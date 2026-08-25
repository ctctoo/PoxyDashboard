import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ProcessOrigin, ProcessOriginKind } from '../shared/types'

const execFileAsync = promisify(execFile)

export interface RawConn {
  addr: string
  port: number
  pid: number
}

export interface RawProc {
  pid: number
  ppid: number
  name: string
  cmd: string | null
  created: number
}

export interface RawPerf {
  pid: number
  cpu: number
  mem: number
  path: string | null
}

export interface ScanData {
  ts: number
  conns: RawConn[]
  procs: Map<number, RawProc>
  perf: Map<number, RawPerf>
  os?: { totalMemKB: number; freeMemKB: number }
  cpuPct?: number
}

const PS_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$ProgressPreference = 'SilentlyContinue'

# 并行执行三路采集，避免串行拖慢；每路内部容错，任何单点失败都不阻塞整体
# 注：Job 是独立会话，需在其内部也抑制进度输出，避免 CLIXML 污染主进程 stdout
$jobConns = Start-Job { $ProgressPreference='SilentlyContinue'; Get-NetTCPConnection -State Listen | Select-Object -Property LocalAddress,LocalPort,OwningProcess }
$jobProcs = Start-Job { $ProgressPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Select-Object -Property ProcessId,ParentProcessId,Name,CommandLine,CreationDate }
$jobPerf  = Start-Job { $ProgressPreference='SilentlyContinue'; Get-Process -ErrorAction SilentlyContinue | Select-Object -Property Id,CPU,WorkingSet64,Path }
$jobOs    = Start-Job { $ProgressPreference='SilentlyContinue'; Get-CimInstance Win32_OperatingSystem | Select-Object -Property TotalVisibleMemorySize,FreePhysicalMemory }
$jobCpu   = Start-Job { $ProgressPreference='SilentlyContinue'; Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" | Select-Object -Property PercentProcessorTime }

# 等待全部完成（上限 12s），超时的 Job 强制回收，避免扫描挂死
$timeout = 12
$deadline = (Get-Date).AddSeconds($timeout)
while (@($jobConns,$jobProcs,$jobPerf,$jobOs,$jobCpu | Where-Object { $_.State -in 'NotStarted','Running' }).Count -gt 0 -and (Get-Date) -lt $deadline) {
  Start-Sleep -Milliseconds 200
}
$jobConns,$jobProcs,$jobPerf,$jobOs,$jobCpu | ForEach-Object {
  if ($_.State -ne 'Completed') { Stop-Job $_ -ErrorAction SilentlyContinue }
}

$conns = @(Receive-Job $jobConns | ForEach-Object {
  [ordered]@{ addr = [string]$_.LocalAddress; port = [int]$_.LocalPort; pid = [int]$_.OwningProcess }
})
$procs = @(Receive-Job $jobProcs | ForEach-Object {
  $c = $null
  try { $c = [DateTimeOffset]$_.CreationDate } catch { $c = $null }
  [ordered]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name; cmd = $_.CommandLine; created = $c }
})
$perf = @(Receive-Job $jobPerf | ForEach-Object {
  [ordered]@{ pid = [int]$_.Id; cpu = [double]$_.CPU; mem = [long]$_.WorkingSet64; path = $_.Path }
})
$os = Receive-Job $jobOs | Select-Object -First 1
$osInfo = $null
if ($os) {
  $osInfo = [ordered]@{ totalMemKB = [double]$os.TotalVisibleMemorySize; freeMemKB = [double]$os.FreePhysicalMemory }
}
$cpuRow = Receive-Job $jobCpu | Select-Object -First 1
$cpuPct = $null
if ($cpuRow) { try { $cpuPct = [double]$cpuRow.PercentProcessorTime } catch { $cpuPct = $null } }

$jobConns,$jobProcs,$jobPerf,$jobOs,$jobCpu | Remove-Job -Force -ErrorAction SilentlyContinue

