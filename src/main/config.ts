import { app } from 'electron'
import { readFileSync } from 'fs'
import { promises as fs, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { AppConfig, ConfigFile, HiddenPortEntry, Settings } from '../shared/types'
import type { LoggerService } from './logger'

export function getDataDir(): string {
  return join(app.getPath('userData'), 'data')
}

export function getLogsDir(): string {
  return join(getDataDir(), 'logs')
}

export function getConfigPath(): string {
  return join(getDataDir(), 'config.json')
}

function defaults(): ConfigFile {
  return {
    version: 1,
    apps: [],
    focusKeywords: [],
    hiddenPorts: [],
    ignoredPorts: [],
    settings: { notifyTaskComplete: true, theme: 'auto', launchpadView: 'grid' }
  }
}

export class ConfigStore {
  private cfg: ConfigFile = defaults()
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private logger?: LoggerService) {
    mkdirSync(getLogsDir(), { recursive: true })
    this.load()
  }

  private load(): void {
    try {
      if (existsSync(getConfigPath())) {
        const raw = JSON.parse(readFileSync(getConfigPath(), 'utf8')) as Partial<ConfigFile>
        this.cfg = {
          ...defaults(),
          ...raw,
          settings: { ...defaults().settings, ...(raw.settings ?? {}) },
          apps: Array.isArray(raw.apps) ? raw.apps : [],
          focusKeywords: Array.isArray(raw.focusKeywords) ? raw.focusKeywords : [],
          hiddenPorts: Array.isArray(raw.hiddenPorts) ? raw.hiddenPorts : [],
          ignoredPorts: Array.isArray(raw.ignoredPorts) ? raw.ignoredPorts : []
        }
        this.logger?.business(`加载配置成功（${this.cfg.apps.length} 个应用）`)
      }
    } catch {
      this.cfg = defaults()
      this.logger?.business('配置加载失败，已回退到默认配置')
    }
  }

  get data(): ConfigFile {
    return this.cfg
  }

  getApp(id: string): AppConfig | undefined {
    return this.cfg.apps.find((a) => a.id === id)
  }

  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      void (async () => {
        try {
          const tmp = `${getConfigPath()}.tmp`
          await fs.writeFile(tmp, JSON.stringify(this.cfg, null, 2), 'utf8')
          await fs.rename(tmp, getConfigPath())
        } catch (err) {
          this.logger?.business(`配置保存失败：${(err as Error).message}`)
          console.error('配置保存失败', err)
        }
      })()
    }, 120)
  }

  updateSettings(patch: Partial<Settings>): Settings {
    this.cfg.settings = { ...this.cfg.settings, ...patch }
    this.save()
    return this.cfg.settings
  }

  addApp(app: AppConfig): AppConfig {
    this.cfg.apps.push(app)
    this.save()
    return app
  }

  updateApp(id: string, patch: Partial<AppConfig>): AppConfig | undefined {
    const idx = this.cfg.apps.findIndex((a) => a.id === id)
    if (idx === -1) return undefined
    this.cfg.apps[idx] = { ...this.cfg.apps[idx], ...patch, id }
    this.save()
    return this.cfg.apps[idx]
  }

  removeApp(id: string): void {
    this.cfg.apps = this.cfg.apps.filter((a) => a.id !== id)
    this.save()
  }

  reorderApps(ids: string[]): void {
    const byId = new Map(this.cfg.apps.map((a) => [a.id, a]))
    const next: AppConfig[] = []
    for (const id of ids) {
      const app = byId.get(id)
      if (app) next.push(app)
    }
    for (const a of this.cfg.apps) {
      if (!byId.has(a.id) || !ids.includes(a.id)) next.push(a)
    }
    this.cfg.apps = next
    this.save()
  }

  addFocusKeyword(kw: string): void {
    const k = kw.trim()
    if (k && !this.cfg.focusKeywords.includes(k)) {
      this.cfg.focusKeywords.push(k)
      this.save()
    }
  }

  removeFocusKeyword(kw: string): void {
    this.cfg.focusKeywords = this.cfg.focusKeywords.filter((k) => k !== kw)
    this.save()
  }

  hidePort(entry: HiddenPortEntry): void {
    this.cfg.hiddenPorts = this.cfg.hiddenPorts.filter((h) => h.port !== entry.port)
    this.cfg.hiddenPorts.push(entry)
    this.save()
  }

  unhidePort(port: number): void {
    this.cfg.hiddenPorts = this.cfg.hiddenPorts.filter((h) => h.port !== port)
    this.save()
  }

  isPortHidden(port: number): boolean {
    return this.cfg.hiddenPorts.some((h) => h.port === port)
  }

  addIgnoredPort(port: number): void {
    if (!this.cfg.ignoredPorts.includes(port)) {
      this.cfg.ignoredPorts.push(port)
      this.save()
    }
  }

  isPortIgnored(port: number): boolean {
    return this.cfg.ignoredPorts.includes(port)
  }
}
