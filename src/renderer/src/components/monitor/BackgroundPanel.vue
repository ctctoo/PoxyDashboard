<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronRight, XCircle } from '@lucide/vue'
import type { ProcessInfo } from '@shared/types'
import { formatDuration, formatMem, originBadge } from '../../lib/fmt'
import { confirmDialog } from '../../stores/confirm'
import { expandedCmd, killProcess, toggleExpand } from '../../stores/monitor'

const props = defineProps<{ processes: ProcessInfo[] }>()
const collapsed = ref(true)
const key = (p: ProcessInfo): string => `p${p.pid}`

async function onKill(p: ProcessInfo): Promise<void> {
  const ok = await confirmDialog({
    title: `结束进程 ${p.name}（PID ${p.pid}）？`,
    body: `将安全结束该进程及其子进程树。\n命令行：${p.cmdline}`,
    danger: true,
    confirmText: '结束进程'
  })
  if (ok) await killProcess(p.pid)
}
</script>

<template>
  <section class="card">
    <button class="flex w-full items-center gap-2 px-4 py-3 text-left" @click="collapsed = !collapsed">
      <ChevronRight v-if="collapsed" :size="15" class="text-ink-soft dark:text-chalk-soft" />
      <ChevronDown v-else :size="15" class="text-ink-soft dark:text-chalk-soft" />
      <span class="h-3.5 w-1 rounded-sm bg-inspect" />
      <span class="font-mono text-[13px] font-bold uppercase tracking-[0.1em]">应用后台</span>
      <span class="font-mono text-[11px] text-ink-soft dark:text-chalk-soft">{{ processes.length }} 个进程</span>
      <span class="ml-auto font-mono text-[11px] text-ink-soft/60 dark:text-chalk-soft/60">系统 / GUI 应用默认折叠</span>
    </button>
    <div v-if="!collapsed" class="border-t border-line px-2 py-1 dark:border-coal-line">
      <template v-for="p in processes" :key="p.pid">
        <div class="flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-line hover:bg-paper dark:hover:border-coal-line dark:hover:bg-black/20">
          <span class="w-28 truncate font-medium">{{ p.name }}</span>
          <span class="w-24 truncate font-mono text-ink-soft dark:text-chalk-soft">PID {{ p.pid }}</span>
          <span class="w-12 font-mono tabular-nums text-ink-soft dark:text-chalk-soft">{{ p.cpu }}%</span>
          <span class="w-16 font-mono text-ink-soft dark:text-chalk-soft">{{ formatMem(p.memMB) }}</span>
          <span class="w-16 font-mono text-ink-soft dark:text-chalk-soft">{{ formatDuration(Date.now() - p.createdAt) }}</span>
          <span v-if="p.origin" class="inline-flex w-24 justify-center truncate rounded-full px-1.5 py-0.5 font-mono text-[10px]" :class="originBadge(p.origin.kind).cls">
            {{ p.origin.label }}
          </span>
          <button class="icon-btn ml-auto !h-6 !w-6" @click="toggleExpand(key(p))">
            {{ expandedCmd.has(key(p)) ? '收起' : '命令' }}
          </button>
          <button class="icon-btn !h-6 !w-6 hover:!text-alert" title="安全结束进程" @click="onKill(p)">
            <XCircle :size="13" />
          </button>
        </div>
        <div
          v-if="expandedCmd.has(key(p))"
          class="px-2 pb-1.5 font-mono text-[11px] text-ink-soft dark:text-chalk-soft"
        >
          {{ p.cmdline }}
        </div>
      </template>
      <p v-if="!processes.length" class="px-2 py-6 text-center font-mono text-xs text-ink-soft/70 dark:text-chalk-soft/70">暂无后台应用</p>
    </div>
  </section>
</template>
