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
      return 'text-emerald-500'
    case 'starting':
    case 'stopping':
      return 'text-amber-500'
    case 'failed':
    case 'cancelled':
    case 'error':
      return 'text-red-500'
    case 'aborted':
      return 'text-violet-500'
    default:
      return 'text-neutral-400'
  }
}

export function originBadge(kind?: ProcessOriginKind): { label: string; cls: string } {
  switch (kind) {
    case 'ai':
      return { label: 'AI 助手', cls: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-300' }
    case 'editor':
      return { label: '编辑器', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' }
    case 'terminal':
      return { label: '终端', cls: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-500/15 dark:text-neutral-300' }
    case 'system':
      return { label: '系统', cls: 'bg-neutral-200 text-neutral-500 dark:bg-neutral-600/25 dark:text-neutral-400' }
    case 'this-app':
      return { label: '总控台', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' }
    default:
      return { label: '其他', cls: 'bg-stone-100 text-stone-600 dark:bg-stone-500/15 dark:text-stone-300' }
  }
}
