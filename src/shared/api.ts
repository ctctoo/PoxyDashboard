import type {
  AppConfig,
  AppEntry,
  AppInfo,
  AppKind,
  AppRuntime,
  ConfigFile,
  ContainerRow,
  DbRow,
  DetectionResult,
  HiddenPortEntry,
  LogLine,
  MonitorSnapshot,
  NewAppInput,
  PortAlert,
  Settings,
  ValidationResult
} from './types'

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
  shortcut: 'palette' | 'logs'
  nav: 'launchpad' | 'monitor' | 'logs' | 'settings'
}

export type AppEventChannel = keyof AppEvents

export type { AppKind }
