<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { LayoutGrid, List, ListPlus, MoreHorizontal, Plus } from '@lucide/vue'
import AppSection from '../components/app/AppSection.vue'
import ViewLoading from '../components/ViewLoading.vue'
import { appEntries, appsReady, stopAll } from '../stores/apps'
import { confirmDialog } from '../stores/confirm'
import { settings, setLaunchpadView } from '../stores/settings'
import { openAdd, openDiagnostics } from '../stores/ui'
import { openDashboardLogs } from '../stores/view'

const runningCount = computed(
  () =>
    appEntries.value.filter((e) => ['starting', 'running', 'stopping'].includes(e.runtime.status))
      .length
)
const shortcutsOpen = ref(false)

watch(shortcutsOpen, (v) => {
  if (v) window.addEventListener('mousedown', onClickOutside)
  else window.removeEventListener('mousedown', onClickOutside)
})
onUnmounted(() => window.removeEventListener('mousedown', onClickOutside))

function onClickOutside(e: MouseEvent): void {
  if (shortcutsOpen.value && !(e.target as HTMLElement).closest('.shortcut-menu'))
    shortcutsOpen.value = false
}

async function onStopAll(): Promise<void> {
  shortcutsOpen.value = false
  const ok = await confirmDialog({
    title: '停止全部运行中的应用？',
    body: `当前有 ${runningCount.value} 个应用在运行。将逐个安全停止（只结束各自进程树，绝不按端口杀进程）。`,
    danger: true,
    confirmText: '全部停止'
  })
  if (ok) await stopAll()
}

function onOpenLogs(): void {
  shortcutsOpen.value = false
  openDashboardLogs()
}
</script>

<template>
  <div class="h-full">
    <ViewLoading v-if="!appsReady" label="正在加载启动台配置…" :cards="2" />
    <div v-else class="scroll-slim h-full space-y-6 overflow-auto pb-4 pr-1">
      <header class="flex items-center justify-between">
        <div class="flex items-center gap-3 font-mono text-xs text-ink-soft dark:text-chalk-soft">
          <span
            class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 dark:border-coal-line dark:bg-coal-raised"
          >
            共 <b class="text-ink dark:text-chalk">{{ appEntries.length }}</b> 个应用
          </span>
          <span
            class="flex items-center gap-2 rounded-[6px] border border-go/30 bg-go/8 px-3 py-1.5 text-go dark:border-go/30 dark:bg-go/10 dark:text-go-soft"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-go pulse-dot" />
            <b>{{ runningCount }}</b> 运行中
          </span>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex rounded-lg border border-line p-0.5 dark:border-coal-line">
            <button
              class="icon-btn"
              :class="{
                '!border-signal !text-signal dark:!text-signal-soft':
                  settings.launchpadView === 'grid'
              }"
              title="宫格视图"
              @click="setLaunchpadView('grid')"
            >
              <LayoutGrid :size="14" />
            </button>
            <button
              class="icon-btn"
              :class="{
                '!border-signal !text-signal dark:!text-signal-soft':
                  settings.launchpadView === 'list'
              }"
              title="列表视图"
              @click="setLaunchpadView('list')"
            >
              <List :size="14" />
            </button>
          </div>
          <button class="btn-primary" @click="openAdd('service')">
            <Plus :size="14" /> 添加服务
          </button>
          <button class="btn-ghost" @click="openAdd('task')">
            <ListPlus :size="14" /> 添加任务
          </button>
          <div class="shortcut-menu relative">
            <button class="btn-ghost" @click="shortcutsOpen = !shortcutsOpen">
              <MoreHorizontal :size="14" /> 快捷操作
            </button>
            <div
              v-if="shortcutsOpen"
              class="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-coal-line bg-coal-raised p-1 shadow-xl dark:border-coal-line dark:bg-coal-raised"
            >
              <button
                class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-mono text-alert hover:bg-white/5 dark:text-alert-soft dark:hover:bg-white/5"
                @click="onStopAll"
              >
                ⏹ 停止全部运行中的应用
              </button>
              <button
                class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-white/5 dark:hover:bg-white/5"
                @click="onOpenLogs"
              >
                🖥️ 查看总控台日志
              </button>
            </div>
          </div>
        </div>
      </header>

      <AppSection
        kind="service"
        :view="settings.launchpadView"
        @add="openAdd"
        @diagnose="openDiagnostics"
      />
      <AppSection
        kind="task"
        :view="settings.launchpadView"
        @add="openAdd"
        @diagnose="openDiagnostics"
      />
    </div>
  </div>
</template>
