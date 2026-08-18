<script setup lang="ts">
import { FolderOpen } from '@lucide/vue'
import { api } from '../lib/api'
import { appInfo, setNotify, setTheme, settings } from '../stores/settings'

const themeOptions = [
  { v: 'auto' as const, l: '自动' },
  { v: 'light' as const, l: '浅色' },
  { v: 'dark' as const, l: '深色' }
]
</script>

<template>
  <div class="scroll-slim h-full max-w-2xl space-y-6 overflow-auto pb-4 pr-1">
    <section class="card p-5">
      <div class="mb-4 flex items-center gap-2">
        <span class="h-3.5 w-1 rounded-sm bg-signal" />
        <h3 class="font-mono text-[13px] font-bold uppercase tracking-[0.1em]">通用</h3>
      </div>
      <div class="flex items-center justify-between py-2.5">
        <div>
          <div class="text-sm font-medium">任务完成通知</div>
          <div class="text-xs text-ink-soft dark:text-chalk-soft">任务自然结束时发送系统通知，切走页面也能收到</div>
        </div>
        <button
          class="relative h-6 w-11 rounded-full transition-colors"
          :class="settings.notifyTaskComplete ? 'bg-go' : 'bg-ink/15 dark:bg-white/15'"
          @click="setNotify(!settings.notifyTaskComplete)"
        >
          <span
            class="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
            :class="settings.notifyTaskComplete ? 'left-[22px]' : 'left-0.5'"
          />
        </button>
      </div>
      <div class="flex items-center justify-between border-t border-line py-2.5 dark:border-coal-line">
        <div>
          <div class="text-sm font-medium">外观</div>
          <div class="text-xs text-ink-soft dark:text-chalk-soft">自动跟随系统外观</div>
        </div>
        <div class="flex rounded-lg border border-line p-0.5 dark:border-coal-line">
          <button
            v-for="o in themeOptions"
            :key="o.v"
            class="rounded-md px-3 py-1 font-mono text-sm transition-colors"
            :class="settings.theme === o.v ? 'bg-ink text-paper dark:bg-chalk dark:text-coal' : 'text-ink-soft hover:bg-ink/5 dark:text-chalk-soft dark:hover:bg-white/10'"
            @click="setTheme(o.v)"
          >
            {{ o.l }}
          </button>
        </div>
      </div>
    </section>

    <section class="card p-5">
      <div class="mb-4 flex items-center gap-2">
        <span class="h-3.5 w-1 rounded-sm bg-inspect" />
        <h3 class="font-mono text-[13px] font-bold uppercase tracking-[0.1em]">关于</h3>
      </div>
      <dl class="space-y-2.5 text-sm">
        <div class="flex items-center justify-between">
          <dt class="font-mono text-xs text-ink-soft dark:text-chalk-soft">版本</dt>
          <dd class="font-mono tabular-nums">v{{ appInfo?.version ?? '—' }}</dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="font-mono text-xs text-ink-soft dark:text-chalk-soft">本地端口</dt>
          <dd class="font-mono tabular-nums">{{ appInfo?.port ?? '—' }}</dd>
        </div>
        <div class="flex items-center justify-between gap-4">
          <dt class="shrink-0 font-mono text-xs text-ink-soft dark:text-chalk-soft">工作目录</dt>
          <dd class="flex min-w-0 items-center gap-2">
            <span class="min-w-0 truncate font-mono text-xs" :title="appInfo?.cwd">{{ appInfo?.cwd }}</span>
            <button class="icon-btn !h-6 !w-6" title="打开工作目录" @click="appInfo && api.openPath(appInfo.cwd)">
              <FolderOpen :size="13" />
            </button>
          </dd>
        </div>
        <div class="flex items-center justify-between gap-4">
          <dt class="shrink-0 font-mono text-xs text-ink-soft dark:text-chalk-soft">数据目录</dt>
          <dd class="flex min-w-0 items-center gap-2">
            <span class="min-w-0 truncate font-mono text-xs" :title="appInfo?.dataDir">{{ appInfo?.dataDir }}</span>
            <button class="icon-btn !h-6 !w-6" title="打开数据目录" @click="appInfo && api.openPath(appInfo.dataDir)">
              <FolderOpen :size="13" />
            </button>
          </dd>
        </div>
        <div class="flex items-center justify-between">
          <dt class="font-mono text-xs text-ink-soft dark:text-chalk-soft">运行环境</dt>
          <dd class="font-mono text-xs tabular-nums">Electron {{ appInfo?.electron }} · Node {{ appInfo?.node }} · {{ appInfo?.platform }}</dd>
        </div>
      </dl>
    </section>
  </div>
</template>
