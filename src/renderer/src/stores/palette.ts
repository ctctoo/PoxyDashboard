import { computed, ref } from 'vue'
import { fuzzyMatch } from '../lib/fuzzy'
import { appEntries, start, stop, restart, stopAll } from './apps'
import { openLogs } from './logs'
import { openDashboardLogs, setView, view } from './view'
import { settings, setNotify, cycleTheme } from './settings'
import { openAdd } from './ui'
import { confirmDialog } from './confirm'

export interface PaletteAction {
  id: string
  label: string
  hint?: string
  keywords?: string
  icon?: string
  run: () => void | Promise<void>
}

export const open = ref(false)
export const query = ref('')
export const selected = ref(0)
export const actions = ref<PaletteAction[]>([])

export const results = computed(() => {
  const q = query.value.trim()
  if (!q) return actions.value
  return actions.value
    .map((a) => ({ a, score: fuzzyMatch(q, `${a.label} ${a.hint ?? ''} ${a.keywords ?? ''}`) }))
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a)
})

export function togglePalette(): void {
  if (open.value) {
    open.value = false
    return
  }
  open.value = true
  query.value = ''
  selected.value = 0
  actions.value = buildActions()
}

export function closePalette(): void {
  open.value = false
}

export function runSelected(): void {
  const list = results.value
  const a = list[selected.value]
  if (!a) return
  closePalette()
  void a.run()
}

function buildActions(): PaletteAction[] {
  const acts: PaletteAction[] = [
    { id: 'add-service', label: '添加服务', hint: '长期运行 · 端口语义', keywords: 'service 添加服务 新服务', icon: '🚀', run: () => openAdd('service') },
    { id: 'add-task', label: '添加任务', hint: '批处理 · 有结束时间', keywords: 'task 添加任务 新任务 脚本', icon: '📋', run: () => openAdd('task') },
    { id: 'view-launchpad', label: '打开启动台', hint: view.value === 'launchpad' ? '当前' : undefined, keywords: '启动台 launchpad 服务 任务', icon: '🚀', run: () => setView('launchpad') },
    { id: 'view-monitor', label: '打开服务监控', hint: view.value === 'monitor' ? '当前' : undefined, keywords: '监控 monitor 进程 端口', icon: '📡', run: () => setView('monitor') },
    { id: 'view-logs', label: '打开日志中心', hint: view.value === 'logs' ? '当前' : undefined, keywords: '日志 logs', icon: '📜', run: () => setView('logs') },
    { id: 'view-settings', label: '打开设置中心', hint: view.value === 'settings' ? '当前' : undefined, keywords: '设置 settings', icon: '⚙️', run: () => setView('settings') },
    { id: 'dashboard-logs', label: '查看总控台自身日志', keywords: '总控台 日志 dashboard 自身', icon: '🖥️', run: openDashboardLogs }
  ]

  for (const e of appEntries.value) {
    const running = ['starting', 'running', 'stopping'].includes(e.runtime.status)
    acts.push({
      id: `start-${e.id}`,
      label: running ? `停止「${e.name}」` : `启动「${e.name}」`,
      hint: e.kind === 'service' ? '服务' : '任务',
      keywords: e.name,
      icon: running ? '⏹' : '▶️',
      run: () => void (running ? stop(e.id) : start(e.id))
    })
    acts.push({
      id: `restart-${e.id}`,
      label: `重启「${e.name}」`,
      hint: e.kind === 'service' ? '服务' : '任务',
      keywords: e.name,
      icon: '🔄',
      run: () => void restart(e.id)
    })
    acts.push({
      id: `logs-${e.id}`,
      label: `查看「${e.name}」日志`,
      keywords: `${e.name} 日志`,
      icon: '📜',
      run: () => {
        void openLogs(e.id)
        setView('logs')
      }
    })
  }

  acts.push({
    id: 'stop-all',
    label: '停止全部运行中的应用',
    keywords: 'stop all 停止 全部 批量',
    icon: '🛑',
    run: async () => {
      const ok = await confirmDialog({
        title: '停止全部运行中的应用？',
        body: '将逐个安全停止所有由总控台启动的应用（不按端口杀进程）。',
        danger: true,
        confirmText: '全部停止'
      })
      if (ok) await stopAll()
    }
  })

  acts.push({
    id: 'toggle-notify',
    label: settings.notifyTaskComplete ? '关闭任务完成通知' : '开启任务完成通知',
    hint: settings.notifyTaskComplete ? '当前开启' : '当前关闭',
    keywords: '通知 notify 任务完成',
    icon: '🔔',
    run: () => setNotify(!settings.notifyTaskComplete)
  })
  acts.push({
    id: 'cycle-theme',
    label: '切换外观（自动 / 浅色 / 深色）',
    hint: `当前 ${settings.theme}`,
    keywords: '主题 theme 外观 深色 浅色',
    icon: '🎨',
    run: cycleTheme
  })

  return acts
}
