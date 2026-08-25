import { computed, ref } from 'vue'
import { api } from '../lib/api'
import type { Workspace } from '@shared/types'

/** Module 4 · Workspace Manager 状态 */
export const workspaces = ref<Workspace[]>([])
export const workspacesReady = ref(false)
export const query = ref('')

export const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return workspaces.value
  return workspaces.value.filter(
    (w) =>
      w.name.toLowerCase().includes(q) ||
      w.path.toLowerCase().includes(q) ||
      (w.techStack ?? '').toLowerCase().includes(q)
  )
})

let unsub: (() => void) | null = null

export async function initWorkspaces(): Promise<void> {
  unsub?.()
  unsub = api.on('ws:updated', () => void reload())
  await reload()
}

export async function reload(): Promise<void> {
  workspaces.value = await api.listWorkspaces()
  workspacesReady.value = true
}

export async function add(path: string): Promise<Workspace | null> {
  const ws = await api.addWorkspace(path)
  if (ws) await reload()
  return ws
}

export function togglePin(id: string, v: boolean): void {
  void api.setWorkspacePinned(id, v).then(() => reload())
}

export function remove(id: string): void {
  void api.removeWorkspace(id).then(() => reload())
}

export function open(id: string): void {
  void api.openWorkspace(id)
}

export function start(id: string): void {
  void api.startWorkspace(id)
}
