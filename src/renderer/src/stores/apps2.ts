import { computed, ref } from 'vue'
import { api } from '../lib/api'
import type { DesktopApp } from '@shared/types'

/** Module 2 · Application Manager 状态 */
export const apps = ref<DesktopApp[]>([])
export const appsReady = ref(false)
export const syncing = ref(false)
export const query = ref('')

export const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return apps.value
  return apps.value.filter(
    (a) => a.name.toLowerCase().includes(q) || (a.category ?? '').toLowerCase().includes(q)
  )
})

export const pinnedApps = computed(() => filtered.value.filter((a) => a.pinned))
export const unpinnedApps = computed(() => filtered.value.filter((a) => !a.pinned))

let unsub: (() => void) | null = null

export async function initApps2(): Promise<void> {
  unsub?.()
  unsub = api.on('apps2:updated', () => void reload())
  await reload()
}

export async function reload(): Promise<void> {
  apps.value = await api.listApplications()
  appsReady.value = true
}

export async function syncDiscovered(): Promise<{ added: number; total: number }> {
  syncing.value = true
  try {
    const r = await api.syncDiscoveredApps()
    await reload()
    return r
  } finally {
    syncing.value = false
  }
}

export function togglePin(id: string, v: boolean): void {
  void api.setAppPinnedDesktop(id, v).then(() => reload())
}

export function setCategory(id: string, category?: string): void {
  void api.setAppCategory(id, category).then(() => reload())
}

export function remove(id: string): void {
  void api.removeApplication(id).then(() => reload())
}

export function launch(id: string): void {
  void api.launchApplication(id)
}
