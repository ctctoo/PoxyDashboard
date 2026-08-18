<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { FileCode2, FolderOpen, Sparkles } from '@lucide/vue'
import type { AppKind, DetectionResult } from '@shared/types'
import { api } from '../../lib/api'
import { addApp, updateApp } from '../../stores/apps'
import { closeEditor, editorState } from '../../stores/ui'
import Modal from '../Modal.vue'

const form = reactive({ kind: 'service' as AppKind, name: '', icon: '', dir: '', command: '', scriptPath: '', port: '' })
const detection = ref<DetectionResult | null>(null)
const issues = ref<string[]>([])
const saving = ref(false)

watch(
  () => editorState.value.open,
  (v) => {
    if (v) reset()
  },
  { immediate: true }
)

function reset(): void {
  const a = editorState.value.app
  form.kind = editorState.value.kind
  form.name = a?.name ?? ''
  form.icon = a?.icon ?? ''
  form.dir = a?.dir ?? ''
  form.command = a?.command ?? ''
  form.scriptPath = a?.scriptPath ?? ''
  form.port = a?.port ? String(a.port) : ''
  detection.value = null
  issues.value = []
}

async function pickDir(): Promise<void> {
  const dir = await api.pickDirectory()
  if (!dir) return
  form.dir = dir
  if (!form.name) form.name = dir.split(/[\\/]/).filter(Boolean).pop() ?? ''
  detection.value = await api.detectProject(dir)
  if (detection.value.candidates.length && !form.command) applyCandidate(0)
}

function applyCandidate(i: number): void {
  const c = detection.value?.candidates[i]
  if (!c) return
  form.command = c.command
  if (c.port) form.port = String(c.port)
  if (c.kind === 'task') form.kind = 'task'
}

async function pickScript(): Promise<void> {
  const p = await api.pickScript()
  if (!p) return
  form.scriptPath = p
  form.kind = 'task'
  const det = await api.scriptCommand(p)
  if (det.candidates.length) form.command = det.candidates[0].command
}

async function save(): Promise<void> {
  issues.value = []
  if (!form.name.trim()) issues.value.push('请填写名称')
  if (!form.command.trim()) issues.value.push('请填写启动命令，或选择脚本 / 候选命令')
  if (issues.value.length) return
  saving.value = true
  try {
    const payload = {
      kind: form.kind,
      name: form.name.trim(),
      icon: form.icon.trim() || undefined,
      dir: form.dir.trim() || undefined,
      command: form.command.trim(),
      scriptPath: form.scriptPath.trim() || undefined,
      port: form.kind === 'service' && form.port ? Number(form.port) : undefined
    }
    if (editorState.value.app) await updateApp(editorState.value.app.id, payload)
    else await addApp(payload)
    closeEditor()
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Modal :title="editorState.app ? `编辑「${editorState.app.name}」` : form.kind === 'service' ? '添加服务' : '添加任务'" width="600px" @close="closeEditor">
    <div class="space-y-4 text-sm">
      <div class="flex gap-2">
        <button
          class="btn-ghost flex-1"
          :class="{ '!border-emerald-500 !text-emerald-600': form.kind === 'service' }"
          @click="form.kind = 'service'"
        >
          🚀 服务 <span class="text-[11px] text-neutral-400">长期运行 · 端口语义</span>
        </button>
        <button
          class="btn-ghost flex-1"
          :class="{ '!border-emerald-500 !text-emerald-600': form.kind === 'task' }"
          @click="form.kind = 'task'"
        >
          📋 任务 <span class="text-[11px] text-neutral-400">批处理 · 明确结束</span>
        </button>
      </div>

      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div>
          <label class="mb-1 block text-xs text-neutral-400">名称</label>
          <input v-model="form.name" class="input" placeholder="例如：前端开发服务器" />
        </div>
        <div class="pt-4">
          <label class="mb-1 block text-xs text-neutral-400">图标</label>
          <input v-model="form.icon" class="input w-16 text-center" placeholder="🚀" maxlength="4" />
        </div>
        <div>
          <label class="mb-1 block text-xs text-neutral-400">端口（可选）</label>
          <input v-model="form.port" class="input" type="number" min="1" max="65535" placeholder="服务可留空自动发现" :disabled="form.kind === 'task'" />
        </div>
      </div>

      <div>
        <label class="mb-1 flex items-center justify-between text-xs text-neutral-400">
          <span>工作目录</span>
          <button class="text-emerald-600 hover:underline" @click="pickDir"><FolderOpen :size="12" class="inline" /> 选择文件夹</button>
        </label>
        <input v-model="form.dir" class="input font-mono" placeholder="D:\Project\My\..." />
        <div v-if="detection" class="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          <div class="flex items-center gap-1.5 text-xs text-neutral-500">
            <Sparkles :size="13" class="text-emerald-500" />
            自动识别：{{ detection.type }}
          </div>
          <div v-if="detection.candidates.length" class="mt-2 flex flex-wrap gap-1.5">
            <button
              v-for="(c, i) in detection.candidates"
              :key="i"
              class="chip cursor-pointer border border-transparent hover:border-emerald-400"
              @click="applyCandidate(i)"
            >
              {{ c.label }}{{ c.port ? ` · :${c.port}` : '' }}
            </button>
          </div>
          <p v-else class="mt-1.5 text-xs text-amber-600">未识别到候选命令，请手动填写或选择脚本</p>
        </div>
      </div>

      <div>
        <label class="mb-1 flex items-center justify-between text-xs text-neutral-400">
          <span>启动命令</span>
          <button class="text-emerald-600 hover:underline" @click="pickScript"><FileCode2 :size="12" class="inline" /> 选择脚本</button>
        </label>
        <textarea v-model="form.command" class="input min-h-16 resize-y font-mono" placeholder="例如：pnpm run dev" />
        <p v-if="form.scriptPath" class="mt-1 text-[11px] text-neutral-400">
          脚本路径（仅保存路径，不复制内容）：<span class="font-mono">{{ form.scriptPath }}</span>
        </p>
      </div>

      <ul v-if="issues.length" class="space-y-1 text-xs text-red-500">
        <li v-for="(iss, i) in issues" :key="i">· {{ iss }}</li>
      </ul>

      <div class="flex justify-end gap-2 pt-1">
        <button class="btn-ghost" @click="closeEditor">取消</button>
        <button class="btn-primary" :disabled="saving" @click="save">{{ editorState.app ? '保存' : '添加' }}</button>
      </div>
    </div>
  </Modal>
</template>
