import { execFileSync } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { join, extname } from 'path'
import { Worker } from 'worker_threads'

export interface DiscoveredApp {
  name: string
  path: string
  icon?: string
  category?: string
  source: 'start-menu' | 'registry' | 'program-files' | 'appdata'
}

const KNOWN_CATEGORY: Record<string, string> = {
  chrome: '浏览器',
  edge: '浏览器',
  firefox: '浏览器',
  idea: '开发',
  webstorm: '开发',
  pycharm: '开发',
  goland: '开发',
  rubymine: '开发',
  rider: '开发',
  phpstorm: '开发',
  android: '开发',
  studio: '开发',
  'visual studio': '开发',
  code: '开发',
  vscode: '开发',
  cursor: '开发',
  windsurf: '开发',
  docker: '工具',
  terminal: '工具',
  powershell: '工具',
  cmd: '工具',
  notepad: '工具',
  calculator: '工具',
  word: '办公',
  excel: '办公',
  powerpoint: '办公',
  outlook: '办公',
  wechat: '通讯',
  qq: '通讯',
  dingtalk: '通讯',
  'feishu': '通讯',
  spotify: '娱乐',
  steam: '娱乐',
  'netflix': '娱乐'
}

function guessCategory(name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [key, cat] of Object.entries(KNOWN_CATEGORY)) {
    if (lower.includes(key)) return cat
  }
  return undefined
}

function parseLnkTarget(lnk: string): string | null {
  // 优先用 PowerShell 解析快捷方式目标
  try {
    const script = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}').TargetPath; Write-Output $s`
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const target = out.trim().split(/\r?\n/).filter(Boolean).join('\n').trim()
    if (target && /\.(exe|bat|cmd|com|ps1)$/i.test(target) && existsSync(target)) return target
  } catch {
    /* 回退到二进制解析 */
  }
  // 后备：正则扫描 .lnk 二进制中的可执行路径（多为 UTF-16）
  try {
    const buf = require('fs').readFileSync(lnk)
    const utf16 = buf.toString('utf16le')
    const m = utf16.match(/[A-Za-z]:\\[^\u0000]{0,240}\.(exe|bat|cmd|com|ps1)/i)
    if (m && existsSync(m[0])) return m[0]
    const ansi = buf.toString('latin1')
    const m2 = ansi.match(/[A-Za-z]:\\[^\u0000]{0,240}\.(exe|bat|cmd|com|ps1)/i)
    if (m2 && existsSync(m2[0])) return m2[0]
  } catch {
    /* 忽略 */
  }
  return null
}

function scanLnkDir(dir: string, source: DiscoveredApp['source'], limit: number): DiscoveredApp[] {
  if (!existsSync(dir)) return []
  const out: DiscoveredApp[] = []
  const stack = [dir]
  const seen = new Set<string>()
  while (stack.length && out.length < limit) {
    const cur = stack.pop() as string
    let entries
    try {
      entries = readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      if (out.length >= limit) break
      const full = join(cur, e.name)
      if (e.isDirectory()) {
        if (stack.length < 200) stack.push(full)
        continue
      }
      if (e.name.toLowerCase().endsWith('.lnk')) {
        const target = parseLnkTarget(full)
        if (!target) continue
        const name = e.name.replace(/\.lnk$/i, '')
        const key = `${name.toLowerCase()}|${target.toLowerCase()}`
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
          name,
          path: target,
          category: guessCategory(name),
          source
        })
      }
    }
  }
  return out
}

