<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ArrowDownToLine, Copy, Filter, Trash2 } from '@lucide/vue'
import { formatClock } from '../../lib/fmt'
import { appEntries } from '../../stores/apps'
import { clearLines, linesByApp } from '../../stores/logs'

const props = defineProps<{ appId: string }>()
const follow = ref(true)
const onlyErr = ref(false)
const scrollRef = ref<HTMLElement | null>(null)

const all = computed(() => linesByApp.get(props.appId) ?? [])
const visible = computed(() => (onlyErr.value ? all.value.filter((l) => l.stream !== 'out') : all.value))
const shown = computed(() => visible.value.slice(-600))

watch(shown, async () => {
  if (follow.value) await nextTick()
  if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
})

const meta = computed(() => appEntries.value.find((e) => e.id === props.appId))

async function onCopy(): Promise<void> {
  await navigator.clipboard.writeText(shown.value.map((l) => l.text).join('\n'))
}
</script>

<template>
  <div class="card flex min-h-0 flex-1 flex-col">
    <header class="flex h-10 shrink-0 items-center gap-2 border-b border-neutral-200 px-3 dark:border-neutral-800">
      <span class="truncate text-sm font-semibold">{{ meta?.name ?? (appId === 'dashboard' ? '总控台自身日志' : appId) }}</span>
      <span v-if="meta?.runtime.port" class="font-mono text-xs text-emerald-500">:{{ meta.runtime.port }}</span>
      <div class="flex-1" />
      <button class="icon-btn" :class="{ active: onlyErr }" title="仅错误" @click="onlyErr = !onlyErr"><Filter :size="14" /></button>
      <button class="icon-btn" :class="{ active: follow }" title="自动滚动" @click="follow = !follow"><ArrowDownToLine :size="14" /></button>
      <button class="icon-btn" title="清屏（仅当前视图）" @click="clearLines(appId)"><Trash2 :size="14" /></button>
      <button class="icon-btn" title="复制" @click="onCopy"><Copy :size="14" /></button>
    </header>
    <div ref="scrollRef" class="scroll-slim flex-1 overflow-auto bg-neutral-950 p-3 font-mono text-xs leading-5 dark:bg-black">
      <div v-for="(l, i) in shown" :key="i" class="whitespace-pre-wrap break-all">
        <span class="mr-2 select-none text-neutral-500">{{ formatClock(l.t) }}</span>
        <span :class="l.stream === 'err' ? 'text-red-400' : l.stream === 'sys' ? 'text-amber-400' : 'text-neutral-200 dark:text-neutral-300'">
          {{ l.text }}
        </span>
      </div>
      <div v-if="!shown.length" class="mt-8 text-center text-neutral-500">暂无日志</div>
    </div>
  </div>
</template>
