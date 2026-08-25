<script setup lang="ts">
import { ref } from 'vue'
import { Search, RefreshCw, Plus, Pin, PinOff, Trash2, Play, FolderOpen } from '@lucide/vue'
import {
  appsReady,
  filtered,
  query,
  syncDiscovered,
  togglePin,
  remove,
  launch,
  setCategory
} from '../stores/apps2'
import { confirmDialog } from '../stores/confirm'
import { pickExecutable } from '../lib/pick'

const adding = ref(false)
const syncing = ref(false)
const categories = ['浏览器', '开发', '工具', '办公', '通讯', '娱乐', '其他']

async function onSync(): Promise<void> {
  syncing.value = true
  try {
    await syncDiscovered()
  } finally {
    syncing.value = false
  }
}

async function onManualAdd(): Promise<void> {
  const path = await pickExecutable()
  if (!path) return
  await syncDiscovered()
  void path
}

async function onRemove(a: { id: string; name: string }): Promise<void> {
  const ok = await confirmDialog({
    title: `删除「${a.name}」记录？`,
    body: '仅删除应用列表中的记录，不会卸载或删除该应用。',
    danger: true,
    confirmText: '删除记录'
  })
  if (ok) remove(a.id)
}

async function onCategory(a: { id: string }, cat: string): Promise<void> {
  setCategory(a.id, cat)
}
</script>

<template>
  <div class="h-full">
    <div v-if="!appsReady" class="flex h-full items-center justify-center text-ink-soft dark:text-chalk-soft">
      正在加载应用索引…
    </div>
    <div v-else class="scroll-slim flex h-full flex-col gap-4 overflow-auto pb-4 pr-1">
      <!-- 工具栏 -->
      <header class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-52">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft dark:text-chalk-soft" />
          <input
            v-model="query"
            class="input pl-9"
            placeholder="搜索应用…"
          />
        </div>
        <span class="font-mono text-xs text-ink-soft dark:text-chalk-soft">共 {{ filtered.length }} 个</span>
        <button class="btn-ghost" :disabled="syncing" @click="onSync">
          <RefreshCw :size="14" :class="syncing && 'animate-spin'" /> 同步发现
        </button>
        <button class="btn-primary" @click="adding = true"><Plus :size="14" /> 手动添加</button>
      </header>

      <!-- 手动添加弹层 -->
      <div v-if="adding" class="card p-4">
        <form class="flex flex-wrap items-end gap-3" @submit.prevent="adding = false">
          <div class="flex-1 min-w-40">
            <label class="panel-label block pb-1">选择可执行文件</label>
            <button type="button" class="btn-ghost w-full justify-between" @click="onManualAdd">
              <span class="truncate">选择 .exe / .cmd / .bat…</span>
              <FolderOpen :size="14" />
            </button>
          </div>
          <button type="button" class="btn-ghost" @click="adding = false">关闭</button>
        </form>
        <p class="mt-2 font-mono text-[11px] text-ink-soft dark:text-chalk-soft">
          提示：同步发现会自动扫描 Start Menu / 注册表 / Program Files / AppData。手动添加请先点击上方选择文件。
        </p>
      </div>

      <!-- 应用列表 -->
      <div class="card overflow-hidden">
        <ul class="divide-y divide-line dark:divide-coal-line">
          <li
            v-for="a in filtered"
            :key="a.id"
            class="flex items-center gap-3 px-4 py-2.5 hover:bg-ink/5 dark:hover:bg-white/5"
          >
            <span class="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line bg-paper text-base dark:border-coal-line dark:bg-coal">
              {{ a.icon ?? '🖥️' }}
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-medium">{{ a.name }}</span>
                <span v-if="a.pinned" class="chip !text-[10px] text-signal">已收藏</span>
              </div>
              <div class="truncate font-mono text-[11px] text-ink-soft dark:text-chalk-soft">{{ a.path }}</div>
            </div>
            <!-- 分类 -->
            <select
              class="hidden w-28 rounded-md border border-line bg-paper px-1 py-1 font-mono text-[11px] text-ink-soft outline-none sm:block dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft"
              :value="a.category ?? ''"
              @change="onCategory(a, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">分类…</option>
              <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
            </select>
            <span v-if="a.category" class="chip sm:hidden">{{ a.category }}</span>
            <!-- 操作 -->
            <div class="flex items-center gap-1">
              <button class="icon-btn" title="启动" @click="launch(a.id)"><Play :size="14" /></button>
              <button
                class="icon-btn"
                :class="{ active: a.pinned }"
                :title="a.pinned ? '取消收藏' : '收藏'"
                @click="togglePin(a.id, !a.pinned)"
              >
                <PinOff v-if="a.pinned" :size="14" />
                <Pin v-else :size="14" />
              </button>
              <button class="icon-btn text-alert hover:!text-alert" title="删除记录" @click="onRemove(a)">
                <Trash2 :size="14" />
              </button>
            </div>
          </li>
          <li v-if="!filtered.length" class="px-4 py-10 text-center text-sm text-ink-soft dark:text-chalk-soft">
            未找到应用。点击「同步发现」扫描本机应用，或「手动添加」登记。
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>
