import { reactive, ref } from 'vue'
import { api } from '../lib/api'
import type { LogLine } from '@shared/types'

export const activeId = ref<string | null>(null)
export const linesByApp = reactive(new Map<string, LogLine[]>())
export const lastLine = reactive(new Map<string, LogLine>())
export const loaded = reactive(new Set<string>())

let unsub: (() => void) | undefined

export function initLogs(): void {
  unsub?.()
  unsub = api.on('logs:append', ({ appId, lines }: { appId: string; lines: LogLine[] }) => {
    const buf = linesByApp.get(appId) ?? []
    buf.push(...lines)
    if (buf.length > 4000) buf.splice(0, buf.length - 4000)
    linesByApp.set(appId, buf)
    const last = lines[lines.length - 1]
    if (last) lastLine.set(appId, last)
  })
}

export async function openLogs(appId: string): Promise<void> {
  activeId.value = appId
  if (!loaded.has(appId)) {
    const ls = await api.getLogLines(appId)
    linesByApp.set(appId, ls)
    loaded.add(appId)
    if (ls.length) lastLine.set(appId, ls[ls.length - 1])
  }
}

export function clearLines(appId: string): void {
  linesByApp.set(appId, [])
}
