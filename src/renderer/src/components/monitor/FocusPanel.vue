<script setup lang="ts">
import { ref } from 'vue'
import { X } from '@lucide/vue'
import { formatMem } from '../../lib/fmt'
import { addKeyword, focusKeywords, focusQuery, focused, removeKeyword } from '../../stores/monitor'

const input = ref('')

async function submit(): Promise<void> {
  const k = input.value.trim()
  if (!k) return
  await addKeyword(k)
  focusQuery.value = k
  input.value = ''
}
</script>

<template>
  <section class="card p-4">
    <div class="mb-2 flex items-center justify-between">
      <h3 class="text-sm font-semibold">关注的进程</h3>
      <span class="text-xs text-neutral-400">输入关键字（如 ffmpeg）回车，实时列出匹配进程</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span v-for="kw in focusKeywords" :key="kw" class="chip">
        {{ kw }}
        <button class="text-neutral-400 hover:text-red-500" @click="removeKeyword(kw)"><X :size="12" /></button>
      </span>
      <input v-model="input" class="input !w-64" placeholder="输入关键字回车…" @keydown.enter="submit" />
    </div>
    <div v-if="focused.length" class="mt-3 space-y-1">
      <div
        v-for="p in focused"
        :key="p.pid"
        class="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
      >
        <span class="text-emerald-500">●</span>
        <span class="font-medium">{{ p.name }}</span>
        <span class="text-neutral-400">PID {{ p.pid }}</span>
        <span class="text-neutral-400">{{ p.cpu }}% / {{ formatMem(p.memMB) }}</span>
        <span class="min-w-0 flex-1 truncate font-mono text-neutral-400">{{ p.cmdline }}</span>
      </div>
    </div>
    <p v-else-if="focusQuery" class="mt-3 text-xs text-neutral-400">没有匹配的进程</p>
  </section>
</template>
