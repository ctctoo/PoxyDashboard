import { describe, expect, it } from 'vitest'
import { aggregateAgents, mergeInstalledAgents } from '../src/main/agentAggregator'
import type { ScanData } from '../src/main/portScanner'

/** 构造一份包含 AI agent 进程树的扫描数据 */
function makeData(): ScanData {
  return {
    ts: 1000,
    conns: [
      { addr: '127.0.0.1', port: 3000, pid: 102 }, // node 任务进程监听 :3000
      { addr: '0.0.0.0', port: 8080, pid: 200 } // cursor 本体监听 :8080
    ],
    procs: new Map([
      [100, { pid: 100, ppid: 1, name: 'codex.exe', cmd: '"C:\\codex\\codex.exe"', created: 100 }],
      [101, { pid: 101, ppid: 100, name: 'codex.exe', cmd: '"C:\\codex\\codex.exe" --worker', created: 101 }],
      [102, { pid: 102, ppid: 100, name: 'node.exe', cmd: 'node build.js', created: 102 }],
      [103, { pid: 103, ppid: 102, name: 'npm.exe', cmd: 'npm run build', created: 103 }],
      [200, { pid: 200, ppid: 1, name: 'cursor.exe', cmd: '"C:\\cursor\\cursor.exe"', created: 200 }],
      [300, { pid: 300, ppid: 1, name: 'explorer.exe', cmd: 'explorer.exe', created: 300 }]
    ]),
    perf: new Map([
      [100, { pid: 100, cpu: 5, mem: 200 * 1048576, path: 'C:\\codex\\codex.exe' }],
      [101, { pid: 101, cpu: 2, mem: 100 * 1048576, path: 'C:\\codex\\codex.exe' }],
      [102, { pid: 102, cpu: 30, mem: 300 * 1048576, path: 'C:\\node\\node.exe' }],
      [103, { pid: 103, cpu: 10, mem: 50 * 1048576, path: 'C:\\node\\npm.exe' }],
      [200, { pid: 200, cpu: 8, mem: 800 * 1048576, path: 'C:\\cursor\\cursor.exe' }],
      [300, { pid: 300, cpu: 1, mem: 10 * 1048576, path: 'C:\\Windows\\explorer.exe' }]
    ])
  }
}

function buildChildren(data: ScanData): Map<number, number[]> {
  const children = new Map<number, number[]>()
  for (const p of data.procs.values()) {
    const list = children.get(p.ppid) ?? []
    list.push(p.pid)
    children.set(p.ppid, list)
  }
  return children
}

describe('aggregateAgents', () => {
  const data = makeData()
  const children = buildChildren(data)
  const ownTree = new Set<number>()
  const cpuByPid = new Map<number, number>([
    [100, 5],
    [101, 2],
    [102, 30],
    [103, 10],
    [200, 8],
    [300, 1]
  ])

  it('识别两个 agent（codex 与 cursor），忽略非 AI 进程', () => {
    const rows = aggregateAgents(data, ownTree, cpuByPid, children)
    expect(rows).toHaveLength(2)
    const kinds = rows.map((r) => r.kind).sort()
    expect(kinds).toEqual(['codex', 'cursor'])
  })

  it('codex 聚合整树资源并归拢派生任务', () => {
    const rows = aggregateAgents(data, ownTree, cpuByPid, children)
    const codex = rows.find((r) => r.kind === 'codex')!
    // 任务 = 树内名称不同于根且非系统噪音的进程
    expect(codex.taskCount).toBe(2) // node.exe + npm.exe
    expect(codex.tasks.map((t) => t.name).sort()).toEqual(['node.exe', 'npm.exe'])
    // 整树 CPU = 5 + 2 + 30 + 10 = 47
    expect(codex.cpu).toBe(47)
    // 整树内存 = (200 + 100 + 300 + 50) MB = 650
    expect(codex.memMB).toBe(650)
    // 端口来自 node 任务
    expect(codex.ports).toContain(3000)
    expect(codex.status).toBe('running')
  })

  it('同名 GUI 辅助进程不视为任务', () => {
    const rows = aggregateAgents(data, ownTree, cpuByPid, children)
    const codex = rows.find((r) => r.kind === 'codex')!
    // pid 101 是 codex.exe 同名子进程，应被过滤
    expect(codex.tasks.some((t) => t.pid === 101)).toBe(false)
  })

  it('无任务进程的 agent 标记为 idle（cursor 仅本体监听端口视为 running）', () => {
    const rows = aggregateAgents(data, ownTree, cpuByPid, children)
    const cursor = rows.find((r) => r.kind === 'cursor')!
    // cursor 无派生任务，但有监听端口 8080 → 仍为 running
    expect(cursor.taskCount).toBe(0)
    expect(cursor.ports).toContain(8080)
    expect(cursor.status).toBe('running')
  })

  it('无任何 ai 进程时返回空数组', () => {
    const empty: ScanData = {
      ts: 1,
      conns: [],
      procs: new Map([[300, { pid: 300, ppid: 1, name: 'explorer.exe', cmd: 'explorer.exe', created: 1 }]]),
      perf: new Map([[300, { pid: 300, cpu: 0, mem: 0, path: null }]])
    }
    const rows = aggregateAgents(empty, ownTree, cpuByPid, buildChildren(empty))
    expect(rows).toHaveLength(0)
  })

  it('排除总控台自身进程（ownTree）', () => {
    const own = new Set<number>([200])
    const rows = aggregateAgents(data, own, cpuByPid, children)
    // cursor(200) 被排除，只剩 codex
    expect(rows.map((r) => r.kind)).toEqual(['codex'])
  })
})

describe('mergeInstalledAgents', () => {
  const running: Array<ReturnType<typeof aggregateAgents>[number]> = [
    {
      id: 'codex:100',
      kind: 'codex',
      label: 'Codex',
      icon: '🤖',
      status: 'running',
      pid: 100,
      createdAt: 100,
      cpu: 47,
      memMB: 650,
      ports: [3000],
      taskCount: 2,
      tasks: []
    }
  ]

  it('追加已安装但未运行的 agent，并标记 not-running', () => {
    const merged = mergeInstalledAgents(running, [
      { kind: 'opencode', label: 'OpenCode', command: 'opencode' },
      { kind: 'claude', label: 'Claude', command: 'claude' }
    ])
    expect(merged).toHaveLength(3)
    const opencode = merged.find((r) => r.kind === 'opencode')!
    expect(opencode.status).toBe('not-running')
    expect(opencode.pid).toBeUndefined()
    expect(opencode.cpu).toBe(0)
    expect(opencode.taskCount).toBe(0)
  })

  it('运行中的 agent 不会重复追加为未启动', () => {
    const merged = mergeInstalledAgents(running, [
      { kind: 'codex', label: 'Codex', command: 'codex' }, // 已在运行
      { kind: 'claude', label: 'Claude', command: 'claude' }
    ])
    const codex = merged.filter((r) => r.kind === 'codex')
    expect(codex).toHaveLength(1)
    expect(codex[0].status).toBe('running')
  })

  it('排序：running 在前，not-running 在后', () => {
    const merged = mergeInstalledAgents(running, [{ kind: 'opencode', label: 'OpenCode', command: 'opencode' }])
    expect(merged[0].status).toBe('running')
    expect(merged[1].status).toBe('not-running')
  })
})
