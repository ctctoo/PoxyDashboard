<script setup lang="ts">
import { RotateCcw } from '@lucide/vue'
import type { HiddenPortEntry } from '@shared/types'
import { formatClock } from '../../lib/fmt'
import { unhide } from '../../stores/monitor'

defineProps<{ entries: HiddenPortEntry[] }>()
</script>

<template>
  <section v-if="entries.length" class="card p-4">
    <h3 class="mb-2 text-sm font-semibold">已隐藏的服务（可随时恢复）</h3>
    <div class="space-y-1">
      <div
        v-for="e in entries"
        :key="e.port"
        class="flex items-center gap-3 rounded-md px-2 py-1.5 text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
      >
        <span class="font-mono font-semibold text-neutral-500">:{{ e.port }}</span>
        <span>{{ e.name }}</span>
        <span class="text-neutral-400">PID {{ e.pid }}</span>
        <span class="ml-auto text-neutral-400">隐藏于 {{ formatClock(e.hiddenAt) }}</span>
        <button class="btn-ghost btn-sm" @click="unhide(e.port)"><RotateCcw :size="12" /> 恢复</button>
      </div>
    </div>
  </section>
</template>
