import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { findExecutable, hasShellSyntax, parseCommand, tokenize } from '../src/main/commands'

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

describe('findExecutable', () => {
  it('PATH 找不到时可按项目 bin 目录解析可执行文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dashboard-exe-'))
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

  it('常见安装目录中的 mongod 可被解析', () => {
    const p = findExecutable('mongod')
    if (process.platform === 'win32' && p) {
      expect(p.toLowerCase()).toContain('mongod')
    }
  })
})
