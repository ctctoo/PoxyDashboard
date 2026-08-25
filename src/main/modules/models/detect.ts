import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import { execFileSync } from 'child_process'
import type { ModelEnv, ModelRuntime } from '../../../shared/types'
import { findExecutable } from '../../commands'

interface EnvDef {
  runtime: ModelRuntime
  label: string
  icon: string
  /** 候选可执行文件 basename（不含扩展名） */
  bins: string[]
  /** 常见安装根目录（追加搜索） */
  roots?: string[]
  defaultPort: number
  /** 探测命令（返回版本字符串） */
  versionArg?: string[]
}

const ENV_DEFS: EnvDef[] = [
  {
    runtime: 'ollama',
    label: 'Ollama',
    icon: '🦙',
    bins: ['ollama'],
    roots: [join(homedir(), '.ollama')],
    defaultPort: 11434,
    versionArg: ['--version']
  },
  {
    runtime: 'llamacpp',
    label: 'llama.cpp',
    icon: '🧠',
    bins: ['llama-server', 'llama-cli', 'main'],
    roots: [join(homedir(), 'llama.cpp', 'build', 'bin'), join(homedir(), 'llama.cpp')],
    defaultPort: 8080,
    versionArg: ['--version']
  },
  {
    runtime: 'vllm',
    label: 'vLLM',
    icon: '⚡',
    bins: ['vllm'],
    defaultPort: 8000
  },
  {
    runtime: 'lmstudio',
    label: 'LM Studio',
    icon: '🟣',
    bins: ['lm-studio', 'lmstudio'],
    roots: [join(homedir(), '.lmstudio')],
    defaultPort: 1234
  },
  {
    runtime: 'koboldcpp',
    label: 'KoboldCpp',
    icon: '🐉',
    bins: ['koboldcpp', 'koboldcpp.exe', 'koboldcpp_nocuda'],
    roots: [join(homedir(), 'koboldcpp')],
    defaultPort: 5001
  },
  {
    runtime: 'textgen',
    label: 'text-generation-webui',
    icon: '🖥️',
    bins: ['server', 'webui', 'start_windows'],
    roots: [join(homedir(), 'text-generation-webui')],
    defaultPort: 7860
  },
  {
    runtime: 'llamacpp-python',
    label: 'llama-cpp-python',
    icon: '🐍',
    bins: ['llama-server'],
    roots: [join(homedir(), '.cache', 'llama-cpp-python')],
    defaultPort: 8000
  },
  {
    runtime: 'gpt4all',
    label: 'GPT4All',
    icon: '💬',
    bins: ['gpt4all', 'gpt4all-lora-quantized'],
    roots: [join(homedir(), 'gpt4all')],
    defaultPort: 4891
  }
]

const versionCache = new Map<string, string | undefined>()

/** 探测二进制版本（失败返回 undefined） */
function probeVersion(bin: string, args?: string[]): string | undefined {
  if (!args) return undefined
  const key = `${bin}\u0000${args.join(' ')}`
  if (versionCache.has(key)) return versionCache.get(key)
  try {
    const out = execFileSync(bin, args, {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 4000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const first = out.split(/\r?\n/).find((l) => l.trim())
    const m = /v?(\d+\.\d+(?:\.\d+)?)/.exec(first ?? '')
    const version = m ? m[1] : first?.trim()
    versionCache.set(key, version)
    return version
  } catch {
    versionCache.set(key, undefined)
    return undefined
  }
}

/** 解析可执行文件路径：优先 PATH，其次常见安装根目录 */
function resolveBin(def: EnvDef): { bin: string; available: boolean } {
  for (const name of def.bins) {
    const fromPath = findExecutable(name)
    if (fromPath && existsSync(fromPath)) return { bin: fromPath, available: true }
  }
  // 常见安装根目录下递归查找
  for (const name of def.bins) {
    for (const root of def.roots ?? []) {
      if (!existsSync(root)) continue
      const found = searchRoot(root, name)
      if (found) return { bin: found, available: true }
    }
  }
  return { bin: def.bins[0] ?? '', available: false }
}

/** 在安装目录内递归查找同名可执行文件（浅层，depth<=3） */
function searchRoot(root: string, name: string): string | null {
  const isWin = process.platform === 'win32'
  const target = name.toLowerCase().endsWith('.exe') ? name : isWin ? `${name}.exe` : name
  const stack: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }]
  while (stack.length) {
    const { dir, depth } = stack.pop() as { dir: string; depth: number }
    if (depth > 3) continue
    let entries: Array<{ name: string; isDirectory: () => boolean }>
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as unknown as Array<{
        name: string
        isDirectory: () => boolean
      }>
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

/** 自动检测本机已安装的大模型运行框架 */
export function detectModelEnvs(): ModelEnv[] {
  return ENV_DEFS.map((def) => {
    const { bin, available } = resolveBin(def)
    const version = available ? probeVersion(bin, def.versionArg) : undefined
    return {
      kind: def.runtime,
      label: def.label,
      icon: def.icon,
      bin,
      version,
      defaultPort: def.defaultPort,
      available,
      note: available
        ? version
          ? `检测到 ${def.label}（v${version}）`
          : `检测到 ${def.label}`
        : `未检测到 ${def.label}，可手动指定可执行文件`
    }
  })
}

/** 根据运行时类型查找默认端口（未知返回 11434） */
export function defaultPortFor(runtime: ModelRuntime): number {
  return ENV_DEFS.find((d) => d.runtime === runtime)?.defaultPort ?? 11434
}

/** 运行时类型是否可通过二进制启动（ollama/vllm 等需要特殊参数处理） */
export function isBinaryRuntime(runtime: ModelRuntime): boolean {
  return runtime !== 'ollama'
}
