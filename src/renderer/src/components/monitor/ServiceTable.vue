<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  EyeOff,
  LoaderCircle,
  Pin,
  PinOff,
  PlusCircle,
  ShieldCheck,
  XCircle
} from '@lucide/vue'
import type { ProcessInfo } from '@shared/types'
import { api } from '../../lib/api'
import { formatDuration, formatMem } from '../../lib/fmt'
import { confirmDialog } from '../../stores/confirm'
import { claim, expandedCmd, hideAlert, killProcess, pinnedRows, toggleExpand, togglePin } from '../../stores/monitor'

const props = defineProps<{ services: ProcessInfo[] }>()

const key = (p: ProcessInfo): string => `p${p.pid}`
const portMin = (p: ProcessInfo): number => (p.ports.length ? Math.min(...p.ports) : 0)

/** 普通服务行（数据库进程有独立数据库视图，不在普通表格展示） */
const rows = computed(() =>
  props.services
    .filter((p) => !p.db)
    .sort((a, b) => {
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
    <header class="flex items-center justify-between border-b border-line px-4 py-3 dark:border-coal-line">
      <div class="flex items-center gap-2">
        <span class="h-3.5 w-1 rounded-sm bg-inspect" />
        <h3 class="font-mono text-[13px] font-bold uppercase tracking-[0.1em]">服务表格</h3>
      </div>
      <span class="font-mono text-[11px] text-ink-soft dark:text-chalk-soft">点击端口直接打开 · 共 {{ rows.length }} 个监听进程</span>
    </header>
    <div class="scroll-slim overflow-auto">
      <div class="grid min-w-[860px] grid-cols-[80px_150px_1fr_120px_80px_70px_220px] items-center gap-2 border-b border-line bg-paper px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-soft dark:border-coal-line dark:bg-black/20 dark:text-chalk-soft">
        <span>端口</span>
        <span>进程</span>
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
          class="grid min-w-[860px] grid-cols-[80px_150px_1fr_120px_80px_70px_220px] items-center gap-2 border-b border-line/70 px-4 py-2 text-sm last:border-0 hover:bg-ink/[0.02] dark:border-coal-line/70 dark:hover:bg-white/[0.03]"
        >
          <button class="chip-port w-fit" title="打开 http://localhost:{{ portMin(p) }}" @click="openPort(portMin(p))">
            :{{ portMin(p) }}
          </button>
          <div class="min-w-0">
            <div class="truncate font-medium">{{ p.name }}</div>
            <div class="font-mono text-[11px] text-ink-soft dark:text-chalk-soft">PID {{ p.pid }}</div>
          </div>
          <span class="truncate font-mono text-xs text-ink-soft dark:text-chalk-soft" :title="p.dir">{{ p.dir ?? '—' }}</span>
          <div class="font-mono text-xs">
            <div class="text-ink dark:text-chalk tabular-nums">{{ p.cpu }}%</div>
            <div class="text-ink-soft/70 dark:text-chalk-soft/70">{{ formatMem(p.memMB) }}</div>
          </div>
          <span class="font-mono text-xs text-ink-soft dark:text-chalk-soft">{{ formatDuration(Date.now() - p.createdAt) }}</span>
          <span class="flex items-center gap-1 font-mono text-xs font-medium text-go">
            <span class="h-1.5 w-1.5 rounded-full bg-go pulse-dot" />
            监听中
          </span>
          <div class="flex items-center justify-end gap-0.5">
            <button class="icon-btn" title="打开" @click="openPort(portMin(p))"><ExternalLink :size="13" /></button>
            <button v-if="claimingPids.has(p.pid)" class="icon-btn" title="认领中…" disabled>
              <LoaderCircle :size="13" class="animate-spin" />
            </button>
            <span
              v-else-if="justClaimedPids.has(p.pid)"
              class="pop-in inline-flex items-center gap-1 rounded-[6px] border border-go/25 bg-go/10 px-1.5 py-0.5 font-mono text-[10px] font-medium text-go dark:text-go-soft"
            >
              <Check :size="11" /> 已认领
            </span>
            <button v-else-if="!p.claimedBy" class="icon-btn" title="加入启动台" @click="onClaim(p)"><PlusCircle :size="13" /></button>
            <span
              v-else
              class="inline-flex items-center gap-1 rounded-[6px] border border-go/20 bg-go/8 px-1.5 py-0.5 font-mono text-[10px] text-go dark:text-go-soft"
            >
              <ShieldCheck :size="11" /> 已认领
            </span>
            <button class="icon-btn" :title="pinnedRows.has(key(p)) ? '取消置顶' : '置顶'" @click="togglePin(key(p))">
              <Pin v-if="!pinnedRows.has(key(p))" :size="13" />
              <PinOff v-else :size="13" class="text-go" />
            </button>
            <button class="icon-btn" title="隐藏" @click="onHide(p)"><EyeOff :size="13" /></button>
            <button class="icon-btn" :title="expandedCmd.has(key(p)) ? '收起命令' : '展开命令'" @click="toggleExpand(key(p))">
              <ChevronRight v-if="!expandedCmd.has(key(p))" :size="13" />
              <ChevronDown v-else :size="13" />
            </button>
            <button class="icon-btn hover:!text-alert" title="安全结束进程" @click="onKill(p)"><XCircle :size="13" /></button>
          </div>
        </div>
        <div
          v-for="p in rows.filter((r) => expandedCmd.has(key(r)))"
          :key="`cmd-${p.pid}`"
          class="border-b border-line bg-paper px-4 py-2 font-mono text-[11px] text-ink-soft dark:border-coal-line dark:bg-black/25 dark:text-chalk-soft"
        >
          {{ p.cmdline }}
        </div>
      </TransitionGroup>
      <p v-if="!rows.length" class="px-4 py-10 text-center font-mono text-sm text-ink-soft/70 dark:text-chalk-soft/70">暂无监听端口进程</p>
    </div>
  </section>
</template>
