<script setup lang="ts">
import { Bot, ChevronDown, ChevronRight, Cpu, HardDrive, HeartPulse } from '@lucide/vue'
import type { AgentRow } from '@shared/types'
import { formatMem } from '../lib/fmt'
import { formatDuration } from '../stores/agents'

defineProps<{
  row: AgentRow
  expanded: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()

function activityColor(activity: string): string {
  switch (activity) {
    case 'test':
      return 'text-go dark:text-go-soft border-go/30 bg-go/8'
    case 'build':
    case 'install':
      return 'text-inspect dark:text-inspect-soft border-inspect/30 bg-inspect/8'
    case 'dev-server':
      return 'text-signal dark:text-signal-soft border-signal/30 bg-signal/8'
    case 'lint':
      return 'text-warn dark:text-warn-soft border-warn/30 bg-warn/8'
    case 'git':
      return 'text-primary dark:text-primary-soft border-primary/30 bg-primary/8'
    default:
      return 'text-ink-soft dark:text-chalk-soft border-line bg-paper dark:border-coal-line dark:bg-black/20'
  }
}

function statusLabel(row: AgentRow): string {
  if (row.status === 'running') return '运行中'
  return '空闲'
}
</script>

<template>
  <div class="flex flex-col">
    <span
      class="absolute inset-x-0 top-0 h-[3px]"
      :class="row.status === 'running' ? 'bg-go' : 'bg-warn'"
    />

    <!-- 卡片头 -->
    <div class="flex items-center gap-2.5">
      <span
        class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-paper text-lg leading-none dark:border-coal-line dark:bg-black/25"
      >
        {{ row.icon }}
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate font-semibold">{{ row.label }}</span>
          <span
            class="rounded-[5px] border border-line px-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-soft dark:border-coal-line dark:text-chalk-soft"
          >
            {{ row.kind }}
          </span>
        </div>
        <div
          class="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-ink-soft dark:text-chalk-soft"
        >
          <span
            class="flex items-center gap-1"
            :class="row.status === 'running' ? 'text-go' : 'text-warn'"
          >
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="row.status === 'running' ? 'bg-go pulse-dot' : 'bg-warn'"
            />
            {{ statusLabel(row) }}
          </span>
          <span v-if="row.pid">PID {{ row.pid }}</span>
          <span v-if="row.createdAt">已运行 {{ formatDuration(Date.now() - row.createdAt) }}</span>
          <span v-if="row.totalRunMs !== undefined" title="本会话累计运行"
            >累计 {{ formatDuration(row.totalRunMs) }}</span
          >
        </div>
        <div
          v-if="row.health"
          class="mt-1 flex items-center gap-1.5 font-mono text-[11px]"
          :class="
            row.health.level === 'healthy'
              ? 'text-go dark:text-go-soft'
              : row.health.level === 'suspicious'
                ? 'text-warn dark:text-warn-soft'
                : 'text-alert dark:text-alert-soft'
          "
        >
          <HeartPulse :size="12" />
          {{ row.health.message }}
        </div>
      </div>
      <span
        v-if="row.ports.length"
        class="chip-port"
        :title="row.ports.map((p) => `:${p}`).join(' · ')"
      >
        :{{ row.ports[0] }}{{ row.ports.length > 1 ? ` +${row.ports.length - 1}` : '' }}
      </span>
    </div>

    <!-- 资源行 -->
    <div
      class="mt-3 flex items-center gap-4 border-t border-line pt-3 font-mono text-xs dark:border-coal-line"
    >
      <span class="flex items-center gap-1.5 text-ink-soft dark:text-chalk-soft">
        <Cpu :size="13" class="text-warn" />
        <b class="tabular-nums text-ink dark:text-chalk">{{ row.cpu }}%</b>
      </span>
      <span class="flex items-center gap-1.5 text-ink-soft dark:text-chalk-soft">
        <HardDrive :size="13" class="text-inspect" />
        <b class="tabular-nums text-ink dark:text-chalk">{{ formatMem(row.memMB) }}</b>
      </span>
      <span class="ml-auto text-ink-soft/70 dark:text-chalk-soft/70"
        >{{ row.taskCount }} 个任务进程</span
      >
    </div>

    <!-- 派生任务 -->
    <div v-if="row.tasks.length" class="mt-2">
      <button
        class="flex w-full items-center gap-1.5 rounded-md px-1 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-soft hover:text-signal dark:text-chalk-soft dark:hover:text-signal-soft"
        @click="emit('toggle')"
      >
        <ChevronRight v-if="!expanded" :size="13" />
        <ChevronDown v-else :size="13" />
        派生任务
        <span class="text-ink-soft/50 dark:text-chalk-soft/50">({{ row.tasks.length }})</span>
      </button>
      <div v-if="expanded" class="mt-1 space-y-1">
        <div
          v-for="t in row.tasks"
          :key="t.pid"
          class="flex items-center gap-2 rounded-md border border-line/70 bg-paper px-2 py-1.5 dark:border-coal-line/70 dark:bg-black/20"
        >
          <span
            class="grid h-6 w-6 shrink-0 place-items-center rounded bg-ink/5 text-ink-soft dark:bg-white/10 dark:text-chalk-soft"
          >
            <Bot :size="13" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate text-xs font-medium">{{ t.name }}</span>
              <span class="font-mono text-[10px] text-ink-soft/60 dark:text-chalk-soft/60"
                >PID {{ t.pid }}</span
              >
              <span
                class="shrink-0 rounded-[4px] border px-1 font-mono text-[9px] uppercase"
                :class="activityColor(t.activity)"
                >{{ t.activityLabel }}</span
              >
            </div>
            <div class="truncate font-mono text-[10px] text-ink-soft dark:text-chalk-soft">
              {{ t.cmdline }}
            </div>
          </div>
          <span
            class="shrink-0 font-mono text-[10px] tabular-nums text-ink-soft dark:text-chalk-soft"
            >{{ t.cpu }}% · {{ formatMem(t.memMB) }}</span
          >
        </div>
      </div>
    </div>
    <p
      v-else
      class="mt-2 rounded-md border border-dashed border-line px-2 py-2 text-center font-mono text-[11px] text-ink-soft/60 dark:border-coal-line dark:text-chalk-soft/60"
    >
      {{ row.status === 'running' ? '正在运行 · 无可见任务进程' : '空闲 · 等待任务' }}
    </p>
  </div>
</template>
