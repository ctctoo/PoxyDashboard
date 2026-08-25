<script setup lang="ts">
import { Search, FolderPlus, Pin, PinOff, Trash2, FolderOpen, Play, ExternalLink } from '@lucide/vue'
import { api } from '../lib/api'
import {
  workspacesReady,
  filtered,
  query,
  add,
  togglePin,
  remove,
  open,
  start
} from '../stores/workspaces'
import { confirmDialog } from '../stores/confirm'

async function onAddDir(): Promise<void> {
  const dir = await api.pickDirectory()
  if (!dir) return
  const ws = await add(dir)
  if (ws) void 0
}

async function onRemove(w: { id: string; name: string }): Promise<void> {
  const ok = await confirmDialog({
    title: `移除「${w.name}」工作区？`,
    body: '仅移除列表记录，不会删除项目文件。',
    danger: true,
    confirmText: '移除'
  })
  if (ok) remove(w.id)
}

function stackTags(w: { techStack?: string }): string[] {
  return (w.techStack ?? '').split(',').filter(Boolean)
}
</script>

<template>
  <div class="h-full">
    <div v-if="!workspacesReady" class="flex h-full items-center justify-center text-ink-soft dark:text-chalk-soft">
      正在加载工作区…
    </div>
    <div v-else class="scroll-slim flex h-full flex-col gap-4 overflow-auto pb-4 pr-1">
      <!-- 工具栏 -->
      <header class="flex flex-wrap items-center gap-3">
        <div class="relative flex-1 min-w-52">
          <Search :size="14" class="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft dark:text-chalk-soft" />
          <input v-model="query" class="input pl-9" placeholder="搜索工作区（名称 / 路径 / 技术栈）…" />
        </div>
        <span class="font-mono text-xs text-ink-soft dark:text-chalk-soft">共 {{ filtered.length }} 个</span>
        <button class="btn-primary" @click="onAddDir"><FolderPlus :size="14" /> 登记工作区</button>
      </header>

      <!-- 工作区列表 -->
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="w in filtered" :key="w.id" class="card flex flex-col p-4">
          <div class="mb-2 flex items-start gap-3">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-line bg-paper text-inspect dark:border-coal-line dark:bg-coal">
              <FolderOpen :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="truncate text-sm font-semibold">{{ w.name }}</span>
                <span v-if="w.pinned" class="chip !text-[10px] text-signal">已收藏</span>
              </div>
              <div class="truncate font-mono text-[11px] text-ink-soft dark:text-chalk-soft">{{ w.path }}</div>
            </div>
          </div>

          <div class="mb-3 flex flex-wrap items-center gap-1.5">
            <span v-if="w.type" class="chip">{{ w.type }}</span>
            <span v-for="t in stackTags(w)" :key="t" class="chip !text-go dark:!text-go-soft">{{ t }}</span>
            <span v-if="w.port" class="chip-port">:{{ w.port }}</span>
          </div>

          <div v-if="w.startCommand" class="mb-3 truncate rounded-md bg-paper px-2 py-1 font-mono text-[11px] text-ink-soft dark:bg-black/20 dark:text-chalk-soft">
            {{ w.startCommand }}
          </div>

          <div class="mt-auto flex items-center gap-1.5">
            <button class="btn-ghost btn-sm flex-1" @click="open(w.id)">
              <ExternalLink :size="12" /> 打开
            </button>
            <button
              v-if="w.startCommand"
              class="btn-primary btn-sm flex-1"
              @click="start(w.id)"
            >
              <Play :size="12" /> 启动
            </button>
            <button
              class="icon-btn"
              :class="{ active: w.pinned }"
              :title="w.pinned ? '取消收藏' : '收藏'"
              @click="togglePin(w.id, !w.pinned)"
            >
              <PinOff v-if="w.pinned" :size="14" />
              <Pin v-else :size="14" />
            </button>
            <button class="icon-btn text-alert hover:!text-alert" title="移除" @click="onRemove(w)">
              <Trash2 :size="14" />
            </button>
          </div>
        </div>

        <div v-if="!filtered.length" class="col-span-full rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-ink-soft dark:border-coal-line dark:text-chalk-soft">
          暂无工作区。点击「登记工作区」选择项目目录，自动识别技术栈与启动命令。
        </div>
      </div>
    </div>
  </div>
</template>
