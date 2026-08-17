import { computed, ref } from 'vue'
import { api } from '../lib/api'
import type { HiddenPortEntry, MonitorSnapshot, PortAlert, ProcessInfo } from '@shared/types'

export const snapshot = ref<MonitorSnapshot | null>(null)
export const alerts = ref<PortAlert[]>([])
export const hiddenPorts = ref<HiddenPortEntry[]>([])
export const focusKeywords = ref<string[]>([])
export const focusQuery = ref('')
export const cpuHistory = ref<number[]>([])
export const memHistory = ref<number[]>([])
export const pinnedRows = ref<Set<string>>(new Set())
export const expandedCmd = ref<Set<string>>(new Set())

let unsubs: Array<() => void> = []

export async function initMonitor(): Promise<void> {
  unsubs.forEach((f) => f())
  unsubs = [
    api.on('monitor:snapshot', (s) => {
      snapshot.value = s
      cpuHistory.value = [...cpuHistory.value.slice(-23), s.stats.totalCpu]
      memHistory.value = [...memHistory.value.slice(-23), s.stats.totalMemMB]
    }),
    api.on('monitor:alerts', (list) => {
      const existing = new Set(alerts.value.map((a) => a.port))
      alerts.value = [...alerts.value, ...list.filter((a) => !existing.has(a.port))]
    }),
    api.on('apps:changed', () => {
      void refreshMeta()
    })
  ]
  const [s, h] = await Promise.all([api.getMonitorState(), api.getHiddenPorts()])
  if (s) snapshot.value = s
  hiddenPorts.value = h
  const cfg = await api.getConfig()
  focusKeywords.value = cfg.focusKeywords
}

async function refreshMeta(): Promise<void> {
  const [h, cfg] = await Promise.all([api.getHiddenPorts(), api.getConfig()])
  hiddenPorts.value = h
  focusKeywords.value = cfg.focusKeywords
}

export const focused = computed<ProcessInfo[]>(() => {
  const q = focusQuery.value.trim().toLowerCase()
  if (!q) return []
  const all = [...(snapshot.value?.services ?? []), ...(snapshot.value?.background ?? [])]
  return all.filter(
    (p) => p.name.toLowerCase().includes(q) || p.cmdline.toLowerCase().includes(q) || (p.dir ?? '').toLowerCase().includes(q)
  )
})

export const pendingAlertCount = computed(() => alerts.value.length)

export async function addKeyword(kw: string): Promise<void> {
  const k = kw.trim()
  if (!k) return
  await api.addFocusKeyword(k)
  focusKeywords.value = [...focusKeywords.value, k]
}

export async function removeKeyword(kw: string): Promise<void> {
  await api.removeFocusKeyword(kw)
  focusKeywords.value = focusKeywords.value.filter((x) => x !== kw)
}

export async function dismissAlert(port: number): Promise<void> {
  await api.dismissPort(port)
  alerts.value = alerts.value.filter((a) => a.port !== port)
}

export async function ignoreAlert(port: number): Promise<void> {
  await api.ignorePort(port)
  alerts.value = alerts.value.filter((a) => a.port !== port)
}

export async function hideAlert(port: number): Promise<void> {
  await api.hidePort(port)
  alerts.value = alerts.value.filter((a) => a.port !== port)
  await refreshHidden()
}

export async function unhide(port: number): Promise<void> {
  await api.unhidePort(port)
  await refreshHidden()
}

export async function refreshHidden(): Promise<void> {
  hiddenPorts.value = await api.getHiddenPorts()
}

export async function claim(port: number): Promise<void> {
  await api.claimPort(port)
  alerts.value = alerts.value.filter((a) => a.port !== port)
}

export function togglePin(key: string): void {
  const s = new Set(pinnedRows.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  pinnedRows.value = s
}

export function toggleExpand(key: string): void {
  const s = new Set(expandedCmd.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  expandedCmd.value = s
}

export async function killProcess(pid: number): Promise<void> {
  await api.killProcess(pid)
}
