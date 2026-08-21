import { describe, expect, it } from 'vitest'
import { classifyActivity, activityLabel, evaluateHealth } from '../src/main/agentAggregator'
import type { AgentRow } from '../src/shared/types'

describe('classifyActivity', () => {
  it('识别测试命令', () => {
    expect(classifyActivity('node_modules/.bin/vitest run')).toBe('test')
    expect(classifyActivity('npm test')).toBe('test')
    expect(classifyActivity('python -m pytest')).toBe('test')
  })

  it('识别构建命令', () => {
    expect(classifyActivity('npm run build')).toBe('build')
    expect(classifyActivity('tsc --noEmit')).toBe('build')
    expect(classifyActivity('vite build')).toBe('build')
  })

  it('识别开发服务器', () => {
    expect(classifyActivity('npm run dev')).toBe('dev-server')
    expect(classifyActivity('vite')).toBe('dev-server')
    expect(classifyActivity('uvicorn app:app --reload')).toBe('dev-server')
  })

  it('识别安装依赖', () => {
    expect(classifyActivity('npm install')).toBe('install')
    expect(classifyActivity('pip install requests')).toBe('install')
  })

  it('识别 git 操作', () => {
    expect(classifyActivity('git commit -m "wip"')).toBe('git')
    expect(classifyActivity('git push origin main')).toBe('git')
  })

  it('识别脚本/shell', () => {
    expect(classifyActivity('python script.py')).toBe('script')
    expect(classifyActivity('node index.js')).toBe('script')
    expect(classifyActivity('bash')).toBe('shell')
  })

  it('未知命令回退 other', () => {
    expect(classifyActivity('some-unknown-tool --flag')).toBe('other')
  })

  it('避免子串误判（lint 关键字嵌在路径中不命中）', () => {
    expect(classifyActivity('open eslint-config-foo.js')).toBe('other')
  })
})

describe('activityLabel', () => {
  it('返回可读标签', () => {
    expect(activityLabel('test')).toBe('运行测试')
    expect(activityLabel('dev-server')).toBe('开发服务器')
    expect(activityLabel('other')).toBe('任务')
  })
})

function makeRow(over: Partial<AgentRow>): AgentRow {
  return {
    id: 'x',
    kind: 'codex',
    label: 'Codex',
    icon: '🤖',
    status: 'running',
    cpu: 5,
    memMB: 100,
    ports: [],
    taskCount: 0,
    tasks: [],
    ...over
  }
}

describe('evaluateHealth', () => {
  it('孤儿态判为 abnormal', () => {
    const h = evaluateHealth(makeRow({ status: 'orphan' }))
    expect(h.level).toBe('abnormal')
  })

  it('长时间无活动判为 suspicious', () => {
    const h = evaluateHealth(
      makeRow({ cpu: 0, taskCount: 0, lastActiveAt: Date.now() - 11 * 60 * 1000 })
    )
    expect(h.level).toBe('suspicious')
  })

  it('CPU 高判为 suspicious', () => {
    const h = evaluateHealth(makeRow({ cpu: 95, lastActiveAt: Date.now() }))
    expect(h.level).toBe('suspicious')
  })

  it('正常活动判为 healthy', () => {
    const h = evaluateHealth(makeRow({ cpu: 10, taskCount: 1, lastActiveAt: Date.now() }))
    expect(h.level).toBe('healthy')
  })
})
