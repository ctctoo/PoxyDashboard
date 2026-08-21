import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { CustomAgent } from '../src/shared/types'
import {
  agentCommandWithDir,
  isKnownAgentKind,
  resolveAgentLaunch
} from '../src/main/agentLauncher'

const customAgent: CustomAgent = {
  kind: 'myagent',
  label: 'My Agent',
  icon: '🤖',
  command: 'myagent',
  withDirArg: true,
  createdAt: Date.now()
}
const customNoDir: CustomAgent = {
  kind: 'guitool',
  label: 'GUI Tool',
  icon: '🛠',
  command: 'guitool',
  withDirArg: false,
  createdAt: Date.now()
}

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

  it('自定义 agent 视为已知 kind（REQ-03）', () => {
    expect(isKnownAgentKind('myagent', [customAgent])).toBe(true)
    expect(isKnownAgentKind('myagent')).toBe(false)
  })
})

describe('resolveAgentLaunch 自定义 agent', () => {
  it('自定义 CLI agent 启动时携带工作目录（绝对路径命令）', () => {
    if (process.platform !== 'win32') return
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-custom-'))
    const exe = join(dir, `myagent-${Date.now()}.exe`)
    writeFileSync(exe, '', 'binary')
    const c: CustomAgent = { ...customAgent, command: exe }
    try {
      expect(resolveAgentLaunch(c.kind, 'D:\\Proj', [c])).toBe(`${exe} "D:\\Proj"`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('GUI 型自定义 agent（withDirArg=false）启动时不拼目录参数（绝对路径命令）', () => {
    if (process.platform !== 'win32') return
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-gui-'))
    const exe = join(dir, `guitool-${Date.now()}.exe`)
    writeFileSync(exe, '', 'binary')
    const c: CustomAgent = { ...customNoDir, command: exe }
    try {
      expect(resolveAgentLaunch(c.kind, 'D:\\Proj', [c])).toBe(exe)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('命令不可解析时返回 undefined（用唯一命令名避开 exeCache）', () => {
    const unique = `definitely-not-installed-${Date.now()}`
    const c: CustomAgent = { ...customAgent, command: unique }
    expect(resolveAgentLaunch(unique, 'D:\\Proj', [c])).toBeUndefined()
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
