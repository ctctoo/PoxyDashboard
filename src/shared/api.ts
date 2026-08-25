import type {
  AppConfig,
  AppEntry,
  AppInfo,
  AppKind,
  AppRuntime,
  ConfigFile,
  ContainerRow,
  DbRow,
  DangerousAction,
  DesktopApp,
  DetectionResult,
  HiddenPortEntry,
  LocalModel,
  LocalModelConfig,
  LogLine,
  ModelEnv,
  MonitorSnapshot,
  NewAppInput,
  PortAlert,
  Settings,
  SystemOverview,
  ValidationResult,
  Workspace
} from './types'

/** 新增本地模型实例的输入 */
export interface ModelInput {
  name: string
  runtime: LocalModelConfig['runtime']
  model: string
  binPath?: string
  host?: string
  port?: number
  extraArgs?: string
  dir?: string
  pinned?: boolean
}

export interface Api {
  getConfig(): Promise<ConfigFile>
  updateSettings(patch: Partial<Settings>): Promise<Settings>

  getApps(): Promise<AppEntry[]>
  addApp(input: NewAppInput): Promise<AppConfig>
  updateApp(id: string, patch: Partial<AppConfig>): Promise<AppConfig>
  removeApp(id: string): Promise<void>
  reorderApps(ids: string[]): Promise<void>
  setAppPinned(id: string, v: boolean): Promise<void>
  setAppHidden(id: string, v: boolean): Promise<void>

  startApp(id: string): Promise<AppRuntime>
  stopApp(id: string): Promise<AppRuntime>
  restartApp(id: string): Promise<AppRuntime>
  stopAllApps(): Promise<void>
  validateApp(id: string): Promise<ValidationResult>

  pickDirectory(): Promise<string | null>
  pickScript(): Promise<string | null>
  pickExecutable(): Promise<string | null>
  detectProject(dir: string): Promise<DetectionResult>
  scriptCommand(path: string): Promise<DetectionResult>

  getLogLines(appId: string): Promise<LogLine[]>
  getMonitorState(): Promise<MonitorSnapshot | null>
  getHiddenPorts(): Promise<HiddenPortEntry[]>

  stopDb(id: string): Promise<DbRow | undefined>
  startDb(id: string): Promise<DbRow | undefined>
  dismissDb(id: string): Promise<void>

  stopContainer(id: string): Promise<ContainerRow | undefined>
  startContainer(id: string): Promise<ContainerRow | undefined>

  claimPort(port: number): Promise<AppConfig>
  dismissPort(port: number): Promise<void>
  ignorePort(port: number): Promise<void>
  hidePort(port: number): Promise<void>
  unhidePort(port: number): Promise<void>
  killProcess(pid: number): Promise<void>

  addFocusKeyword(kw: string): Promise<void>
  removeFocusKeyword(kw: string): Promise<void>

  openUrl(url: string): Promise<void>
  openPath(p: string): Promise<void>
  getAppInfo(): Promise<AppInfo>

  /* ---- Phase 1：Desktop Assistant 统一入口 ---- */
  // Module 2 · Application Manager
  listApplications(): Promise<DesktopApp[]>
  searchApplications(q: string): Promise<DesktopApp[]>
  syncDiscoveredApps(): Promise<{ added: number; total: number }>
  addApplication(name: string, path: string, category?: string): Promise<DesktopApp | null>
  setAppPinnedDesktop(id: string, v: boolean): Promise<DesktopApp | undefined>
  setAppCategory(id: string, category?: string): Promise<DesktopApp | undefined>
  removeApplication(id: string): Promise<void>
  launchApplication(id: string): Promise<void>
  recentApplications(): Promise<DesktopApp[]>

  // Module 4 · Workspace Manager
  listWorkspaces(): Promise<Workspace[]>
  searchWorkspaces(q: string): Promise<Workspace[]>
  addWorkspace(path: string): Promise<Workspace | null>
  setWorkspacePinned(id: string, v: boolean): Promise<Workspace | undefined>
  removeWorkspace(id: string): Promise<void>
  openWorkspace(id: string): Promise<void>
  startWorkspace(id: string): Promise<void>
  recentWorkspaces(): Promise<Workspace[]>

  // Module 1 · Home Dashboard
  getSystemOverview(): Promise<SystemOverview>

  // 安全：危险操作确认描述
  describeDangerous(action: string, target?: string): Promise<DangerousAction>

  // Module 8 · Local LLM
  detectModelEnvs(): Promise<ModelEnv[]>
  pickModelFile(): Promise<string | null>
  listModels(): Promise<LocalModel[]>
  addModel(input: ModelInput): Promise<LocalModel | null>
  updateModel(id: string, patch: Partial<LocalModelConfig>): Promise<LocalModel | undefined>
  removeModel(id: string): Promise<void>
  startModel(id: string): Promise<LocalModel>
  stopModel(id: string): Promise<LocalModel>
  buildModelCommand(input: ModelInput): Promise<string>

  on<T extends AppEventChannel>(channel: T, cb: (payload: AppEvents[T]) => void): () => void
}

export interface AppEvents {
  'apps:changed': ConfigFile
  'apps:runtime': { id: string; runtime: AppRuntime }
  'monitor:snapshot': MonitorSnapshot
  'monitor:alerts': PortAlert[]
  'db:changed': DbRow[]
  'containers:changed': ContainerRow[]
  'logs:append': { appId: string; lines: LogLine[] }
  'settings:changed': Settings
  'apps2:updated': DesktopApp[]
  'ws:updated': Workspace[]
  'models:changed': LocalModel[]
  'models:runtime': { id: string; model: LocalModel }
  shortcut: 'palette' | 'logs'
  nav:
    | 'launchpad'
    | 'monitor'
    | 'dbs'
    | 'docker'
    | 'agents'
    | 'logs'
    | 'settings'
    | 'home'
    | 'applications'
    | 'workspace'
    | 'models'
}

export type AppEventChannel = keyof AppEvents

export type { AppKind }
