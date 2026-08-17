import { EventEmitter } from 'events'
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import type { WriteStream } from 'fs'
import { join } from 'path'
import { TextDecoder } from 'util'
import type { LogLine } from '../shared/types'

const MAX_BUFFER = 4000
const MAX_FILE = 5 * 1024 * 1024

const utf8Strict = new TextDecoder('utf-8', { fatal: true })
const gbkDecoder = new TextDecoder('gbk')

/** 按行解码：优先严格 UTF-8，失败时回退 GBK，解决 Windows 下中文日志乱码 */
export function decodeLine(buf: Buffer): string {
  try {
    return utf8Strict.decode(buf)
  } catch {
    try {
      return gbkDecoder.decode(buf)
    } catch {
      return buf.toString('utf8')
    }
  }
}

export class LoggerService extends EventEmitter {
  private buffers = new Map<string, LogLine[]>()
  private streams = new Map<string, WriteStream>()

  constructor(private dir: string) {
    super()
    mkdirSync(dir, { recursive: true })
  }

  private sanitize(id: string): string {
    return id.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  private filePath(appId: string): string {
    return join(this.dir, `${this.sanitize(appId)}.log`)
  }

  private stream(appId: string): WriteStream {
    let s = this.streams.get(appId)
    if (!s) {
      const fp = this.filePath(appId)
      try {
        if (existsSync(fp) && statSync(fp).size > MAX_FILE) {
          renameSync(fp, `${fp}.old`)
        }
      } catch {
        /* 忽略轮转错误 */
      }
      s = createWriteStream(fp, { flags: 'a', encoding: 'utf8' })
      this.streams.set(appId, s)
    }
    return s
  }

  append(appId: string, stream: LogLine['stream'], text: string): void {
    const textLines = text.split(/\r?\n/)
    const lines: LogLine[] = []
    for (const t of textLines) {
      if (t.length === 0) continue
      lines.push({ t: Date.now(), stream, text: t })
    }
    if (!lines.length) return
    const buf = this.buffers.get(appId) ?? []
    buf.push(...lines)
    if (buf.length > MAX_BUFFER) buf.splice(0, buf.length - MAX_BUFFER)
    this.buffers.set(appId, buf)
    const s = this.stream(appId)
    for (const l of lines) s.write(`${l.text}\n`)
    this.emit('line', { appId, lines })
  }

  attach(appId: string, stdout: NodeJS.ReadableStream | null, stderr: NodeJS.ReadableStream | null): void {
    const partials = new Map<'out' | 'err', Buffer>([
      ['out', Buffer.alloc(0)],
      ['err', Buffer.alloc(0)]
    ])
    const consume = (stream: 'out' | 'err', chunk: Buffer): void => {
      let buf = Buffer.concat([partials.get(stream) ?? Buffer.alloc(0), chunk])
      let idx: number
      while ((idx = buf.indexOf(0x0a)) !== -1) {
        const line = buf.subarray(0, idx)
        buf = buf.subarray(idx + 1)
        const text = decodeLine(line).replace(/\r$/, '')
        if (text.length) this.append(appId, stream, text)
      }
      partials.set(stream, buf)
    }
    const flush = (stream: 'out' | 'err'): void => {
      const buf = partials.get(stream) ?? Buffer.alloc(0)
      if (buf.length) {
        const text = decodeLine(buf).replace(/\r$/, '')
        if (text.length) this.append(appId, stream, text)
      }
      partials.set(stream, Buffer.alloc(0))
    }
    stdout?.on('data', (chunk: Buffer) => consume('out', chunk))
    stdout?.on('close', () => flush('out'))
    stderr?.on('data', (chunk: Buffer) => consume('err', chunk))
    stderr?.on('close', () => flush('err'))
  }

  getLines(appId: string): LogLine[] {
    return [...(this.buffers.get(appId) ?? [])]
  }

  close(): void {
    for (const s of this.streams.values()) s.end()
    this.streams.clear()
  }
}
