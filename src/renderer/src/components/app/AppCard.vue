<script setup lang="ts">
import { computed } from 'vue'
import {
  AlertTriangle,
  FolderOpen,
  GripVertical,
  Link2,
  Pencil,
  Play,
  RotateCw,
  ScrollText,
  Square,
  Stethoscope,
  Trash2
} from '@lucide/vue'
import type { AppEntry } from '@shared/types'
import { formatDuration, statusColor, statusLabel } from '../../lib/fmt'
import { removeApp, restart, start, stop, validity } from '../../stores/apps'
import { confirmDialog } from '../../stores/confirm'
import { openLogs } from '../../stores/logs'
import { openEdit } from '../../stores/ui'

const props = defineProps<{ entry: AppEntry }>()
const emit = defineEmits<{ diagnose: [id: string] }>()

const running = computed(() => ['starting', 'running', 'stopping'].includes(props.entry.runtime.status))
const portUrl = computed(() => (props.entry.runtime.port ? `http://localhost:${props.entry.runtime.port}` : null))
const blocked = computed(() => {
  const v = validity.get(props.entry.id)
  return !!v && !v.ok
})
const blockReasons = computed(() => {
  const v = validity.get(props.entry.id)
  return v ? v.issues.filter((i) => i.level === 'error').map((i) => i.message) : []
})
const busy = computed(() => ['starting', 'stopping'].includes(props.entry.runtime.status))

const primaryLabel = computed(() => {
  if (props.entry.kind === 'task') return running.value ? '中止' : '运行'
  return running.value ? '停止' : '启动'
})

async function onPrimary(): Promise<void> {
  if (running.value) await stop(props.entry.id)
  else await start(props.entry.id)
}

async function onRestart(): Promise<void> {
  if (running.value) await restart(props.entry.id)
  else await start(props.entry.id)
}

async function onRemove(): Promise<void> {
  const ok = await confirmDialog({
    title: `删除「${props.entry.name}」？`,
    body: '删除后配置将被移除，已启动的进程不会自动终止。',
    danger: true,
    confirmText: '删除'
  })
  if (ok) await removeApp(props.entry.id)
}

async function onCopy(): Promise<void> {
  if (portUrl.value) {
    await navigator.clipboard.writeText(portUrl.value)
  }
}
</script>

<template>
  <article class="card group relative flex gap-2 p-4">
    <div class="drag-handle mt-1 cursor-grab opacity-0 transition-opacity group-hover:opacity-100" title="拖拽排序">
      <GripVertical :size="15" class="text-neutral-400" />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="text-lg leading-none">{{ entry.icon ?? (entry.kind === 'service' ? '🚀' : '📋') }}</span>
        <span class="truncate font-semibold">{{ entry.name }}</span>
        <span class="text-xs font-medium" :class="statusColor(entry.runtime.status)">
          {{ statusLabel(entry.runtime.status, entry.kind) }}
        </span>
        <button v-if="running && entry.runtime.port" class="chip-port" :title="`复制 ${portUrl}`" @click="onCopy">
          :{{ entry.runtime.port }}
        </button>
        <span v-if="running" class="text-xs text-neutral-400">
          {{ formatDuration(Date.now() - (entry.runtime.startedAt ?? Date.now())) }}
        </span>
      </div>
      <div class="mt-1 truncate font-mono text-xs text-neutral-500 dark:text-neutral-400">{{ entry.command }}</div>
      <div v-if="entry.dir || entry.scriptPath" class="mt-0.5 flex items-center gap-1 truncate text-xs text-neutral-400">
        <FolderOpen :size="12" class="shrink-0" />
        <span class="truncate">{{ entry.scriptPath ?? entry.dir }}</span>
      </div>
      <div v-if="blocked" class="mt-1.5 flex items-center gap-1 text-xs text-red-500">
        <AlertTriangle :size="12" class="shrink-0" />
        <span class="truncate">{{ blockReasons[0] }}</span>
        <button class="shrink-0 underline underline-offset-2" @click="emit('diagnose', entry.id)">启动诊断</button>
      </div>
      <div v-else-if="entry.runtime.error && !running" class="mt-1.5 flex items-center gap-1 text-xs text-red-500">
        <AlertTriangle :size="12" class="shrink-0" />
        <span class="truncate">{{ entry.runtime.error }}</span>
        <button class="shrink-0 underline underline-offset-2" @click="emit('diagnose', entry.id)">启动诊断</button>
      </div>
    </div>
    <div class="flex shrink-0 flex-col items-end gap-2">
      <button class="btn-primary w-24" :class="{ 'btn-danger': running }" :disabled="busy || (blocked && !running)" @click="onPrimary">
        <Play v-if="!running" :size="14" />
        <Square v-else :size="12" />
        {{ primaryLabel }}
      </button>
      <div class="flex gap-0.5">
        <button class="icon-btn" :disabled="!portUrl" title="复制链接" @click="onCopy"><Link2 :size="14" /></button>
        <button class="icon-btn" title="日志" @click="openLogs(entry.id)"><ScrollText :size="14" /></button>
        <button class="icon-btn" title="启动诊断" @click="emit('diagnose', entry.id)"><Stethoscope :size="14" /></button>
        <button class="icon-btn" :disabled="!running" title="重启" @click="onRestart"><RotateCw :size="14" /></button>
        <button class="icon-btn" title="编辑" @click="openEdit(entry)"><Pencil :size="14" /></button>
        <button class="icon-btn hover:!text-red-500" title="删除" @click="onRemove"><Trash2 :size="14" /></button>
      </div>
    </div>
  </article>
</template>
