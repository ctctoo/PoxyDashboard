<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  Search,
  RefreshCw,
  Plus,
  Pin,
  PinOff,
  Trash2,
  Play,
  Square,
  ScanSearch,
  FolderOpen,
  FileCode2,
  X,
  Check
} from '@lucide/vue'
import { api } from '../lib/api'
import {
  modelsReady,
  filtered,
  query,
  runningCount,
  envs,
  refreshEnvs,
  addModel,
  updateModel,
  removeModel,
  togglePin,
  startModel,
  stopModel,
  previewCommand,
  envFor
} from '../stores/models'
import { confirmDialog } from '../stores/confirm'
import type { LocalModel, ModelRuntime } from '@shared/types'
import { runtimeLabels, runtimeIcons, runtimeDefaultPort } from '../lib/modelMeta'

/** 表单状态 */
const formOpen = ref(false)
const editing = ref<LocalModel | null>(null)
const saving = ref(false)
const syncing = ref(false)

const form = reactive({
  name: '',
  runtime: 'ollama' as ModelRuntime,
  model: '',
  binPath: '',
  host: '127.0.0.1',
  port: 11434,
  extraArgs: '',
  dir: '',
  pinned: false
})

const runtimeOptions: ModelRuntime[] = [
  'ollama',
  'llamacpp',
  'vllm',
  'lmstudio',
  'koboldcpp',
  'textgen',
  'llamacpp-python',
  'gpt4all',
  'custom'
]

watch(
  () => form.runtime,
  (rt) => {
    form.port = runtimeDefaultPort[rt]
    const env = envFor(rt)
    if (env?.available && env.bin && rt !== 'ollama') {
      form.binPath = env.bin
    }
    if (rt === 'custom' && !form.binPath) form.binPath = ''
  }
)

function openAdd(): void {
  editing.value = null
  form.name = ''
  form.runtime = 'ollama'
  form.model = ''
  form.binPath = ''
  form.host = '127.0.0.1'
  form.port = runtimeDefaultPort.ollama
  form.extraArgs = ''
  form.dir = ''
  form.pinned = false
  formOpen.value = true
}

function openEdit(m: LocalModel): void {
  editing.value = m
  form.name = m.name
  form.runtime = m.runtime
  form.model = m.model
  form.binPath = m.binPath ?? ''
  form.host = m.host
  form.port = m.port
  form.extraArgs = m.extraArgs ?? ''
  form.dir = m.dir ?? ''
  form.pinned = m.pinned ?? false
  formOpen.value = true
}

async function onSyncEnvs(): Promise<void> {
  syncing.value = true
  try {
    await refreshEnvs()
  } finally {
    syncing.value = false
  }
}

async function pickModelFile(): Promise<void> {
  const p = await api.pickModelFile()
  if (p) {
    form.model = p
    if (!form.name) form.name = p.split(/[\\/]/).pop() ?? p
    form.dir = p.split(/[\\/]/).slice(0, -1).join('/')
  }
}

async function pickBin(): Promise<void> {
  const p = await api.pickExecutable()
  if (p) form.binPath = p
}

async function pickDir(): Promise<void> {
  const d = await api.pickDirectory()
  if (d) form.dir = d
}

const commandPreview = ref('')

async function buildPreview(): Promise<void> {
  if (!form.model.trim()) {
    commandPreview.value = ''
    return
  }
  commandPreview.value = await previewCommand({
    name: form.name,
    runtime: form.runtime,
    model: form.model,
    binPath: form.binPath || undefined,
    host: form.host,
    port: form.port,
    extraArgs: form.extraArgs || undefined,
    dir: form.dir || undefined
  })
}

watch(
  () => [form.runtime, form.model, form.binPath, form.host, form.port, form.extraArgs, form.dir],
  () => void buildPreview(),
  { deep: true }
)

const canSave = computed(() => form.model.trim().length > 0)

