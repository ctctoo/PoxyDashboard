import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { findExecutable } from './commands'
import { AGENT_CATALOG } from './agentLauncher'

const execFileAsync = promisify(execFile)

/** 探测结果：某 agent 是否已安装（可通过命令启动） */
export interface InstalledAgent {
  kind: string
  label: string
  /** 实际可用的启动命令（PATH 或 npm 全局 bin） */
  command: string
}

const AGENT_LABEL: Record<string, string> = {
  codex: 'Codex',
  opencode: 'OpenCode',
  claude: 'Claude',
  kimi: 'Kimi',
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  windsurf: 'Windsurf',
  cursor: 'Cursor',
  cline: 'Cline'
}

/**
 * 探测本机已安装的 AI agent（即使尚未运行也能识别）。
 * 来源：
 *  1) PATH / 常见安装目录（findExecutable）
 *  2) npm 全局 bin（npm prefix -g → node_modules/.bin，覆盖 npm 全局安装的 CLI agent）
 */
export async function detectInstalledAgents(): Promise<InstalledAgent[]> {
  const installed: InstalledAgent[] = []
  const seen = new Set<string>()

  const npmBinDir = await findNpmGlobalBin()

  for (const [kind, cmd] of Object.entries(AGENT_CATALOG)) {
    if (!cmd) continue
    // 1) PATH 命中
    const exe = findExecutable(cmd)
    if (exe) {
      installed.push({ kind, label: AGENT_LABEL[kind] ?? kind, command: cmd })
      seen.add(kind)
      continue
    }
    // 2) npm 全局 bin 命中（npm 安装的 CLI 常有 .cmd/.ps1 shim）
    if (npmBinDir) {
      const shimNames = [`${cmd}.cmd`, `${cmd}.ps1`, `${cmd}.exe`, cmd]
      const hit = shimNames.find((n) => existsSync(join(npmBinDir, n)))
      if (hit) {
        installed.push({ kind, label: AGENT_LABEL[kind] ?? kind, command: cmd })
        seen.add(kind)
      }
    }
  }
  return installed
}

/** 解析 npm 全局 bin 目录（`{npm prefix -g}/node_modules/.bin`） */
async function findNpmGlobalBin(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('npm', ['prefix', '-g'], {
      windowsHide: true,
      timeout: 5000,
      env: process.env
    })
    const prefix = stdout.trim()
    if (!prefix) return null
    // 常见结构：{prefix}/node_modules/.bin
    const bin = join(prefix, 'node_modules', '.bin')
    return existsSync(bin) ? bin : null
  } catch {
    return null
  }
}
