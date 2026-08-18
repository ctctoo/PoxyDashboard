import { findExecutable } from './commands'

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

/**
 * 解析某类 agent 的可执行启动命令。
 * 返回可直接交给 spawnCommandLine 的命令串；找不到返回 undefined。
 */
export function resolveAgentLaunch(kind: string): string | undefined {
  const cmd = AGENT_CATALOG[kind]
  if (!cmd) return undefined
  // 命令可解析到可执行文件时才认为可启动，避免对未知路径静默失败
  return findExecutable(cmd) ? cmd : undefined
}

/** 已知的 agent kind 集合（用于判定可自动重启/启动） */
export function isKnownAgentKind(kind: string): boolean {
  return kind in AGENT_CATALOG
}
