<script setup lang="ts">
import { computed, ref } from 'vue'
import { Power, Search } from '@lucide/vue'
import {
  agents,
  filteredAgents,
  groupByKind,
  groupedAgents,
  runningCount,
  searchText,
  sortKey,
  totalCpu,
  totalMemMB,
  type AgentSortKey
} from '../stores/agents'
import { monitorReady } from '../stores/monitor'
import { formatMem } from '../lib/fmt'
import AgentCard from '../components/AgentCard.vue'
import ViewLoading from '../components/ViewLoading.vue'

const expanded = ref<Set<string>>(new Set())

const sortOptions: Array<{ value: AgentSortKey; label: string }> = [
  { value: 'cpu', label: '按 CPU' },
  { value: 'mem', label: '按内存' },
  { value: 'taskCount', label: '按任务数' },
  { value: 'lastActive', label: '按最近活动' }
]

function toggle(id: string): void {
  const s = new Set(expanded.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expanded.value = s
}

const isGrouped = computed(() => groupByKind.value && Object.keys(groupedAgents.value).length > 1)
</script>

<template>
  <div class="h-full">
    <ViewLoading v-if="!monitorReady" label="正在检测本机运行中的 AI Agent…" />
    <div v-else class="scroll-slim h-full space-y-6 overflow-auto pb-4 pr-1">
      <!-- 顶部统计条 -->
      <header class="flex flex-wrap items-center gap-2">
        <span
          class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft"
        >
          共 <b class="text-ink dark:text-chalk">{{ agents.length }}</b> 个运行中
        </span>
        <span
          class="flex items-center gap-2 rounded-[6px] border border-go/30 bg-go/8 px-3 py-1.5 font-mono text-xs text-go dark:text-go-soft"
        >
          <span class="h-1.5 w-1.5 rounded-full bg-go pulse-dot" />
          <b>{{ runningCount }}</b> 活跃
        </span>
        <span
          class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft"
        >
          <b>CPU</b> {{ totalCpu }}%
        </span>
        <span
          class="flex items-center gap-2 rounded-[6px] border border-line bg-paper-raised px-3 py-1.5 font-mono text-xs text-ink-soft dark:border-coal-line dark:bg-coal-raised dark:text-chalk-soft"
        >
          <b>内存</b> {{ formatMem(totalMemMB) }}
        </span>
      </header>

      <!-- 排序 / 搜索 / 分组 -->
      <div class="flex flex-wrap items-center gap-2">
        <select
          v-model="sortKey"
          class="input !h-7 !w-auto !py-0 font-mono text-xs"
          title="排序方式"
        >
          <option v-for="opt in sortOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <label
          class="flex cursor-pointer items-center gap-1.5 font-mono text-xs text-ink-soft dark:text-chalk-soft"
        >
          <input v-model="groupByKind" type="checkbox" class="accent-signal" />
          按类型分组
        </label>
        <div class="relative min-w-0 flex-1">
          <Search
            :size="13"
            class="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft/50 dark:text-chalk-soft/50"
          />
          <input
            v-model="searchText"
            class="input h-7 w-full pl-8 font-mono text-xs"
            placeholder="搜索 agent 名称或类型"
          />
        </div>
      </div>

      <!-- Agent 卡片列表 -->
      <template v-if="filteredAgents.length">
        <template v-if="isGrouped">
          <section v-for="(group, kind) in groupedAgents" :key="kind" class="space-y-2">
            <h3
              class="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft dark:text-chalk-soft"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-signal" /> {{ kind }}
              <span class="text-ink-soft/50 dark:text-chalk-soft/50">{{ group.length }}</span>
            </h3>
            <div class="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
              <article
                v-for="row in group"
                :key="row.id"
                class="card relative flex flex-col overflow-hidden p-4"
              >
                <AgentCard :row="row" :expanded="expanded.has(row.id)" @toggle="toggle(row.id)" />
              </article>
            </div>
          </section>
        </template>
        <template v-else>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-3">
            <article
              v-for="row in filteredAgents"
              :key="row.id"
              class="card relative flex flex-col overflow-hidden p-4"
            >
              <AgentCard :row="row" :expanded="expanded.has(row.id)" @toggle="toggle(row.id)" />
            </article>
          </div>
        </template>
      </template>

      <!-- 空状态 -->
      <div v-else class="card grid place-items-center gap-3 border-dashed py-16 text-center">
        <div
          class="grid h-12 w-12 place-items-center rounded-full border border-line bg-paper text-ink-soft dark:border-coal-line dark:bg-black/25 dark:text-chalk-soft"
        >
          <Power :size="20" />
        </div>
        <div>
          <p class="font-mono text-sm font-semibold text-ink dark:text-chalk">
            {{ searchText ? '没有匹配的 agent' : '当前没有 AI agent 正在运行' }}
          </p>
          <p class="mt-1 font-mono text-xs text-ink-soft dark:text-chalk-soft">
            启动 Codex / OpenCode / Claude / Cursor / Windsurf 等 agent 后会自动出现在这里
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
