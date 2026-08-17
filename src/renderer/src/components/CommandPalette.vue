<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Search, CornerDownLeft } from '@lucide/vue'
import { closePalette, open, query, results, runSelected, selected } from '../stores/palette'

const inputRef = ref<HTMLInputElement | null>(null)

watch(open, async (v) => {
  if (v) await nextTick()
  if (v) inputRef.value?.focus()
})

function onKey(e: KeyboardEvent): void {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    closePalette()
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    selected.value = Math.min(selected.value + 1, results.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selected.value = Math.max(selected.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    runSelected()
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[18vh]" @mousedown.self="closePalette">
      <div class="w-full max-w-xl overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900">
        <div class="flex h-12 items-center gap-2 border-b border-neutral-200 px-4 dark:border-neutral-800">
          <Search :size="16" class="text-neutral-400" />
          <input
            ref="inputRef"
            v-model="query"
            class="flex-1 bg-transparent text-sm outline-none"
            placeholder="搜索命令：添加服务、启动/停止应用、打开页面、查看日志…"
          />
          <kbd class="rounded border border-neutral-200 px-1.5 py-0.5 text-[10px] text-neutral-400 dark:border-neutral-700">ESC</kbd>
        </div>
        <div class="scroll-slim max-h-[46vh] overflow-auto py-1">
          <template v-if="results.length">
            <button
              v-for="(a, i) in results"
              :key="a.id"
              class="flex w-full items-center gap-3 px-4 py-2 text-left text-sm"
              :class="i === selected ? 'bg-emerald-50 dark:bg-emerald-500/10' : ''"
              @mouseenter="selected = i"
              @click="runSelected"
            >
              <span class="w-5 text-center">{{ a.icon }}</span>
              <span class="flex-1 truncate">{{ a.label }}</span>
              <span v-if="a.hint" class="text-xs text-neutral-400">{{ a.hint }}</span>
              <CornerDownLeft v-if="i === selected" :size="13" class="text-emerald-500" />
            </button>
          </template>
          <p v-else class="px-4 py-8 text-center text-sm text-neutral-400">没有匹配的命令</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
