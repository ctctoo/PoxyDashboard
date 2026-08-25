import { ref } from 'vue'
import { api } from '../lib/api'
import type { SystemOverview } from '@shared/types'
import { snapshot } from './monitor'
import { appEntries } from './apps'
import { reload as reloadApps2 } from './apps2'
import { reload as reloadWorkspaces } from './workspaces'

/** Module 1 · Home Dashboard 总览状态 */
export const overview = ref<SystemOverview | null>(null)
export const overviewReady = ref(false)

/** 最近启动的应用（带 pid/状态，来自 launchpad runtime） */
export function runningEntityCount(): number {
  return appEntries.value.filter((e) => ['starting', 'running', 'stopping'].includes(e.runtime.status))
    .length
}

export async function initOverview(): Promise<void> {
  overview.value = await api.getSystemOverview()
  // 并行预热应用/工作区索引，Home 展示快捷入口
  await Promise.allSettled([reloadApps2(), reloadWorkspaces()])
  overviewReady.value = true
}

export async function refreshOverview(): Promise<void> {
  overview.value = await api.getSystemOverview()
}

export function refreshFromSnapshot(): void {
  if (!snapshot.value) return
  const s = snapshot.value
  overview.value = {
    ...(overview.value ?? emptyOverview()),
    runningApps: runningEntityCount(),
    services: s.stats.serviceCount,
    containers: s.containers.filter((c) => c.status === 'running').length,
    databases: s.dbs.filter((d) => d.status === 'running').length,
    agents: s.agents.filter((a) => a.status === 'running').length,
    ts: Date.now()
  }
}

function emptyOverview(): SystemOverview {
  return {
    cpu: { usage: 0, cores: 0, history: [] },
    memory: { usedMB: 0, capacityMB: 0, percent: 0, history: [] },
    disk: { totalGB: 0, freeGB: 0, percent: 0 },
    runningApps: 0,
    services: 0,
    containers: 0,
    databases: 0,
    agents: 0,
    alerts: 0,
    workspaces: 0,
    models: 0,
    ts: 0
  }
}
