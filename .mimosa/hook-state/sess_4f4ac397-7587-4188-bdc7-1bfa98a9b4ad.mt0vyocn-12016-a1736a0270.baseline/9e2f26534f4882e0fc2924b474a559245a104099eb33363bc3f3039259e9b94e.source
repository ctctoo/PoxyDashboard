import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  agentCommandWithDir,
  isKnownAgentKind,
  resolveAgentLaunch
} from '../src/main/agentLauncher'

describe('agentCommandWithDir', () => {
  it('目录拼接为带引号的参数（含空格）', () => {
    expect(agentCommandWithDir('opencode', 'D:\\Project\\My dashboard')).toBe(
      'opencode "D:\\Project\\My dashboard"'
    )
  })

  it('trim 目录前后空白', () => {
    expect(agentCommandWithDir('codex', '  C:/work  ')).toBe('codex "C:/work"')
  })

  it('无目录或空目录时返回裸命令', () => {
    expect(agentCommandWithDir('claude')).toBe('claude')
    expect(agentCommandWithDir('claude', '   ')).toBe('claude')
  })
})

describe('isKnownAgentKind', () => {
  it('识别已知 agent 与未知 kind', () => {
    expect(isKnownAgentKind('opencode')).toBe(true)
    expect(isKnownAgentKind('codex')).toBe(true)
    expect(isKnownAgentKind('not-an-agent')).toBe(false)
  })
})

describe('resolveAgentLaunch', () => {
  it('未知 kind 返回 undefined', () => {
    expect(resolveAgentLaunch('nope')).toBeUndefined()
  })

  it('解析到可执行文件时携带工作目录', () => {
    if (process.platform !== 'win32') return
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-agent-'))
    writeFileSync(join(dir, 'opencode.exe'), '', 'binary')
    const prev = process.env.PATH ?? ''
    process.env.PATH = `${dir};${prev}`
    try {
      expect(resolveAgentLaunch('opencode', 'D:\\Project')).toBe('opencode "D:\\Project"')
    } finally {
      process.env.PATH = prev
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
