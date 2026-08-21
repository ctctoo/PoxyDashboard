<script setup lang="ts">
import { computed } from 'vue'
import { Zap } from '@lucide/vue'

const props = defineProps<{ steps: string[] }>()

const doneCount = computed(() => props.steps.filter((s) => s === 'done').length)
const stepLabels = ['配置', '应用', '进程', 'Agent']
</script>

<template>
  <div
    class="desk-grid fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper dark:bg-coal"
  >
    <!-- 品牌标识：呼吸光晕 -->
    <div class="relative mb-6">
      <span class="boot-halo absolute inset-0 rounded-2xl bg-signal/20 blur-xl" />
      <div
        class="relative grid h-16 w-16 place-items-center rounded-xl border border-signal/60 bg-signal/10 text-signal dark:text-signal-soft"
      >
        <Zap :size="28" class="fill-current" />
        <span class="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-signal pulse-dot" />
      </div>
    </div>

    <div class="mb-8 text-center leading-none">
      <div class="font-mono text-xl font-bold tracking-[0.1em] text-ink dark:text-chalk">
        总控台
      </div>
      <div
        class="mt-2 font-mono text-[11px] uppercase tracking-[0.24em] text-ink-soft/70 dark:text-chalk-soft/70"
      >
        Service · Task · Monitor
      </div>
    </div>

    <!-- 加载指示 -->
    <div class="flex flex-col items-center gap-3">
      <div class="relative flex items-center justify-center">
        <span
          class="h-8 w-8 animate-spin rounded-full border-2 border-ink/15 border-t-signal dark:border-white/15 dark:border-t-signal"
        />
        <Zap :size="13" class="absolute text-signal dark:text-signal-soft" />
      </div>
      <div class="font-mono text-xs text-ink-soft dark:text-chalk-soft">正在初始化…</div>
    </div>

    <!-- 底部数据源进度（等宽小字 + 步骤标签） -->
    <div v-if="steps.length" class="absolute bottom-12 flex flex-col items-center gap-2">
      <div
        class="flex items-center gap-3 font-mono text-[11px] text-ink-soft/60 dark:text-chalk-soft/60"
      >
        <span v-for="(label, i) in stepLabels" :key="i" class="flex items-center gap-1.5">
          <span
            class="h-1.5 w-1.5 rounded-full transition-colors duration-300"
            :class="
              steps[i] === 'done'
                ? 'bg-go'
                : steps[i] === 'loading'
                  ? 'bg-signal pulse-dot'
                  : 'bg-ink/15 dark:bg-white/15'
            "
          />
          <span :class="steps[i] === 'done' ? 'text-ink/70 dark:text-chalk/70' : ''">{{
            label
          }}</span>
        </span>
      </div>
      <div
        class="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft/50 dark:text-chalk-soft/50"
      >
        {{ doneCount }} / {{ steps.length }} ·
        {{ steps.some((s) => s === 'loading') ? '加载中' : '准备就绪' }}
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes boot-halo {
  0%,
  100% {
    opacity: 0.55;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.15);
  }
}
.boot-halo {
  animation: boot-halo 2.2s ease-in-out infinite;
}
</style>
