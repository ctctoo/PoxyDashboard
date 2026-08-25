<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { Cpu, MemoryStick, HardDrive, Activity, Rocket, FolderOpen, Bot, Boxes } from '@lucide/vue'
import { overview, refreshOverview } from '../stores/overview'
import { snapshot } from '../stores/monitor'
import { apps, launch } from '../stores/apps2'
import { workspaces, open as openWorkspace } from '../stores/workspaces'
import { setView } from '../stores/view'

const cpuPct = computed(() => overview.value?.cpu.usage ?? 0)
const memPct = computed(() => overview.value?.memory.percent ?? 0)
const diskPct = computed(() => overview.value?.disk.percent ?? 0)
const memText = computed(() => {
  const o = overview.value
  if (!o) return '—'
  const used = Math.round(o.memory.usedMB)
  const cap = Math.round(o.memory.capacityMB)
  return cap ? `${used} / ${cap} MB` : `${used} MB`
})
const diskText = computed(() => {
  const d = overview.value?.disk
  if (!d || !d.totalGB) return '—'
  return `${d.freeGB} GB 可用 / ${d.totalGB} GB`
})

const recentApps = computed(() => apps.value.slice(0, 6))
const recentWs = computed(() => workspaces.value.slice(0, 5))

let timer: number | null = null
onMounted(() => {
  timer = window.setInterval(() => void refreshOverview(), 4000)
})
onUnmounted(() => {
  if (timer) window.clearInterval(timer)
})

const serviceCount = computed(() => snapshot.value?.stats.serviceCount ?? 0)
</script>

