export type AppKind = 'service' | 'task'

export type AppStatus =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'success'
  | 'failed'
  | 'cancelled'
  | 'aborted'
  | 'error'

export interface AppConfig {
  id: string
  kind: AppKind
  name: string
  icon?: string
  /** 工作目录 */
  dir?: string
  /** 完整命令行，例如 pnpm run dev */
  command: string
  /** 脚本绝对路径（任务语义），仅保存路径，不复制内容 */
  scriptPath?: string
  /** 服务期望端口（可选，运行时端口以实际监听为准） */
  port?: number
  pinned?: boolean
  hidden?: boolean
  /** 原子认领的外部进程 */
  claimed?: { pid: number; startedAt: number; port?: number }
  createdAt: number
}

export interface AppRuntime {
  status: AppStatus
  pid?: number
  startedAt?: number
  exitCode?: number
  port?: number
  error?: string
  lastActiveAt?: number
}

export interface AppEntry extends AppConfig {
  runtime: AppRuntime
}

export interface NewAppInput {
  kind: AppKind
  name: string
  dir?: string
  command: string
  scriptPath?: string
  port?: number
  icon?: string
}

export interface Settings {
  notifyTaskComplete: boolean
  theme: 'auto' | 'light' | 'dark'
}

export interface HiddenPortEntry {
  port: number
  name: string
  pid: number
  hiddenAt: number
}

export interface ConfigFile {
  version: number
  apps: AppConfig[]
  focusKeywords: string[]
  hiddenPorts: HiddenPortEntry[]
  ignoredPorts: number[]
  settings: Settings
}

export interface DetectionCandidate {
  command: string
  kind: AppKind
  label: string
  port?: number
}

export interface DetectionResult {
  type: string
  candidates: DetectionCandidate[]
  notes?: string[]
}

export interface ValidationIssue {
  level: 'error' | 'warning'
  message: string
  fix?: string
}

export interface ValidationResult {
  ok: boolean
  issues: ValidationIssue[]
}

export type ProcessOriginKind = 'ai' | 'editor' | 'terminal' | 'system' | 'other' | 'this-app'

export interface ProcessOrigin {
  kind: ProcessOriginKind
  label: string
}

export interface ProcessInfo {
  pid: number
  ppid: number
  name: string
  cmdline: string
  dir?: string
  createdAt: number
  /** 单核百分比 */
  cpu: number
  memMB: number
  ports: number[]
  origin?: ProcessOrigin
  claimedBy?: string
}

export interface MonitorStats {
  serviceCount: number
  backgroundCount: number
  totalCpu: number
  totalMemMB: number
  memCapacityMB: number
  cores: number
}

export interface MonitorSnapshot {
  ts: number
  services: ProcessInfo[]
  background: ProcessInfo[]
  stats: MonitorStats
}

export interface PortAlert {
  port: number
  pid: number
  name: string
  cmdline: string
  dir?: string
  localAddress?: string
  origin?: ProcessOrigin
}

export interface LogLine {
  t: number
  stream: 'out' | 'err' | 'sys'
  text: string
}

export interface AppInfo {
  version: string
  port: number
  cwd: string
  dataDir: string
  electron: string
  node: string
  platform: string
}
