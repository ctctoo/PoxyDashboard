import { reactive, ref } from 'vue'
import { api } from '../lib/api'
import type { AppInfo, Settings } from '@shared/types'

export const settings = reactive<Settings>({ notifyTaskComplete: true, theme: 'auto' })
export const appInfo = ref<AppInfo | null>(null)

export async function initSettings(): Promise<void> {
  const [cfg, info] = await Promise.all([api.getConfig(), api.getAppInfo()])
  Object.assign(settings, cfg.settings)
  appInfo.value = info
  applyTheme()
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'auto') applyTheme()
  })
  api.on('settings:changed', (s) => {
    Object.assign(settings, s)
    applyTheme()
  })
}

export function applyTheme(): void {
  const dark =
    settings.theme === 'dark' || (settings.theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(t: Settings['theme']): void {
  settings.theme = t
  void api.updateSettings({ theme: t })
}

export function setNotify(v: boolean): void {
  settings.notifyTaskComplete = v
  void api.updateSettings({ notifyTaskComplete: v })
}

export function cycleTheme(): void {
  const order = ['auto', 'light', 'dark'] as const
  const idx = order.indexOf(settings.theme as (typeof order)[number])
  setTheme(order[(idx + 1) % 3])
}