async function onSave(): Promise<void> {
  if (!canSave.value) return
  saving.value = true
  try {
    const input = {
      name: form.name,
      runtime: form.runtime,
      model: form.model,
      binPath: form.binPath || undefined,
      host: form.host,
      port: form.port,
      extraArgs: form.extraArgs || undefined,
      dir: form.dir || undefined,
      pinned: form.pinned
    }
    if (editing.value) await updateModel(editing.value.id, input)
    else await addModel(input)
    formOpen.value = false
  } finally {
    saving.value = false
  }
}

async function onRemove(m: LocalModel): Promise<void> {
  const ok = await confirmDialog({
    title: `删除「${m.name}」模型？`,
    body: '仅删除模型实例记录，不会删除模型文件。若正在运行将一并停止。',
    danger: true,
    confirmText: '删除'
  })
  if (ok) removeModel(m.id)
}

function onToggle(m: LocalModel): void {
  if (m.status === 'running' || m.status === 'starting') stopModel(m.id)
  else startModel(m.id)
}

const statusText: Record<string, string> = {
  stopped: '已停止',
  starting: '启动中',
  running: '运行中',
  stopping: '停止中',
  error: '异常'
}

function statusDot(m: LocalModel): string {
  if (m.status === 'running') return 'bg-go'
  if (m.status === 'starting' || m.status === 'stopping') return 'bg-warn animate-pulse'
  if (m.status === 'error') return 'bg-alert'
  return 'bg-line dark:bg-coal-line'
}
</script>

