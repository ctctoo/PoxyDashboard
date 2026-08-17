import { EventEmitter } from 'events'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import type { AppConfig, AppRuntime, AppStatus } from '../shared/types'
import { killTree, spawnCommandLine } from './commands'
import type { LoggerService } from './logger'

export interface ManagedProcess {
  app: AppConfig
  child?: ChildProcessWithoutNullStreams
  status: AppStatus
  pid?: number
  startedAt?: number
  exitCode?: number
  port?: number
  error?: string
  lastActiveAt?: number
  stopRequested?: boolean
}

export function defaultRuntime(app: AppConfig): AppRuntime {
  return app.claimed ? { status: 'running', pid: app.claimed.pid, port: app.claimed.port, startedAt: app.claimed.startedAt } : { status: 'stopped' }
}

export class ProcessManager extends EventEmitter {
  private managed = new Map<string, ManagedProcess>()

  constructor(private logger: LoggerService) {
    super()
  }

  getManaged(id: string): ManagedProcess | undefined {
    return this.managed.get(id)
  }

  hasChild(id: string): boolean {
    const m = this.managed.get(id)
    return !!m?.child
  }

  getRuntime(id: string): AppRuntime | undefined {
    const m = this.managed.get(id)
    if (!m) return undefined
    return this.runtimeOf(m)
  }

  private runtimeOf(m: ManagedProcess): AppRuntime {
    return {
      status: m.status,
      pid: m.pid,
      startedAt: m.startedAt,
      exitCode: m.exitCode,
      port: m.port,
      error: m.error,
      lastActiveAt: m.lastActiveAt
    }
  }

  private emitRuntime(m: ManagedProcess): void {
    this.emit('runtime', { id: m.app.id, runtime: this.runtimeOf(m) })
  }

  claimExternal(app: AppConfig): AppRuntime {
    const m: ManagedProcess = {
      app,
      status: 'running',
      pid: app.claimed?.pid,
      startedAt: app.claimed?.startedAt ?? Date.now(),
      port: app.claimed?.port,
      lastActiveAt: Date.now()
    }
    this.managed.set(app.id, m)
    this.emitRuntime(m)
    return this.runtimeOf(m)
  }

  /** 服务启动后检测到监听端口时，由监控层调用以切换到运行中 */
  markRunning(id: string, port?: number): void {
    const m = this.managed.get(id)
    if (!m || m.status !== 'starting') return
    m.status = 'running'
    m.port = port
    m.lastActiveAt = Date.now()
    this.emitRuntime(m)
  }

  /** 监控轮询时更新已认领外部进程的状态 */
  applyExternalTick(id: string, runtime: AppRuntime): void {
    const m = this.managed.get(id)
    if (!m || m.child) return
    m.status = runtime.status
    m.pid = runtime.pid
    m.port = runtime.port
    m.startedAt = runtime.startedAt
    m.error = runtime.error
    m.lastActiveAt = Date.now()
    this.emitRuntime(m)
  }

  start(app: AppConfig): AppRuntime {
    const existing = this.managed.get(app.id)
    if (existing && ['starting', 'running', 'stopping'].includes(existing.status)) {
      return this.runtimeOf(existing)
    }
    const m: ManagedProcess = { app, status: 'starting', startedAt: Date.now(), lastActiveAt: Date.now() }
    this.managed.set(app.id, m)
    this.emitRuntime(m)

    if (app.claimed?.pid) {
      m.pid = app.claimed.pid
      m.status = 'running'
      m.port = app.claimed.port
      this.emitRuntime(m)
      return this.runtimeOf(m)
    }

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawnCommandLine(app.command, { cwd: app.dir || undefined })
    } catch (err) {
      m.status = 'error'
      m.error = `启动失败：${(err as Error).message}`
      this.emitRuntime(m)
      return this.runtimeOf(m)
    }
    m.child = child
    m.pid = child.pid
    this.logger.attach(app.id, child.stdout, child.stderr)
    child.on('error', (err) => {
      if (m.status === 'starting' || m.status === 'running') {
        m.status = 'error'
        m.error = `无法启动：${err.message}`
        this.emitRuntime(m)
      }
    })
    child.on('exit', (code, _signal) => this.onExit(m, code, _signal))
    return this.runtimeOf(m)
  }

  private onExit(m: ManagedProcess, code: number | null, _signal: string | null): void {
    m.exitCode = code ?? undefined
    m.lastActiveAt = Date.now()
    if (m.stopRequested) {
      m.status = m.app.kind === 'task' ? 'aborted' : 'stopped'
    } else if (m.app.kind === 'task') {
      m.status = code === 0 ? 'success' : code === 130 ? 'cancelled' : 'failed'
      if (m.status === 'failed' && code !== null && code !== undefined) m.error = `退出码 ${code}`
    } else {
      m.status = code === 0 ? 'stopped' : 'error'
      if (m.status === 'error' && code !== null && code !== undefined) m.error = `异常退出（退出码 ${code}）`
    }
    m.child = undefined
    m.pid = undefined
    m.port = undefined
    m.startedAt = undefined
    this.emit('exit', { id: m.app.id, app: m.app, runtime: this.runtimeOf(m) })
    this.emitRuntime(m)
  }

  async stop(id: string): Promise<AppRuntime | undefined> {
    const m = this.managed.get(id)
    if (!m) return undefined
    if (!['starting', 'running'].includes(m.status)) return this.runtimeOf(m)
    m.stopRequested = true
    m.status = 'stopping'
    this.emitRuntime(m)
    if (m.pid) await killTree(m.pid)
    if (!m.child) {
      m.status = m.app.kind === 'task' ? 'aborted' : 'stopped'
      m.pid = undefined
      m.port = undefined
      m.startedAt = undefined
      this.emit('exit', { id: m.app.id, app: m.app, runtime: this.runtimeOf(m) })
      this.emitRuntime(m)
    }
    return this.runtimeOf(m)
  }

  async stopAll(): Promise<void> {
    const ids = [...this.managed.values()].filter((m) => ['starting', 'running'].includes(m.status)).map((m) => m.app.id)
    for (const id of ids) {
      await this.stop(id)
    }
  }

  async restart(app: AppConfig): Promise<AppRuntime> {
    await this.stop(app.id)
    await new Promise((r) => setTimeout(r, 400))
    return this.start(app)
  }

  forget(id: string): void {
    this.managed.delete(id)
  }
}
