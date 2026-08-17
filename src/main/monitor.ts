import { EventEmitter } from 'events'
import { cpus } from 'os'
import type { AppRuntime, MonitorSnapshot, PortAlert, ProcessInfo } from '../shared/types'
import { guessCwd } from './projectDetect'
import { buildOwnTree, classifyOrigin, scanPorts } from './portScanner'
import type { ScanData } from './portScanner'
import type { ConfigStore } from './config'
import type { ProcessManager } from './processManager'

const SCAN_INTERVAL = 5000

const SYSTEM_NOISE = new Set([
  'system',
  'registry',
  'smss.exe',
  'csrss.exe',
  'wininit.exe',
  'winlogon.exe',
  'services.exe',
  'lsass.exe',
  'fontdrvhost.exe',
  'dwm.exe',
  'dllhost.exe',
  'conhost.exe',
  'sihost.exe',
  'taskhostw.exe',
  'runtimebroker.exe',
  'svchost.exe',
  'spoolsv.exe',
  'audiodg.exe',
  'msmpeng.exe',
  'nissrv.exe',
  'securityhealthservice.exe',
  'searchindexer.exe',
  'explorer.exe',
  'winlogon.exe',
  'wininit.exe',
  'backgroundtaskhost.exe',
  'textinputhost.exe'
])

export class MonitorService extends EventEmitter {
  private timer: NodeJS.Timeout | null = null
  private prevPerf = new Map<number, { cpu: number; ts: number }>()
  private knownPorts = new Set<number>()
  private dismissedPorts = new Set<number>()
  private lastScan: ScanData | null = null
  private lastSnapshot: MonitorSnapshot | null = null
  private scanning = false
  private firstScan = true

  constructor(
    private cfg: ConfigStore,
    private pm: ProcessManager
  ) {
    super()
  }

  start(): void {
    void this.tick()
    this.timer = setInterval(() => void this.tick(), SCAN_INTERVAL)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  getLastSnapshot(): MonitorSnapshot | null {
    return this.lastSnapshot
  }

  private ack(port: number): void {
    this.dismissedPorts.add(port)
    this.knownPorts.add(port)
    this.emit('alerts-changed', this.pendingAlerts().filter((a) => a.port !== port))
  }

  dismiss(port: number): void {
    this.ack(port)
  }

  ignore(port: number): void {
    this.ack(port)
  }

  hide(port: number): void {
    this.ack(port)
  }

  private pendingAlerts(): PortAlert[] {
    return this.lastAlerts
  }

  private lastAlerts: PortAlert[] = []

  findPortProcess(port: number): { pid: number; name: string; cmdline: string; dir?: string } | null {
    const s = this.lastScan
    if (!s) return null
    const conn = s.conns.find((c) => c.port === port)
    if (!conn) return null
    const p = s.procs.get(conn.pid)
    return {
      pid: conn.pid,
      name: p?.name ?? `PID ${conn.pid}`,
      cmdline: p?.cmd ?? '',
      dir: p ? guessCwd(p.cmd) : undefined
    }
  }

  private async tick(): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    try {
      const data = await scanPorts()
      this.lastScan = data
      this.processScan(data)
    } catch (err) {
      console.error('端口扫描失败', err)
    } finally {
      this.scanning = false
    }
  }

