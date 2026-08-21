import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findExecutable, hasShellSyntax, parseCommand, pickExecutablePath, tokenize } from '../src/main/commands'

describe('tokenize', () => {
  it('处理引号与空白', () => {
    expect(tokenize('node "C:\\Program Files\\app.js" --port 8080')).toEqual([
      'node',
      'C:\\Program Files\\app.js',
      '--port',
      '8080'
    ])
  })

  it('处理空字符串', () => {
    expect(tokenize('   ')).toEqual([])
  })
})

describe('parseCommand', () => {
  it('解析简单命令', () => {
    expect(parseCommand('pnpm run dev')).toEqual({ exe: 'pnpm', args: ['run', 'dev'], shell: false })
  })

  it('带引号的参数保持内容', () => {
    expect(parseCommand('python "D:\\my dir\\a.py"')).toEqual({
      exe: 'python',
      args: ['D:\\my dir\\a.py'],
      shell: false
    })
  })
})

describe('hasShellSyntax', () => {
  it('识别管道与重定向', () => {
    expect(hasShellSyntax('cmd1 | cmd2')).toBe(true)
    expect(hasShellSyntax('cmd1 > out.txt')).toBe(true)
    expect(hasShellSyntax('cmd1 && cmd2')).toBe(true)
  })

  it('引号内的特殊字符不算', () => {
    expect(hasShellSyntax('node -e "console.log(1 > 0)"')).toBe(false)
  })

  it('普通命令不算', () => {
    expect(hasShellSyntax('npm run build')).toBe(false)
  })
})

describe('pickExecutablePath', () => {
  it('where.exe 同时返回无扩展名脚本与 .cmd 时，优先选择带扩展名的可执行文件', () => {
    expect(pickExecutablePath(['D:\\nodeJs\\npm', 'D:\\nodeJs\\npm.cmd'])).toBe('D:\\nodeJs\\npm.cmd')
  })

  it('仅有无扩展名路径时回退到第一行', () => {
    expect(pickExecutablePath(['D:\\nodeJs\\npm'])).toBe('D:\\nodeJs\\npm')
  })

  it('空行与空输入返回 null', () => {
    expect(pickExecutablePath([])).toBeNull()
    expect(pickExecutablePath(['', '  '])).toBeNull()
  })

  it('保留非扩展名路径的正常选择', () => {
    expect(pickExecutablePath(['/usr/bin/npm', '/usr/bin/node'])).toBe('/usr/bin/npm')
  })
})

describe('findExecutable', () => {
  it('PATH 找不到时可按项目 bin 目录解析可执行文件', () => {    const dir = mkdtempSync(join(tmpdir(), 'dashboard-exe-'))
    const binDir = join(dir, 'bin')
    mkdirSync(binDir, { recursive: true })
    const name = `probe-${Date.now()}-tool`
    writeFileSync(join(binDir, `${name}.exe`), '', 'binary')
    try {
      expect(findExecutable(name, dir)).toBe(join(binDir, `${name}.exe`))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('可按工作目录解析 .\\ 开头的 wrapper 命令（如 mvnw.cmd）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-exe-'))
    writeFileSync(join(dir, 'mvnw.cmd'), '@echo off', 'utf8')
    try {
      expect(findExecutable('.\\mvnw.cmd', dir)).toBe(join(dir, 'mvnw.cmd'))
      expect(findExecutable('./mvnw.cmd', dir)).toBe(join(dir, 'mvnw.cmd'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('wrapper 不存在时不返回绝对路径', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-exe-'))
    try {
      expect(findExecutable('.\\missing.cmd', dir)).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('常见安装目录中的 mongod 可被解析', () => {
    const p = findExecutable('mongod')
    if (process.platform === 'win32' && p) {
      expect(p.toLowerCase()).toContain('mongod')
    }
  })
})
