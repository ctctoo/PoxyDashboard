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
    class="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
  >
    <h3 class="mb-2 text-sm font-semibold text-amber-700 dark:text-amber-300">发现新端口（{{ alerts.length }}）</h3>
    <TransitionGroup name="row" tag="div" class="space-y-1.5">
      <div v-for="a in alerts" :key="a.port" class="flex items-center gap-3 py-1 text-sm">
        <span class="font-mono text-sm font-bold text-amber-700 dark:text-amber-300">{{ a.port }}</span>
        <span class="shrink-0">{{ a.name }}</span>
        <span class="shrink-0 text-xs text-neutral-400">PID {{ a.pid }}</span>
        <span v-if="a.origin" class="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]" :class="originBadge(a.origin.kind).cls">
          {{ a.origin.label }}
        </span>
        <span class="min-w-0 flex-1 truncate font-mono text-xs text-neutral-500">{{ a.cmdline }}</span>
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
