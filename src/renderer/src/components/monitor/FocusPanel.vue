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
      <div class="flex items-center gap-2">
        <span class="h-3.5 w-1 rounded-sm bg-signal" />
        <h3 class="font-mono text-[13px] font-bold uppercase tracking-[0.1em]">关注的进程</h3>
      </div>
      <span class="font-mono text-[11px] text-ink-soft dark:text-chalk-soft">输入关键字（如 ffmpeg）回车，实时列出匹配进程</span>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span v-for="kw in focusKeywords" :key="kw" class="chip">
        {{ kw }}
        <button class="text-ink-soft/60 hover:text-alert dark:text-chalk-soft/60 dark:hover:text-alert-soft" @click="removeKeyword(kw)"><X :size="12" /></button>
      </span>
      <input v-model="input" class="input !w-64 font-mono" placeholder="输入关键字回车…" @keydown.enter="submit" />
    </div>
    <div v-if="focused.length" class="mt-3 space-y-1">
      <div
        v-for="p in focused"
        :key="p.pid"
        class="flex items-center gap-2 rounded-md border border-transparent px-2 py-1 text-xs hover:border-line hover:bg-paper dark:hover:border-coal-line dark:hover:bg-black/20"
      >
        <span class="h-1.5 w-1.5 rounded-full bg-go pulse-dot" />
        <span class="font-medium">{{ p.name }}</span>
        <span class="font-mono text-ink-soft dark:text-chalk-soft">PID {{ p.pid }}</span>
        <span class="font-mono tabular-nums text-ink-soft dark:text-chalk-soft">{{ p.cpu }}% / {{ formatMem(p.memMB) }}</span>
        <span class="min-w-0 flex-1 truncate font-mono text-ink-soft/70 dark:text-chalk-soft/70">{{ p.cmdline }}</span>
      </div>
    </div>
    <p v-else-if="focusQuery" class="mt-3 font-mono text-xs text-ink-soft/70 dark:text-chalk-soft/70">没有匹配的进程</p>
  </section>
</template>