<template>
  <div class="h-full">
    <div
      v-if="!modelsReady"
      class="flex h-full items-center justify-center text-ink-soft dark:text-chalk-soft"
    >
      正在加载本地大模型…
    </div>
    <div v-else class="scroll-slim flex h-full flex-col gap-4 overflow-auto pb-4 pr-1">
      <!-- 工具栏 -->
      <header class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-52">
          <Search
            :size="14"
            class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft dark:text-chalk-soft"
          />
          <input v-model="query" class="input pl-9" placeholder="搜索模型（名称 / 文件 / 框架）…" />
        </div>
        <span class="font-mono text-xs text-ink-soft dark:text-chalk-soft">
          共 {{ filtered.length }} 个
          <span v-if="runningCount" class="text-go">· {{ runningCount }} 运行中</span>
        </span>
        <button class="btn-ghost" :disabled="syncing" @click="onSyncEnvs">
          <ScanSearch :size="14" :class="syncing && 'animate-spin'" /> 检测环境
        </button>
        <button class="btn-primary" @click="openAdd"><Plus :size="14" /> 添加模型</button>
      </header>

      <!-- 环境检测 -->
      <div class="card p-4">
        <div class="mb-2 flex items-center gap-2">
          <span class="panel-label">已检测到的大模型运行框架</span>
          <span class="font-mono text-[10px] text-ink-soft/60 dark:text-chalk-soft/50"
            >RUNTIME ENVIRONMENTS</span
          >
        </div>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <div
            v-for="e in envs"
            :key="e.kind"
            class="flex items-center gap-2 rounded-md border px-2.5 py-2"
            :class="
              e.available
                ? 'border-go/40 bg-go/5 dark:border-go/30 dark:bg-go/5'
                : 'border-line bg-paper opacity-60 dark:border-coal-line dark:bg-coal'
            "
          >
            <span class="text-lg">{{ e.icon }}</span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate text-xs font-medium">{{ e.label }}</span>
                <Check v-if="e.available" :size="11" class="shrink-0 text-go" />
              </div>
              <div class="truncate font-mono text-[10px] text-ink-soft dark:text-chalk-soft">
                <template v-if="e.available">{{ e.bin }}</template>
                <template v-else>未安装</template>
              </div>
            </div>
          </div>
          <div
            v-if="!envs.length"
            class="col-span-full py-2 text-center text-xs text-ink-soft dark:text-chalk-soft"
          >
            暂无检测结果，点击「检测环境」扫描本机运行框架。
          </div>
        </div>
      </div>

      <!-- 模型列表 -->
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="m in filtered" :key="m.id" class="card flex flex-col p-4">
          <div class="mb-2 flex items-start gap-3">
            <span
              class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-paper text-lg dark:border-coal-line dark:bg-coal"
            >
              {{ runtimeIcons[m.runtime] }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-semibold">{{ m.name }}</span>
                <span v-if="m.pinned" class="chip !text-[10px] text-signal">已收藏</span>
              </div>
              <div class="truncate font-mono text-[11px] text-ink-soft dark:text-chalk-soft">
                {{ runtimeLabels[m.runtime] }}
              </div>
            </div>
          </div>

          <!-- 状态 -->
          <div class="mb-2 flex items-center gap-2 font-mono text-[11px]">
            <span class="flex items-center gap-1.5">
              <span class="h-2 w-2 rounded-full" :class="statusDot(m)" />
              <b
                :class="
                  m.status === 'error' ? 'text-alert' : m.status === 'running' ? 'text-go' : ''
                "
              >
                {{ statusText[m.status] }}
              </b>
            </span>
            <span v-if="m.status === 'running'" class="text-ink-soft dark:text-chalk-soft"
              >pid={{ m.pid }}</span
            >
            <span class="chip-port">:{{ m.port }}</span>
          </div>

          <div
            v-if="m.error"
            class="mb-2 truncate rounded-md bg-alert/10 px-2 py-1 font-mono text-[11px] text-alert"
          >
            {{ m.error }}
          </div>

          <div
            class="mb-2 truncate rounded-md bg-paper px-2 py-1 font-mono text-[11px] text-ink-soft dark:bg-black/20 dark:text-chalk-soft"
          >
            {{ m.model }}
          </div>
          <div
            v-if="m.command"
            class="mb-3 truncate rounded-md bg-paper px-2 py-1 font-mono text-[10px] text-ink-soft/80 dark:bg-black/20 dark:text-chalk-soft/80"
          >
            {{ m.command }}
          </div>

          <div class="mt-auto flex items-center gap-1.5">
            <button
              class="btn-primary btn-sm flex-1"
              :class="
                (m.status === 'running' || m.status === 'starting') && '!bg-alert hover:!bg-alert'
              "
              @click="onToggle(m)"
            >
              <Square v-if="m.status === 'running' || m.status === 'starting'" :size="12" />
              <Play v-else :size="12" />
              {{ m.status === 'running' || m.status === 'starting' ? '停止' : '启动' }}
            </button>
            <button class="btn-ghost btn-sm" @click="openEdit(m)">编辑</button>
            <button
              class="icon-btn"
              :class="{ active: m.pinned }"
              :title="m.pinned ? '取消收藏' : '收藏'"
              @click="togglePin(m.id, !m.pinned)"
            >
              <PinOff v-if="m.pinned" :size="14" />
              <Pin v-else :size="14" />
            </button>
            <button class="icon-btn text-alert hover:!text-alert" title="删除" @click="onRemove(m)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>

        <div
          v-if="!filtered.length"
          class="col-span-full rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-ink-soft dark:border-coal-line dark:text-chalk-soft"
        >
          暂无模型实例。点击「添加模型」登记一个本地模型，或先「检测环境」识别运行框架。
        </div>
      </div>
    </div>

    <!-- 添加/编辑弹层 -->
    <div
      v-if="formOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="formOpen = false"
    >
      <div class="card flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden">
        <div
          class="flex items-center justify-between border-b border-line px-5 py-3 dark:border-coal-line"
        >
          <h3 class="font-mono text-sm font-bold">{{ editing ? '编辑模型' : '添加本地模型' }}</h3>
          <button class="icon-btn" @click="formOpen = false"><X :size="15" /></button>
        </div>

        <div class="scroll-slim flex-1 space-y-3 overflow-auto p-5">
          <!-- 框架选择 -->
          <div>
            <label class="panel-label block pb-1">运行框架</label>
            <div class="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              <button
                v-for="rt in runtimeOptions"
                :key="rt"
                type="button"
                class="rounded-md border px-2 py-1.5 text-xs transition"
                :class="
                  form.runtime === rt
                    ? 'border-signal bg-signal/10 text-signal'
                    : 'border-line bg-paper text-ink-soft hover:border-signal/40 dark:border-coal-line dark:bg-coal dark:text-chalk-soft'
                "
                @click="form.runtime = rt"
              >
                <span class="mr-1">{{ runtimeIcons[rt] }}</span
                >{{ runtimeLabels[rt] }}
              </button>
            </div>
            <p v-if="envFor(form.runtime)?.available" class="mt-1.5 font-mono text-[10px] text-go">
              ✓ 已检测到 {{ runtimeLabels[form.runtime] }}：{{ envFor(form.runtime)?.bin }}
            </p>
          </div>

          <div>
            <label class="panel-label block pb-1">名称（可选）</label>
            <input
              v-model="form.name"
              class="input"
              placeholder="模型实例名称，默认取文件/模型名"
            />
          </div>

          <div>
            <label class="panel-label block pb-1"> 模型 <span class="text-alert">*</span> </label>
            <div class="flex gap-2">
              <input
                v-model="form.model"
                class="input flex-1"
                placeholder="Ollama 模型名（如 qwen2.5:7b）或模型文件路径（.gguf）"
              />
              <button
                v-if="form.runtime !== 'ollama'"
                type="button"
                class="btn-ghost shrink-0"
                title="选择模型文件"
                @click="pickModelFile"
              >
                <FileCode2 :size="14" />
              </button>
            </div>
            <p
              v-if="form.runtime === 'ollama'"
              class="mt-1 font-mono text-[10px] text-ink-soft dark:text-chalk-soft"
            >
              提示：Ollama 使用模型名启动，如 <code>llama3.2</code>、<code>qwen2.5:7b</code>。
            </p>
          </div>

          <!-- 自定义可执行文件 -->
          <div v-if="form.runtime === 'custom' || form.runtime === 'llamacpp'">
            <label class="panel-label block pb-1">可执行文件</label>
            <div class="flex gap-2">
              <input v-model="form.binPath" class="input flex-1" placeholder="推理可执行文件路径" />
              <button type="button" class="btn-ghost shrink-0" @click="pickBin">
                <FolderOpen :size="14" />
              </button>
            </div>
          </div>

          <!-- 地址与端口 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="panel-label block pb-1">监听地址</label>
              <input v-model="form.host" class="input" placeholder="127.0.0.1" />
            </div>
            <div>
              <label class="panel-label block pb-1">端口</label>
              <input v-model.number="form.port" type="number" min="1" max="65535" class="input" />
            </div>
          </div>

          <div>
            <label class="panel-label block pb-1">工作目录（可选）</label>
            <div class="flex gap-2">
              <input v-model="form.dir" class="input flex-1" placeholder="模型或脚本所在目录" />
              <button type="button" class="btn-ghost shrink-0" @click="pickDir">
                <FolderOpen :size="14" />
              </button>
            </div>
          </div>

          <div>
            <label class="panel-label block pb-1">额外参数（可选，每行一个）</label>
            <textarea
              v-model="form.extraArgs"
              class="input resize-none font-mono text-xs"
              rows="2"
              placeholder="--ctx-size 8192&#10;--gpu-layers 32"
            />
          </div>

          <div class="flex items-center gap-2">
            <input id="model-pinned" v-model="form.pinned" type="checkbox" class="accent-signal" />
            <label for="model-pinned" class="text-xs text-ink-soft dark:text-chalk-soft"
              >置顶显示</label
            >
          </div>

          <!-- 命令预览 -->
          <div>
            <label class="panel-label block pb-1">启动命令预览</label>
            <pre
              class="scroll-slim max-h-24 overflow-auto rounded-md bg-paper px-3 py-2 font-mono text-[11px] text-ink-soft dark:bg-black/20 dark:text-chalk-soft"
              >{{ commandPreview || '填写模型名称/路径后自动生成' }}</pre>
          </div>
        </div>

        <div
          class="flex items-center justify-end gap-2 border-t border-line px-5 py-3 dark:border-coal-line"
        >
          <button class="btn-ghost" @click="formOpen = false">取消</button>
          <button class="btn-primary" :disabled="saving || !canSave" @click="onSave">
            <RefreshCw v-if="saving" :size="14" class="animate-spin" />
            {{ editing ? '保存' : '添加' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
