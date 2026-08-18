import type { AppKind, AppStatus, ProcessOriginKind } from '@shared/types'

export function formatDuration(ms?: number): string {
  if (ms == null) return '—'
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${String(m % 60).padStart(2, '0')}m`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

export function formatClock(ts?: number): string {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function formatMem(mb: number): string {
  if (mb < 1024) return `${Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

export function statusLabel(status: AppStatus, kind: AppKind): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'starting':
      return '启动中'
    case 'stopping':
      return '停止中'
    case 'stopped':
      return kind === 'service' ? '已停止' : '未运行'
    case 'success':
      return '成功'
    case 'failed':
      return '失败'
    case 'cancelled':
      return '已取消'
    case 'aborted':
      return '已中止'
    case 'error':
      return '异常'
  }
}

export function statusColor(status: AppStatus): string {
  switch (status) {
    case 'running':
    case 'success':
      return 'text-go dark:text-go-soft'
    case 'starting':
    case 'stopping':
      return 'text-warn dark:text-warn-soft'
    case 'failed':
    case 'cancelled':
    case 'error':
      return 'text-alert dark:text-alert-soft'
    case 'aborted':
      return 'text-inspect dark:text-inspect-soft'
    default:
      return 'text-ink-soft/70 dark:text-chalk-soft/70'
  }
}

export function originBadge(kind?: ProcessOriginKind): { label: string; cls: string } {
  switch (kind) {
    case 'ai':
      return { label: 'AI 助手', cls: 'bg-[#e9d4f2] text-[#6b3f85] dark:bg-[#4a2b5e]/50 dark:text-[#d3b2e6]' }
    case 'editor':
      return { label: '编辑器', cls: 'bg-inspect-soft/25 text-inspect dark:bg-inspect/15 dark:text-inspect-soft' }
    case 'terminal':
      return { label: '终端', cls: 'bg-paper text-ink-soft dark:bg-black/30 dark:text-chalk-soft' }
    case 'system':
      return { label: '系统', cls: 'bg-ink/8 text-ink-soft dark:bg-white/10 dark:text-chalk-soft' }
    case 'this-app':
      return { label: '总控台', cls: 'bg-signal/12 text-signal dark:bg-signal/15 dark:text-signal-soft' }
    default:
      return { label: '其他', cls: 'bg-paper text-ink-soft dark:bg-black/30 dark:text-chalk-soft' }
  }
}
