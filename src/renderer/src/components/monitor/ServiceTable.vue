<script setup lang="ts">
import { computed, ref } from 'vue'
import { Check, ChevronDown, ChevronRight, ExternalLink, EyeOff, LoaderCircle, Pin, PinOff, PlusCircle, ShieldCheck, XCircle } from '@lucide/vue'
import type { ProcessInfo } from '@shared/types'
import { api } from '../../lib/api'
import { formatDuration, formatMem, originBadge } from '../../lib/fmt'
import { confirmDialog } from '../../stores/confirm'
import { claim, expandedCmd, hideAlert, killProcess, pinnedRows, toggleExpand, togglePin } from '../../stores/monitor'

const props = defineProps<{ services: ProcessInfo[] }>()

const key = (p: ProcessInfo): string => `p${p.pid}`
const portMin = (p: ProcessInfo): number => (p.ports.length ? Math.min(...p.ports) : 0)

const rows = computed(() =>
  [...props.services].sort((a, b) => {
    const pa = pinnedRows.value.has(key(a)) ? 0 : 1
    const pb = pinnedRows.value.has(key(b)) ? 0 : 1
    return pa - pb || portMin(a) - portMin(b)
  })
)

async function openPort(port: number): Promise<void> {
  await api.openUrl(`http://localhost:${port}`)
}

async function onKill(p: ProcessInfo): Promise<void> {
  const ok = await confirmDialog({
    title: `结束进程 ${p.name}（PID ${p.pid}）？`,
    body: `将安全结束该进程及其子进程树，绝不按端口操作。\n命令行：${p.cmdline}`,
    danger: true,
    confirmText: '结束进程'
  })
  if (ok) await killProcess(p.pid)
}

async function onHide(p: ProcessInfo): Promise<void> {
  const port = portMin(p)
  if (port) await hideAlert(port)
}

const claimingPids = ref<Set<number>>(new Set())
const justClaimedPids = ref<Set<number>>(new Set())

async function onClaim(p: ProcessInfo): Promise<void> {
  if (claimingPids.value.has(p.pid)) return
  const next = new Set(claimingPids.value)
  next.add(p.pid)
  claimingPids.value = next
  try {
    await claim(portMin(p))
    const done = new Set(justClaimedPids.value)
    done.add(p.pid)
    justClaimedPids.value = done
    setTimeout(() => {
      const s = new Set(justClaimedPids.value)
      s.delete(p.pid)
      justClaimedPids.value = s
    }, 2200)
  } finally {
    const s = new Set(claimingPids.value)
    s.delete(p.pid)
    claimingPids.value = s
  }
}
</script>

<template>
  <section class="card overflow-hidden">
    <header class="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <h3 class="text-sm font-semibold">服务表格</h3>
      <span class="text-xs text-neutral-400">点击端口直接打开 · 共 {{ rows.length }} 个监听进程</span>
    </header>
    <div class="scroll-slim overflow-auto">
      <div class="grid min-w-[860px] grid-cols-[80px_150px_110px_1fr_120px_80px_70px_auto] items-center gap-2 border-b border-neutral-200 px-4 py-2 text-[11px] font-medium text-neutral-400 dark:border-neutral-800">
        <span>端口</span>
        <span>进程</span>
        <span>启动者</span>
        <span>目录</span>
        <span>负载</span>
        <span>时长</span>
        <span>状态</span>
        <span class="text-right">操作</span>
      </div>
      <TransitionGroup name="row" tag="div">
        <div
          v-for="p in rows"
          :key="p.pid"
          class="grid min-w-[860px] grid-cols-[80px_150px_110px_1fr_120px_80px_70px_auto] items-center gap-2 border-b border-neutral-200 px-4 py-2 text-sm last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
        >
          <button class="chip-port w-fit" title="打开 http://localhost:{{ portMin(p) }}" @click="openPort(portMin(p))">
            :{{ portMin(p) }}
          </button>
          <div class="min-w-0">
            <div class="truncate font-medium">{{ p.name }}</div>
            <div class="text-[11px] text-neutral-400">PID {{ p.pid }}</div>
          </div>
          <span v-if="p.origin" class="w-fit rounded-full px-1.5 py-0.5 text-[10px]" :class="originBadge(p.origin.kind).cls">
            {{ p.origin.label }}
          </span>
          <span v-else class="text-xs text-neutral-400">—</span>
          <span class="truncate font-mono text-xs text-neutral-500" :title="p.dir">{{ p.dir ?? '—' }}</span>
          <div class="text-xs">
            <div class="text-neutral-600 dark:text-neutral-300">{{ p.cpu }}%</div>
            <div class="text-neutral-400">{{ formatMem(p.memMB) }}</div>
          </div>
          <span class="text-xs text-neutral-400">{{ formatDuration(Date.now() - p.createdAt) }}</span>
          <span class="flex items-center gap-1 text-xs text-emerald-500">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            监听中
          </span>
          <div class="flex items-center justify-end gap-0.5">
            <button class="icon-btn" title="打开" @click="openPort(portMin(p))"><ExternalLink :size="13" /></button>
            <button v-if="claimingPids.has(p.pid)" class="icon-btn" title="认领中…" disabled>
              <LoaderCircle :size="13" class="animate-spin" />
            </button>
            <span
              v-else-if="justClaimedPids.has(p.pid)"
              class="pop-in inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            >
              <Check :size="11" /> 已认领
            </span>
            <button v-else-if="!p.claimedBy" class="icon-btn" title="加入启动台" @click="onClaim(p)"><PlusCircle :size="13" /></button>
            <span
              v-else
              class="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
            >
              <ShieldCheck :size="11" /> 已认领
            </span>
            <button class="icon-btn" :title="pinnedRows.has(key(p)) ? '取消置顶' : '置顶'" @click="togglePin(key(p))">
              <Pin v-if="!pinnedRows.has(key(p))" :size="13" />
              <PinOff v-else :size="13" class="text-emerald-500" />
            </button>
            <button class="icon-btn" title="隐藏" @click="onHide(p)"><EyeOff :size="13" /></button>
            <button class="icon-btn" :title="expandedCmd.has(key(p)) ? '收起命令' : '展开命令'" @click="toggleExpand(key(p))">
              <ChevronRight v-if="!expandedCmd.has(key(p))" :size="13" />
              <ChevronDown v-else :size="13" />
            </button>
            <button class="icon-btn hover:!text-red-500" title="安全结束进程" @click="onKill(p)"><XCircle :size="13" /></button>
          </div>
        </div>
        <div
          v-for="p in rows.filter((r) => expandedCmd.has(key(r)))"
          :key="`cmd-${p.pid}`"
          class="border-b border-neutral-200 bg-neutral-50 px-4 py-2 font-mono text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/40"
        >
          {{ p.cmdline }}
        </div>
      </TransitionGroup>
      <p v-if="!rows.length" class="px-4 py-10 text-center text-sm text-neutral-400">暂无监听端口进程</p>
    </div>
  </section>
</template>
