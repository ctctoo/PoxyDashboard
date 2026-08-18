<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { LayoutGrid, List, ListPlus, MoreHorizontal, Plus } from '@lucide/vue'
import AppSection from '../components/app/AppSection.vue'
import { appEntries, stopAll } from '../stores/apps'
import { confirmDialog } from '../stores/confirm'
import { settings, setLaunchpadView } from '../stores/settings'
import { openAdd, openDiagnostics } from '../stores/ui'
import { openDashboardLogs } from '../stores/view'

const runningCount = computed(
  () => appEntries.value.filter((e) => ['starting', 'running', 'stopping'].includes(e.runtime.status)).length
)
const shortcutsOpen = ref(false)

watch(shortcutsOpen, (v) => {
  if (v) window.addEventListener('mousedown', onClickOutside)
  else window.removeEventListener('mousedown', onClickOutside)
})
onUnmounted(() => window.removeEventListener('mousedown', onClickOutside))

function onClickOutside(e: MouseEvent): void {
  if (shortcutsOpen.value && !(e.target as HTMLElement).closest('.shortcut-menu')) shortcutsOpen.value = false
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
</script>

<template>
  <div class="scroll-slim h-full space-y-6 overflow-auto pb-4 pr-1">
    <header class="flex items-center justify-between">
      <div class="text-sm text-neutral-500 dark:text-neutral-400">
        共 {{ appEntries.length }} 个应用 ·
        <span class="text-emerald-500">{{ runningCount }}</span>
        个运行中
      </div>
      <div class="flex items-center gap-2">
        <div class="flex rounded-lg border border-neutral-200 p-0.5 dark:border-neutral-700">
          <button
            class="icon-btn"
            :class="{ '!border-emerald-500 !text-emerald-600': settings.launchpadView === 'grid' }"
            title="宫格视图"
            @click="setLaunchpadView('grid')"
          >
            <LayoutGrid :size="14" />
          </button>
          <button
            class="icon-btn"
            :class="{ '!border-emerald-500 !text-emerald-600': settings.launchpadView === 'list' }"
            title="列表视图"
            @click="setLaunchpadView('list')"
          >
            <List :size="14" />
          </button>
        </div>
        <button class="btn-primary" @click="openAdd('service')"><Plus :size="14" /> 添加服务</button>
        <button class="btn-ghost" @click="openAdd('task')"><ListPlus :size="14" /> 添加任务</button>
        <div class="shortcut-menu relative">
          <button class="btn-ghost" @click="shortcutsOpen = !shortcutsOpen"><MoreHorizontal :size="14" /> 快捷操作</button>
          <div
            v-if="shortcutsOpen"
            class="absolute right-0 top-full z-20 mt-1 w-64 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            <button
              class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              @click="onStopAll"
            >
              ⏹ 停止全部运行中的应用
            </button>
            <button
              class="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
              @click="shortcutsOpen = false; openDashboardLogs()"
            >
              🖥️ 查看总控台日志
            </button>
          </div>
        </div>
      </div>
    </header>

    <AppSection kind="service" :view="settings.launchpadView" @add="openAdd" @diagnose="openDiagnostics" />
    <AppSection kind="task" :view="settings.launchpadView" @add="openAdd" @diagnose="openDiagnostics" />
  </div>
</template>
