<script setup lang="ts">
import { ref } from 'vue'
import { Bot, ChevronDown, ChevronRight, Cpu, HardDrive, Play, Power, RotateCw, Square, XCircle } from '@lucide/vue'
import type { AgentRow } from '@shared/types'
import {
  agents,
  formatDuration,
  installedCount,
  restartAgent,
  runningCount,
  startAgent,
  stopAgent,
  stopTask,
  totalCpu,
  totalMemMB
} from '../stores/agents'
import { formatMem } from '../lib/fmt'

const expanded = ref<Set<string>>(new Set())
const actingTask = ref<number | null>(null)
const actingAgent = ref<string | null>(null)

function toggle(id: string): void {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}

async function onStopTask(pid: number): Promise<void> {
  actingTask.value = pid
  try {
    await stopTask(pid)
  } finally {
    actingTask.value = null
  }
}

async function onStopAgent(row: AgentRow): Promise<void> {
  actingAgent.value = row.id
  try {
    await stopAgent(row)
  } finally {
    actingAgent.value = null
  }
}

async function onRestartAgent(row: AgentRow): Promise<void> {
  actingAgent.value = row.id
  try {
    await restartAgent(row)
  } finally {
    actingAgent.value = null
  }
}

async function onStartAgent(row: AgentRow): Promise<void> {
  actingAgent.value = row.id
  try {
    await startAgent(row)
  } finally {
    actingAgent.value = null
  }
}

function statusLabel(row: AgentRow): string {
  if (row.status === 'running') return '运行中'
  if (row.status === 'idle') return '空闲'
  return '未启动'
}
</script>

