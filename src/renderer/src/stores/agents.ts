import { computed, ref } from 'vue'
import type { AgentRow } from '@shared/types'
import { snapshot } from './monitor'
import { formatMem } from '../lib/fmt'

/**
 * 运行中的 AI agent 列表（直接来自 monitor snapshot，主进程已只聚合运行中进程）。
 * 本模块仅负责「展示」：无任何启动/停止/重启等控制能力。
 */
export const agents = computed<AgentRow[]>(() => snapshot.value?.agents ?? [])

/** 初始化占位：agent 数据完全来自 monitor snapshot，无需额外加载（保留以兼容 App 启动流程） */
export async function initAgents(): Promise<void> {
  /* no-op */
}

// ---- 排序 / 分组 / 筛选（纯展示） ----
export type AgentSortKey = 'cpu' | 'mem' | 'lastActive' | 'taskCount'
export const sortKey = ref<AgentSortKey>('cpu')
export const searchText = ref('')
export const groupByKind = ref(false)

function statusOrder(s: AgentRow['status']): number {
  return s === 'running' ? 0 : s === 'idle' ? 1 : 2
}

export const filteredAgents = computed<AgentRow[]>(() => {
  let list = agents.value
  const q = searchText.value.trim().toLowerCase()
  if (q) {
    list = list.filter((a) => a.label.toLowerCase().includes(q) || a.kind.toLowerCase().includes(q))
  }
  const sorted = [...list]
  switch (sortKey.value) {
    case 'cpu':
      sorted.sort((a, b) => b.cpu - a.cpu)
      break
    case 'mem':
      sorted.sort((a, b) => b.memMB - a.memMB)
      break
    case 'taskCount':
      sorted.sort((a, b) => b.taskCount - a.taskCount)
      break
    case 'lastActive':
      sorted.sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0))
      break
    default:
      sorted.sort((a, b) => statusOrder(a.status) - statusOrder(b.status) || b.cpu - a.cpu)
  }
  if (groupByKind.value) {
    sorted.sort(
      (a, b) => a.kind.localeCompare(b.kind) || statusOrder(a.status) - statusOrder(b.status)
    )
  }
  return sorted
})

export const groupedAgents = computed<Record<string, AgentRow[]>>(() => {
  const out: Record<string, AgentRow[]> = {}
  for (const a of filteredAgents.value) {
    ;(out[a.kind] ??= []).push(a)
  }
  return out
})

// ---- 顶部统计 ----
export const runningCount = computed(
  () => agents.value.filter((a) => a.status === 'running').length
)
export const totalCpu = computed(
  () => Math.round(agents.value.reduce((s, a) => s + a.cpu, 0) * 10) / 10
)
export const totalMemMB = computed(
  () => Math.round(agents.value.reduce((s, a) => s + a.memMB, 0) * 10) / 10
)

/** 单个任务进程的显示内存 */
export function taskMem(task: { memMB: number }): string {
  return formatMem(task.memMB)
}

export function formatDuration(ms?: number): string {
  if (ms == null) return '—'
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${String(m % 60).padStart(2, '0')}m`
}