<template>
  <div class="scroll-slim h-full space-y-5 overflow-auto pb-4 pr-1">
    <!-- 顶部：系统状态核心指标 -->
    <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <!-- CPU -->
      <div class="card p-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="panel-label">CPU</span>
          <Cpu :size="14" class="text-signal" />
        </div>
        <div class="font-mono text-2xl font-bold text-ink dark:text-chalk">
          {{ cpuPct.toFixed(1) }}<span class="text-sm text-ink-soft">%</span>
        </div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-line dark:bg-coal-line">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="cpuPct > 80 ? 'bg-alert' : 'bg-signal'"
            :style="{ width: cpuPct + '%' }"
          />
        </div>
        <div class="mt-2 font-mono text-[11px] text-ink-soft dark:text-chalk-soft">
          {{ overview?.cpu.cores ?? 0 }} 核
        </div>
      </div>

      <!-- Memory -->
      <div class="card p-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="panel-label">内存</span>
          <MemoryStick :size="14" class="text-go" />
        </div>
        <div class="font-mono text-2xl font-bold text-ink dark:text-chalk">{{ memPct }}%</div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-line dark:bg-coal-line">
          <div
            class="h-full rounded-full transition-all duration-500 bg-go"
            :style="{ width: memPct + '%' }"
          />
        </div>
        <div class="mt-2 font-mono text-[11px] text-ink-soft dark:text-chalk-soft">
          {{ memText }}
        </div>
      </div>

      <!-- Disk -->
      <div class="card p-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="panel-label">磁盘</span>
          <HardDrive :size="14" class="text-inspect" />
        </div>
        <div class="font-mono text-2xl font-bold text-ink dark:text-chalk">{{ diskPct }}%</div>
        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-line dark:bg-coal-line">
          <div
            class="h-full rounded-full transition-all duration-500 bg-inspect"
            :style="{ width: diskPct + '%' }"
          />
        </div>
        <div class="mt-2 font-mono text-[11px] text-ink-soft dark:text-chalk-soft">
          {{ diskText }}
        </div>
      </div>

      <!-- 运行实体 -->
      <div class="card p-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="panel-label">运行实体</span>
          <Activity :size="14" class="text-warn" />
        </div>
        <div class="font-mono text-2xl font-bold text-ink dark:text-chalk">
          {{ overview?.runningApps ?? 0 }}
        </div>
        <div class="mt-2 space-y-1 font-mono text-[11px] text-ink-soft dark:text-chalk-soft">
          <div class="flex justify-between">
            <span>服务</span><b class="text-ink dark:text-chalk">{{ overview?.services ?? 0 }}</b>
          </div>
          <div class="flex justify-between">
            <span>数据库</span><b class="text-ink dark:text-chalk">{{ overview?.databases ?? 0 }}</b>
          </div>
          <div class="flex justify-between">
            <span>容器 / Agent</span>
            <b class="text-ink dark:text-chalk">{{ overview?.containers ?? 0 }} / {{ overview?.agents ?? 0 }}</b>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <!-- 最近打开应用 -->
      <div class="card p-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="panel-label">最近应用</span>
          <Rocket :size="14" class="text-signal" />
        </div>
        <ul class="space-y-1">
          <li
            v-for="a in recentApps"
            :key="a.id"
            class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ink/5 dark:hover:bg-white/5"
            @click="launch(a.id)"
          >
            <span class="text-lg">{{ a.icon ?? '🖥️' }}</span>
            <span class="flex-1 truncate text-sm">{{ a.name }}</span>
            <span
              v-if="a.category"
              class="chip !text-[10px]"
            >{{ a.category }}</span>
          </li>
          <li v-if="!recentApps.length" class="py-4 text-center text-sm text-ink-soft dark:text-chalk-soft">
            暂无应用，去应用管理同步
          </li>
        </ul>
      </div>

      <!-- 最近工作区 -->
      <div class="card p-4">
        <div class="mb-3 flex items-center justify-between">
          <span class="panel-label">最近工作区</span>
          <FolderOpen :size="14" class="text-go" />
        </div>
        <ul class="space-y-1">
          <li
            v-for="w in recentWs"
            :key="w.id"
            class="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-ink/5 dark:hover:bg-white/5"
            @click="openWorkspace(w.id)"
          >
            <span class="grid h-7 w-7 place-items-center rounded-md border border-line bg-paper dark:border-coal-line dark:bg-coal">
              <FolderOpen :size="13" class="text-ink-soft dark:text-chalk-soft" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm">{{ w.name }}</span>
              <span class="block truncate font-mono text-[10px] text-ink-soft dark:text-chalk-soft">{{ w.path }}</span>
            </span>
            <span v-if="w.type" class="chip !text-[10px]">{{ w.type }}</span>
          </li>
          <li v-if="!recentWs.length" class="py-4 text-center text-sm text-ink-soft dark:text-chalk-soft">
            暂无工作区，去工作区管理登记
          </li>
        </ul>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div class="card p-4">
      <div class="mb-3 flex items-center gap-2">
        <span class="panel-label">快捷入口</span>
        <span class="font-mono text-[10px] text-ink-soft/60 dark:text-chalk-soft/50">QUICK ACCESS</span>
      </div>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <button class="btn-ghost h-16 flex-col !gap-1" @click="setView('applications')">
          <Rocket :size="16" class="text-signal" /> 应用管理
        </button>
        <button class="btn-ghost h-16 flex-col !gap-1" @click="setView('workspace')">
          <FolderOpen :size="16" class="text-go" /> 工作区
        </button>
        <button class="btn-ghost h-16 flex-col !gap-1" @click="setView('models')">
          <Cpu :size="16" class="text-inspect" /> 本地模型
        </button>
        <button class="btn-ghost h-16 flex-col !gap-1" @click="setView('monitor')">
          <Activity :size="16" class="text-warn" /> 服务监控
        </button>
        <button class="btn-ghost h-16 flex-col !gap-1" @click="setView('launchpad')">
          <Boxes :size="16" class="text-inspect" /> 启动台
        </button>
      </div>
    </div>

    <!-- 运行中的服务快速列表 -->
    <div class="card p-4">
      <div class="mb-3 flex items-center gap-2">
        <span class="panel-label">运行中服务</span>
        <Bot :size="13" class="text-ink-soft dark:text-chalk-soft" />
        <span class="font-mono text-[10px] text-ink-soft/60 dark:text-chalk-soft/50">{{ serviceCount }}</span>
      </div>
      <div v-if="!serviceCount" class="py-3 text-center text-sm text-ink-soft dark:text-chalk-soft">
        暂无监听端口的服务进程
      </div>
      <ul v-else class="grid grid-cols-1 gap-1 sm:grid-cols-2">
        <li
          v-for="p in snapshot?.services.slice(0, 8) ?? []"
          :key="p.pid"
          class="flex items-center gap-2 rounded-md px-2 py-1 font-mono text-xs"
        >
          <span class="h-1.5 w-1.5 shrink-0 rounded-full bg-go" />
          <span class="truncate">{{ p.name }}</span>
          <span class="ml-auto text-go">:{{ p.ports[0] }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>
