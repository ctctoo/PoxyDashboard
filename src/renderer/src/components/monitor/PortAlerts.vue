<script setup lang="ts">
import { ref } from 'vue'
import { BellOff, EyeOff, LoaderCircle, PlusCircle } from '@lucide/vue'
import type { PortAlert } from '@shared/types'
import { originBadge } from '../../lib/fmt'
import { claim, hideAlert, ignoreAlert } from '../../stores/monitor'

defineProps<{ alerts: PortAlert[] }>()

const claimingPorts = ref<Set<number>>(new Set())

async function onClaim(a: PortAlert): Promise<void> {
  if (claimingPorts.value.has(a.port)) return
  const next = new Set(claimingPorts.value)
  next.add(a.port)
  claimingPorts.value = next
  try {
    await claim(a.port)
  } finally {
    const s = new Set(claimingPorts.value)
    s.delete(a.port)
    claimingPorts.value = s
  }
}
</script>

<template>
  <section
    v-if="alerts.length"
    class="relative overflow-hidden rounded-lg border border-warn/40 bg-warn/10 p-4 dark:border-warn/40 dark:bg-warn/10"
  >
    <span class="absolute inset-y-0 left-0 w-[3px] bg-warn" />
    <h3 class="mb-2 flex items-center gap-2 font-mono text-sm font-bold text-warn dark:text-warn-soft">
      <span class="h-2 w-2 rounded-full bg-warn pulse-dot" />
      发现新端口（{{ alerts.length }}）
    </h3>
    <TransitionGroup name="row" tag="div" class="space-y-1.5">
      <div v-for="a in alerts" :key="a.port" class="flex items-center gap-3 py-1 text-sm">
        <span class="font-mono text-sm font-bold text-warn dark:text-warn-soft">{{ a.port }}</span>
        <span class="shrink-0">{{ a.name }}</span>
        <span class="shrink-0 font-mono text-xs text-ink-soft dark:text-chalk-soft">PID {{ a.pid }}</span>
        <span v-if="a.origin" class="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px]" :class="originBadge(a.origin.kind).cls">
          {{ a.origin.label }}
        </span>
        <span class="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft dark:text-chalk-soft">{{ a.cmdline }}</span>
        <button class="btn-primary btn-sm shrink-0" :disabled="claimingPorts.has(a.port)" @click="onClaim(a)">
          <LoaderCircle v-if="claimingPorts.has(a.port)" :size="13" class="animate-spin" />
          <PlusCircle v-else :size="13" />
          加入启动台
        </button>
        <button class="btn-ghost btn-sm shrink-0" @click="ignoreAlert(a.port)"><BellOff :size="13" /> 忽略提醒</button>
        <button class="btn-ghost btn-sm shrink-0" @click="hideAlert(a.port)"><EyeOff :size="13" /> 忽略并隐藏</button>
      </div>
    </TransitionGroup>
  </section>
</template>
