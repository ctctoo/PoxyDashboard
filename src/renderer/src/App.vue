<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Rocket, Activity, Database, Boxes, ScrollText, Settings as SettingsIcon, Terminal, Sun, Moon, MonitorCog, Keyboard, Zap, Bot } from '@lucide/vue'
import { view, setView, openDashboardLogs } from './stores/view'
import { initApps } from './stores/apps'
import { initMonitor } from './stores/monitor'
import { initAgents } from './stores/agents'
import { initLogs } from './stores/logs'
import { initSettings, settings, cycleTheme } from './stores/settings'
import { togglePalette } from './stores/palette'
import { api } from './lib/api'
import LaunchpadView from './views/LaunchpadView.vue'
import MonitorView from './views/MonitorView.vue'
import AgentView from './views/AgentView.vue'
import DbsView from './views/DbsView.vue'
import DockerView from './views/DockerView.vue'
import LogsView from './views/LogsView.vue'
import SettingsView from './views/SettingsView.vue'
import CommandPalette from './components/CommandPalette.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AppEditorModal from './components/app/AppEditorModal.vue'
import DiagnosticsModal from './components/app/DiagnosticsModal.vue'
import AppBootLoader from './components/AppBootLoader.vue'
import { editorState, diagnosticsId } from './stores/ui'

const navItems = [
  { key: 'launchpad', label: '启动台', icon: Rocket, code: '01' },
  { key: 'monitor', label: '服务监控', icon: Activity, code: '02' },
  { key: 'dbs', label: '数据库', icon: Database, code: '03' },
  { key: 'docker', label: 'Docker', icon: Boxes, code: '04' },
  { key: 'agents', label: 'AI Agent', icon: Bot, code: '05' },
  { key: 'logs', label: '日志中心', icon: ScrollText, code: '06' },
  { key: 'settings', label: '设置中心', icon: SettingsIcon, code: '07' }
] as const

const titles: Record<string, { title: string; sub: string }> = {
  launchpad: { title: '启动台', sub: 'LAUNCHPAD · 服务与任务控制' },
  monitor: { title: '服务监控', sub: 'MONITOR · 本机运行观测' },
  dbs: { title: '数据库', sub: 'DATABASE · 本机数据库实例' },
  docker: { title: 'Docker', sub: 'DOCKER · 容器管理' },
  agents: { title: 'AI Agent', sub: 'AGENTS · AI 工具统一管理' },
  logs: { title: '日志中心', sub: 'LOGS · 实时日志 · 运行中优先' },
  settings: { title: '设置中心', sub: 'CONFIG · 通知 · 外观 · 关于' }
}

const viewComp = computed(() => {
  const map = {
    launchpad: LaunchpadView,
    monitor: MonitorView,
    dbs: DbsView,
    docker: DockerView,
    agents: AgentView,
    logs: LogsView,
    settings: SettingsView
  }
  return map[view.value]
})

const themeIcon = computed(() => {
  if (settings.theme === 'dark') return Moon
  if (settings.theme === 'light') return Sun
  return MonitorCog
})

/** 启动加载：数据源步骤状态，用于加载动画圆点 */
type BootStep = 'pending' | 'loading' | 'done'
const bootSteps = ref<BootStep[]>(['pending', 'pending', 'pending', 'pending'])

/** 是否完成启动（加载动画结束） */
const booted = ref(false)

function runStep(index: number, p: Promise<unknown> | void): void {
  const arr = [...bootSteps.value]
  arr[index] = 'loading'
  bootSteps.value = arr
  Promise.resolve(p)
    .catch(() => undefined)
    .finally(() => {
      const done = [...bootSteps.value]
      done[index] = 'done'
      bootSteps.value = done
    })
}

onMounted(() => {
  // 并行初始化各数据源，并标记加载步骤进度
  runStep(0, initSettings()) // 配置 / 外观 / 关于
  runStep(1, initApps()) // 启动台应用
  runStep(2, initMonitor()) // 进程 / 端口监控
  runStep(3, initAgents()) // AI Agent
  initLogs() // 日志订阅（同步，不计入加载步骤）

  api.on('shortcut', (kind) => {
    if (kind === 'palette') togglePalette()
    else openDashboardLogs()
  })
  api.on('nav', (v) => setView(v))

  // 加载动画：最短展示时间防闪烁 + 超时兜底，避免个别数据源卡住导致永远加载
  const minShowMs = 500
  const maxWaitMs = 4000
  const startedAt = Date.now()
  const doneAt = () => Date.now() - startedAt >= minShowMs

  let settled = false
  const finish = (): void => {
    if (settled) return
    settled = true
    // 补齐未完成步骤标记，再淡出
    const arr = bootSteps.value.map((s) => (s === 'loading' ? 'done' : s)) as BootStep[]
    bootSteps.value = arr
    booted.value = true
  }
  // 任一数据源失败/完成都不阻塞，等最短展示时间或超时即进入应用
  const timer = setInterval(() => {
    if (settled) {
      clearInterval(timer)
      return
    }
    if (bootSteps.value.every((s) => s === 'done') && doneAt()) finish()
    else if (Date.now() - startedAt >= maxWaitMs) finish()
  }, 50)
})
</script>

