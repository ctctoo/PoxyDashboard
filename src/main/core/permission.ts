import type { DangerousAction, PermissionRisk } from '../../shared/types'
import type { LoggerService } from '../logger'
import type { EventBus } from './eventBus'

/**
 * 安全策略：默认只读（Read Only First, Confirm Before Execute）。
 *
 * 允许：查询 / 搜索 / 展示
 * 危险操作（需确认）：删除文件、关闭进程、执行脚本、关闭系统
 *
 * 既约束内部模块，也约束未来 MCP 工具调用。
 */
export interface PermissionContext {
  /** 调用来源：renderer | mcp | automation */
  origin: 'renderer' | 'mcp' | 'automation'
  /** 是否已经过用户确认（危险操作） */
  approved?: boolean
}

/** 内置风险清单：操作名 → 风险级别 */
const RISK_TABLE: Record<string, PermissionRisk> = {
  // 只读
  list: 'read',
  get: 'read',
  search: 'read',
  read: 'read',
  status: 'read',
  // 安全操作（本机内、可逆或低影响）
  open: 'safe',
  launch: 'safe',
  start: 'safe',
  stop: 'safe',
  pin: 'safe',
  restart: 'safe',
  'open-workspace': 'safe',
  // 危险操作（需要确认）
  'stop-process': 'dangerous',
  kill: 'dangerous',
  'delete-file': 'dangerous',
  'run-script': 'dangerous',
  'shutdown-system': 'dangerous',
  remove: 'dangerous'
}

export class PermissionManager {
  /** 是否启用严格模式：危险操作必须显式确认 */
  private strict = true

  constructor(
    private eventBus: EventBus,
    private logger: LoggerService | null
  ) {}

  setStrict(v: boolean): void {
    this.strict = v
  }

  /** 查询某操作的风险级别；未知操作默认按 safe 处理（保守） */
  risk(action: string): PermissionRisk {
    const base = action.split(':').pop() ?? action
    return RISK_TABLE[base] ?? 'safe'
  }

  /**
   * 校验操作是否被允许。
   * @returns 允许时返回 true；危险操作未确认时抛出明确错误。
   */
  assert(action: string, ctx: PermissionContext, target?: string): boolean {
    const level = this.risk(action)
    if (level === 'read' || level === 'safe') return true
    // 危险操作
    if (ctx.approved) {
      this.eventBus.emit('dangerous:approved', { action, target })
      this.logger?.business(`危险操作已确认：${action}${target ? ` → ${target}` : ''}`)
      return true
    }
    const desc: DangerousAction = { action, target, description: riskDescription(action) }
    throw new PermissionError(action, desc)
  }

  /** 构造一条待确认的危险操作描述（供渲染层弹出确认） */
  describe(action: string, target?: string): DangerousAction {
    return { action, target, description: riskDescription(action) }
  }

  /** 供外部模块判断：是否需要先征求用户确认 */
  requiresConfirm(action: string): boolean {
    return this.strict && this.risk(action) === 'dangerous'
  }
}

export class PermissionError extends Error {
  readonly action: string
  readonly needConfirm: DangerousAction

  constructor(action: string, desc: DangerousAction) {
    super(`操作「${action}」需要用户确认`)
    this.name = 'PermissionError'
    this.action = action
    this.needConfirm = desc
  }
}

function riskDescription(action: string): string {
  const map: Record<string, string> = {
    'stop-process': '结束指定进程，可能导致数据丢失或服务中断',
    kill: '强制结束进程树',
    'delete-file': '永久删除文件，不可恢复',
    'run-script': '在本地执行脚本，可能产生副作用',
    'shutdown-system': '关闭或重启系统',
    remove: '删除记录/数据，不可恢复'
  }
  return map[action.split(':').pop() ?? action] ?? '该操作可能产生不可逆影响'
}
