import type { ChildProcessWithoutNullStreams } from 'child_process'
import { spawnCommandLine, killTree } from '../../commands'
import type { LoggerService } from '../../logger'
import type { LocalModel } from '../../../shared/types'

interface ManagedModel {
  model: LocalModel
  child?: ChildProcessWithoutNullStreams
  stopRequested?: boolean
}

/**
 * 本地模型进程生命周期管理：启动 / 停止 / 状态跟踪。
 * 与 ProcessManager 分离，避免与「应用」语义混淆。
 */
export class ModelProcessManager {
  private managed = new Map<string, ManagedModel>()

  /** 进程退出/异常时回调（供 Service 转发实时状态到渲染层） */
  onRuntime?: (id: string) => void

  constructor(private logger: LoggerService) {}

  get(id: string): LocalModel | undefined {
    return this.managed.get(id)?.model
  }

  list(): LocalModel[] {
    return [...this.managed.values()].map((m) => m.model)
  }

  forget(id: string): void {
    this.managed.delete(id)
  }

  hasChild(id: string): boolean {
    return !!this.managed.get(id)?.child
  }

  start(model: LocalModel): LocalModel {
    const existing = this.managed.get(model.id)
    if (existing && ['starting', 'running', 'stopping'].includes(existing.model.status)) {
      return existing.model
    }
    const m: ManagedModel = {
      model: { ...model, status: 'starting', startedAt: Date.now() }
    }
    this.managed.set(model.id, m)

    const command = model.command
    if (!command) {
      m.model = { ...m.model, status: 'error', error: '缺少启动命令' }
      this.logger.business(`启动模型「${model.name}」失败：缺少启动命令`)
      return m.model
    }

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawnCommandLine(command, { cwd: model.dir || undefined })
    } catch (err) {
      m.model = { ...m.model, status: 'error', error: `启动失败：${(err as Error).message}` }
      this.logger.business(`启动模型「${model.name}」失败：${(err as Error).message}`)
      return m.model
    }
    m.child = child
    m.model = { ...m.model, pid: child.pid }
    this.logger.attach(model.id, child.stdout, child.stderr)

    child.on('error', (err) => {
      if (m.model.status === 'starting' || m.model.status === 'running') {
        m.model = {
          ...m.model,
          status: 'error',
          error: `无法启动：${err.message}`,
          pid: undefined
        }
        this.logger.business(`模型「${m.model.name}」无法启动：${err.message}`)
      }
      this.onRuntime?.(m.model.id)
    })
    child.on('exit', (code) => {
      m.child = undefined
      m.model = {
        ...m.model,
        status: m.stopRequested ? 'stopped' : 'error',
        exitCode: code ?? undefined,
        pid: undefined,
        startedAt: undefined,
        error: m.stopRequested
          ? undefined
          : code != null
            ? `异常退出（退出码 ${code}）`
            : '进程退出'
      }
      this.logger.business(
        `模型「${m.model.name}」已${m.stopRequested ? '停止' : `退出${code != null ? `（${code}）` : ''}`}`
      )
      this.onRuntime?.(m.model.id)
    })
    this.logger.business(`启动模型「${model.name}」（pid=${child.pid}）`)
    return m.model
  }

  async stop(id: string): Promise<LocalModel | undefined> {
    const m = this.managed.get(id)
    if (!m) return undefined
    if (!['starting', 'running'].includes(m.model.status)) return m.model
    m.stopRequested = true
    m.model = { ...m.model, status: 'stopping' }
    this.logger.business(`正在停止模型「${m.model.name}」…`)
    if (m.model.pid) await killTree(m.model.pid)
    if (!m.child) {
      m.model = {
        ...m.model,
        status: 'stopped',
        pid: undefined,
        startedAt: undefined,
        error: undefined
      }
      this.logger.business(`模型「${m.model.name}」已停止`)
    }
    return m.model
  }

  async stopAll(): Promise<void> {
    const ids = [...this.managed.values()]
      .filter((m) => ['starting', 'running'].includes(m.model.status))
      .map((m) => m.model.id)
    for (const id of ids) await this.stop(id)
  }
}
