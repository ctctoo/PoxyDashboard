import { execFileSync, spawn } from 'child_process'
import type { ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import crossSpawn from 'cross-spawn'

export interface ParsedCommand {
  exe: string
  args: string[]
  shell: boolean
}

export function tokenize(s: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ: string | null = null
  for (const ch of s) {
    if (inQ) {
      if (ch === inQ) inQ = null
      else cur += ch
    } else if (ch === '"' || ch === "'") {
      inQ = ch
    } else if (/\s/.test(ch)) {
      if (cur) {
        out.push(cur)
        cur = ''
      }
    } else {
      cur += ch
    }
  }
  if (cur) out.push(cur)
  return out
}

export function parseCommand(cmd: string): ParsedCommand {
  const tokens = tokenize(cmd)
  if (tokens.length === 0) return { exe: '', args: [], shell: false }
  const [exe, ...args] = tokens
  const outside = cmd.replace(/"[^"]*"/g, '')
  const shell = /[|><&]/.test(outside) && !/(^|[^&])&&/.test(outside)
  return { exe, args, shell }
}

export function hasShellSyntax(cmd: string): boolean {
  const outside = cmd.replace(/"[^"]*"/g, '')
  return /[|><&]/.test(outside)
}

export function spawnCommandLine(raw: string, opts: { cwd?: string }): ChildProcessWithoutNullStreams {
  const parsed = parseCommand(raw)
  const base = { cwd: opts.cwd, windowsHide: true } as const
  if (parsed.shell || hasShellSyntax(raw)) {
    if (process.platform === 'win32') {
      return spawn('cmd.exe', ['/d', '/s', '/c', raw], { ...base, env: process.env }) as unknown as ChildProcessWithoutNullStreams
    }
    return spawn('/bin/sh', ['-c', raw], { ...base }) as unknown as ChildProcessWithoutNullStreams
  }
  const resolved = findExecutable(parsed.exe, opts.cwd)
  const exe = resolved ?? parsed.exe
  const lower = exe.toLowerCase()
  if (lower.endsWith('.cmd') || lower.endsWith('.bat') || lower.endsWith('.ps1')) {
    return crossSpawn(exe, parsed.args, { ...base, env: process.env }) as unknown as ChildProcessWithoutNullStreams
  }
  return spawn(exe, parsed.args, { ...base, env: process.env }) as unknown as ChildProcessWithoutNullStreams
}

const exeCache = new Map<string, string | null>()

/**
 * 解析可执行文件路径：先按绝对路径 / PATH 查找；
 * 找不到时再搜索常见安装目录（如 MongoDB 的 Program Files / scoop / chocolatey 等），
 * 以及项目目录下的 bin 子目录。结果按进程缓存。
 */
export function findExecutable(exe: string, cwd?: string): string | null {
  if (!exe) return null
  const key = `${exe}\u0000${cwd ?? ''}`
  if (exeCache.has(key)) return exeCache.get(key) ?? null

  let found: string | null = null
  if (/^[A-Za-z]:[\\/]/.test(exe) || exe.startsWith('\\\\') || exe.startsWith('/')) {
    found = existsSync(exe) ? exe : null
  } else {
    found = whichPath(exe)
    if (!found) found = searchKnownRoots(exe)
    if (!found && cwd) {
      const local = join(cwd, 'bin', process.platform === 'win32' ? `${exe}.exe` : exe)
      if (existsSync(local)) found = local
    }
  }
  exeCache.set(key, found)
  return found
}

function whichPath(exe: string): string | null {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where.exe', [exe], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8', windowsHide: true })
      const first = out.split(/\r?\n/)[0]?.trim()
      return first || null
    }
    execFileSync('which', [exe], { stdio: 'ignore' })
    return exe
  } catch {
    return null
  }
}

function knownRoots(): string[] {
  if (process.platform === 'win32') {
    return [
      'C:\\Program Files\\MongoDB\\Server',
      'C:\\Program Files (x86)\\MongoDB\\Server',
      join(process.env['LOCALAPPDATA'] ?? '', 'Programs', 'MongoDB', 'Server'),
      join(process.env['USERPROFILE'] ?? '', 'scoop', 'apps', 'mongodb'),
      'C:\\ProgramData\\chocolatey\\bin'
    ]
  }
  return [
    '/usr/local/opt/mongodb-community/bin',
    '/usr/local/opt/mongodb/bin',
    '/opt/homebrew/opt/mongodb-community/bin',
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]
}

function searchKnownRoots(exe: string): string | null {
  const isWin = process.platform === 'win32'
  const name = exe.toLowerCase()
  const target = isWin ? (name.endsWith('.exe') ? name : `${name}.exe`) : name
  const stack: Array<{ dir: string; depth: number }> = []
  for (const root of knownRoots()) {
    if (existsSync(root)) stack.push({ dir: root, depth: 0 })
  }
  while (stack.length) {
    const { dir, depth } = stack.pop() as { dir: string; depth: number }
    if (depth > 3) continue
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) {
        stack.push({ dir: full, depth: depth + 1 })
      } else if (e.name.toLowerCase() === target) {
        return full
      }
    }
  }
  return null
}

export function killTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const p = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
      p.on('close', () => resolve())
      p.on('error', () => resolve())
    } else {
      try {
        process.kill(-pid, 'SIGTERM')
      } catch {
        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          /* 已退出 */
        }
      }
      resolve()
    }
  })
}