<template>
  <Transition name="boot" mode="out-in">
    <AppBootLoader v-if="!booted" :steps="bootSteps" />
  </Transition>

  <div v-if="booted" class="flex h-screen overflow-hidden bg-paper text-ink dark:bg-coal dark:text-chalk">
    <!-- 侧栏：跟随主题 -->
    <aside class="desk-grid flex w-60 shrink-0 flex-col border-r border-line bg-paper dark:border-coal-line dark:bg-coal">
      <!-- 品牌区：电源开关 -->
      <div class="flex h-16 items-center gap-3 border-b border-line px-5 dark:border-coal-line">
        <div class="relative grid h-9 w-9 place-items-center rounded-md border border-signal/60 bg-signal/15 text-signal dark:text-signal-soft">
          <Zap :size="17" class="fill-current" />
          <span class="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-signal pulse-dot" />
        </div>
        <div class="leading-none">
          <div class="font-mono text-[15px] font-bold tracking-[0.08em] text-ink dark:text-chalk">总控台</div>
          <div class="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-soft/70 dark:text-chalk-soft/70">Service · Task · Monitor</div>
        </div>
      </div>

      <div class="px-4 pt-4 pb-1 font-mono text-[10px] uppercase tracking-[0.22em] text-ink-soft/60 dark:text-chalk-soft/50">Modules</div>
      <nav class="flex-1 space-y-0.5 overflow-auto px-3 py-2">
        <button v-for="item in navItems" :key="item.key" class="nav-item w-full" :class="{ active: view === item.key }" @click="setView(item.key)">
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-paper-raised text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft">
            <component :is="item.icon" :size="14" />
          </span>
          <span class="flex-1 text-left">{{ item.label }}</span>
          <span class="font-mono text-[10px] text-ink-soft/50 dark:text-chalk-soft/40">{{ item.code }}</span>
        </button>
      </nav>

      <div class="space-y-1 border-t border-line p-3 dark:border-coal-line">
        <button class="nav-item w-full" @click="openDashboardLogs">
          <span class="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-line bg-paper-raised text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft">
            <Terminal :size="14" />
          </span>
          <span class="flex-1 text-left">总控台日志</span>
        </button>
        <div class="mt-2 flex items-center justify-between px-3 font-mono text-[10px] text-ink-soft/70 dark:text-chalk-soft/60">
          <span class="flex items-center gap-1.5"><Keyboard :size="11" /> ⌘K 命令</span>
          <span class="flex items-center gap-1.5"><Keyboard :size="11" /> ⌘J 日志</span>
        </div>
      </div>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col">
      <!-- 仪器头部：细条状态栏 -->
      <header class="flex h-12 shrink-0 items-center justify-between border-b border-line bg-paper-raised px-5 dark:border-coal-line dark:bg-coal-raised">
        <div class="flex items-baseline gap-3">
          <h1 class="font-mono text-sm font-bold tracking-wide">{{ titles[view].title }}</h1>
          <span class="hidden font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft sm:inline dark:text-chalk-soft">{{ titles[view].sub }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button class="btn-ghost btn-sm" @click="togglePalette">
            <Keyboard :size="12" />
            命令面板
            <kbd class="ml-0.5 rounded border border-line bg-paper px-1 font-mono text-[10px] text-ink-soft dark:border-coal-line dark:bg-black/30 dark:text-chalk-soft">⌘K</kbd>
          </button>
          <span class="mx-1 h-5 w-px bg-line dark:bg-coal-line" />
          <button class="icon-btn" :title="`外观：${settings.theme}`" @click="cycleTheme">
            <component :is="themeIcon" :size="15" />
          </button>
        </div>
      </header>

      <div class="min-h-0 flex-1 overflow-hidden p-5">
        <KeepAlive>
          <component :is="viewComp" />
        </KeepAlive>
      </div>
    </main>

    <CommandPalette />
    <ConfirmDialog />
    <AppEditorModal v-if="editorState.open" />
    <DiagnosticsModal v-if="diagnosticsId" />
  </div>
</template>
