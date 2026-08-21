import { computed, reactive, ref } from 'vue'
import { api } from '../lib/api'
import type { AppConfig, AppEntry, AppRuntime, NewAppInput, ValidationResult } from '@shared/types'

export const configs = ref<AppConfig[]>([])
export const runtimes = reactive(new Map<string, AppRuntime>())
export const validity = reactive(new Map<string, ValidationResult>())
/** 启动台应用列表是否已加载完成 */
export const appsReady = ref(false)

function defaultOf(c: AppConfig): AppRuntime {
  return c.claimed
    ? {
        status: 'running',
        pid: c.claimed.pid,
        port: c.claimed.port,
        startedAt: c.claimed.startedAt
      }
    : { status: 'stopped' }
}

export const appEntries = computed<AppEntry[]>(() =>
  configs.value.map((c) => ({ ...c, runtime: runtimes.get(c.id) ?? defaultOf(c) }))
)

let unsubs: Array<() => void> = []

export async function initApps(): Promise<void> {
  unsubs.forEach((f) => f())
  unsubs = [
    api.on('apps:changed', () => void reload()),
    api.on('apps:runtime', ({ id, runtime }: { id: string; runtime: AppRuntime }) => {
      runtimes.set(id, runtime)
    })
  ]
  await reload()
  appsReady.value = true
}

export async function reload(): Promise<void> {
  const list = await api.getApps()
  runtimes.clear()
  validity.clear()
  const cfgs: AppConfig[] = []
  for (const e of list) {
    runtimes.set(e.id, e.runtime)
    const { runtime: _r, ...cfg } = e
    cfgs.push(cfg)
  }
  configs.value = cfgs
  for (const c of cfgs) {
    validity.set(c.id, await api.validateApp(c.id))
  }
  appsReady.value = true
}

export async function addApp(input: NewAppInput): Promise<void> {
  await api.addApp(input)
  await reload()
}

export async function updateApp(id: string, patch: Partial<AppConfig>): Promise<void> {
  await api.updateApp(id, patch)
  await reload()
}

export async function removeApp(id: string): Promise<void> {
  await api.removeApp(id)
  await reload()
}

export async function reorder(ids: string[]): Promise<void> {
  await api.reorderApps(ids)
}

export function start(id: string): Promise<AppRuntime> {
  return api.startApp(id)
}

export function stop(id: string): Promise<AppRuntime> {
  return api.stopApp(id)
}

export function restart(id: string): Promise<AppRuntime> {
  return api.restartApp(id)
}

export function stopAll(): Promise<void> {
  return api.stopAllApps()
}

export function setPinned(id: string, v: boolean): void {
  void api.setAppPinned(id, v)
}

export function setHidden(id: string, v: boolean): void {
  void api.setAppHidden(id, v)
}
