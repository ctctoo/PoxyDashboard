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
  /** 启动台布局：宫格 / 列表 */
  launchpadView: 'grid' | 'list'
}

/** 用户自定义的 AI agent（非内置目录中的） */
export interface CustomAgent {
  kind: string
  label: string
  icon: string
  /** 启动命令（如 `codex` 或 `my-agent`） */
  command: string
  /** 默认工作目录（可空） */
  dir?: string
  /** 启动时是否携带工作目录参数 */
  withDirArg: boolean
  createdAt: number
}

/** agent 任务进程的活动类型（由命令行启发式识别） */
export type AgentActivity =
  'test' | 'build' | 'dev-server' | 'install' | 'script' | 'shell' | 'git' | 'lint' | 'other'

/** agent 健康度评估结果 */
export interface AgentHealth {
  level: 'healthy' | 'suspicious' | 'abnormal'
  message: string
  /** 一句诊断/建议文案 */
  suggestion?: string
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
  /** 每个 AI agent（按 kind）一键启动时使用的工作目录 */
  agentDirs: Record<string, string>
  /** 用户自定义 agent */
  customAgents: CustomAgent[]
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

/** 常见数据库引擎 */
export type DbKind =
  | 'mysql'
  | 'postgres'
  | 'sqlserver'
  | 'oracle'
  | 'redis'
  | 'mongodb'
  | 'sqlite'
  | 'mariadb'
  | 'clickhouse'
  | 'elasticsearch'
  | 'kafka'
  | 'memcached'
  | 'neo4j'
  | 'cassandra'
  | 'influxdb'

/** 扫描识别出的数据库实例（含默认控制命令） */
export interface DbInfo {
  kind: DbKind
  label: string
  icon: string
  version?: string
  /** Windows 服务名（识别到时通过 sc 控制） */
  service?: string
  /** 启动命令（来自服务注册表 / 可执行文件路径） */
  start?: string
  /** 停止命令（来自服务注册表 / 已知二进制） */
  stop?: string
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
  /** 数据库实例信息（识别为常见数据库时存在） */
  db?: DbInfo
}

export interface MonitorStats {
  serviceCount: number
  backgroundCount: number
  totalCpu: number
  totalMemMB: number
  memCapacityMB: number
  cores: number
}

export type DbRowStatus = 'running' | 'starting' | 'stopping' | 'stopped'

/** Docker 容器运行状态（简化） */
export type ContainerState = 'running' | 'starting' | 'stopping' | 'stopped'

/** 监控视图中的 Docker 容器行 */
export interface ContainerRow {
  id: string
  name: string
  image: string
  status: ContainerState
  /** docker 原始状态文本，如 "Up 5 minutes" */
  statusText?: string
  /** 宿主机监听端口 */
  ports: number[]
  /** 原始端口映射展示文本 */
  portMap?: string
  lastActiveAt: number
}

/** 监控视图中的数据库行（简化展示：运行状态 + 启停控制） */
export interface DbRow {
  id: string
  kind: DbKind
  label: string
  icon: string
  version?: string
  port?: number
  pid?: number
  status: DbRowStatus
  /** Windows 服务名（识别到时通过服务启停） */
  service?: string
  /** 启动命令 */
  start?: string
  /** 优雅停止命令 */
  stop?: string
  cmdline?: string
  dir?: string
  lastActiveAt: number
}

/** Agent 派生的单个任务进程 */
export interface AgentTaskProcess {
  pid: number
  name: string
  cmdline: string
  cpu: number
  memMB: number
  ports: number[]
  createdAt: number
  /** 活动类型（命令行启发式识别） */
  activity: AgentActivity
  /** 活动的一句话描述（如「运行测试」） */
  activityLabel: string
}

/** 一个 AI agent（应用本体 + 派生任务）聚合行 */
export interface AgentRow {
  /** 稳定标识（agent 根进程 pid，或 `${kind}:${firstPid}`） */
  id: string
  /** 'codex' | 'cursor' | 'claude' | 'kimi' | 'chatgpt' | 'gemini' | 'windsurf' | 'cline' | 'opencode' | 'ai'（含自定义 kind） */
  kind: string
  label: string
  icon: string
  /** running=有任务进程或监听端口；idle=仅应用本体空闲；not-running=已安装但未启动；orphan=根已失活但留有孤儿任务 */
  status: 'running' | 'idle' | 'not-running' | 'orphan'
  /** agent 应用根进程 pid（未启动时无；orphan 时可能已失活） */
  pid?: number
  createdAt?: number
  /** 整树 CPU 汇总（%） */
  cpu: number
  /** 整树内存汇总（MB） */
  memMB: number
  /** 整树监听端口 */
  ports: number[]
  /** 派生任务进程数 */
  taskCount: number
  tasks: AgentTaskProcess[]
  /** 是否由用户自定义 agent（非内置目录） */
  custom?: boolean
  /** 最近活动时间戳（末次任务进程启动/心跳） */
  lastActiveAt?: number
  /** 健康度评估（运行/孤儿态时存在） */
  health?: AgentHealth
  /** 已安装但未运行时的探测到的启动命令（可一键启动） */
  launchCommand?: string
  /** 统计：本会话累计运行时长（ms） */
  totalRunMs?: number
}

export interface MonitorSnapshot {
  ts: number
  services: ProcessInfo[]
  background: ProcessInfo[]
  dbs: DbRow[]
  containers: ContainerRow[]
  stats: MonitorStats
  agents: AgentRow[]
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
