import { app, BrowserWindow, Menu, Tray, nativeImage, shell } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { join } from 'path'
import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { AppInfo } from '../shared/types'
import { ConfigStore, getConfigPath, getDataDir, getLogsDir } from './config'
import { broadcast, registerIpc } from './ipc'
import { LoggerService } from './logger'
import { MonitorService } from './monitor'
import { ProcessManager } from './processManager'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let appLogger: LoggerService | null = null

const DEFAULT_STATUS_PORT = 16888
function resolveStatusPort(): number {
  const raw = process.env['DASH_STATUS_PORT']
  if (raw) {
    const n = Number(raw)
    if (Number.isInteger(n) && n >= 1 && n <= 65535) return n
  }
  return DEFAULT_STATUS_PORT
}

function send(channel: string, payload?: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: '总控台',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  if (process.env['DASH_SMOKE']) {
    mainWindow.webContents.on('console-message', (_e, level, message) => {
      if (level >= 2) console.error('[renderer]', message)
      else console.log('[renderer]', message)
    })
    mainWindow.webContents.once('did-finish-load', async () => {
      void runSmoke()
    })
  }
  mainWindow.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const mod = input.control || input.meta
    if (mod && !input.alt && input.type === 'keyDown') {
      const key = input.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        send('shortcut', 'palette')
      } else if (key === 'j') {
        event.preventDefault()
        send('shortcut', 'logs')
      }
    }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function runSmoke(): Promise<void> {
  const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const js = (code: string): Promise<unknown> =>
    mainWindow?.webContents.executeJavaScript(code) ?? Promise.resolve(null)
  const dump = async (label: string): Promise<void> => {
    const txt = (await js(`document.body.innerText`)) as string
    console.log(`[smoke:${label}]`, txt.replace(/\n+/g, ' | ').slice(0, 480))
  }
  const clickNav = async (label: string): Promise<void> => {
    await js(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes(${JSON.stringify(label)})); b?.click(); return !!b })()`
    )
  }
  const waitText = async (selector: string, text: string, timeoutMs: number): Promise<boolean> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const t = (await js(selector)) as string
      if (t.includes(text)) return true
      await delay(800)
    }
    return false
  }
  const waitNoText = async (
    selector: string,
    text: string,
    timeoutMs: number
  ): Promise<boolean> => {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const t = (await js(selector)) as string
      if (!t.includes(text)) return true
      await delay(800)
    }
    return false
  }
  try {
    await delay(5000)
    await dump('launchpad')
    await clickNav('服务监控')
    await delay(1200)
    await dump('monitor')
    await clickNav('日志中心')
    await delay(600)
    await dump('logs')
    await clickNav('设置中心')
    await delay(600)
    await dump('settings')
    await clickNav('启动台')
    await delay(400)
    await js(
      `(() => { const b = document.querySelector('article .btn-primary'); if (b) { b.click(); return 'clicked' } return 'no-card' })()`
    )
    const runningOk = await waitText(`document.body.innerText`, ':8799', 20000)
    console.log('[smoke:service-running]', runningOk ? 'ok' : 'TIMEOUT')
    await dump('after-start')
    await js(
      `(() => { const b = document.querySelector('article .btn-danger'); if (b) { b.click(); return 'clicked' } return 'no-stop' })()`
    )
    const stoppedOk = await waitNoText(`document.body.innerText`, ':8799', 15000)
    console.log('[smoke:service-stopped]', stoppedOk ? 'ok' : 'TIMEOUT')
    await dump('after-stop')
    await js(
      `(() => { const b = document.querySelectorAll('article')[1]?.querySelector('.btn-primary'); if (b) { b.click(); return 'clicked' } return 'no-task-card' })()`
    )
    await delay(9000)
    await clickNav('日志中心')
    await delay(800)
    await js(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('GBK中文任务')); b?.click(); return !!b })()`
    )
    await delay(500)
    const taskOk = await waitText(`document.body.innerText`, '任务完成 中文OK', 10000)
    console.log('[smoke:task-success]', taskOk ? 'ok' : 'TIMEOUT')
    await dump('task-after-run')
    await clickNav('日志中心')
    await delay(600)
    await dump('logs-after-task')
    await js(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('命令面板')); b?.click(); return !!b })()`
    )
    await delay(500)
    await dump('palette-open')
    await js(
      `(() => { const el = document.querySelector('input[placeholder^="搜索命令"]'); if (!el) return 'no-input'; const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; s.call(el, '服务监控'); el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed' })()`
    )
    await delay(400)
    await dump('palette-filter')
    await js(
      `(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent?.includes('打开服务监控')); b?.click(); return !!b })()`
    )
    await delay(700)
    await dump('palette-navigated')
    // 新端口提醒 → 「忽略提醒」：提醒消失、不隐藏到已隐藏列表、持久记住
    broadcast('monitor:alerts', [
      {
        port: 8797,
        pid: 0,
        name: 'smoke-server.exe',
        cmdline: 'python -m http.server 8797 --bind 127.0.0.1',
        origin: { kind: 'other', label: '其他' }
      }
    ])
    const alertShown = await waitText(`document.body.innerText`, '8797', 8000)
    console.log('[smoke:port-alert-shown]', alertShown ? 'ok' : 'TIMEOUT')
    await delay(400)
    await js(
      `(() => { const btns = [...document.querySelectorAll('button')].filter(b => b.textContent?.includes('忽略提醒')); const row = btns.find(b => b.parentElement?.textContent?.includes('8797')); row?.click(); return !!row })()`
    )
    await delay(1200)
    const alertGone = await waitNoText(`document.body.innerText`, '发现新端口', 8000)
    const bodyAfter = (await js(`document.body.innerText`)) as string
    const persisted = readFileSync(getConfigPath(), 'utf8').includes('8797')
    console.log(
      '[smoke:port-ignored]',
      alertGone && !bodyAfter.includes('已隐藏的服务') && persisted ? 'ok' : 'FAIL'
    )
    const img = await mainWindow?.webContents.capturePage()
    if (img) writeFileSync(process.env['DASH_SMOKE'] as string, img.toPNG())
  } catch (err) {
    console.error('[smoke] 失败', err)
  } finally {
    app.quit()
  }
}

function showMainWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function navigate(
  view: 'launchpad' | 'monitor' | 'dbs' | 'docker' | 'agents' | 'logs' | 'settings'
): void {
  showMainWindow()
  send('nav', view)
}

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon)
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }))
  tray.setToolTip('总控台')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示总控台', click: () => showMainWindow() },
      { type: 'separator' },
      { label: '启动台', click: () => navigate('launchpad') },
      { label: '服务监控', click: () => navigate('monitor') },
      { label: '数据库', click: () => navigate('dbs') },
      { label: 'Docker', click: () => navigate('docker') },
      { label: 'AI Agent', click: () => navigate('agents') },
      { label: '日志中心', click: () => navigate('logs') },
      { label: '设置', click: () => navigate('settings') },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
  tray.on('click', () => showMainWindow())
}

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showMainWindow())

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.dashboard.app')
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    const logger = new LoggerService(getLogsDir())
    appLogger = logger
    const cfg = new ConfigStore(logger)
    const pm = new ProcessManager(logger)
    const monitor = new MonitorService(cfg, pm)

    const httpServer = createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      if (req.url === '/api/apps') {
        res.end(
          JSON.stringify({
            apps: cfg.data.apps.map((a) => ({
              id: a.id,
              kind: a.kind,
              name: a.name,
              status: pm.getRuntime(a.id)?.status ?? 'stopped'
            }))
          })
        )
        return
      }
      res.end(
        JSON.stringify({
          name: '总控台',
          version: app.getVersion(),
          uptimeMs: process.uptime() * 1000,
          ts: Date.now()
        })
      )
    })
    const appInfo: AppInfo = {
      version: app.getVersion(),
      port: 0,
      cwd: process.cwd(),
      dataDir: getDataDir(),
      electron: process.versions.electron ?? '',
      node: process.versions.node ?? '',
      platform: process.platform
    }
    httpServer.once('listening', () => {
      appInfo.port = (httpServer.address() as AddressInfo | null)?.port ?? 0
    })
    const statusPort = resolveStatusPort()
    httpServer.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        logger.business(`状态端口 ${statusPort} 被占用，改用随机端口`)
        httpServer.listen(0, '127.0.0.1')
      }
    })
    httpServer.listen(statusPort, '127.0.0.1')

    registerIpc({ cfg, pm, logger, monitor, appInfo })
    createWindow()
    createTray()
    monitor.start()
    logger.append('dashboard', 'sys', `总控台已启动 v${app.getVersion()} (${process.platform})`)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    // 常驻托盘：关闭窗口不退出
  })

  app.on('before-quit', () => {
    quitting = true
    appLogger?.business('总控台退出')
    tray?.destroy()
    tray = null
  })
}
