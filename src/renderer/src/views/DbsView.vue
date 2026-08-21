<script setup lang="ts">
import { computed } from 'vue'
import { Database, LoaderCircle, Play, Square, X } from '@lucide/vue'
import type { DbRow, DbRowStatus } from '@shared/types'
import { api } from '../lib/api'
import { confirmDialog } from '../stores/confirm'
import { dismissDb, dbs, startDb, stopDb } from '../stores/monitor'

const runningCount = computed(() => dbs.value.filter((d) => d.status === 'running').length)
const stoppedCount = computed(() => dbs.value.filter((d) => d.status === 'stopped').length)

function statusLabel(s: DbRowStatus): string {
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

function statusColor(s: DbRowStatus): string {
  switch (s) {
    case 'running':
      return 'text-go'
    case 'starting':
    case 'stopping':
      return 'text-warn'
    default:
      return 'text-ink-soft/60 dark:text-chalk-soft/60'
  }
}

function dotClass(s: DbRowStatus): string {
  switch (s) {
    case 'running':
      return 'bg-go'
    case 'starting':
    case 'stopping':
      return 'bg-warn'
    default:
      return 'bg-ink-soft/50 dark:bg-chalk-soft/50'
  }
}

async function onStop(row: DbRow): Promise<void> {
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

async function onStart(row: DbRow): Promise<void> {
  await startDb(row.id)
}

async function onDismiss(row: DbRow): Promise<void> {
  const ok = await confirmDialog({
    title: `移除「${row.label}」记录？`,
    body: '仅从监控列表移除，不会影响实际进程。',
    confirmText: '移除'
  })
  if (ok) await dismissDb(row.id)
}

async function openPort(port?: number): Promise<void> {
  if (port) await api.openUrl(`http://localhost:${port}`)
}
</script>

<template>
  <div class="scroll-slim h-full space-y-6 overflow-auto pb-4 pr-1">
    <!-- 统计条 -->
    <header class="flex flex-wrap items-center gap-2">
      <span class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft">
        共 <b class="text-ink dark:text-chalk">{{ dbs.length }}</b> 个数据库
      </span>
      <span class="flex items-center gap-2 rounded-[6px] border border-go/30 bg-go/8 px-3 py-1.5 font-mono text-xs text-go dark:text-go-soft">
        <span class="h-1.5 w-1.5 rounded-full bg-go pulse-dot" />
        <b>{{ runningCount }}</b> 运行中
      </span>
      <span v-if="stoppedCount" class="flex items-center gap-2 rounded-[6px] border border-ink/10 bg-ink/5 px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-white/10 dark:bg-white/5 dark:text-chalk-soft">
        <b>{{ stoppedCount }}</b> 已停止
      </span>
    </header>

    <!-- 数据库列表 -->
    <section v-if="dbs.length" class="card overflow-hidden">
      <header class="flex items-center justify-between border-b border-line px-4 py-3 dark:border-coal-line">
        <div class="flex items-center gap-2">
          <span class="h-3.5 w-1 rounded-sm bg-inspect" />
          <h3 class="font-mono text-[13px] font-bold uppercase tracking-[0.1em]">数据库实例</h3>
        </div>
        <span class="font-mono text-[11px] text-ink-soft dark:text-chalk-soft">点击端口可打开管理页 · 运行中优先排序</span>
      </header>
      <div class="scroll-slim overflow-auto">
        <div
          v-for="row in dbs"
          :key="row.id"
          class="flex items-center gap-3 border-b border-line/70 px-4 py-3 text-sm last:border-0 hover:bg-ink/[0.02] dark:border-coal-line/70 dark:hover:bg-white/[0.03]"
        >
          <span class="text-lg leading-none">{{ row.icon }}</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">{{ row.label }}</span>
              <span v-if="row.version" class="rounded-[5px] border border-line px-1.5 font-mono text-[10px] uppercase text-ink-soft dark:border-coal-line dark:text-chalk-soft">
                v{{ row.version }}
              </span>
            </div>
            <div class="truncate font-mono text-[11px] text-ink-soft dark:text-chalk-soft" :title="row.cmdline ?? row.service">
              {{ row.service ? `Windows 服务 ${row.service}` : (row.cmdline ?? '—') }}
            </div>
          </div>
          <span class="flex items-center gap-1.5 font-mono text-xs font-medium" :class="statusColor(row.status)">
            <span class="h-1.5 w-1.5 rounded-full" :class="dotClass(row.status)" />
            {{ statusLabel(row.status) }}
          </span>
          <button
            v-if="row.port"
            class="chip-port"
            :title="`打开 http://localhost:${row.port}`"
            @click="openPort(row.port)"
          >
            :{{ row.port }}
          </button>
          <span v-else class="font-mono text-xs text-ink-soft/60 dark:text-chalk-soft/60">—</span>
          <div class="flex shrink-0 items-center gap-1">
            <button v-if="row.status === 'running'" class="btn-danger w-20" @click="onStop(row)">
              <Square :size="12" /> 停止
            </button>
            <button v-else-if="row.status === 'stopped'" class="btn-primary w-20" @click="onStart(row)">
              <Play :size="13" /> 启动
            </button>
            <button v-else class="btn-ghost w-20" disabled>
              <LoaderCircle :size="13" class="animate-spin" /> {{ row.status === 'stopping' ? '停止中' : '启动中' }}
            </button>
            <button v-if="row.status === 'stopped'" class="icon-btn" title="移除该记录" @click="onDismiss(row)">
              <X :size="13" />
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 空态 -->
    <section v-else class="card grid place-items-center gap-3 border-dashed py-16 text-center">
      <div class="grid h-12 w-12 place-items-center rounded-full border border-line bg-paper text-ink-soft dark:border-coal-line dark:bg-black/25 dark:text-chalk-soft">
        <Database :size="20" />
      </div>
      <div>
        <p class="font-mono text-sm font-semibold text-ink dark:text-chalk">尚未检测到数据库实例</p>
        <p class="mt-1 font-mono text-xs text-ink-soft dark:text-chalk-soft">启动 MySQL / Redis / PostgreSQL 等后会自动出现在这里</p>
      </div>
    </section>
  </div>
</template>
