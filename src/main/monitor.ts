import { EventEmitter } from 'events'
import { cpus } from 'os'
import type {
  AgentRow,
  AppRuntime,
  ContainerRow,
  DbRow,
  MonitorSnapshot,
  PortAlert,
  ProcessInfo
} from '../shared/types'
import { killTree, spawnCommandLine } from './commands'
import { identifyDb } from './dbDetect'
import { parseDockerPortMap, parseDockerPorts, scanDocker } from './dockerScan'
import type { RawContainer } from './dockerScan'
import { guessCwd } from './projectDetect'
import { buildOwnTree, classifyOrigin, scanPorts } from './portScanner'
import type { ScanData } from './portScanner'
import type { ConfigStore } from './config'
import type { ProcessManager } from './processManager'
import { aggregateAgents, evaluateHealth } from './agentAggregator'

const SCAN_INTERVAL = 5000
/** Docker 扫描间隔：每 3 个端口扫描周期执行一次（约 15s） */
const DOCKER_SCAN_INTERVAL = 3

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
  /** 会话内数据库实例表（含已停止的记录，支持重新启动） */
  private dbRows = new Map<string, DbRow>()
  /** 会话内容器表（含已停止的记录，支持重新启动） */
  private containerRows = new Map<string, ContainerRow>()
  private scanCount = 0
  /** 会话内 agent 累计运行时长（ms）：kind → 累计 */
  private agentRunTotal = new Map<string, number>()
  /** 每轮记录各 agent 是否在运行，用于累计 */
  private agentLastSeen = new Map<string, number>()

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

  /** 当前待处理（未忽略）的新端口提醒数 */
  getPendingAlertCount(): number {
    return this.lastAlerts.length
  }

  private ack(port: number): void {
    this.dismissedPorts.add(port)
    this.knownPorts.add(port)
    this.emit(
      'alerts-changed',
      this.pendingAlerts().filter((a) => a.port !== port)
    )
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

  findPortProcess(
    port: number
  ): { pid: number; name: string; cmdline: string; dir?: string } | null {
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

  getDbRows(): DbRow[] {
    return [...this.dbRows.values()]
  }

  private emitDbChanged(): void {
    this.emit('db:changed', this.getDbRows())
  }

  getContainers(): ContainerRow[] {
    return [...this.containerRows.values()].sort((a, b) => {
      const sa = a.status === 'running' ? 0 : 1
      const sb = b.status === 'running' ? 0 : 1
      return sa - sb || a.name.localeCompare(b.name)
    })
  }

  private emitContainersChanged(): void {
    this.emit('containers:changed', this.getContainers())
  }

  /** 停止容器：执行 docker stop 优雅停止 */
  async stopContainer(id: string): Promise<ContainerRow | undefined> {
    const row = this.containerRows.get(id)
    if (!row) return undefined
    if (row.status !== 'running') return row
    this.containerRows.set(id, { ...row, status: 'stopping', lastActiveAt: Date.now() })
    this.emitContainersChanged()
    await this.runControl(`docker stop ${row.id}`)
    return this.containerRows.get(id)
  }

  /** 启动容器：执行 docker start */
  async startContainer(id: string): Promise<ContainerRow | undefined> {
    const row = this.containerRows.get(id)
    if (!row) return undefined
    if (row.status === 'running' || row.status === 'starting') return row
    this.containerRows.set(id, { ...row, status: 'starting', lastActiveAt: Date.now() })
    this.emitContainersChanged()
    await this.runControl(`docker start ${row.id}`)
    return this.containerRows.get(id)
  }

  /** 停止数据库：优先优雅关闭命令，其次服务停止，最后强制结束进程树 */
  async stopDb(id: string): Promise<DbRow | undefined> {
    const row = this.dbRows.get(id)
    if (!row) return undefined
    if (row.status !== 'running') return row
    const pid = row.pid
    this.dbRows.set(id, { ...row, status: 'stopping', lastActiveAt: Date.now() })
    this.emitDbChanged()

    if (row.stop) {
      await this.runControl(row.stop, row.dir)
    }
    if (pid) {
      await delay(2500)
      if (this.isPidAlive(pid) && row.service) {
        await this.runControl(`sc stop "${row.service}"`)
      }
      await delay(2500)
      if (pid && this.isPidAlive(pid)) {
        await killTree(pid)
      }
    }
    this.emitDbChanged()
    return this.dbRows.get(id)
  }

  /** 启动数据库：有服务名走服务启动，否则按原命令行 detached 拉起 */
  async startDb(id: string): Promise<DbRow | undefined> {
    const row = this.dbRows.get(id)
    if (!row) return undefined
    if (row.status === 'running' || row.status === 'starting') return row
    this.dbRows.set(id, { ...row, status: 'starting', lastActiveAt: Date.now() })
    this.emitDbChanged()

    if (row.service) {
      await this.runControl(`sc start "${row.service}"`)
    } else if (row.start) {
      try {
        const child = spawnCommandLine(row.start, { cwd: row.dir, detached: true })
        child.unref?.()
        child.on('error', () => undefined)
      } catch {
        /* 启动失败由下一轮扫描反映 */
      }
    }
    this.emitDbChanged()
    return this.dbRows.get(id)
  }

  dismissDb(id: string): void {
    if (this.dbRows.delete(id)) this.emitDbChanged()
  }

  private isPidAlive(pid: number): boolean {
    if (this.lastScan && this.lastScan.procs.has(pid)) return true
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  private runControl(cmd: string, cwd?: string): Promise<void> {
    return new Promise((resolve) => {
      let child
      try {
        child = spawnCommandLine(cmd, { cwd })
      } catch {
        resolve()
        return
      }
      const timer = setTimeout(() => {
        try {
          child.kill()
        } catch {
          /* 忽略 */
        }
      }, 8000)
      child.on('close', () => {
        clearTimeout(timer)
        resolve()
      })
      child.on('error', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  private async tick(): Promise<void> {
    if (this.scanning) return
    this.scanning = true
    try {
      const data = await scanPorts()
      this.lastScan = data
      this.processScan(data)
      if (++this.scanCount % DOCKER_SCAN_INTERVAL === 0) await this.scanContainers()
    } catch (err) {
      console.error('端口扫描失败', err)
    } finally {
      this.scanning = false
    }
  }

  private async scanContainers(): Promise<void> {
    try {
      const result = await scanDocker()
      if (!result.ok) return
      this.syncContainers(result.items)
    } catch {
      /* docker 扫描失败忽略，下一轮重试 */
    }
  }

  /** 根据 docker ps 结果同步容器表：运行中的 upsert，消失的标记为已停止 */
  private syncContainers(raw: RawContainer[]): void {
    const now = Date.now()
    const seen = new Set<string>()
    for (const c of raw) {
      seen.add(c.id)
      const existing = this.containerRows.get(c.id)
      const row: ContainerRow = {
        id: c.id,
        name: c.name,
        image: c.image,
        status: 'running',
        statusText: c.status,
        ports: parseDockerPorts(c.ports),
        portMap: parseDockerPortMap(c.ports) || existing?.portMap,
        lastActiveAt: now
      }
      this.containerRows.set(c.id, row)
    }
    let changed = false
    for (const [id, row] of this.containerRows) {
      if (seen.has(id)) continue
      if (row.status === 'running' || row.status === 'starting' || row.status === 'stopping') {
        this.containerRows.set(id, { ...row, status: 'stopped', lastActiveAt: now })
        changed = true
      }
    }
    if (changed) this.emitContainersChanged()
  }

  private processScan(data: ScanData): void {
    const ownTree = buildOwnTree(data)
    const children = buildChildrenMap(data)

    const snapshot = this.buildSnapshot(data, ownTree, children)
    this.lastSnapshot = snapshot

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

    this.emit('snapshot', snapshot)
  }

  private buildSnapshot(
    data: ScanData,
    ownTree: Set<number>,
    children: Map<number, number[]>
  ): MonitorSnapshot {
    const now = Date.now()
    const cpuByPid = new Map<number, number>()
    for (const [pid, perf] of data.perf) {
      const prev = this.prevPerf.get(pid)
      if (prev) {
        const dt = Math.max((now - prev.ts) / 1000, 0.001)
        const delta = Math.max(perf.cpu - prev.cpu, 0)
        cpuByPid.set(pid, Math.min(99, Math.round((delta / dt) * 100 * 10) / 10))
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
        claimedBy,
        db: identifyDb({
          name: p.name,
          cmdline: p.cmd ?? '',
          binaryPath: perf?.path,
          port: ports.length ? Math.min(...ports) : undefined
        })
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
    const dbs = this.syncDbRows(services, data)
    const agents = this.buildAgentRows(data, ownTree, cpuByPid, children, now)
    return {
      ts: data.ts,
      services,
      background: trimmedBackground,
      dbs,
      containers: this.getContainers(),
      agents,
      stats: {
        serviceCount: services.length,
        backgroundCount: background.length,
        totalCpu: Math.round(totalCpu * 10) / 10,
        totalMemMB: Math.round((totalMem / 1048576) * 10) / 10,
        memCapacityMB: Math.round((memCapacity / 1048576) * 10) / 10,
        cores: cpus().length
      }
    }
  }

  /**
   * 构建 agent 行：只返回当前正在运行的 agent（应用本体 + 派生任务），并附加健康度与累计运行时长。
   * 已按要求去除：未安装 agent 探测合并、孤儿态、控制相关逻辑。
   */
  private buildAgentRows(
    data: ScanData,
    ownTree: Set<number>,
    cpuByPid: Map<number, number>,
    children: Map<number, number[]>,
    now: number
  ): AgentRow[] {
    const rows = aggregateAgents(data, ownTree, cpuByPid, children)
    // REQ-07 健康度
    for (const row of rows) {
      row.health = evaluateHealth(row)
    }
    // REQ-14 累计运行时长
    this.accumulateRunTime(rows, now)
    return rows
  }

  /** 累计各 agent 会话内运行时长（REQ-14）：按 kind 聚合，按扫描间隔累加 */
  private accumulateRunTime(rows: AgentRow[], now: number): void {
    for (const row of rows) {
      if (row.status === 'not-running') {
        this.agentLastSeen.delete(row.kind)
        continue
      }
      const prev = this.agentLastSeen.get(row.kind)
      if (prev !== undefined) {
        const delta = Math.max(0, now - prev)
        this.agentRunTotal.set(row.kind, (this.agentRunTotal.get(row.kind) ?? 0) + delta)
      }
      this.agentLastSeen.set(row.kind, now)
      row.totalRunMs = this.agentRunTotal.get(row.kind) ?? 0
    }
  }

  /** 根据本轮扫描结果同步数据库实例表：运行中的 upsert，消失的标记为已停止 */
  private syncDbRows(services: ProcessInfo[], data: ScanData): DbRow[] {
    const now = Date.now()
    const seen = new Set<string>()
    for (const s of services) {
      if (!s.db) continue
      const binaryPath = data.perf.get(s.pid)?.path
      const key = this.dbKey(s, binaryPath)
      seen.add(key)
      const existing = this.dbRows.get(key)
      const row: DbRow = {
        id: key,
        kind: s.db.kind,
        label: s.db.label,
        icon: s.db.icon,
        version: s.db.version,
        port: s.ports.length ? Math.min(...s.ports) : existing?.port,
        pid: s.pid,
        status: 'running',
        service: s.db.service ?? existing?.service,
        start: s.db.start ?? existing?.start,
        stop: s.db.stop ?? existing?.stop,
        cmdline: s.cmdline,
        dir: s.dir,
        lastActiveAt: now
      }
      this.dbRows.set(key, row)
    }
    for (const [key, row] of this.dbRows) {
      if (seen.has(key)) continue
      if (row.status === 'running' || row.status === 'starting' || row.status === 'stopping') {
        this.dbRows.set(key, { ...row, status: 'stopped', pid: undefined, lastActiveAt: now })
      }
    }
    // 限制会话内记录数量，防止无界增长
    if (this.dbRows.size > 80) {
      const sorted = [...this.dbRows.values()].sort((a, b) => a.lastActiveAt - b.lastActiveAt)
      for (const r of sorted.slice(0, this.dbRows.size - 80)) this.dbRows.delete(r.id)
    }
    return [...this.dbRows.values()].sort((a, b) => {
      const sa =
        a.status === 'running' || a.status === 'starting' || a.status === 'stopping' ? 0 : 1
      const sb =
        b.status === 'running' || b.status === 'starting' || b.status === 'stopping' ? 0 : 1
      return sa - sb || (a.port ?? 0) - (b.port ?? 0)
    })
  }

  private dbKey(s: ProcessInfo, binaryPath?: string | null): string {
    if (binaryPath) return `bin:${binaryPath.toLowerCase()}`
    const base = (s.cmdline || '').replace(/\d+/g, '').toLowerCase()
    return `cmd:${s.db!.kind}:${base}`
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
        const runtime: AppRuntime = {
          status: 'stopped',
          error: '外部进程已退出',
          lastActiveAt: Date.now()
        }
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

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
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