/** 扫描 Start Menu（用户 + 公共） */
function scanStartMenu(): DiscoveredApp[] {
  const roots: string[] = []
  const appData = process.env['APPDATA']
  const programData = process.env['PROGRAMDATA']
  if (appData) roots.push(join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  if (programData) roots.push(join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'))
  const out: DiscoveredApp[] = []
  for (const root of roots) out.push(...scanLnkDir(root, 'start-menu', 600))
  return out
}

/** 扫描 Registry 已安装应用（Uninstall 键） */
function scanRegistry(): DiscoveredApp[] {
  const out: DiscoveredApp[] = []
  const roots = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
  ]
  for (const root of roots) {
    try {
      const raw = execFileSync('reg.exe', ['query', root, '/s', '/f', 'DisplayIcon', '/v', 'DisplayIcon'], {
        windowsHide: true,
        encoding: 'utf8',
        timeout: 15000,
        stdio: ['ignore', 'pipe', 'ignore']
      })
      for (const line of raw.split(/\r?\n/)) {
        const m = line.match(/^HKEY_.*?\s+DisplayIcon\s+REG_[A-Z]+.*?\s+(.+)$/)
        if (!m) continue
        let icon = m[1].replace(/^"|"$/g, '').split(',')[0].trim()
        if (icon.startsWith('~')) continue
        if (!/\.(exe|bat|cmd|com)$/i.test(icon)) continue
        if (!existsSync(icon)) continue
        // 去掉 SystemRoot 变量
        icon = icon.replace(/^%SystemRoot%/, process.env['SystemRoot'] ?? 'C:\\Windows')
        const name = icon.split(/[\\/]/).pop()?.replace(/\.(exe|bat|cmd|com)$/i, '') ?? icon
        if (!name || /^uninstall/i.test(name)) continue
        if (out.some((a) => a.path.toLowerCase() === icon.toLowerCase())) continue
        out.push({ name, path: icon, category: guessCategory(name), source: 'registry' })
      }
    } catch {
      /* 某些键不存在，忽略 */
    }
  }
  return out
}

/** 扫描 Program Files / AppData 下的桌面应用 */
function scanProgramFiles(): DiscoveredApp[] {
  const out: DiscoveredApp[] = []
  const roots: Array<{ dir: string; source: DiscoveredApp['source'] }> = []
  const pf = process.env['ProgramFiles']
  const localAppData = process.env['LOCALAPPDATA']
  if (pf) roots.push({ dir: join(pf, 'Google', 'Chrome', 'Application'), source: 'program-files' })
  if (localAppData) roots.push({ dir: join(localAppData, 'Programs'), source: 'appdata' })

  const knownDirs = [
    'JetBrains',
    'Microsoft VS Code',
    'Docker',
    'Windows Terminal',
    'PowerShell',
    'Git',
    'MySQL',
    'PostgreSQL',
    'Redis'
  ]
  for (const root of roots) {
    for (const sub of knownDirs) {
      const d = join(root.dir, sub)
      if (!existsSync(d)) continue
      let entries
      try {
        entries = readdirSync(d, { withFileTypes: true })
      } catch {
        continue
      }
      const exe = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith('.exe'))
      if (exe) {
        const name = exe.name.replace(/\.exe$/i, '')
        const full = join(d, exe.name)
        if (!out.some((a) => a.path.toLowerCase() === full.toLowerCase())) {
          out.push({ name, path: full, category: guessCategory(name), source: root.source })
        }
      }
    }
  }
  return out
}

/**
 * 发现本机应用：合并 Start Menu / Registry / Program Files 结果并去重。
 * 返回已去重的应用列表（同一可执行文件只保留一份，优先 start-menu 来源）。
 */
export function discoverApplications(): DiscoveredApp[] {
  const merged = new Map<string, DiscoveredApp>()
  const add = (a: DiscoveredApp): void => {
    const key = a.path.toLowerCase()
    const existing = merged.get(key)
    if (!existing || sourceRank(a.source) < sourceRank(existing.source)) {
      merged.set(key, a)
    }
  }
  for (const a of scanStartMenu()) add(a)
  for (const a of scanRegistry()) add(a)
  for (const a of scanProgramFiles()) add(a)
  const list = [...merged.values()]
  // 排序：名称 A-Z，名称相近的按路径
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

function sourceRank(s: DiscoveredApp['source']): number {
  return s === 'start-menu' ? 0 : s === 'registry' ? 1 : s === 'program-files' ? 2 : 3
}

/** 提取可执行文件展示名 */
export function appDisplayName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path
  return base.replace(/\.(exe|bat|cmd|com|ps1)$/i, '')
}

/** 判断某路径是否可执行且存在 */
export function isRunnable(path: string): boolean {
  if (!path) return false
  try {
    return existsSync(path) && statSync(path).isFile()
  } catch {
    return false
  }
}

export function iconForApp(path: string): string | undefined {
  const ext = extname(path).toLowerCase()
  if (['.exe', '.bat', '.cmd', '.com', '.ps1'].includes(ext)) return '🖥️'
  return undefined
}

export interface DiscoveredAppDto {
  name: string
  path: string
  icon?: string
  category?: string
  source: DiscoveredApp['source']
}

/**
 * 异步发现本机应用。
 *
 * 应用发现包含同步的 PowerShell / reg.exe / 文件系统扫描，直接在主进程执行会
 * 长时间阻塞事件循环导致界面无响应。此处将扫描放到 worker_threads 中执行，
 * 主进程事件循环不受影响。
 */
export function discoverApplicationsAsync(): Promise<DiscoveredAppDto[]> {
  return new Promise((resolve, reject) => {
    try {
      // worker 与主进程同目录构建（见 electron.vite.config.ts main 多入口）
      const worker = new Worker(join(__dirname, 'discoverWorker.js'))
      const timeout = setTimeout(() => {
        void worker.terminate()
        reject(new Error('应用发现超时'))
      }, 45000)
      worker.postMessage({ type: 'discover' })
      worker.once('message', (res: { ok: boolean; apps?: DiscoveredAppDto[]; error?: string }) => {
        clearTimeout(timeout)
        void worker.terminate()
        if (res.ok && res.apps) resolve(res.apps)
        else reject(new Error(res.error ?? '应用发现失败'))
      })
      worker.once('error', (err) => {
        clearTimeout(timeout)
        reject(err)
      })
    } catch (err) {
      // worker 不可用（如打包环境异常）时回退到同步扫描，仅日志提示不阻断
      // eslint-disable-next-line no-console
      console.error('应用发现 worker 启动失败，回退同步扫描', err)
      resolve(discoverApplications())
    }
  })
}