<template>
  <div class="scroll-slim h-full space-y-6 overflow-auto pb-4 pr-1">
    <!-- 顶部统计条 -->
    <header class="flex flex-wrap items-center gap-2">
      <span class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft">
        共 <b class="text-ink dark:text-chalk">{{ agents.length }}</b> 个 agent
      </span>
      <span class="flex items-center gap-2 rounded-[6px] border border-go/30 bg-go/8 px-3 py-1.5 font-mono text-xs text-go dark:text-go-soft">
        <span class="h-1.5 w-1.5 rounded-full bg-go pulse-dot" />
        <b>{{ runningCount }}</b> 运行中
      </span>
      <span
        v-if="installedCount"
        class="flex items-center gap-2 rounded-[6px] border border-inspect/30 bg-inspect/8 px-3 py-1.5 font-mono text-xs text-inspect dark:text-inspect-soft"
      >
        <b>{{ installedCount }}</b> 已安装未启动
      </span>
      <span class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft">
        <Cpu :size="13" class="text-warn" /> CPU {{ totalCpu }}%
      </span>
      <span class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft">
        <HardDrive :size="13" class="text-inspect" /> {{ formatMem(totalMemMB) }}
      </span>
    </header>

    <!-- Agent 卡片列表 -->
    <div v-if="agents.length" class="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
      <article
        v-for="row in agents"
        :key="row.id"
        class="card relative flex flex-col overflow-hidden p-4"
        :class="row.status === 'not-running' ? 'opacity-90' : ''"
      >
        <span
          class="absolute inset-x-0 top-0 h-[3px]"
          :class="row.status === 'running' ? 'bg-go' : row.status === 'idle' ? 'bg-warn' : 'bg-ink/15 dark:bg-white/15'"
        />

        <!-- 卡片头 -->
        <div class="flex items-center gap-2.5">
          <span
            class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-paper text-lg leading-none dark:border-coal-line dark:bg-black/25"
            :class="row.status === 'not-running' ? 'grayscale' : ''"
          >
            {{ row.icon }}
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-semibold">{{ row.label }}</span>
              <span class="rounded-[5px] border border-line px-1.5 font-mono text-[10px] uppercase tracking-wide text-ink-soft dark:border-coal-line dark:text-chalk-soft">
                {{ row.kind }}
              </span>
            </div>
            <div class="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-ink-soft dark:text-chalk-soft">
              <span
                class="flex items-center gap-1"
                :class="row.status === 'running' ? 'text-go' : row.status === 'idle' ? 'text-warn' : 'text-ink-soft/60 dark:text-chalk-soft/60'"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="row.status === 'running' ? 'bg-go pulse-dot' : row.status === 'idle' ? 'bg-warn' : 'bg-current'"
                />
                {{ statusLabel(row) }}
              </span>
              <span v-if="row.pid">PID {{ row.pid }}</span>
              <span v-if="row.createdAt">{{ formatDuration(Date.now() - row.createdAt) }}</span>
            </div>
          </div>
          <span v-if="row.ports.length" class="chip-port" :title="row.ports.map((p) => `:${p}`).join(' · ')">
            :{{ row.ports[0] }}{{ row.ports.length > 1 ? ` +${row.ports.length - 1}` : '' }}
          </span>
        </div>

        <!-- 资源行 -->
        <div class="mt-3 flex items-center gap-4 border-t border-line pt-3 font-mono text-xs dark:border-coal-line">
          <span class="flex items-center gap-1.5 text-ink-soft dark:text-chalk-soft">
            <Cpu :size="13" class="text-warn" /> <b class="tabular-nums text-ink dark:text-chalk">{{ row.cpu }}%</b>
          </span>
          <span class="flex items-center gap-1.5 text-ink-soft dark:text-chalk-soft">
            <HardDrive :size="13" class="text-inspect" /> <b class="tabular-nums text-ink dark:text-chalk">{{ formatMem(row.memMB) }}</b>
          </span>
          <span v-if="row.status !== 'not-running'" class="ml-auto text-ink-soft/70 dark:text-chalk-soft/70">{{ row.taskCount }} 个任务进程</span>
        </div>

        <!-- 派生任务进程 -->
        <template v-if="row.status !== 'not-running'">
          <div v-if="row.tasks.length" class="mt-2">
            <button
              class="flex w-full items-center gap-1.5 rounded-md px-1 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-soft hover:text-signal dark:text-chalk-soft dark:hover:text-signal-soft"
              @click="toggle(row.id)"
            >
              <ChevronRight v-if="!expanded.has(row.id)" :size="13" />
              <ChevronDown v-else :size="13" />
              派生任务
            </button>
            <div v-if="expanded.has(row.id)" class="mt-1 space-y-1">
              <div
                v-for="t in row.tasks"
                :key="t.pid"
                class="flex items-center gap-2 rounded-md border border-line/70 bg-paper px-2 py-1.5 dark:border-coal-line/70 dark:bg-black/20"
              >
                <span class="grid h-6 w-6 shrink-0 place-items-center rounded bg-ink/5 text-ink-soft dark:bg-white/10 dark:text-chalk-soft">
                  <Bot :size="13" />
                </span>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="truncate text-xs font-medium">{{ t.name }}</span>
                    <span class="font-mono text-[10px] text-ink-soft/60 dark:text-chalk-soft/60">PID {{ t.pid }}</span>
                  </div>
                  <div class="truncate font-mono text-[10px] text-ink-soft dark:text-chalk-soft">{{ t.cmdline }}</div>
                </div>
                <span class="shrink-0 font-mono text-[10px] tabular-nums text-ink-soft dark:text-chalk-soft">{{ t.cpu }}% · {{ formatMem(t.memMB) }}</span>
                <button
                  class="icon-btn !h-6 !w-6 hover:!text-alert"
                  title="安全结束该任务进程"
                  :disabled="actingTask === t.pid"
                  @click="onStopTask(t.pid)"
                >
                  <XCircle v-if="actingTask !== t.pid" :size="13" />
                  <span v-else class="h-3 w-3 animate-spin rounded-full border-2 border-alert/40 border-t-alert" />
                </button>
              </div>
            </div>
          </div>
          <p
            v-else
            class="mt-2 rounded-md border border-dashed border-line px-2 py-2 text-center font-mono text-[11px] text-ink-soft/60 dark:border-coal-line dark:text-chalk-soft/60"
          >
            {{ row.status === 'running' ? '正在运行 · 无可见任务进程' : '空闲 · 等待任务' }}
          </p>
        </template>
        <p v-else class="mt-2 rounded-md border border-dashed border-line px-2 py-2 text-center font-mono text-[11px] text-inspect/70 dark:border-coal-line dark:text-inspect-soft/70">
          已安装 · 未启动 · 可一键启动
        </p>

        <!-- 操作 -->
        <div class="mt-3 flex items-center justify-end gap-2 border-t border-line pt-3 dark:border-coal-line">
          <template v-if="row.status === 'not-running'">
            <button class="btn-primary btn-sm" :disabled="actingAgent === row.id" @click="onStartAgent(row)">
              <Play :size="12" /> 启动
            </button>
          </template>
          <template v-else>
            <button class="btn-ghost btn-sm" :disabled="actingAgent === row.id" @click="onRestartAgent(row)">
              <RotateCw :size="12" /> 重启
            </button>
            <button class="btn-danger btn-sm" :disabled="actingAgent === row.id" @click="onStopAgent(row)">
              <Square :size="11" /> 退出
            </button>
          </template>
        </div>
      </article>
    </div>

    <!-- 空状态 -->
    <div v-else class="card grid place-items-center gap-3 border-dashed py-16 text-center">
      <div class="grid h-12 w-12 place-items-center rounded-full border border-line bg-paper text-ink-soft dark:border-coal-line dark:bg-black/25 dark:text-chalk-soft">
        <Power :size="20" />
      </div>
      <div>
        <p class="font-mono text-sm font-semibold text-ink dark:text-chalk">尚未检测到 AI agent 在本机运行</p>
        <p class="mt-1 font-mono text-xs text-ink-soft dark:text-chalk-soft">启动或通过 npm 安装 Codex / OpenCode / Claude / Cursor 等工具后会自动出现在这里</p>
      </div>
    </div>
  </div>
</template>
