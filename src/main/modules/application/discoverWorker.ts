import { parentPort, workerData } from 'worker_threads'
import { discoverApplications } from './discover'

/**
 * Module 2 · 应用发现工作线程
 *
 * 将「同步的 PowerShell / reg / 文件系统扫描」放到独立线程执行，
 * 避免阻塞 Electron 主进程事件循环导致界面无响应。
 * 主线程通过 postMessage 启动扫描，结果通过 postMessage 返回。
 */
export type DiscoverWorkerRequest = { type: 'discover' }

export interface DiscoverWorkerResponse {
  ok: boolean
  apps?: Array<{
    name: string
    path: string
    icon?: string
    category?: string
    source: string
  }>
  error?: string
}

const port = parentPort

if (port) {
  port.on('message', (_req: DiscoverWorkerRequest) => {
    try {
      const apps = discoverApplications()
      const res: DiscoverWorkerResponse = {
        ok: true,
        apps: apps.map((a) => ({
          name: a.name,
          path: a.path,
          icon: a.icon,
          category: a.category,
          source: a.source
        }))
      }
      port.postMessage(res)
    } catch (err) {
      const res: DiscoverWorkerResponse = { ok: false, error: (err as Error).message }
      port.postMessage(res)
    }
  })
}

// 仅作为类型引用保留 workerData，避免未使用告警
void workerData
