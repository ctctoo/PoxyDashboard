<script setup lang="ts">
import { AlarmClock, Cpu, Gauge, HardDrive, Radio, Shapes } from '@lucide/vue'
import type { MonitorSnapshot } from '@shared/types'
import { formatClock, formatMem } from '../../lib/fmt'
import Sparkline from './Sparkline.vue'

defineProps<{ snapshot: MonitorSnapshot | null; cpu: number[]; mem: number[]; alertCount: number }>()
</script>

<template>
  <div class="grid grid-cols-3 gap-3">
    <div class="card relative overflow-hidden p-4">
      <span class="absolute inset-x-0 top-0 h-[2px] bg-signal" />
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-signal/30 bg-signal/10 text-signal">
          <Radio :size="16" />
        </div>
        <div class="min-w-0">
          <div class="panel-label">在线服务</div>
          <div class="font-mono text-xl font-bold tabular-nums">{{ snapshot?.stats.serviceCount ?? '—' }}</div>
        </div>
      </div>
    </div>
    <div class="card relative overflow-hidden p-4">
      <span class="absolute inset-x-0 top-0 h-[2px] bg-inspect" />
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-inspect/30 bg-inspect/10 text-inspect">
          <Shapes :size="16" />
        </div>
        <div class="min-w-0">
          <div class="panel-label">后台应用</div>
          <div class="font-mono text-xl font-bold tabular-nums">{{ snapshot?.stats.backgroundCount ?? '—' }}</div>
        </div>
      </div>
    </div>
    <div class="card relative overflow-hidden p-4">
      <span class="absolute inset-x-0 top-0 h-[2px] bg-warn" />
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-warn/30 bg-warn/10 text-warn">
          <Cpu :size="16" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="panel-label">总 CPU</div>
          <div class="font-mono text-xl font-bold tabular-nums">{{ snapshot?.stats.totalCpu ?? '—' }}%</div>
          <div class="mt-0.5 text-go"><Sparkline :data="cpu" /></div>
        </div>
      </div>
    </div>
    <div class="card relative overflow-hidden p-4">
      <span class="absolute inset-x-0 top-0 h-[2px] bg-inspect" />
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-inspect/30 bg-inspect/10 text-inspect">
          <HardDrive :size="16" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="panel-label">总内存</div>
          <div class="font-mono text-xl font-bold tabular-nums">
            {{ formatMem(snapshot?.stats.totalMemMB ?? 0) }}
            <span v-if="snapshot?.stats.memCapacityMB" class="text-sm font-normal text-ink-soft dark:text-chalk-soft">
              / {{ formatMem(snapshot.stats.memCapacityMB) }}
            </span>
          </div>
          <div class="mt-0.5 text-inspect"><Sparkline :data="mem" /></div>
        </div>
      </div>
    </div>
    <div class="card relative overflow-hidden p-4">
      <span class="absolute inset-x-0 top-0 h-[2px]" :class="alertCount ? 'bg-alert' : 'bg-warn'" />
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-alert/30 bg-alert/10 text-alert">
          <Gauge :size="16" />
        </div>
        <div class="min-w-0">
          <div class="panel-label">端口警告</div>
          <div class="font-mono text-xl font-bold tabular-nums" :class="alertCount ? 'text-alert' : ''">{{ alertCount }}</div>
        </div>
      </div>
    </div>
    <div class="card relative overflow-hidden p-4">
      <span class="absolute inset-x-0 top-0 h-[2px] bg-ink/15 dark:bg-white/10" />
      <div class="flex items-center gap-3">
        <div class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-ink/10 bg-ink/5 text-ink-soft dark:border-white/10 dark:bg-white/5 dark:text-chalk-soft">
          <AlarmClock :size="16" />
        </div>
        <div class="min-w-0">
          <div class="panel-label">最后更新</div>
          <div class="font-mono text-lg font-bold tabular-nums">{{ formatClock(snapshot?.ts) }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