[ordered]@{ ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); conns = $conns; procs = $procs; perf = $perf; os = $osInfo; cpuPct = $cpuPct } | ConvertTo-Json -Depth 5 -Compress
`

export async function scanPorts(): Promise<ScanData> {
  if (process.platform !== 'win32') {
    return { ts: Date.now(), conns: [], procs: new Map(), perf: new Map() }
  }
  const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64')
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 35000 }
  )
  return parseScan(stdout)
}

export function parseScan(stdout: string): ScanData {
  const raw = JSON.parse(stdout) as {
    ts: number
    conns: Array<{ addr: string; port: number; pid: number }>
    procs: Array<{
      pid: number
      ppid: number
      name: string
      cmd: string | null
      created: string | null
    }>
    perf: Array<{ pid: number; cpu: number; mem: number; path: string | null }>
    os: { totalMemKB: number; freeMemKB: number } | null
    cpuPct: number | null
  }
  const procs = new Map<number, RawProc>()
  for (const p of raw.procs ?? []) {
    procs.set(p.pid, {
      pid: p.pid,
      ppid: p.ppid,
      name: p.name ?? '',
      cmd: p.cmd,
      created: toEpoch(p.created)
    })
  }
  const perf = new Map<number, RawPerf>()
  for (const p of raw.perf ?? []) {
    perf.set(p.pid, { pid: p.pid, cpu: p.cpu ?? 0, mem: p.mem ?? 0, path: p.path })
  }
  return {
    ts: raw.ts ?? Date.now(),
    conns: raw.conns ?? [],
    procs,
    perf,
    os:
      raw.os && typeof raw.os.totalMemKB === 'number' && typeof raw.os.freeMemKB === 'number'
        ? raw.os
        : undefined,
    cpuPct: typeof raw.cpuPct === 'number' ? raw.cpuPct : undefined
  }
}

function toEpoch(v: string | null): number {
  if (!v) return Date.now()
  const m = /\/Date\((\d+)\)\//.exec(v)
  if (m) return Number(m[1])
  const t = Date.parse(v)
  return Number.isNaN(t) ? Date.now() : t
}

const AI_NAMES = new Set([
  'codex.exe',
  'claude.exe',
  'claude-code.exe',
  'kimi.exe',
  'chatgpt.exe',
  'gemini.exe',
  'windsurf.exe',
  'cline.exe',
  'opencode.exe',
  // 桌面 App 型 AI agent（Cursor 等 AI 原生编辑器也归为 agent）
  'cursor.exe',
  'cursor-agent.exe'
])
/** CLI 命令名：仅当作为可执行名/命令首 token 出现时才判定为 AI，避免误匹配任意含该子串的进程 */
const AI_CMDS = [
  'codex',
  'claude',
  'kimi',
  'chatgpt',
  'gemini',
  'windsurf',
  'cline',
  'copilot',
  'opencode'
]

/** 已知的非 agent 应用（浏览器等）：即使命令行含 AI 关键词也绝不判为 ai */
const NON_AGENT_NAMES = new Set([
  'msedge.exe',
  'chrome.exe',
  'chromium.exe',
  'brave.exe',
  'opera.exe',
  'firefox.exe',
  'iexplore.exe',
  '360se.exe',
  '360chrome.exe',
  'qqbrowser.exe'
])
const EDITOR_NAMES = new Set([
  'code.exe',
  'vscodium.exe',
  'zed.exe',
  'sublime_text.exe',
  'atom.exe',
  'webstorm64.exe',
  'pycharm64.exe',
  'idea64.exe',
  'goland64.exe',
  'rider64.exe',
  'notepad++.exe'
])
const TERMINAL_NAMES = new Set([
  'windowsterminal.exe',
  'wt.exe',
  'conhost.exe',
  'cmd.exe',
  'powershell.exe',
  'pwsh.exe',
  'bash.exe',
  'zsh.exe',
  'fish.exe',
  'mintty.exe',
  'alacritty.exe',
  'wezterm-gui.exe',
  'tabby.exe',
  'hyper.exe',
  'windowsconsolehost.exe'
])
const SYSTEM_NAMES = new Set([
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

/** 判断命令行中是否以命令名/首 token 形式出现某个 AI CLI（边界感知，避免子串误判） */
function aiCommandIn(cmd: string): string | undefined {
  // 取命令行中每个"可执行单元"（去引号），匹配首个 AI 命令名
  const tokens = cmd.match(/(?:^|[\s\\/])([a-zA-Z0-9_.-]+)(?:\.exe)?(?:\s|$)/g) ?? []
  for (const t of tokens) {
    const clean = t.replace(/^[\s\\/]+|[\s.]*$/g, '').toLowerCase()
    for (const k of AI_CMDS) {
      if (clean === k) return k
    }
  }
  return undefined
}

function friendlyLabel(name: string, cmd: string): string {
  const n = name.toLowerCase()
  const aiCmd = aiCommandIn(cmd)
  if (AI_NAMES.has(n) || aiCmd) {
    const key = (AI_NAMES.has(n) ? n.replace(/\.exe$/, '') : aiCmd) as string
    const LABELS: Record<string, string> = {
      codex: 'Codex',
      claude: 'Claude',
      'claude-code': 'Claude',
      kimi: 'Kimi',
      chatgpt: 'ChatGPT',
      gemini: 'Gemini',
      windsurf: 'Windsurf',
      cline: 'Cline',
      opencode: 'OpenCode',
      copilot: 'Copilot',
      cursor: 'Cursor',
      'cursor-agent': 'Cursor'
    }
    return LABELS[key] ?? 'AI 助手'
  }
  if (n === 'code.exe') return 'VS Code'
  if (n === 'cursor.exe') return 'Cursor'
  if (n === 'vscodium.exe') return 'VSCodium'
  if (n === 'zed.exe') return 'Zed'
  if (n === 'sublime_text.exe') return 'Sublime'
  if (n === 'windowsterminal.exe' || n === 'wt.exe' || n === 'conhost.exe') return '终端'
  if (n === 'cmd.exe') return '终端'
  if (n === 'powershell.exe' || n === 'pwsh.exe') return 'PowerShell'
  if (n === 'bash.exe' || n === 'zsh.exe' || n === 'fish.exe' || n === 'mintty.exe') return '终端'
  if (n === 'explorer.exe' || n === 'svchost.exe' || n === 'dwm.exe' || n === 'services.exe')
    return '系统'
  return n.replace(/\.exe$/, '')
}

export function classifyOrigin(
  pid: number,
  procs: Map<number, RawProc>,
  ownPids: Set<number>
): ProcessOrigin | undefined {
  const matches: Array<{ kind: ProcessOriginKind; label: string }> = []
  const seen = new Set<number>()
  let cur = pid
  for (let i = 0; i < 12; i++) {
    if (!cur || seen.has(cur)) break
    seen.add(cur)
    if (ownPids.has(cur)) {
      matches.push({ kind: 'this-app', label: '总控台' })
      break
    }
    const p = procs.get(cur)
    if (!p) break
    const name = p.name.toLowerCase()
    const cmd = (p.cmd ?? '').toLowerCase()
    let kind: ProcessOriginKind | null = null
    if (
      // 已知浏览器等非 agent 应用绝不判为 ai
      NON_AGENT_NAMES.has(name)
    ) {
      kind = null
    } else if (
      AI_NAMES.has(name) ||
      /(^|[\\\s])(codex|claude-code|claude|kimi|chatgpt|gemini|windsurf|cline|opencode)(\.exe)?$/i.test(
        name
      ) ||
      !!aiCommandIn(cmd)
    ) {
      kind = 'ai'
    } else if (EDITOR_NAMES.has(name)) {
      kind = 'editor'
    } else if (TERMINAL_NAMES.has(name)) {
      kind = 'terminal'
    } else if (SYSTEM_NAMES.has(name)) {
      kind = 'system'
    }
    if (kind) matches.push({ kind, label: friendlyLabel(name, cmd) })
    cur = p.ppid
  }
  if (!matches.length) return undefined
  const prio: Record<string, number> = { ai: 0, editor: 1, terminal: 2, 'this-app': 3, system: 4 }
  matches.sort((a, b) => (prio[a.kind] ?? 5) - (prio[b.kind] ?? 5))
  return matches[0]
}

export function buildOwnTree(data: ScanData): Set<number> {
  const own = new Set<number>()
  const root = process.pid
  const children = new Map<number, number[]>()
  for (const p of data.procs.values()) {
    const list = children.get(p.ppid) ?? []
    list.push(p.pid)
    children.set(p.ppid, list)
  }
  const stack = [root]
  while (stack.length) {
    const cur = stack.pop() as number
    if (own.has(cur)) continue
    own.add(cur)
    for (const c of children.get(cur) ?? []) stack.push(c)
  }
  return own
}
