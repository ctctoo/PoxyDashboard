<script setup lang="ts">
import { Zap } from '@lucide/vue'

withDefaults(
  defineProps<{
    /** 加载提示文案 */
    label?: string
    /** 骨架屏卡片数量 */
    cards?: number
  }>(),
  { label: '正在扫描本机…', cards: 3 }
)
</script>

<template>
  <div class="flex h-full flex-col gap-4 pb-4 pr-1">
    <!-- 顶部骨架条 -->
    <div class="flex items-center gap-2">
      <span v-for="i in 4" :key="i" class="skeleton h-7 w-28 rounded-[6px]" />
      <span class="skeleton h-7 w-20 rounded-[6px]" />
    </div>
    <!-- 骨架卡片 -->
    <div class="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
      <div v-for="i in cards" :key="i" class="card flex flex-col gap-3 p-4">
        <div class="flex items-center gap-2.5">
          <span class="skeleton h-9 w-9 shrink-0 rounded-md" />
          <div class="min-w-0 flex-1 space-y-2">
            <span class="skeleton block h-4 w-1/3 rounded" />
            <span class="skeleton block h-3 w-1/2 rounded" />
          </div>
        </div>
        <div class="space-y-2 border-t border-line pt-3 dark:border-coal-line">
          <span class="skeleton block h-3 w-full rounded" />
          <span class="skeleton block h-3 w-3/4 rounded" />
        </div>
      </div>
    </div>
    <!-- 加载指示 -->
    <div class="flex flex-col items-center gap-2 pt-2">
      <div class="relative flex items-center justify-center">
        <span
          class="h-6 w-6 animate-spin rounded-full border-2 border-ink/15 border-t-signal dark:border-white/15 dark:border-t-signal"
        />
        <Zap :size="11" class="absolute text-signal dark:text-signal-soft" />
      </div>
      <span
        class="font-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft/60 dark:text-chalk-soft/60"
        >{{ label }}</span
      >
    </div>
  </div>
</template>

<style scoped>
@keyframes skeleton-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
.skeleton {
  position: relative;
  overflow: hidden;
  background: rgb(140 130 110 / 0.14);
  border-radius: 6px;
}
.dark .skeleton {
  background: rgb(255 255 255 / 0.07);
}
.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.18), transparent);
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.4s ease-in-out infinite;
}
.dark .skeleton::after {
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 0.08), transparent);
  background-size: 200% 100%;
}
</style>
