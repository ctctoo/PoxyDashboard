import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface RawContainer {
  id: string
  name: string
  image: string
  status: string
  state: string
  ports: string
  createdAt: string
}

export interface DockerScanResult {
  /** docker CLI 可用且执行成功 */
  ok: boolean
  items: RawContainer[]
}

/**
 * 扫描运行中的 Docker 容器。
 * 依赖 docker CLI（Docker Desktop / 引擎）。未安装或 daemon 未运行时不抛错，返回空列表。
 */
export async function scanDocker(): Promise<DockerScanResult> {
  if (process.platform !== 'win32') return { ok: false, items: [] }
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '--no-trunc', '--format', '{{json .}}'],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 10000 }
    )
    return { ok: true, items: parseDockerPs(stdout) }
  } catch {
    return { ok: false, items: [] }
  }
}

export function parseDockerPs(stdout: string): RawContainer[] {
  const out: RawContainer[] = []
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const r = JSON.parse(line) as {
        ID?: string
        Names?: string
        Image?: string
        Status?: string
        State?: string
        Ports?: string
        CreatedAt?: string
      }
      if (!r.ID) continue
      out.push({
        id: r.ID,
        name: r.Names ?? r.ID,
        image: r.Image ?? '',
        status: r.Status ?? '',
        state: r.State ?? '',
        ports: r.Ports ?? '',
        createdAt: r.CreatedAt ?? ''
      })
    } catch {
      /* 忽略无法解析的行 */
    }
  }
  return out
}

/** 从 docker ports 字符串中提取宿主机监听端口，如 `0.0.0.0:8080->8080/tcp, 3306/tcp` → [8080] */
export function parseDockerPorts(ports: string): number[] {
  const result = new Set<number>()
  for (const part of ports.split(',')) {
    const m = /(?:^|\s)(?:\d+\.\d+\.\d+\.\d+:|\[::\]:|0\.0\.0\.0:)?(\d{1,5})(?:->)/.exec(part.trim())
    const port = m ? Number(m[1]) : undefined
    if (port && port >= 1 && port <= 65535) result.add(port)
  }
  return [...result].sort((a, b) => a - b)
}

/** 将原始端口字符串转成友好展示，如 `0.0.0.0:8080->8080/tcp` */
export function parseDockerPortMap(ports: string): string {
  return ports
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(', ')
}
