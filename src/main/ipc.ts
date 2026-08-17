import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'crypto'
import { basename } from 'path'
import type {
  AppConfig,
  AppInfo,
  AppRuntime,
  HiddenPortEntry,
  NewAppInput,
  Settings,
  ValidationResult
} from '../shared/types'
import { killTree } from './commands'
import type { ConfigStore } from './config'
import { defaultRuntime } from './processManager'
import type { ProcessManager } from './processManager'
import type { LoggerService } from './logger'
import type { MonitorService } from './monitor'
import { detectProject, scriptCommand } from './projectDetect'
import { showNotification } from './notify'
import { validateAppConfig } from './validate'

export interface IpcDeps {
  cfg: ConfigStore
  pm: ProcessManager
  logger: LoggerService
  monitor: MonitorService
  appInfo: AppInfo
}

export function broadcast(channel: string, payload?: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload)
  }
}

function toEntry(pm: ProcessManager, app: AppConfig) {
  return { ...app, runtime: pm.getRuntime(app.id) ?? defaultRuntime(app) }
}

export function registerIpc(deps: IpcDeps): void {
  const { cfg, pm, logger, monitor, appInfo } = deps

  pm.on('runtime', ({ id, runtime }: { id: string; runtime: AppRuntime }) => {
    broadcast('apps:runtime', { id, runtime })
  })
  pm.on('exit', ({ id, app, runtime }: { id: string; app: AppConfig; runtime: AppRuntime }) => {
    broadcast('apps:runtime', { id, runtime })
    if (app.kind === 'task' && cfg.data.settings.notifyTaskComplete) {
      const label = runtime.status === 'success' ? '成功' : runtime.status === 'failed' ? '失败' : runtime.status === 'cancelled' ? '已取消' : '已中止'
      showNotification(`任务「${app.name}」${label}`, runtime.exitCode != null ? `退出码 ${runtime.exitCode}` : '')
    }
  })
  logger.on('line', ({ appId, lines }: { appId: string; lines: unknown[] }) => {
    broadcast('logs:append', { appId, lines })
  })
  monitor.on('snapshot', (s) => broadcast('monitor:snapshot', s))
  monitor.on('alerts', (a) => broadcast('monitor:alerts', a))
  monitor.on('claimed-expired', (id: string) => {
    cfg.updateApp(id, { claimed: undefined })
    broadcast('apps:changed', cfg.data)
  })

  ipcMain.handle('config:get', () => cfg.data)
  ipcMain.handle('settings:update', (_e, patch: Partial<Settings>) => {
    const s = cfg.updateSettings(patch)
    broadcast('settings:changed', s)
    return s
  })

  ipcMain.handle('apps:list', () => cfg.data.apps.map((a) => toEntry(pm, a)))
  ipcMain.handle('apps:add', (_e, input: NewAppInput) => {
    const app: AppConfig = {
      id: randomUUID(),
      kind: input.kind,
      name: input.name.trim() || '未命名',
      icon: input.icon,
      dir: input.dir || undefined,
      command: input.command.trim(),
      scriptPath: input.scriptPath || undefined,
      port: input.kind === 'service' && input.port ? input.port : undefined,
      createdAt: Date.now()
    }
    cfg.addApp(app)
    broadcast('apps:changed', cfg.data)
    return app
  })
  ipcMain.handle('apps:update', async (_e, id: string, patch: Partial<AppConfig>) => {
    const app = cfg.getApp(id)
    if (!app) throw new Error('应用不存在')
    const m = pm.getManaged(id)
    if (m && ['starting', 'running', 'stopping'].includes(m.status)) {
      await pm.stop(id)
    }
    const updated = cfg.updateApp(id, patch)
    if (updated && updated.claimed && !pm.hasChild(id)) {
      pm.claimExternal(updated)
    }
    broadcast('apps:changed', cfg.data)
    return updated
  })
  ipcMain.handle('apps:remove', async (_e, id: string) => {
    const app = cfg.getApp(id)
    if (!app) return
    if (pm.getRuntime(id)?.status === 'running' || pm.getRuntime(id)?.status === 'starting') {
      await pm.stop(id)
    }
    cfg.removeApp(id)
    pm.forget(id)
    broadcast('apps:changed', cfg.data)
  })
  ipcMain.handle('apps:reorder', (_e, ids: string[]) => {
    cfg.reorderApps(ids)
    broadcast('apps:changed', cfg.data)
  })
  ipcMain.handle('apps:setPinned', (_e, id: string, v: boolean) => {
    cfg.updateApp(id, { pinned: v })
    broadcast('apps:changed', cfg.data)
  })
  ipcMain.handle('apps:setHidden', (_e, id: string, v: boolean) => {
    cfg.updateApp(id, { hidden: v })
    broadcast('apps:changed', cfg.data)
  })

  ipcMain.handle('apps:start', (_e, id: string) => {
    const app = cfg.getApp(id)
    if (!app) throw new Error('应用不存在')
    const v = validateAppConfig(app)
    if (!v.ok) {
      const runtime: AppRuntime = { status: 'error', error: v.issues.filter((i) => i.level === 'error').map((i) => i.message).join('；') }
      return runtime
    }
    return pm.start(app)
  })
  ipcMain.handle('apps:stop', async (_e, id: string) => {
    const app = cfg.getApp(id)
    if (!app) throw new Error('应用不存在')
    const runtime = await pm.stop(id)
    if (app.claimed && !pm.hasChild(id)) {
      cfg.updateApp(id, { claimed: undefined })
      broadcast('apps:changed', cfg.data)
    }
    return runtime
  })
  ipcMain.handle('apps:restart', async (_e, id: string) => {
    const app = cfg.getApp(id)
    if (!app) throw new Error('应用不存在')
    if (app.claimed && !pm.hasChild(id)) {
      await pm.stop(id)
      cfg.updateApp(id, { claimed: undefined })
      broadcast('apps:changed', cfg.data)
    }
    const v = validateAppConfig(app)
    if (!v.ok) {
      return { status: 'error', error: v.issues.filter((i) => i.level === 'error').map((i) => i.message).join('；') } as AppRuntime
    }
    return pm.restart(app)
  })
  ipcMain.handle('apps:stopAll', async () => {
    await pm.stopAll()
  })
  ipcMain.handle('apps:validate', (_e, id: string): ValidationResult => {
    const app = cfg.getApp(id)
    if (!app) return { ok: false, issues: [{ level: 'error', message: '应用不存在', fix: '刷新后重试' }] }
    return validateAppConfig(app)
  })

  ipcMain.handle('dialog:pickDirectory', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory'], title: '选择工作区文件夹' })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })
  ipcMain.handle('dialog:pickScript', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile'],
      title: '选择脚本',
      filters: [
        { name: '脚本', extensions: ['js', 'mjs', 'cjs', 'ts', 'py', 'sh', 'ps1', 'bat', 'cmd'] },
        { name: '全部文件', extensions: ['*'] }
      ]
    })
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0]
  })
  ipcMain.handle('project:detect', (_e, dir: string) => detectProject(dir))
  ipcMain.handle('project:scriptCommand', (_e, p: string) => scriptCommand(p))

  ipcMain.handle('logs:get', (_e, appId: string) => logger.getLines(appId))
  ipcMain.handle('monitor:state', () => monitor.getLastSnapshot())
  ipcMain.handle('monitor:hiddenPorts', () => cfg.data.hiddenPorts)
  ipcMain.handle('monitor:claim', (_e, port: number) => {
    const info = monitor.findPortProcess(port)
    if (!info) throw new Error('端口对应的进程不存在')
    const dir = info.dir
    let command = info.cmdline || `${info.name}`
    let name = info.name.replace(/\.exe$/i, '')
    let icon = '🚀'
    if (dir) {
      name = basename(dir)
      const det = detectProject(dir)
      if (det.candidates.length) {
        command = det.candidates[0].command
        if (det.candidates[0].port) icon = '🚀'
      }
    }
    const app: AppConfig = {
      id: randomUUID(),
      kind: 'service',
      name,
      icon,
      dir: dir || undefined,
      command,
      port,
      claimed: { pid: info.pid, startedAt: Date.now(), port },
      createdAt: Date.now()
    }
    cfg.addApp(app)
    pm.claimExternal(app)
    broadcast('apps:changed', cfg.data)
    return app
  })
  ipcMain.handle('monitor:dismiss', (_e, port: number) => {
    monitor.dismiss(port)
  })
  ipcMain.handle('monitor:ignorePort', (_e, port: number) => {
    cfg.addIgnoredPort(port)
    monitor.ignore(port)
  })
  ipcMain.handle('monitor:hidePort', (_e, port: number) => {
    const info = monitor.findPortProcess(port)
    const entry: HiddenPortEntry = {
      port,
      name: info?.name ?? `端口 ${port}`,
      pid: info?.pid ?? 0,
      hiddenAt: Date.now()
    }
    cfg.hidePort(entry)
    monitor.hide(port)
    broadcast('apps:changed', cfg.data)
  })
  ipcMain.handle('monitor:unhidePort', (_e, port: number) => {
    cfg.unhidePort(port)
    broadcast('apps:changed', cfg.data)
  })
  ipcMain.handle('monitor:kill', async (_e, pid: number) => {
    await killTree(pid)
  })
  ipcMain.handle('monitor:focusAdd', (_e, kw: string) => {
    cfg.addFocusKeyword(kw)
    broadcast('apps:changed', cfg.data)
  })
  ipcMain.handle('monitor:focusRemove', (_e, kw: string) => {
    cfg.removeFocusKeyword(kw)
    broadcast('apps:changed', cfg.data)
  })

  ipcMain.handle('shell:openUrl', (_e, url: string) => shell.openExternal(url))
  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p))
  ipcMain.handle('app:info', () => appInfo)
}
