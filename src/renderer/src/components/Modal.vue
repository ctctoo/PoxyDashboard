<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { X } from '@lucide/vue'

defineProps<{ title: string; width?: string }>()
const emit = defineEmits<{ close: [] }>()

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm" @mousedown.self="emit('close')">
      <div
        class="w-full rounded-xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        :style="{ maxWidth: width ?? '560px' }"
      >
        <header class="flex h-12 items-center justify-between border-b border-neutral-200 px-5 dark:border-neutral-800">
          <h3 class="font-semibold">{{ title }}</h3>
          <button class="icon-btn" @click="emit('close')"><X :size="16" /></button>
        </header>
        <div class="scroll-slim max-h-[70vh] overflow-auto p-5">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
