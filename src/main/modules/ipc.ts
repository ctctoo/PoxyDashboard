import { dialog, ipcMain, shell } from 'electron'
import { readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import type { ModuleRegistry } from './index'
import type { MonitorService } from '../monitor'
import type { LoggerService } from '../logger'
import type { SystemOverview } from '../../shared/types'
import { spawnCommandLine } from '../commands'
import { eventBus } from '../core/eventBus'
import { broadcast } from '../ipc'

/**
 * Phase 1 模块的 IPC 注册：Application Manager / Workspace Manager / Home Dashboard。
 * 与既有 registerIpc（服务/监控）共存，互不干扰。
 */
export function registerDesktopIpc(
  mods: ModuleRegistry,
  monitor: MonitorService,
  logger: LoggerService
): void {
  const { applications, workspaces, permission, models } = mods

  // ---- Module 2 · Application Manager ----
  ipcMain.handle('apps2:list', () => applications.list())
  ipcMain.handle('apps2:search', (_e, q: string) => applications.search(q))
  ipcMain.handle('apps2:sync', () => applications.syncDiscovered())
  ipcMain.handle('apps2:add', (_e, name: string, path: string, category?: string) =>
    applications.addManual(name, path, category)
  )
  ipcMain.handle('apps2:setPinned', (_e, id: string, v: boolean) => applications.setPinned(id, v))
  ipcMain.handle('apps2:setCategory', (_e, id: string, category?: string) =>
    applications.setCategory(id, category)
  )
  ipcMain.handle('apps2:remove', (_e, id: string) => applications.remove(id))
  ipcMain.handle('apps2:launch', (_e, id: string) => {
    const app = applications.get(id)
    if (!app) return
    // 启动外部应用属于安全操作，无需确认
    permission.assert('launch', { origin: 'renderer' }, app.path)
    spawnCommandLine(`"${app.path}"`, { detached: true }).unref?.()
    applications.touchUsed(id)
    logger.business(`启动应用「${app.name}」`)
    eventBus.emit('application:launched', { app })
  })
  ipcMain.handle('apps2:recent', () => applications.recent())

  // ---- Module 4 · Workspace Manager ----
  ipcMain.handle('ws:list', () => workspaces.list())
  ipcMain.handle('ws:search', (_e, q: string) => workspaces.search(q))
  ipcMain.handle('ws:add', (_e, path: string) => workspaces.add(path))
  ipcMain.handle('ws:setPinned', (_e, id: string, v: boolean) => workspaces.setPinned(id, v))
  ipcMain.handle('ws:remove', (_e, id: string) => workspaces.remove(id))
  ipcMain.handle('ws:open', (_e, id: string) => {
    const ws = workspaces.get(id)
    if (!ws) return
    permission.assert('open-workspace', { origin: 'renderer' }, ws.path)
    void shell.openPath(ws.path)
    workspaces.touchOpened(id)
    logger.business(`打开工作区「${ws.name}」`)
    eventBus.emit('workspace:opened', { workspace: ws })
  })
  ipcMain.handle('ws:start', (_e, id: string) => {
    const ws = workspaces.get(id)
    if (!ws) return
    const command = ws.startCommand
    if (!command) {
      logger.business(`工作区「${ws.name}」无启动命令，仅打开`)
      void shell.openPath(ws.path)
      workspaces.touchOpened(id)
      return
    }
    permission.assert('start', { origin: 'renderer' }, ws.path)
    spawnCommandLine(command, { cwd: ws.path, detached: true }).unref?.()
    logger.business(`启动工作区「${ws.name}」：${command}`)
    workspaces.touchOpened(id)
  })
  ipcMain.handle('ws:recent', () => workspaces.recent())

  // ---- Module 8 · Local LLM ----
  ipcMain.handle('models:detect', () => models.detectEnvs())
  ipcMain.handle('models:pickFile', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择模型文件',
      filters: [
        { name: '模型', extensions: ['gguf', 'bin', 'safetensors'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })
  ipcMain.handle('models:list', () => models.list())
  ipcMain.handle('models:add', (_e, input) => models.add(input))
  ipcMain.handle('models:update', (_e, id: string, patch) => models.update(id, patch))
  ipcMain.handle('models:remove', (_e, id: string) => models.remove(id))
  ipcMain.handle('models:start', (_e, id: string) => models.start(id))
  ipcMain.handle('models:stop', (_e, id: string) => models.stop(id))
  ipcMain.handle('models:command', (_e, input) => models.previewCommand(input))

  // ---- Module 1 · Home Dashboard ----
  ipcMain.handle('overview:get', () =>
    buildOverview(
      monitor,
      mods.workspaces.list().length,
      mods.applications.list().length,
      mods.models.list().length
    )
  )

  // ---- 安全：危险操作描述（供渲染层确认） ----
  ipcMain.handle('permission:describe', (_e, action: string, target?: string) =>
    permission.describe(action, target)
  )

  // 选择可执行文件（手动登记应用）
  ipcMain.handle('dialog:pickExecutable', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择应用可执行文件',
      filters: [
        { name: '应用', extensions: ['exe', 'cmd', 'bat', 'com', 'ps1'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })

  // 事件桥接：模块变更 → 渲染层
  eventBus.on('application:updated', ({ apps }) => broadcast('apps2:updated', apps))
  eventBus.on('workspace:updated', ({ workspaces: list }) => broadcast('ws:updated', list))
  eventBus.on('model:updated', ({ models: list }) => broadcast('models:changed', list))
  eventBus.on('model:runtime', ({ id, model }) => broadcast('models:runtime', { id, model }))
}

/** 构建 Home Dashboard 系统状态总览 */
export function buildOverview(
  monitor: MonitorService,
  workspaceCount: number,
  appCount: number,
  modelCount = 0
): SystemOverview {
  const snap = monitor.getLastSnapshot()
  const now = Date.now()
  const stats = snap?.stats
  const disk = readDiskInfo()
  return {
    cpu: {
      usage: stats?.totalCpu ?? 0,
      cores: stats?.cores ?? 0,
      history: []
    },
    memory: {
      usedMB: stats?.totalMemMB ?? 0,
      capacityMB: stats?.memCapacityMB ?? 0,
      percent: stats?.memCapacityMB
        ? Math.round((stats.totalMemMB / stats.memCapacityMB) * 100)
        : 0,
      history: []
    },
    disk,
    runningApps: appCount,
    services: stats?.serviceCount ?? 0,
    containers: snap?.containers?.filter((c) => c.status === 'running').length ?? 0,
    databases: snap?.dbs?.filter((d) => d.status === 'running').length ?? 0,
    agents: snap?.agents?.filter((a) => a.status === 'running').length ?? 0,
    alerts: monitor.getPendingAlertCount(),
    workspaces: workspaceCount,
    models: modelCount,
    ts: now
  }
}

/** 读取磁盘总容量/剩余（近似：取所有本地盘符求和；非 Windows 取 tmpdir 所在挂载点） */
function readDiskInfo(): { totalGB: number; freeGB: number; percent: number } {
  try {
    if (process.platform === 'win32') {
      const drives = getWinDrives()
      let total = 0
      let free = 0
      for (const d of drives) {
        try {
          const out = execFileSync(
            'wmic',
            ['logicaldisk', 'where', `DeviceID='${d}:'`, 'get', 'Size,FreeSpace', '/value'],
            {
              windowsHide: true,
              encoding: 'utf8',
              timeout: 8000,
              stdio: ['ignore', 'pipe', 'ignore']
            }
          )
          const size = /Size=(\d+)/.exec(out)?.[1]
          const f = /FreeSpace=(\d+)/.exec(out)?.[1]
          if (size && f) {
            total += Number(size)
            free += Number(f)
          }
        } catch {
          /* 该盘不可读，跳过 */
        }
      }
      const totalGB = Math.round(total / 1073741824)
      const freeGB = Math.round(free / 1073741824)
      return { totalGB, freeGB, percent: total ? Math.round(((total - free) / total) * 100) : 0 }
    }
    // 非 Windows：近似用 tmp 目录所在挂载点
    const dir = tmpdir()
    const { statfsSync } = require('fs') as {
      statfsSync?: (p: string) => { bsize: number; blocks: number; bavail: number }
    }
    if (statfsSync) {
      const s = statfsSync(dir)
      const total = s.bsize * s.blocks
      const free = s.bsize * s.bavail
      const totalGB = Math.round(total / 1073741824)
      const freeGB = Math.round(free / 1073741824)
      return { totalGB, freeGB, percent: total ? Math.round(((total - free) / total) * 100) : 0 }
    }
  } catch {
    /* 忽略 */
  }
  return { totalGB: 0, freeGB: 0, percent: 0 }
}

function getWinDrives(): string[] {
  const out: string[] = []
  try {
    const rawin = execFileSync('wmic', ['logicaldisk', 'get', 'DeviceID'], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    for (const line of rawin.split(/\r?\n/)) {
      const m = /^([A-Z]):/.exec(line.trim())
      if (m) out.push(m[1])
    }
  } catch {
    // 回退：扫描 C: 到 Z:
    for (let c = 67; c <= 90; c++) {
      const letter = String.fromCharCode(c)
      try {
        readdirSync(join(letter + ':', '/'))
        out.push(letter)
      } catch {
        /* 不存在 */
      }
    }
  }
  return out.length ? out : ['C']
}