  private processScan(data: ScanData): void {
    const ownTree = buildOwnTree(data)
    const children = buildChildrenMap(data)
    const now = Date.now()
    const cpuByPid = new Map<number, number>()
    for (const [pid, perf] of data.perf) {
      const prev = this.prevPerf.get(pid)
      if (prev) {
        const dt = Math.max((now - prev.ts) / 1000, 0.001)
        const delta = Math.max(perf.cpu - prev.cpu, 0)
        cpuByPid.set(pid, Math.min(99, Math.round(((delta / dt) * 100) * 10) / 10))
      }
      this.prevPerf.set(pid, { cpu: perf.cpu, ts: now })
    }
    if (this.prevPerf.size > data.perf.size * 2 + 64) {
      for (const pid of [...this.prevPerf.keys()]) {
        if (!data.perf.has(pid)) this.prevPerf.delete(pid)
      }
    }

    const portPids = new Map<number, number[]>()
    for (const c of data.conns) {
      const list = portPids.get(c.pid) ?? []
      list.push(c.port)
      portPids.set(c.pid, list)
    }

    const services: ProcessInfo[] = []
    const background: ProcessInfo[] = []
    for (const [pid, p] of data.procs) {
      if (ownTree.has(pid)) continue
      const perf = data.perf.get(pid)
      const ports = portPids.get(pid) ?? []
      const visiblePorts = ports.filter((port) => !this.cfg.isPortHidden(port))
      const claimedBy = this.findClaimedApp(pid)
      const info: ProcessInfo = {
        pid,
        ppid: p.ppid,
        name: p.name,
        cmdline: p.cmd ?? '',
        dir: guessCwd(p.cmd),
        createdAt: p.created || now,
        cpu: cpuByPid.get(pid) ?? 0,
        memMB: perf ? Math.round((perf.mem / 1048576) * 10) / 10 : 0,
        ports,
        origin: classifyOrigin(pid, data.procs, ownTree),
        claimedBy
      }
      if (ports.length) {
        if (!visiblePorts.length) continue
        info.ports = visiblePorts
        services.push(info)
      } else if (!SYSTEM_NOISE.has(p.name.toLowerCase()) && (perf?.path || p.cmd)) {
        background.push(info)
      }
    }
    services.sort((a, b) => a.pid - b.pid)
    background.sort((a, b) => b.memMB - a.memMB)
    const trimmedBackground = background.slice(0, 80)

    const alerts: PortAlert[] = []
    const managedPorts = this.collectManagedPorts(data, children)
    for (const c of data.conns) {
      if (ownTree.has(c.pid)) continue
      if (
        this.knownPorts.has(c.port) ||
        this.dismissedPorts.has(c.port) ||
        this.cfg.isPortHidden(c.port) ||
        this.cfg.isPortIgnored(c.port)
      )
        continue
      this.knownPorts.add(c.port)
      if (managedPorts.has(c.port)) continue
      if (this.firstScan) continue
      const p = data.procs.get(c.pid)
      alerts.push({
        port: c.port,
        pid: c.pid,
        name: p?.name ?? `PID ${c.pid}`,
        cmdline: p?.cmd ?? '',
        dir: p ? guessCwd(p.cmd) : undefined,
        localAddress: c.addr,
        origin: p ? classifyOrigin(c.pid, data.procs, ownTree) : undefined
      })
    }
    this.firstScan = false
    if (alerts.length) {
      this.lastAlerts = [...this.lastAlerts, ...alerts]
      this.emit('alerts', alerts)
    }

    this.updateClaimed(data)
    this.updateManagedServices(data, children)

    let totalCpu = 0
    let totalMem = 0
    let memCapacity = 0
    if (data.os) {
      totalMem = (data.os.totalMemKB - data.os.freeMemKB) * 1024
      memCapacity = data.os.totalMemKB * 1024
    } else {
      // 回退：按进程工作集求和
      for (const perf of data.perf.values()) totalMem += perf.mem
      memCapacity = totalMem
    }
    const cpuPct = data.cpuPct
    if (cpuPct !== undefined && cpuPct >= 0 && cpuPct <= 100) {
      totalCpu = cpuPct
    } else {
      // 回退：按单进程差分求和
      for (const v of cpuByPid.values()) totalCpu += v
    }
    this.lastSnapshot = {
      ts: data.ts,
      services,
      background: trimmedBackground,
      stats: {
        serviceCount: services.length,
        backgroundCount: background.length,
        totalCpu: Math.round(totalCpu * 10) / 10,
        totalMemMB: Math.round((totalMem / 1048576) * 10) / 10,
        memCapacityMB: Math.round((memCapacity / 1048576) * 10) / 10,
        cores: cpus().length
      }
    }
    this.emit('snapshot', this.lastSnapshot)
  }

  private findClaimedApp(pid: number): string | undefined {
    return this.cfg.data.apps.find((a) => a.claimed?.pid === pid)?.id
  }

  private updateClaimed(data: ScanData): void {
    for (const app of this.cfg.data.apps) {
      const claimed = app.claimed
      if (!claimed?.pid || this.pm.hasChild(app.id)) continue
      const proc = data.procs.get(claimed.pid)
      const ports = data.conns.filter((c) => c.pid === claimed.pid).map((c) => c.port)
      if (proc) {
        const runtime: AppRuntime = {
          status: 'running',
          pid: claimed.pid,
          startedAt: claimed.startedAt,
          port: ports[0] ?? claimed.port,
          lastActiveAt: Date.now()
        }
        this.pm.applyExternalTick(app.id, runtime)
      } else {
        const runtime: AppRuntime = { status: 'stopped', error: '外部进程已退出', lastActiveAt: Date.now() }
        this.pm.applyExternalTick(app.id, runtime)
        this.emit('claimed-expired', app.id)
      }
    }
  }

  private collectManagedPorts(data: ScanData, children: Map<number, number[]>): Set<number> {
    const ports = new Set<number>()
    const connPids = new Set<number>()
    for (const c of data.conns) connPids.add(c.pid)
    for (const app of this.cfg.data.apps) {
      const m = this.pm.getManaged(app.id)
      if (!m?.pid) continue
      const tree = descendants(m.pid, children)
      for (const pid of tree) {
        if (connPids.has(pid)) {
          for (const c of data.conns) {
            if (c.pid === pid) ports.add(c.port)
          }
        }
      }
    }
    return ports
  }

  private updateManagedServices(data: ScanData, children: Map<number, number[]>): void {
    const connPids = new Set<number>()
    for (const c of data.conns) connPids.add(c.pid)

    for (const app of this.cfg.data.apps) {
      const m = this.pm.getManaged(app.id)
      if (!m?.child || m.status !== 'starting' || !m.pid) continue
      let foundPort: number | undefined
      for (const pid of descendants(m.pid, children)) {
        if (connPids.has(pid)) {
          foundPort = data.conns.find((c) => c.pid === pid)?.port
          break
        }
      }
      if (foundPort) {
        this.pm.markRunning(app.id, foundPort)
      } else if (Date.now() - (m.startedAt ?? Date.now()) > 15000) {
        this.pm.markRunning(app.id)
      }
    }
  }
}

function buildChildrenMap(data: ScanData): Map<number, number[]> {
  const children = new Map<number, number[]>()
  for (const p of data.procs.values()) {
    const list = children.get(p.ppid) ?? []
    list.push(p.pid)
    children.set(p.ppid, list)
  }
  return children
}

function descendants(root: number, children: Map<number, number[]>): number[] {
  const out: number[] = []
  const stack = [root]
  const seen = new Set<number>()
  while (stack.length) {
    const cur = stack.pop() as number
    if (seen.has(cur)) continue
    seen.add(cur)
    out.push(cur)
    for (const c of children.get(cur) ?? []) stack.push(c)
  }
  return out
}
