<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { appEntries } from '../stores/apps'
import { activeId, lastLine, openLogs } from '../stores/logs'
import { formatClock, statusColor, statusLabel } from '../lib/fmt'
import LogDetail from '../components/logs/LogDetail.vue'

interface LogEntry {
  id: string
  name: string
  icon: string
  status: string
  active: number
}

const list = computed<LogEntry[]>(() => {
  const entries: LogEntry[] = [
    ...appEntries.value.map((e) => ({
      id: e.id,
      name: e.name,
      icon: e.icon ?? (e.kind === 'service' ? '🚀' : '📋'),
      status: e.runtime.status,
      active: e.runtime.lastActiveAt ?? e.createdAt
    })),
    { id: 'dashboard', name: '总控台自身日志', icon: '🖥️', status: 'running', active: Date.now() }
  ]
  const order: Record<string, number> = { running: 0, starting: 1, stopping: 1, success: 2, failed: 2, cancelled: 2, aborted: 2, error: 2, stopped: 3 }
  return entries.sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || b.active - a.active)
})

onMounted(() => {
  if (!activeId.value) void openLogs(list.value[0]?.id ?? 'dashboard')
})
</script>

<template>
  <div class="flex h-full min-h-0 gap-4">
    <aside class="scroll-slim flex w-72 shrink-0 flex-col gap-1 overflow-auto pr-1">
      <button
        v-for="item in list"
        :key="item.id"
        class="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors"
        :class="
          activeId === item.id
            ? 'border border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10'
            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
        "
        @click="openLogs(item.id)"
      >
        <span>{{ item.icon }}</span>
        <span class="min-w-0 flex-1 truncate">{{ item.name }}</span>
        <span class="text-[11px]" :class="statusColor(item.status as never)">{{ statusLabel(item.status as never, 'task') }}</span>
        <span class="font-mono text-[10px] text-neutral-400">{{ formatClock(lastLine.get(item.id)?.t) }}</span>
      </button>
    </aside>
    <div class="flex min-w-0 flex-1 flex-col">
      <LogDetail v-if="activeId" :app-id="activeId" />
      <div v-else class="grid flex-1 place-items-center text-sm text-neutral-400">选择左侧应用查看日志</div>
    </div>
  </div>
</template>
