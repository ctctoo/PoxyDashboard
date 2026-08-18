import type { AgentRow, AgentTaskProcess } from '../shared/types'
import { classifyOrigin } from './portScanner'
import type { ScanData } from './portScanner'
import type { InstalledAgent } from './agentDetect'

const SYSTEM_NOISE = new Set([
  'system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'fontdrvhost.exe',
  'dwm.exe',
  'dllhost.exe',
  'conhost.exe',
  'sihost.exe',
  'taskhostw.exe',
  'runtimebroker.exe',
  'svchost.exe',
  'spoolsv.exe',
  'audiodg.exe',
  'msmpeng.exe',
  'nissrv.exe',
  'securityhealthservice.exe',
  'searchindexer.exe',
  'shellexperiencehost.exe',
  'startmenuexperiencehost.exe',
  'explorer.exe'
])

const AGENT_ICON: Record<string, string> = {
  codex: '🤖',
  cursor: '🧭',
  claude: '🧠',
  kimi: '🗿',
  chatgpt: '💬',
  gemini: '✨',
  windsurf: '🏄',
  cline: '🩺',
  opencode: '🔧'
}

/**
 * 可管理的 AI agent 工具集合（按 friendlyLabel 判定）。
 * 覆盖 CLI 型（codex/claude/kimi/chatgpt/gemini/opencode）与 AI 优先编辑器（cursor/windsurf/cline）。
 * 与 portScanner 的 AI_NAMES / AI_CMDS / EDITOR_NAMES 保持语义一致。
 */
const AI_AGENT_LABELS = new Set([
  'Codex',
  'Claude',
  'Kimi',
  'ChatGPT',
  'Gemini',
  'Windsurf',
  'Cline',
  'Cursor',
  'OpenCode',
  'AI 助手'
])

/** 去掉 .exe 后缀并小写，用于同名判定 */
function nameBase(name: string): string {
  return name.replace(/\.exe$/i, '').toLowerCase()
}

/**
 * 聚合本机的 AI agent。
 *
 * 复用 classifyOrigin 识别 origin.kind==='ai' 的进程；
 * 沿父链找到每个 agent 的根进程，收集其进程树作为派生任务，
 * 汇总整树资源，输出 AgentRow[]。
 *
 * @param data      本轮扫描数据
 * @param ownTree   总控台自身进程集合（跳过）
 * @param cpuByPid  各进程 CPU 百分比（monitor 已差分计算）
 * @param children  进程树 children 映射（buildChildrenMap 产物）
 */
