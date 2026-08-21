import { ref } from 'vue'

export interface ConfirmRequest {
  title: string
  body?: string
  danger?: boolean
  confirmText?: string
  cancelText?: string
}

const pending = ref<ConfirmRequest | null>(null)
let resolver: ((v: boolean) => void) | null = null

export function useConfirmState(): { pending: typeof pending } {
  return { pending }
}

export function confirmDialog(req: ConfirmRequest): Promise<boolean> {
  pending.value = req
  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function resolveConfirm(v: boolean): void {
  pending.value = null
  const r = resolver
  resolver = null
  r?.(v)
}
