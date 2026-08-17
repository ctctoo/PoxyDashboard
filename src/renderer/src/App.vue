<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Rocket, Activity, ScrollText, Settings as SettingsIcon, Terminal, Sun, Moon, MonitorCog, Keyboard } from '@lucide/vue'
import { view, setView, openDashboardLogs } from './stores/view'
import { initApps } from './stores/apps'
import { initMonitor } from './stores/monitor'
import { initLogs } from './stores/logs'
import { initSettings, settings, cycleTheme } from './stores/settings'
import { togglePalette } from './stores/palette'
import { api } from './lib/api'
import LaunchpadView from './views/LaunchpadView.vue'
import MonitorView from './views/MonitorView.vue'
import LogsView from './views/LogsView.vue'
import SettingsView from './views/SettingsView.vue'
import CommandPalette from './components/CommandPalette.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AppEditorModal from './components/app/AppEditorModal.vue'
import DiagnosticsModal from './components/app/DiagnosticsModal.vue'
import { editorState, diagnosticsId } from './stores/ui'

const navItems = [
  { key: 'launchpad', label: '启动台', icon: Rocket },
  { key: 'monitor', label: '服务监控', icon: Activity },
  { key: 'logs', label: '日志中心', icon: ScrollText },
  { key: 'settings', label: '设置中心', icon: SettingsIcon }
] as const

const titles: Record<string, { title: string; sub: string }> = {
  launchpad: { title: '启动台', sub: '管理你的服务与任务' },
  monitor: { title: '服务监控', sub: '看这台电脑在跑什么' },
  logs: { title: '日志中心', sub: '实时日志 · 运行中优先' },
  settings: { title: '设置中心', sub: '通知 · 外观 · 关于' }
}

const viewComp = computed(() => {
  const map = { launchpad: LaunchpadView, monitor: MonitorView, logs: LogsView, settings: SettingsView }
  return map[view.value]
})

const themeIcon = computed(() => {
  if (settings.theme === 'dark') return Moon
  if (settings.theme === 'light') return Sun
  return MonitorCog
})

onMounted(() => {
  void initApps()
  void initMonitor()
  initLogs()
  void initSettings()
  api.on('shortcut', (kind) => {
    if (kind === 'palette') togglePalette()
    else openDashboardLogs()
  })
  api.on('nav', (v) => setView(v))
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-neutral-100 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
    <aside class="flex w-56 shrink-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div class="flex h-14 items-center gap-2.5 px-4">
        <div class="grid h-8 w-8 place-items-center rounded-lg bg-emerald-600 text-white">
          <Terminal :size="17" />
        </div>
        <div>
          <div class="text-sm font-bold leading-tight">总控台</div>
          <div class="text-[10px] text-neutral-400 leading-tight">服务 · 任务 · 监控</div>
        </div>
      </div>
      <nav class="flex-1 space-y-1 overflow-auto px-3 py-2">
        <button v-for="item in navItems" :key="item.key" class="nav-item w-full" :class="{ active: view === item.key }" @click="setView(item.key)">
          <component :is="item.icon" :size="16" />
          {{ item.label }}
        </button>
      </nav>
      <div class="space-y-1 border-t border-neutral-200 p-3 dark:border-neutral-800">
        <button class="nav-item w-full" @click="openDashboardLogs">
          <Terminal :size="16" />
          总控台日志
        </button>
        <div class="flex items-center gap-1.5 px-3 pt-1 text-[10px] text-neutral-400">
          <Keyboard :size="11" />
          ⌘K 命令面板 · ⌘J 日志中心
        </div>
      </div>
    </aside>

    <main class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-12 shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <span class="text-sm font-semibold">{{ titles[view].title }}</span>
          <span class="ml-2 text-xs text-neutral-400">{{ titles[view].sub }}</span>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-ghost btn-sm" @click="togglePalette">
            <Keyboard :size="13" />
            命令面板
            <kbd class="rounded border border-neutral-300 px-1 font-mono text-[10px] dark:border-neutral-600">⌘K</kbd>
          </button>
          <button class="icon-btn" :title="`外观：${settings.theme}`" @click="cycleTheme">
            <component :is="themeIcon" :size="15" />
          </button>
        </div>
      </header>
      <div class="min-h-0 flex-1 overflow-hidden p-4">
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
