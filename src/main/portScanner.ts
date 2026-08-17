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
$conns = @(Get-NetTCPConnection -State Listen | ForEach-Object {
  [ordered]@{ addr = [string]$_.LocalAddress; port = [int]$_.LocalPort; pid = [int]$_.OwningProcess }
})
$procs = @(Get-CimInstance Win32_Process | ForEach-Object {
  $c = $null
  try { $c = [DateTimeOffset]$_.CreationDate } catch { $c = $null }
  [ordered]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; name = [string]$_.Name; cmd = $_.CommandLine; created = $c }
})
$perf = @(Get-Process | ForEach-Object {
  [ordered]@{ pid = [int]$_.Id; cpu = [double]$_.CPU; mem = [long]$_.WorkingSet64; path = $_.Path }
})
$os = $null
try { $os = Get-CimInstance Win32_OperatingSystem } catch { $os = $null }
$osInfo = $null
if ($os) {
  $osInfo = [ordered]@{ totalMemKB = [double]$os.TotalVisibleMemorySize; freeMemKB = [double]$os.FreePhysicalMemory }
}
$cpuPct = $null
try {
  $cpuPerf = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'"
  $cpuPct = [double]$cpuPerf.PercentProcessorTime
} catch { $cpuPct = $null }
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
    { windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: 20000 }
  )
  return parseScan(stdout)
}

export function parseScan(stdout: string): ScanData {
  const raw = JSON.parse(stdout) as {
    ts: number
    conns: Array<{ addr: string; port: number; pid: number }>
    procs: Array<{ pid: number; ppid: number; name: string; cmd: string | null; created: string | null }>
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
    os: raw.os && typeof raw.os.totalMemKB === 'number' && typeof raw.os.freeMemKB === 'number' ? raw.os : undefined,
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

const AI_NAMES = new Set(['codex.exe', 'claude.exe', 'kimi.exe', 'chatgpt.exe', 'gemini.exe', 'windsurf.exe', 'cline.exe'])
const AI_CMDS = ['codex', 'claude', 'kimi', 'chatgpt', 'gemini', 'windsurf', 'cline', 'copilot']
const EDITOR_NAMES = new Set([
  'code.exe',
  'cursor.exe',
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

function friendlyLabel(name: string, cmd: string): string {
  const n = name.toLowerCase()
  const c = cmd.toLowerCase()
  if (AI_CMDS.some((k) => c.includes(k) && /(codex|claude|kimi|chatgpt|gemini|windsurf|cline)/.test(c))) {
    if (c.includes('codex')) return 'Codex'
    if (c.includes('claude')) return 'Claude'
    if (c.includes('kimi')) return 'Kimi'
    if (c.includes('chatgpt')) return 'ChatGPT'
    if (c.includes('gemini')) return 'Gemini'
    if (c.includes('windsurf')) return 'Windsurf'
    return 'AI 助手'
  }
  if (AI_NAMES.has(n)) return n.replace(/\.exe$/, '')
  if (n === 'code.exe') return 'VS Code'
  if (n === 'cursor.exe') return 'Cursor'
  if (n === 'vscodium.exe') return 'VSCodium'
  if (n === 'zed.exe') return 'Zed'
  if (n === 'sublime_text.exe') return 'Sublime'
  if (n === 'windowsterminal.exe' || n === 'wt.exe' || n === 'conhost.exe') return '终端'
  if (n === 'cmd.exe') return '终端'
  if (n === 'powershell.exe' || n === 'pwsh.exe') return 'PowerShell'
  if (n === 'bash.exe' || n === 'zsh.exe' || n === 'fish.exe' || n === 'mintty.exe') return '终端'
  if (n === 'explorer.exe' || n === 'svchost.exe' || n === 'dwm.exe' || n === 'services.exe') return '系统'
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
      AI_NAMES.has(name) ||
      /(^|[\\\s])(codex|claude|kimi|chatgpt|gemini|windsurf|cline)(\.exe)?$/i.test(name) ||
      (AI_CMDS.some((k) => cmd.includes(k)) && /(codex|claude|kimi|chatgpt|gemini|windsurf|cline|copilot)/.test(cmd))
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
