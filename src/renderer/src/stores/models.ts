import { computed, ref } from 'vue'
import { api } from '../lib/api'
import type { LocalModel, LocalModelConfig, ModelEnv, ModelRuntime } from '@shared/types'
import type { ModelInput } from '@shared/api'

/** Module 8 · Local LLM 状态 */
export const models = ref<LocalModel[]>([])
export const envs = ref<ModelEnv[]>([])
export const modelsReady = ref(false)
export const query = ref('')

export const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return models.value
  return models.value.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.model.toLowerCase().includes(q) ||
      m.runtime.toLowerCase().includes(q)
  )
})

export const runningCount = computed(
  () => models.value.filter((m) => ['running', 'starting'].includes(m.status)).length
)

let unsub: (() => void) | null = null
let unsubRt: (() => void) | null = null

export async function initModels(): Promise<void> {
  unsub?.()
  unsubRt?.()
  unsub = api.on('models:changed', () => void reload())
  unsubRt = api.on('models:runtime', ({ id, model }) => applyRuntime(id, model))
  await Promise.all([reload(), refreshEnvs()])
}

export async function reload(): Promise<void> {
  models.value = await api.listModels()
  modelsReady.value = true
}

/** 刷新运行环境检测结果 */
export async function refreshEnvs(): Promise<ModelEnv[]> {
  envs.value = await api.detectModelEnvs()
  return envs.value
}

/** 本地应用运行状态变更（来自事件） */
function applyRuntime(id: string, m: LocalModel): void {
  const i = models.value.findIndex((x) => x.id === id)
  if (i === -1) return
  models.value[i] = m
  models.value = [...models.value]
}

/** 新增模型 */
export async function addModel(input: ModelInput): Promise<LocalModel | null> {
  const m = await api.addModel(input)
  await reload()
  return m
}

export async function updateModel(
  id: string,
  patch: Partial<LocalModelConfig>
): Promise<LocalModel | undefined> {
  const m = await api.updateModel(id, patch)
  await reload()
  return m
}

export function removeModel(id: string): void {
  void api.removeModel(id).then(() => reload())
}

export function togglePin(id: string, v: boolean): void {
  void api.updateModel(id, { pinned: v }).then(() => reload())
}

export function startModel(id: string): void {
  void api.startModel(id)
}

export function stopModel(id: string): void {
  void api.stopModel(id)
}

/** 预览命令 */
export function previewCommand(input: ModelInput): Promise<string> {
  return api.buildModelCommand(input)
}

export function envFor(runtime: ModelRuntime): ModelEnv | undefined {
  return envs.value.find((e) => e.kind === runtime)
}
