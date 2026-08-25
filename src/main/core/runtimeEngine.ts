import { randomUUID } from 'crypto'
import type { LoggerService } from '../logger'
import { eventBus, emitRuntimeChanged } from './eventBus'

/** 运行实体统一模型（Module 5：Runtime Engine 的轻量实现） */
export interface RuntimeEntity {
  id: string
  type: 'application' | 'service' | 'task' | 'docker' | 'database'
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'success'
  pid?: number
  startTime?: number
  /** 关联标签，如应用名 / 服务名 */
  label: string
}

/** 统一控制接口：start / stop / restart / status */
export interface RuntimeHandle {
  start(entity: RuntimeEntity): Promise<RuntimeEntity>
  stop(entity: RuntimeEntity): Promise<RuntimeEntity>
  restart(entity: RuntimeEntity): Promise<RuntimeEntity>
  status(id: string): RuntimeEntity | undefined
}

/**
 * Runtime Engine：统一管理各类运行实体的生命周期。
 * 不直接 fork 进程（具体能力由各模块注入），而是作为中央状态注册表与
 * 生命周期编排层，替代散落的 process/service/docker 管理入口。
 */
export class RuntimeEngine implements RuntimeHandle {
  private entities = new Map<string, RuntimeEntity>()

  constructor(private logger: LoggerService) {
    // 监听外部模块发来的状态变更，同步内部表
    eventBus.on('runtime:changed', ({ id, status, pid }) => {
      const e = this.entities.get(id)
      if (!e) return
      this.entities.set(id, { ...e, status: status as RuntimeEntity['status'], pid })
    })
  }

  register(input: Omit<RuntimeEntity, 'id'> & { id?: string }): RuntimeEntity {
    const id = input.id ?? randomUUID()
    const entity: RuntimeEntity = {
      id,
      type: input.type,
      status: input.status ?? 'stopped',
      pid: input.pid,
      startTime: input.startTime,
      label: input.label
    }
    this.entities.set(id, entity)
    return entity
  }

  get(id: string): RuntimeEntity | undefined {
    return this.entities.get(id)
  }

  status(id: string): RuntimeEntity | undefined {
    return this.entities.get(id)
  }

  list(): RuntimeEntity[] {
    return [...this.entities.values()]
  }

  update(id: string, patch: Partial<RuntimeEntity>): RuntimeEntity | undefined {
    const e = this.entities.get(id)
    if (!e) return undefined
    const next = { ...e, ...patch, id }
    this.entities.set(id, next)
    emitRuntimeChanged({ id, status: next.status, pid: next.pid })
    return next
  }

  async start(entity: RuntimeEntity): Promise<RuntimeEntity> {
    this.update(entity.id, { status: 'starting', startTime: Date.now() })
    // 具体启动逻辑由模块通过 startHandler 注入
    if (this.startHandler) {
      try {
        await this.startHandler(entity)
      } catch (err) {
        this.update(entity.id, { status: 'error' })
        this.logger.business(`启动「${entity.label}」失败：${(err as Error).message}`)
      }
    }
    return this.entities.get(entity.id) ?? entity
  }

  async stop(entity: RuntimeEntity): Promise<RuntimeEntity> {
    this.update(entity.id, { status: 'stopping' })
    if (this.stopHandler) {
      try {
        await this.stopHandler(entity)
      } catch (err) {
        this.logger.business(`停止「${entity.label}」失败：${(err as Error).message}`)
      }
    }
    this.update(entity.id, { status: 'stopped' })
    return this.entities.get(entity.id) ?? entity
  }

  async restart(entity: RuntimeEntity): Promise<RuntimeEntity> {
    await this.stop(entity)
    return this.start(this.entities.get(entity.id) ?? entity)
  }

  /** 模块注入的实际启动/停止实现 */
  startHandler?: (entity: RuntimeEntity) => Promise<void>
  stopHandler?: (entity: RuntimeEntity) => Promise<void>

  forget(id: string): void {
    this.entities.delete(id)
  }
}
