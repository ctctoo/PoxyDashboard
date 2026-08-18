<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  ExternalLink,
  EyeOff,
  LoaderCircle,
  Pin,
  PinOff,
  Play,
  PlusCircle,
  ShieldCheck,
  Square,
  X,
  XCircle
} from '@lucide/vue'
import type { ContainerRow, ContainerState, DbRow, DbRowStatus, ProcessInfo } from '@shared/types'
import { api } from '../../lib/api'
import { formatDuration, formatMem } from '../../lib/fmt'
import { confirmDialog } from '../../stores/confirm'
import { claim, dismissDb, expandedCmd, hideAlert, killProcess, pinnedRows, startDb, stopDb, toggleExpand, togglePin } from '../../stores/monitor'

const props = defineProps<{ services: ProcessInfo[]; dbs: DbRow[]; containers: ContainerRow[] }>()

const key = (p: ProcessInfo): string => `p${p.pid}`
const portMin = (p: ProcessInfo): number => (p.ports.length ? Math.min(...p.ports) : 0)

/** 普通服务行（数据库进程有独立简化行，不在普通表格展示） */
const rows = computed(() =>
  props.services
    .filter((p) => !p.db)
    .sort((a, b) => {
      const pa = pinnedRows.value.has(key(a)) ? 0 : 1
      const pb = pinnedRows.value.has(key(b)) ? 0 : 1
      return pa - pb || portMin(a) - portMin(b)
    })
)

function dbStatusLabel(s: DbRowStatus): string {
  switch (s) {
    case 'running':
      return '运行中'
    case 'starting':
      return '启动中'
    case 'stopping':
      return '停止中'
    case 'stopped':
      return '已停止'
  }
}

function dbStatusColor(s: DbRowStatus): string {
  switch (s) {
    case 'running':
      return 'text-emerald-500'
    case 'starting':
    case 'stopping':
      return 'text-amber-500'
    default:
      return 'text-neutral-400'
  }
}

function containerStatusLabel(s: ContainerState): string {
  switch (s) {
    case 'running':
      return '运行中'
    case 'starting':
      return '启动中'
    case 'stopping':
      return '停止中'
    case 'stopped':
      return '已停止'
  }
}

function containerStatusColor(s: ContainerState): string {
  return s === 'running' ? 'text-emerald-500' : s === 'stopping' || s === 'starting' ? 'text-amber-500' : 'text-neutral-400'
}

function containerDotClass(s: ContainerState): string {
  return s === 'running' ? 'bg-emerald-500' : s === 'stopping' || s === 'starting' ? 'bg-amber-500' : 'bg-neutral-400'
}

const claimingContainer = ref<string | null>(null)

async function onStopContainer(row: ContainerRow): Promise<void> {
  const ok = await confirmDialog({
    title: `停止容器「${row.name}」？`,
    body: '将执行 docker stop 优雅停止该容器。',
    danger: true,
    confirmText: '停止'
  })
  if (ok) {
    claimingContainer.value = row.id
    try {
      await api.stopContainer(row.id)
    } finally {
      claimingContainer.value = null
    }
  }
}

async function onStartContainer(row: ContainerRow): Promise<void> {
  claimingContainer.value = row.id
  try {
    await api.startContainer(row.id)
  } finally {
    claimingContainer.value = null
  }
}

function dbDotClass(s: DbRowStatus): string {
  switch (s) {
    case 'running':
      return 'bg-emerald-500'
    case 'starting':
    case 'stopping':
      return 'bg-amber-500'
    default:
      return 'bg-neutral-400'
  }
}

async function onStopDb(row: DbRow): Promise<void> {
  const ok = await confirmDialog({
    title: `停止数据库「${row.label}」？`,
    body: row.service
      ? `将通过 Windows 服务「${row.service}」停止。`
      : '将先尝试优雅关闭；若未成功会强制结束进程树。',
    danger: true,
    confirmText: '停止'
  })
  if (ok) await stopDb(row.id)
}

async function onStartDb(row: DbRow): Promise<void> {
  await startDb(row.id)
}

