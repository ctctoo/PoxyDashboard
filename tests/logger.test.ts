import { describe, expect, it } from 'vitest'
import { decodeLine } from '../src/main/logger'

describe('decodeLine', () => {
  it('UTF-8 中文正常解码', () => {
    expect(decodeLine(Buffer.from('服务启动成功', 'utf8'))).toBe('服务启动成功')
  })

  it('GBK 中文回退解码（Windows 控制台常见编码）', () => {
    expect(decodeLine(Buffer.from('b7fecef1c6f4b6afb3c9b9a6', 'hex'))).toBe('服务启动成功')
  })

  it('混合 ASCII 与 GBK 中文', () => {
    expect(decodeLine(Buffer.from('6c697374656e696e67206f6e20b6cbbfda2038303830', 'hex'))).toBe('listening on 端口 8080')
  })

  it('跨行边界字节由调用方按行切分', () => {
    const full = Buffer.concat([
      Buffer.from('b5dad2bbd0d0d6d0cec4', 'hex'),
      Buffer.from([0x0a]),
      Buffer.from('b5dab6fed0d0c8d5d6be', 'hex')
    ])
    const nl = full.indexOf(0x0a)
    expect(decodeLine(full.subarray(0, nl))).toBe('第一行中文')
    expect(decodeLine(full.subarray(nl + 1))).toBe('第二行日志')
  })
})
