<script setup lang="ts">
import { AlarmClock, Cpu, Gauge, HardDrive, Radio, Shapes } from '@lucide/vue'
import type { MonitorSnapshot } from '@shared/types'
import { formatClock, formatMem } from '../../lib/fmt'
import Sparkline from './Sparkline.vue'

defineProps<{ snapshot: MonitorSnapshot | null; cpu: number[]; mem: number[]; alertCount: number }>()
</script>

<template>
  <div class="grid grid-cols-3 gap-3">
    <div class="card flex items-center gap-3 p-4">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15">
        <Radio :size="17" />
      </div>
      <div>
        <div class="text-xs text-neutral-400">在线服务</div>
        <div class="text-xl font-bold">{{ snapshot?.stats.serviceCount ?? '—' }}</div>
      </div>
    </div>
    <div class="card flex items-center gap-3 p-4">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-500/15">
        <Shapes :size="17" />
      </div>
      <div>
        <div class="text-xs text-neutral-400">后台应用</div>
        <div class="text-xl font-bold">{{ snapshot?.stats.backgroundCount ?? '—' }}</div>
      </div>
    </div>
    <div class="card flex items-center gap-3 p-4">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-500/15">
        <Cpu :size="17" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-xs text-neutral-400">总 CPU</div>
        <div class="text-xl font-bold">{{ snapshot?.stats.totalCpu ?? '—' }}%</div>
        <div class="text-emerald-500"><Sparkline :data="cpu" /></div>
      </div>
    </div>
    <div class="card flex items-center gap-3 p-4">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-500/15">
        <HardDrive :size="17" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-xs text-neutral-400">总内存</div>
        <div class="text-xl font-bold">
          {{ formatMem(snapshot?.stats.totalMemMB ?? 0) }}
          <span v-if="snapshot?.stats.memCapacityMB" class="text-sm font-normal text-neutral-400">
            / {{ formatMem(snapshot.stats.memCapacityMB) }}
          </span>
        </div>
        <div class="text-violet-500"><Sparkline :data="mem" /></div>
      </div>
    </div>
    <div class="card flex items-center gap-3 p-4">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-red-100 text-red-600 dark:bg-red-500/15">
        <Gauge :size="17" />
      </div>
      <div>
        <div class="text-xs text-neutral-400">端口警告</div>
        <div class="text-xl font-bold" :class="alertCount ? 'text-red-500' : ''">{{ alertCount }}</div>
      </div>
    </div>
    <div class="card flex items-center gap-3 p-4">
      <div class="grid h-9 w-9 place-items-center rounded-lg bg-neutral-100 text-neutral-500 dark:bg-neutral-700">
        <AlarmClock :size="17" />
      </div>
      <div>
        <div class="text-xs text-neutral-400">最后更新</div>
        <div class="text-lg font-bold font-mono">{{ formatClock(snapshot?.ts) }}</div>
      </div>
    </div>
  </div>
</template>