async function onDismissDb(row: DbRow): Promise<void> {
  const ok = await confirmDialog({
    title: `移除「${row.label}」记录？`,
    body: '仅从监控列表移除，不会影响实际进程。',
    confirmText: '移除'
  })
  if (ok) await dismissDb(row.id)
}

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
      <span class="text-xs text-neutral-400">点击端口直接打开 · 共 {{ rows.length }} 个监听进程{{ dbs.length ? ` · ${dbs.length} 个数据库` : '' }}</span>
    </header>
    <div v-if="dbs.length" class="border-b border-neutral-200 dark:border-neutral-800">
      <div class="flex items-center gap-1.5 px-4 pt-3 pb-1.5 text-[11px] font-medium text-neutral-400">
        <Database :size="13" /> 数据库
      </div>
      <div
        v-for="row in dbs"
        :key="row.id"
        class="flex items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-sm last:border-0 dark:border-neutral-800/60"
      >
        <span class="text-base leading-none">{{ row.icon }}</span>
        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">
            {{ row.label }}
            <span v-if="row.version" class="ml-1 text-[11px] text-neutral-400">{{ row.version }}</span>
          </div>
          <div class="truncate text-[11px] text-neutral-400" :title="row.cmdline ?? row.service">
            {{ row.service ? `Windows 服务 ${row.service}` : (row.cmdline ?? '—') }}
          </div>
        </div>
        <span class="flex items-center gap-1.5 text-xs font-medium" :class="dbStatusColor(row.status)">
          <span class="h-1.5 w-1.5 rounded-full" :class="dbDotClass(row.status)" />
          {{ dbStatusLabel(row.status) }}
        </span>
        <span
          v-if="row.port"
          class="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300"
          :title="`端口 ${row.port}`"
        >
          :{{ row.port }}
        </span>
        <span v-else class="text-xs text-neutral-400">—</span>
        <div class="flex shrink-0 items-center gap-1">
          <button v-if="row.status === 'running'" class="btn-danger w-20" @click="onStopDb(row)">
            <Square :size="12" /> 停止
          </button>
          <button v-else-if="row.status === 'stopped'" class="btn-primary w-20" @click="onStartDb(row)">
            <Play :size="13" /> 启动
          </button>
          <button v-else class="btn-ghost w-20" disabled>
            <LoaderCircle :size="13" class="animate-spin" /> {{ row.status === 'stopping' ? '停止中' : '启动中' }}
          </button>
          <button v-if="row.status === 'stopped'" class="icon-btn" title="移除该记录" @click="onDismissDb(row)">
            <X :size="13" />
          </button>
        </div>
      </div>
    </div>
    <div v-if="containers.length" class="border-b border-neutral-200 dark:border-neutral-800">
      <div class="flex items-center gap-1.5 px-4 pt-3 pb-1.5 text-[11px] font-medium text-neutral-400">
        <Boxes :size="13" /> 容器
      </div>
      <div
        v-for="row in containers"
        :key="row.id"
        class="flex items-center gap-3 border-b border-neutral-100 px-4 py-2.5 text-sm last:border-0 dark:border-neutral-800/60"
      >
        <span class="text-base leading-none">🐳</span>
        <div class="min-w-0 flex-1">
          <div class="truncate font-medium">
            {{ row.name }}
            <span class="ml-1 text-[11px] text-neutral-400">{{ row.image }}</span>
          </div>
          <div class="truncate text-[11px] text-neutral-400" :title="row.statusText ?? row.portMap">
            {{ row.statusText ?? '—' }}{{ row.portMap ? ` · ${row.portMap}` : '' }}
          </div>
        </div>
        <span class="flex items-center gap-1.5 text-xs font-medium" :class="containerStatusColor(row.status)">
          <span class="h-1.5 w-1.5 rounded-full" :class="containerDotClass(row.status)" />
          {{ containerStatusLabel(row.status) }}
        </span>
        <span
          v-if="row.ports.length"
          class="rounded-full bg-neutral-100 px-2 py-0.5 font-mono text-[11px] text-neutral-500 dark:bg-neutral-800 dark:text-neutral-300"
          :title="row.ports.map((p) => `:${p}`).join(' · ')"
        >
          {{ row.ports.map((p) => `:${p}`).join(' ') }}
        </span>
        <span v-else class="text-xs text-neutral-400">—</span>
        <div class="flex shrink-0 items-center gap-1">
          <button
            v-if="claimingContainer === row.id"
            class="btn-ghost w-20"
            disabled
          >
            <LoaderCircle :size="13" class="animate-spin" /> {{ row.status === 'starting' ? '启动中' : '停止中' }}
          </button>
          <button v-else-if="row.status === 'running'" class="btn-danger w-20" @click="onStopContainer(row)">
            <Square :size="12" /> 停止
          </button>
          <button v-else-if="row.status === 'stopped'" class="btn-primary w-20" @click="onStartContainer(row)">
            <Play :size="13" /> 启动
          </button>
          <button v-else class="btn-ghost w-20" disabled>
            <LoaderCircle :size="13" class="animate-spin" /> {{ row.status === 'stopping' ? '停止中' : '启动中' }}
          </button>
        </div>
      </div>
    </div>
    <div class="scroll-slim overflow-auto">
      <div class="grid min-w-[860px] grid-cols-[80px_150px_1fr_120px_80px_70px_auto] items-center gap-2 border-b border-neutral-200 px-4 py-2 text-[11px] font-medium text-neutral-400 dark:border-neutral-800">
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
          class="grid min-w-[860px] grid-cols-[80px_150px_1fr_120px_80px_70px_auto] items-center gap-2 border-b border-neutral-200 px-4 py-2 text-sm last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
        >
          <button class="chip-port w-fit" title="打开 http://localhost:{{ portMin(p) }}" @click="openPort(portMin(p))">
            :{{ portMin(p) }}
          </button>
          <div class="min-w-0">
            <div class="truncate font-medium">{{ p.name }}</div>
            <div class="text-[11px] text-neutral-400">PID {{ p.pid }}</div>
          </div>
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
      <p v-if="!rows.length && !dbs.length" class="px-4 py-10 text-center text-sm text-neutral-400">暂无监听端口进程</p>
    </div>
  </section>
</template>
