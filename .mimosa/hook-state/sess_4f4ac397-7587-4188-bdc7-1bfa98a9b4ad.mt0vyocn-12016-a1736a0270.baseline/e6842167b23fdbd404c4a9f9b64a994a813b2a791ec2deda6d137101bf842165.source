import { ref } from 'vue'
import type { AppConfig, AppKind } from '@shared/types'

export const editorState = ref<{ open: boolean; kind: AppKind; app: AppConfig | null }>({
  open: false,
  kind: 'service',
  app: null
})

export const diagnosticsId = ref<string | null>(null)

export function openAdd(kind: AppKind): void {
  editorState.value = { open: true, kind, app: null }
}

export function openEdit(app: AppConfig): void {
  editorState.value = { open: true, kind: app.kind, app }
}

export function closeEditor(): void {
  editorState.value.open = false
}

export function openDiagnostics(id: string): void {
  diagnosticsId.value = id
}

export function closeDiagnostics(): void {
  diagnosticsId.value = null
}
