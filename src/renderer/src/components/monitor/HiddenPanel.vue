<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import type { HiddenPortEntry } from '@shared/types'
import { formatClock } from '../../lib/fmt'
import { unhide } from '../../stores/monitor'

defineProps<{ entries: HiddenPortEntry[] }>()
</script>

<template>
  <section v-if="entries.length" class="card p-4">
    <div class="mb-2 flex items-center gap-2">
      <span class="h-3.5 w-1 rounded-sm bg-ink/20 dark:bg-white/20" />
      <h3 class="font-mono text-[13px] font-bold uppercase tracking-[0.1em]">已隐藏的服务</h3>
      <span class="font-mono text-[11px] text-ink-soft dark:text-chalk-soft">可随时恢复</span>
    </div>
    <div class="space-y-1">
      <div
        v-for="e in entries"
        :key="e.port"
        class="flex items-center gap-3 rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-line hover:bg-paper dark:hover:border-coal-line dark:hover:bg-black/20"
      >
        <span class="font-mono font-semibold text-ink-soft dark:text-chalk-soft">:{{ e.port }}</span>
        <span>{{ e.name }}</span>
        <span class="font-mono text-ink-soft dark:text-chalk-soft">PID {{ e.pid }}</span>
        <span class="ml-auto font-mono text-ink-soft/60 dark:text-chalk-soft/60">隐藏于 {{ formatClock(e.hiddenAt) }}</span>
        <button class="btn-ghost btn-sm" @click="unhide(e.port)"><RotateCcw :size="12" /> 恢复</button>
      </div>
    </div>
  </section>
</template>
