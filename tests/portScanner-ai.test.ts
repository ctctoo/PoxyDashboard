import { describe, expect, it } from 'vitest'
import { classifyOrigin } from '../src/main/portScanner'
import type { ScanData } from '../src/main/portScanner'

function makeProcs(
  map: Record<number, { name: string; cmd: string; ppid: number }>
): Map<number, { pid: number; ppid: number; name: string; cmd: string; created: number }> {
  const m = new Map<
    number,
    { pid: number; ppid: number; name: string; cmd: string; created: number }
  >()
  for (const [pid, p] of Object.entries(map)) {
    m.set(Number(pid), { pid: Number(pid), ppid: p.ppid, name: p.name, cmd: p.cmd, created: 1 })
  }
  return m
}

function classify(map: Record<number, { name: string; cmd: string; ppid: number }>, pid: number) {
  const data: ScanData = {
    ts: 1,
    conns: [],
    procs: makeProcs(map),
    perf: new Map()
  }
  return classifyOrigin(pid, data.procs, new Set<number>())
}

describe('classifyOrigin AI 判定', () => {
  it('Edge 进程不会被误判为 AI agent', () => {
    const origin = classify(
      {
        10: {
          name: 'msedge.exe',
          cmd: '"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --type=renderer --user-data-dir=C:\\Users\\me\\AppData\\Local\\Microsoft\\Edge\\User Data',
          ppid: 1
        }
      },
      10
    )
    expect(origin?.kind).not.toBe('ai')
  })

  it('命令行中间出现 codex 子串（非命令 token）不误判为 AI', () => {
    // 路径/参数里恰好含 "codex" 字样的普通进程，不应被判为 ai
    const origin = classify(
      {
        20: {
          name: 'node.exe',
          cmd: 'node C:\\codex-tools\\helper.js --config=mycodex.json',
          ppid: 1
        }
      },
      20
    )
    expect(origin?.kind).not.toBe('ai')
  })

  it('识别 opencode 为 AI agent', () => {
    const origin = classify(
      {
        30: { name: 'opencode.exe', cmd: '"C:\\Users\\me\\AppData\\npm\\opencode.exe"', ppid: 1 }
      },
      30
    )
    expect(origin?.kind).toBe('ai')
    expect(origin?.label).toBe('OpenCode')
  })

  it('识别 codex 为 AI agent（命令首 token 匹配）', () => {
    const origin = classify(
      {
        40: { name: 'codex.exe', cmd: '"codex" exec', ppid: 1 }
      },
      40
    )
    expect(origin?.kind).toBe('ai')
    expect(origin?.label).toBe('Codex')
  })

  it('识别 Cursor 桌面应用为 AI agent（不再归为 editor）', () => {
    const origin = classify(
      {
        50: {
          name: 'Cursor.exe',
          cmd: '"C:\\Users\\me\\AppData\\Local\\Programs\\cursor\\Cursor.exe"',
          ppid: 1
        }
      },
      50
    )
    expect(origin?.kind).toBe('ai')
    expect(origin?.label).toBe('Cursor')
  })

  it('识别 Windsurf 桌面应用为 AI agent', () => {
    const origin = classify(
      {
        60: {
          name: 'Windsurf.exe',
          cmd: '"C:\\Users\\me\\AppData\\Local\\Programs\\Windsurf\\Windsurf.exe"',
          ppid: 1
        }
      },
      60
    )
    expect(origin?.kind).toBe('ai')
    expect(origin?.label).toBe('Windsurf')
  })
})
