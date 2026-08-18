import { computed } from 'vue'
import { api } from '../lib/api'
import type { AgentRow } from '@shared/types'
import { snapshot } from './monitor'
import { confirmDialog } from './confirm'
import { formatMem } from '../lib/fmt'

/** 从 monitor snapshot 派生 AI agent 聚合数据（运行中 + 已安装未启动） */
export const agents = computed<AgentRow[]>(() => snapshot.value?.agents ?? [])

export const runningCount = computed(() => agents.value.filter((a) => a.status === 'running').length)

export const installedCount = computed(() => agents.value.filter((a) => a.status === 'not-running').length)

export const totalCpu = computed(() => Math.round(agents.value.reduce((s, a) => s + a.cpu, 0) * 10) / 10)

export const totalMemMB = computed(() => Math.round(agents.value.reduce((s, a) => s + a.memMB, 0) * 10) / 10)

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

/** 终止失败时给出明确提示，避免未处理异常 */
async function notifyFailure(what: string): Promise<void> {
  await confirmDialog({
    title: '终止操作未完成',
    body: `无法${what}。该进程可能已被结束、权限不足或已退出。\n你可以在服务监控/日志中确认其状态后重试。`,
    confirmText: '知道了'
  })
}

/** 安全结束某个 agent 派生任务进程 */
export async function stopTask(pid: number): Promise<void> {
  const ok = await confirmDialog({
    title: '结束该 AI 任务进程？',
    body: `将安全结束进程 pid=${pid} 及其子进程树。`,
    danger: true,
    confirmText: '结束进程'
  })
  if (!ok) return
  try {
    const r = await api.stopAgentTask(pid)
    if (!r.ok) await notifyFailure(`结束该任务进程（pid=${pid}）`)
  } catch {
    await notifyFailure(`结束该任务进程（pid=${pid}）`)
  }
}

/** 退出整个 agent 应用（进程树） */
export async function stopAgent(row: AgentRow): Promise<void> {
  if (!row.pid) return
  const ok = await confirmDialog({
    title: `退出「${row.label}」？`,
    body: `将安全结束「${row.label}」及其全部子进程。若它正在跑任务会一并停止。`,
    danger: true,
    confirmText: '退出'
  })
  if (!ok) return
  try {
    const r = await api.stopAgent(row.pid)
    if (!r.ok) await notifyFailure(`退出「${row.label}」`)
  } catch {
    await notifyFailure(`退出「${row.label}」`)
  }
}

/** 重启 agent 应用（仅内置启动命令可自动重启） */
export async function restartAgent(row: AgentRow): Promise<boolean> {
  const result = await api.restartAgent(row.kind)
  if (!result.ok) {
    await confirmDialog({
      title: '无法自动重启',
      body: `未配置「${row.label}」的启动命令，请手动打开该应用。`,
      confirmText: '知道了'
    })
    return false
  }
  return true
}

/** 启动一个已安装但未运行的 agent */
export async function startAgent(row: AgentRow): Promise<boolean> {
  const result = await api.startAgent(row.kind)
  if (!result.ok) {
    await confirmDialog({
      title: '无法自动启动',
      body: `未找到「${row.label}」的可执行文件或启动命令，请确认安装情况后手动打开。`,
      confirmText: '知道了'
    })
    return false
  }
  return true
}
