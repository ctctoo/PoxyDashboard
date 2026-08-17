<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import draggable from 'vuedraggable'
import { Plus } from '@lucide/vue'
import type { AppEntry, AppKind } from '@shared/types'
import { appEntries, reorder } from '../../stores/apps'
import AppCard from './AppCard.vue'

const props = defineProps<{ kind: AppKind }>()
const emit = defineEmits<{ add: [kind: AppKind]; diagnose: [id: string] }>()

type Filter = 'all' | 'running' | 'stopped' | 'error' | 'success' | 'failed' | 'cancelled'

const filter = ref<Filter>('all')

const filterOptions = computed(() =>
  props.kind === 'service'
    ? [
        { v: 'all' as Filter, l: '全部' },
        { v: 'running' as Filter, l: '运行中' },
        { v: 'stopped' as Filter, l: '已停止' },
        { v: 'error' as Filter, l: '异常' }
      ]
    : [
        { v: 'all' as Filter, l: '全部' },
        { v: 'running' as Filter, l: '运行中' },
        { v: 'success' as Filter, l: '成功' },
        { v: 'failed' as Filter, l: '失败' },
        { v: 'cancelled' as Filter, l: '已取消' }
      ]
)

const sectionEntries = computed(() => appEntries.value.filter((e) => e.kind === props.kind))

const visible = computed(() => sectionEntries.value.filter((e) => matches(e, filter.value)))

const dragList = ref<AppEntry[]>([])
watch(visible, (v) => {
  dragList.value = [...v]
})

const sort = ref({ active: false, ids: [] as string[], cursor: 0 })

function matches(e: AppEntry, f: Filter): boolean {
  if (f === 'all') return true
  if (f === 'running') return ['starting', 'running', 'stopping'].includes(e.runtime.status)
  if (f === 'stopped') return e.runtime.status === 'stopped'
  if (f === 'error') return e.runtime.status === 'error'
  if (f === 'success') return e.runtime.status === 'success'
  if (f === 'failed') return ['failed', 'error'].includes(e.runtime.status)
  if (f === 'cancelled') return ['cancelled', 'aborted'].includes(e.runtime.status)
  return true
}

function moveInKind(from: number, to: number): void {
  const all = [...appEntries.value]
  const kindItems = all.filter((e) => e.kind === props.kind)
  if (from < 0 || from >= kindItems.length) return
  const [moved] = kindItems.splice(from, 1)
  kindItems.splice(Math.max(0, Math.min(to, kindItems.length)), 0, moved)
  let ki = 0
  const rebuilt = all.map((e) => (e.kind === props.kind ? kindItems[ki++] : e))
  void reorder(rebuilt.map((e) => e.id))
}

function onDragEnd(evt: { oldIndex: number; newIndex: number }): void {
  if (evt.oldIndex === evt.newIndex) return
  const fromId = dragList.value[evt.oldIndex]?.id
  const toId = dragList.value[evt.newIndex]?.id
  const full = sectionEntries.value
  const from = full.findIndex((e) => e.id === fromId)
  const to = toId ? full.findIndex((e) => e.id === toId) : full.length - 1
  moveInKind(from, to)
  dragList.value = [...visible.value]
}

function onItemKeydown(e: KeyboardEvent, idx: number): void {
  if (e.key === ' ') {
    e.preventDefault()
    if (!sort.value.active) {
      sort.value = { active: true, ids: visible.value.map((x) => x.id), cursor: idx }
    } else {
      persistSort()
    }
    return
  }
  if (!sort.value.active) return
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault()
    moveCursor(-1)
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault()
    moveCursor(1)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    sort.value.active = false
  }
}

function moveCursor(d: number): void {
  const next = sort.value.cursor + d
  if (next < 0 || next >= sort.value.ids.length) return
  const ids = [...sort.value.ids]
  const [m] = ids.splice(sort.value.cursor, 1)
  ids.splice(next, 0, m)
  sort.value.ids = ids
  sort.value.cursor = next
}

function persistSort(): void {
  const all = [...appEntries.value]
  const ordered = [...sort.value.ids]
  const byId = new Map(all.map((e) => [e.id, e]))
  const kindPositions = all.map((e, i) => (e.kind === props.kind ? i : -1)).filter((i) => i >= 0)
  const rebuilt = all.filter((e) => e.kind !== props.kind)
  let inserted = 0
  for (const pos of kindPositions) {
    const item = byId.get(ordered[inserted])
    if (item) rebuilt.splice(pos, 0, item)
    inserted++
  }
  void reorder(rebuilt.map((e) => e.id))
  sort.value.active = false
}

function sortedList(): AppEntry[] {
  if (sort.value.active) {
    const byId = new Map(visible.value.map((e) => [e.id, e]))
    return sort.value.ids.map((id) => byId.get(id)).filter((e): e is AppEntry => !!e)
  }
  return dragList.value
}
</script>

<template>
  <section>
    <div class="mb-2 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <h2 class="text-sm font-bold">{{ kind === 'service' ? '服务' : '任务' }}</h2>
        <span class="text-xs text-neutral-400">{{ sectionEntries.length }}</span>
        <span v-if="sort.active" class="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
          排序中：方向键移动 · 空格确认 · Esc 取消
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          v-for="o in filterOptions"
          :key="o.v"
          class="rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
          :class="filter === o.v ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900' : 'text-neutral-500 hover:bg-neutral-200/70 dark:hover:bg-neutral-800'"
          @click="filter = o.v"
        >
          {{ o.l }}
        </button>
      </div>
    </div>

    <div class="space-y-2">
      <draggable
        v-if="!sort.active"
        v-model="dragList"
        item-key="id"
        handle=".drag-handle"
        :animation="150"
        class="space-y-2"
        @end="onDragEnd"
      >
        <template #item="{ element, index }">
          <div
            tabindex="0"
            class="rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-emerald-400"
            @keydown="onItemKeydown($event, index)"
          >
            <AppCard :entry="element" @diagnose="(id: string) => emit('diagnose', id)" />
          </div>
        </template>
      </draggable>

      <template v-else>
        <div
          v-for="(e, i) in sortedList()"
          :key="e.id"
          tabindex="0"
          class="rounded-xl outline-2 outline-emerald-400"
          :class="i === sort.cursor ? 'outline' : 'opacity-70'"
          @keydown="onItemKeydown($event, i)"
        >
          <AppCard :entry="e" @diagnose="(id: string) => emit('diagnose', id)" />
        </div>
      </template>

      <button
        v-if="!visible.length"
        class="card flex w-full items-center justify-center gap-2 border-dashed py-8 text-sm text-neutral-400 transition-colors hover:text-emerald-500 hover:border-emerald-300 dark:hover:border-emerald-500/40"
        @click="emit('add', kind)"
      >
        <Plus :size="16" />
        {{ kind === 'service' ? '+ 添加服务' : '+ 添加任务' }}
      </button>
    </div>
  </section>
</template>
