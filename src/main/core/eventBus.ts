import type { AppRuntime, DesktopApp, LocalModel, Workspace } from '../../shared/types'

/**
 * 跨模块事件总线：为 main 进程各模块提供类型安全的事件订阅/发布。
 * 渲染层事件仍走 Electron IPC（见 ipc.ts 的 broadcast），此总线用于
 * 模块间解耦（如 application 发现后通知 launcher 刷新索引）。
 */
export interface CoreEvents {
  /** 本机应用索引更新（发现/收藏/删除后触发） */
  'application:updated': { apps: DesktopApp[] }
  /** 工作区索引更新 */
  'workspace:updated': { workspaces: Workspace[] }
  /** 应用启动事件 */
  'application:launched': { app: DesktopApp }
  /** 工作区打开/启动事件 */
  'workspace:opened': { workspace: Workspace }
  /** 危险操作被批准 */
  'dangerous:approved': { action: string; target?: string }
  /** 运行实体状态变更（runtimeEngine） */
  'runtime:changed': { id: string; status: string; pid?: number }
  /** 本地大模型索引更新 */
  'model:updated': { models: LocalModel[] }
  /** 本地大模型运行状态变更 */
  'model:runtime': { id: string; model: LocalModel }
}

type Handler<T> = (payload: T) => void

export class EventBus {
  private listeners = new Map<keyof CoreEvents, Set<Handler<never>>>()

  on<K extends keyof CoreEvents>(event: K, handler: Handler<CoreEvents[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set<Handler<never>>()
    set.add(handler as Handler<never>)
    this.listeners.set(event, set)
    return () => {
      set.delete(handler as Handler<never>)
    }
  }

  emit<K extends keyof CoreEvents>(event: K, payload: CoreEvents[K]): void {
    const set = this.listeners.get(event)
    if (!set) return
    for (const h of [...set]) {
      try {
        ;(h as Handler<CoreEvents[K]>)(payload)
      } catch (err) {
        console.error(`[eventBus:${String(event)}] 处理异常`, err)
      }
    }
  }

  clear(): void {
    this.listeners.clear()
  }
}

/** 单例，供各模块复用 */
export const eventBus = new EventBus()

/** 便捷：转发某个运行实体状态变更到总线（供 runtimeEngine 使用） */
export function emitRuntimeChanged(payload: { id: string; status: string; pid?: number }): void {
  eventBus.emit('runtime:changed', payload)
}

/** 供 IPC 层转发 AppRuntime（复用现有类型） */
export type { AppRuntime }
