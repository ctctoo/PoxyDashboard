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
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-6 backdrop-blur-[2px]" @mousedown.self="emit('close')">
      <div
        class="w-full rounded-lg border border-line bg-paper-raised shadow-[0_24px_60px_-15px_rgb(0,0,0,0.35)] dark:border-coal-line dark:bg-coal-raised"
        :style="{ maxWidth: width ?? '560px' }"
      >
        <header class="flex h-12 items-center justify-between border-b border-line px-5 dark:border-coal-line">
          <h3 class="font-mono text-[13px] font-bold uppercase tracking-[0.08em]">{{ title }}</h3>
          <button class="icon-btn" @click="emit('close')"><X :size="16" /></button>
        </header>
        <div class="scroll-slim max-h-[70vh] overflow-auto p-5">
          <slot />
        </div>
      </div>
    </div>
  </Teleport>
</template>