export function aggregateAgents(
  data: ScanData,
  ownTree: Set<number>,
  cpuByPid: Map<number, number>,
  children: Map<number, number[]>
): AgentRow[] {
  // 1) 找出所有归属某个可管理 AI agent 的进程（按 friendlyLabel 判定）
  const aiPids = new Set<number>()
  const labelByPid = new Map<number, string>()
  for (const pid of data.procs.keys()) {
    if (ownTree.has(pid)) continue
    const origin = classifyOrigin(pid, data.procs, ownTree)
    if (origin?.kind === 'ai' || (origin && AI_AGENT_LABELS.has(origin.label))) {
      aiPids.add(pid)
      labelByPid.set(pid, origin.label)
    }
  }
  if (!aiPids.size) return []

  // 2) 确定每个 ai 进程归属的 agent 根（沿父链向上的第一个 ai 进程）
  const rootOf = new Map<number, number>()
  for (const pid of aiPids) {
    let cur = pid
    let root = pid
    let guard = 0
    while (guard++ < 12) {
      const p = data.procs.get(cur)
      if (!p) break
      const parent = p.ppid
      if (aiPids.has(parent)) {
        root = parent
        cur = parent
      } else {
        break
      }
    }
    rootOf.set(pid, root)
  }

  // 3) 按根进程分组
  const groups = new Map<number, number[]>()
  for (const [pid, root] of rootOf) {
    const list = groups.get(root) ?? []
    list.push(pid)
    groups.set(root, list)
  }

  const rows: AgentRow[] = []
  for (const root of groups.keys()) {
    const rootProc = data.procs.get(root)
    if (!rootProc) continue
    const perf = data.perf.get(root)
    const rootLabel = labelByPid.get(root) ?? 'AI 助手'
    const kind = rootLabel === 'AI 助手' ? 'ai' : rootLabel.toLowerCase()
    const rootName = nameBase(rootProc.name)

    // 任务进程：树内除根外，名称不同于根 exe 且非系统噪音的进程
    const tasks: AgentTaskProcess[] = []
    const treePids = descendants(root, children).filter((pid) => pid !== root)
    for (const pid of treePids) {
      const p = data.procs.get(pid)
      if (!p) continue
      if (SYSTEM_NOISE.has(p.name.toLowerCase())) continue
      if (nameBase(p.name) === rootName) continue // 同名 = GUI 内部辅助进程，噪音
      const pPerf = data.perf.get(pid)
      const ports = collectPorts(pid, data)
      tasks.push({
        pid,
        name: p.name,
        cmdline: p.cmd ?? '',
        cpu: cpuByPid.get(pid) ?? 0,
        memMB: pPerf ? Math.round((pPerf.mem / 1048576) * 10) / 10 : 0,
        ports,
        createdAt: p.created || Date.now()
      })
    }

    let cpu = cpuByPid.get(root) ?? 0
    let memMB = perf ? Math.round((perf.mem / 1048576) * 10) / 10 : 0
    for (const pid of treePids) {
      cpu += cpuByPid.get(pid) ?? 0
      memMB += data.perf.get(pid) ? Math.round((data.perf.get(pid)!.mem / 1048576) * 10) / 10 : 0
    }
    cpu = Math.round(cpu * 10) / 10

    const ports = collectPorts(root, data)
    for (const pid of treePids) {
      for (const port of collectPorts(pid, data)) {
        if (!ports.includes(port)) ports.push(port)
      }
    }

    const status = tasks.length > 0 || ports.length > 0 ? 'running' : 'idle'
    rows.push({
      id: `${kind}:${root}`,
      kind,
      label: rootLabel,
      icon: AGENT_ICON[kind] ?? '🤖',
      status,
      pid: root,
      createdAt: rootProc.created || Date.now(),
      cpu,
      memMB,
      ports: ports.sort((a, b) => a - b),
      taskCount: tasks.length,
      tasks: tasks.sort((a, b) => b.cpu - a.cpu)
    })
  }

  rows.sort((a, b) => {
    const sa = a.status === 'running' ? 0 : 1
    const sb = b.status === 'running' ? 0 : 1
    return sa - sb || b.cpu - a.cpu
  })
  return rows
}

function collectPorts(pid: number, data: ScanData): number[] {
  const out: number[] = []
  for (const c of data.conns) {
    if (c.pid === pid) out.push(c.port)
  }
  return out
}

/** 将已安装但未运行的 agent 合并进运行中聚合结果 */
export function mergeInstalledAgents(running: AgentRow[], installed: InstalledAgent[]): AgentRow[] {
  const runningKinds = new Set(running.map((r) => r.kind))
  const rows = [...running]
  for (const inst of installed) {
    if (runningKinds.has(inst.kind)) continue
    rows.push({
      id: `installed:${inst.kind}`,
      kind: inst.kind,
      label: inst.label,
      icon: AGENT_ICON[inst.kind] ?? '🤖',
      status: 'not-running',
      cpu: 0,
      memMB: 0,
      ports: [],
      taskCount: 0,
      tasks: []
    })
  }
  const order = (s: AgentRow['status']): number => (s === 'running' ? 0 : s === 'idle' ? 1 : 2)
  rows.sort((a, b) => order(a.status) - order(b.status) || b.cpu - a.cpu)
  return rows
}

function descendants(root: number, children: Map<number, number[]>): number[] {
  const out: number[] = []
  const stack = [root]
  const seen = new Set<number>()
  while (stack.length) {
    const cur = stack.pop() as number
    if (seen.has(cur)) continue
    seen.add(cur)
    out.push(cur)
    for (const c of children.get(cur) ?? []) stack.push(c)
  }
  return out
}
