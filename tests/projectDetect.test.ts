import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { detectProject, scriptCommand } from '../src/main/projectDetect'

let dirs: string[] = []

function makeProject(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'dashboard-test-'))
  dirs.push(dir)
  for (const [rel, content] of Object.entries(files)) {
    const fp = join(dir, rel)
    mkdirSync(join(dir, rel.split(/[\\/]/).slice(0, -1).join('/')), { recursive: true })
    writeFileSync(fp, content, 'utf8')
  }
  return dir
}

beforeEach(() => {
  dirs = []
})

afterEach(() => {
  for (const d of dirs) {
    try {
      rmSync(d, { recursive: true, force: true })
    } catch {
      /* 忽略清理错误 */
    }
  }
})

describe('detectProject', () => {
  it('识别 pnpm Node 项目并给出 dev 候选', () => {
    const dir = makeProject({
      'package.json': JSON.stringify({ scripts: { dev: 'vite', build: 'vite build' } }),
      'pnpm-lock.yaml': ''
    })
    const r = detectProject(dir)
    expect(r.type).toBe('Node (pnpm)')
    expect(r.candidates[0]?.command).toBe('pnpm run dev')
  })

  it('识别 Hugo 站点', () => {
    const dir = makeProject({ 'hugo.toml': 'baseURL = "https://example.org"' })
    const r = detectProject(dir)
    expect(r.candidates.some((c) => c.command === 'hugo server')).toBe(true)
  })

  it('识别 Django 服务', () => {
    const dir = makeProject({ 'manage.py': '#!/usr/bin/env python' })
    const r = detectProject(dir)
    expect(r.candidates.some((c) => c.command === 'python manage.py runserver')).toBe(true)
  })

  it('识别 FastAPI 服务', () => {
    const dir = makeProject({
      'main.py': 'from fastapi import FastAPI\napp = FastAPI()'
    })
    const r = detectProject(dir)
    expect(r.candidates.some((c) => c.command === 'uvicorn main:app --reload')).toBe(true)
  })

  it('识别 Go 与 Rust', () => {
    const goDir = makeProject({ 'go.mod': 'module example.com/x\n\ngo 1.22' })
    expect(detectProject(goDir).candidates.some((c) => c.command === 'go run .')).toBe(true)
    const rsDir = makeProject({ 'Cargo.toml': '[package]\nname = "x"' })
    expect(detectProject(rsDir).candidates.some((c) => c.command === 'cargo run')).toBe(true)
  })

  it('识别静态站点', () => {
    const dir = makeProject({ 'index.html': '<h1>hi</h1>' })
    const r = detectProject(dir)
    expect(r.candidates.some((c) => c.label.includes('静态站点'))).toBe(true)
  })

  it('识别 MongoDB 配置目录', () => {
    const dir = makeProject({ 'mongod.cfg': 'storage:\n  dbPath: data/db' })
    const r = detectProject(dir)
    expect(r.candidates.some((c) => c.command.startsWith('mongod --config'))).toBe(true)
  })

  it('无效目录返回错误', () => {
    const r = detectProject(join(tmpdir(), 'not-exist-xyz'))
    expect(r.type).toBe('无效目录')
    expect(r.candidates).toHaveLength(0)
  })
})

describe('scriptCommand', () => {
  it('Python 脚本生成 python 命令且默认为任务', () => {
    const dir = makeProject({ 'job.py': 'print(1)' })
    const p = join(dir, 'job.py')
    const r = scriptCommand(p)
    expect(r.candidates[0]?.command).toContain('python')
    expect(r.candidates[0]?.kind).toBe('task')
  })

  it('PowerShell 脚本生成 powershell 命令', () => {
    const dir = makeProject({ 'job.ps1': 'Write-Host hi' })
    const r = scriptCommand(join(dir, 'job.ps1'))
    expect(r.candidates[0]?.command).toContain('-ExecutionPolicy Bypass')
  })

  it('不存在的脚本返回错误', () => {
    const r = scriptCommand(join(tmpdir(), 'missing.py'))
    expect(r.type).toBe('无效脚本')
  })
})
