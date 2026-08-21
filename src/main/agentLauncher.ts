import { findExecutable } from './commands'
import type { CustomAgent } from '../shared/types'

/**
 * 常见 AI agent 的启动命令目录。
 * key 与 portScanner.ts 的 AI_NAMES / AI_CMDS 保持一致。
 * value 为启动该应用本体的命令（可由 findExecutable 从 PATH / 常见目录解析）。
 * 仅在重启/启动 agent 时使用；未知 agent 返回 undefined，渲染层提示手动打开。
 */
export const AGENT_CATALOG: Record<string, string | undefined> = {
  cursor: 'cursor',
  codex: 'codex',
  claude: 'claude',
  kimi: 'kimi',
  chatgpt: 'chatgpt',
  gemini: 'gemini',
  windsurf: 'windsurf',
  cline: 'code',
  opencode: 'opencode'
}

/** 内置 agent 的友好名（供探测/展示） */
export const AGENT_LABEL: Record<string, string> = {
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
 * 拼接带工作目录的启动命令串（如 `opencode "D:\\Project"`）。
 * 目录含空格时自动加引号，避免被 tokenize 拆开。
 */
export function agentCommandWithDir(cmd: string, dir?: string): string {
  const d = dir?.trim()
  return d ? `${cmd} "${d}"` : cmd
}

/** 从配置中合并出「内置目录 + 自定义 agent」的统一命令表 */
function mergedCatalog(
  customs: CustomAgent[] = []
): Map<string, { command: string; withDirArg: boolean }> {
  const map = new Map<string, { command: string; withDirArg: boolean }>()
  for (const [k, cmd] of Object.entries(AGENT_CATALOG)) {
    if (cmd) map.set(k, { command: cmd, withDirArg: true })
  }
  for (const c of customs) {
    map.set(c.kind, { command: c.command, withDirArg: c.withDirArg })
  }
  return map
}

/**
 * 解析某类 agent 的可执行启动命令。
 * CLI 型 agent（opencode/codex/claude 等）启动时必须携带工作目录，例如 `opencode "D:\\Project"`。
 * 返回可直接交给 spawnCommandLine 的命令串；找不到返回 undefined。
 *
 * @param kind   agent 识别 key（内置或自定义）
 * @param dir    工作目录；内置 CLI 按需拼接为命令参数，并作为进程 cwd
 * @param customs 自定义 agent 表（用于解析自定义 kind）
 */
export function resolveAgentLaunch(
  kind: string,
  dir?: string,
  customs: CustomAgent[] = []
): string | undefined {
  const entry = mergedCatalog(customs).get(kind)
  if (!entry) return undefined
  // 命令可解析到可执行文件时才认为可启动，避免对未知路径静默失败
  if (!findExecutable(entry.command)) return undefined
  return entry.withDirArg ? agentCommandWithDir(entry.command, dir) : entry.command
}

/** 已知的 agent kind 集合（内置目录 + 自定义），用于判定可自动重启/启动 */
export function isKnownAgentKind(kind: string, customs: CustomAgent[] = []): boolean {
  return mergedCatalog(customs).has(kind)
}
