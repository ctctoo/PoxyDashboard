<script setup lang="ts">
import { computed, ref } from 'vue'
import { Boxes, LoaderCircle, Play, Square } from '@lucide/vue'
import type { ContainerRow, ContainerState } from '@shared/types'
import { api } from '../lib/api'
import { confirmDialog } from '../stores/confirm'
import { containers, startContainer, stopContainer } from '../stores/monitor'

const runningCount = computed(() => containers.value.filter((c) => c.status === 'running').length)
const stoppedCount = computed(() => containers.value.filter((c) => c.status === 'stopped').length)

function statusLabel(s: ContainerState): string {
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

function statusColor(s: ContainerState): string {
  return s === 'running' ? 'text-go' : s === 'stopping' || s === 'starting' ? 'text-warn' : 'text-ink-soft/60 dark:text-chalk-soft/60'
}

function dotClass(s: ContainerState): string {
  return s === 'running' ? 'bg-go' : s === 'stopping' || s === 'starting' ? 'bg-warn' : 'bg-ink-soft/50 dark:bg-chalk-soft/50'
}

const acting = ref<string | null>(null)

async function onStop(row: ContainerRow): Promise<void> {
  const ok = await confirmDialog({
    title: `停止容器「${row.name}」？`,
    body: '将执行 docker stop 优雅停止该容器。',
    danger: true,
    confirmText: '停止'
  })
  if (!ok) return
  acting.value = row.id
  try {
    await stopContainer(row.id)
  } finally {
    acting.value = null
  }
}

async function onStart(row: ContainerRow): Promise<void> {
  acting.value = row.id
  try {
    await startContainer(row.id)
  } finally {
    acting.value = null
  }
}

async function openPort(port: number): Promise<void> {
  await api.openUrl(`http://localhost:${port}`)
}
</script>

<template>
  <div class="scroll-slim h-full space-y-6 overflow-auto pb-4 pr-1">
    <!-- 统计条 -->
    <header class="flex flex-wrap items-center gap-2">
      <span class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft">
        共 <b class="text-ink dark:text-chalk">{{ containers.length }}</b> 个容器
      </span>
      <span class="flex items-center gap-2 rounded-[6px] border border-go/30 bg-go/8 px-3 py-1.5 font-mono text-xs text-go dark:text-go-soft">
        <span class="h-1.5 w-1.5 rounded-full bg-go pulse-dot" />
        <b>{{ runningCount }}</b> 运行中
      </span>
      <span v-if="stoppedCount" class="flex items-center gap-2 rounded-[6px] border border-ink/10 bg-ink/5 px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-white/10 dark:bg-white/5 dark:text-chalk-soft">
        <b>{{ stoppedCount }}</b> 已停止
      </span>
    </header>

    <!-- 容器列表 -->
    <section v-if="containers.length" class="card overflow-hidden">
      <header class="flex items-center justify-between border-b border-line px-4 py-3 dark:border-coal-line">
        <div class="flex items-center gap-2">
          <span class="h-3.5 w-1 rounded-sm bg-signal" />
          <h3 class="font-mono text-[13px] font-bold uppercase tracking-[0.1em]">Docker 容器</h3>
        </div>
        <span class="font-mono text-[11px] text-ink-soft dark:text-chalk-soft">点击端口可打开 · 运行中优先排序</span>
      </header>
      <div class="scroll-slim overflow-auto">
        <div
          v-for="row in containers"
          :key="row.id"
          class="flex items-center gap-3 border-b border-line/70 px-4 py-3 text-sm last:border-0 hover:bg-ink/[0.02] dark:border-coal-line/70 dark:hover:bg-white/[0.03]"
        >
          <span class="text-lg leading-none">🐳</span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">{{ row.name }}</span>
              <span class="rounded-[5px] border border-line px-1.5 font-mono text-[10px] text-ink-soft dark:border-coal-line dark:text-chalk-soft">
                {{ row.image }}
              </span>
            </div>
            <div class="truncate font-mono text-[11px] text-ink-soft dark:text-chalk-soft" :title="row.statusText ?? row.portMap">
              {{ row.statusText ?? '—' }}{{ row.portMap ? ` · ${row.portMap}` : '' }}
            </div>
          </div>
          <span class="flex items-center gap-1.5 font-mono text-xs font-medium" :class="statusColor(row.status)">
            <span class="h-1.5 w-1.5 rounded-full" :class="dotClass(row.status)" />
            {{ statusLabel(row.status) }}
          </span>
          <span
            v-if="row.ports.length"
            class="flex items-center gap-1"
          >
            <button
              v-for="p in row.ports"
              :key="p"
              class="chip-port"
              :title="`打开 http://localhost:${p}`"
              @click="openPort(p)"
            >
              :{{ p }}
            </button>
          </span>
          <span v-else class="font-mono text-xs text-ink-soft/60 dark:text-chalk-soft/60">—</span>
          <div class="flex shrink-0 items-center gap-1">
            <button v-if="acting === row.id" class="btn-ghost w-20" disabled>
              <LoaderCircle :size="13" class="animate-spin" /> {{ row.status === 'starting' ? '启动中' : '停止中' }}
            </button>
            <button v-else-if="row.status === 'running'" class="btn-danger w-20" @click="onStop(row)">
              <Square :size="12" /> 停止
            </button>
            <button v-else-if="row.status === 'stopped'" class="btn-primary w-20" @click="onStart(row)">
              <Play :size="13" /> 启动
            </button>
            <button v-else class="btn-ghost w-20" disabled>
              <LoaderCircle :size="13" class="animate-spin" /> {{ row.status === 'stopping' ? '停止中' : '启动中' }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 空态 -->
    <section v-else class="card grid place-items-center gap-3 border-dashed py-16 text-center">
      <div class="grid h-12 w-12 place-items-center rounded-full border border-line bg-paper text-ink-soft dark:border-coal-line dark:bg-black/25 dark:text-chalk-soft">
        <Boxes :size="20" />
      </div>
      <div>
        <p class="font-mono text-sm font-semibold text-ink dark:text-chalk">尚未检测到 Docker 容器</p>
        <p class="mt-1 font-mono text-xs text-ink-soft dark:text-chalk-soft">启动 Docker 并运行容器后会自动出现在这里</p>
      </div>
    </section>
  </div>
</template>
