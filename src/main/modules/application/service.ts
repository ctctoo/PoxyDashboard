import { randomUUID } from 'crypto'
import type { Database } from '../../storage/database'
import type { DesktopApp } from '../../../shared/types'
import type { LoggerService } from '../../logger'
import { discoverApplicationsAsync, isRunnable } from './discover'
import { eventBus } from '../../core/eventBus'

/**
 * Module 2：Application Manager
 * 管理本机应用：自动发现（Start Menu / Registry / Program Files / AppData）+ SQLite 持久化。
 * 支持启动 / 收藏 / 分类 / 删除记录 / FTS5 搜索。
 */
export class ApplicationService {
  constructor(
    private db: Database,
    private logger: LoggerService
  ) {}

  /** 全部已登记应用 */
  list(): DesktopApp[] {
    const rows = this.db.db
      .prepare(
        `SELECT id, name, path, icon, category, source, pinned, last_used, created_at
         FROM application ORDER BY pinned DESC, name COLLATE NOCASE ASC`
      )
      .all() as Array<{
      id: string
      name: string
      path: string
      icon: string | null
      category: string | null
      source: string | null
      pinned: number
      last_used: number | null
      created_at: number
    }>
    return rows.map((r) => this.row(r))
  }

  /** FTS5 搜索应用 */
  search(query: string, limit = 20): DesktopApp[] {
    const q = query.trim()
    if (!q) return this.list().slice(0, limit)
    const escaped = q.replace(/"/g, '""')
    const rows = this.db.db
      .prepare(
        `SELECT a.id, a.name, a.path, a.icon, a.category, a.source, a.pinned, a.last_used, a.created_at
         FROM application_fts f JOIN application a ON a.rowid = f.rowid
         WHERE application_fts MATCH ?
         ORDER BY bm25(application_fts) LIMIT ?`
      )
      .all(`"${escaped}"`, limit) as Array<{
      id: string
      name: string
      path: string
      icon: string | null
      category: string | null
      source: string | null
      pinned: number
      last_used: number | null
      created_at: number
    }>
    // MATCH 需规范 token，若查询无结果则回退到 LIKE 模糊
    if (!rows.length) {
      const like = `%${query}%`
      const likeRows = this.db.db
        .prepare(
          `SELECT id, name, path, icon, category, source, pinned, last_used, created_at
           FROM application WHERE name LIKE ? OR path LIKE ? ORDER BY pinned DESC, name LIMIT ?`
        )
        .all(like, like, limit) as Array<{
        id: string
        name: string
        path: string
        icon: string | null
        category: string | null
        source: string | null
        pinned: number
        last_used: number | null
        created_at: number
      }>
      return likeRows.map((r) => this.row(r))
    }
    return rows.map((r) => this.row(r))
  }

  /** 自动发现并合并入库（幂等：按 path 去重）。扫描在 worker 线程执行，不阻塞主进程 */
  async syncDiscovered(): Promise<{ added: number; total: number }> {
    const discovered = await discoverApplicationsAsync()
    let added = 0
    const listExisting = new Set(
      (this.db.db.prepare('SELECT path FROM application').all() as Array<{ path: string }>).map(
        (r) => r.path.toLowerCase()
      )
    )
    const insert = this.db.db.prepare(
      `INSERT OR IGNORE INTO application (id, name, path, icon, category, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    for (const app of discovered) {
      if (listExisting.has(app.path.toLowerCase())) continue
      insert.run(
        randomUUID(),
        app.name,
        app.path,
        app.icon ?? '🖥️',
        app.category ?? null,
        app.source,
        Date.now()
      )
      listExisting.add(app.path.toLowerCase())
      added++
    }
    this.logger.business(`应用发现完成：新增 ${added} 个（共 ${this.list().length} 个）`)
    eventBus.emit('application:updated', { apps: this.list() })
    return { added, total: this.list().length }
  }

  /** 手动登记一个应用（路径不存在时返回 null） */
  addManual(name: string, path: string, category?: string): DesktopApp | null {
    const trimmed = path.trim()
    if (!isRunnable(trimmed)) {
      this.logger.business(`应用登记失败：路径不可执行 ${trimmed}`)
      return null
    }
    const existing = this.db.db
      .prepare('SELECT id FROM application WHERE path = ?')
      .get(trimmed) as { id: string } | undefined
    if (existing) {
      this.db.db.prepare('UPDATE application SET name = ?, category = ? WHERE id = ?').run(
        name.trim() || trimmed,
        category ?? null,
        existing.id
      )
      const app = this.get(existing.id)
      this.logger.business(`更新应用登记「${app?.name}」`)
      this.afterChange()
      return app ?? null
    }
    const id = randomUUID()
    this.db.db
      .prepare(
        `INSERT INTO application (id, name, path, icon, category, source, created_at)
         VALUES (?, ?, ?, ?, ?, 'manual', ?)`
      )
      .run(id, name.trim() || trimmed, trimmed, '🖥️', category ?? null, Date.now())
    this.logger.business(`手动登记应用「${name.trim() || trimmed}」`)
    this.afterChange()
    return this.get(id) ?? null
  }

  get(id: string): DesktopApp | undefined {
    const row = this.db.db
      .prepare(
        `SELECT id, name, path, icon, category, source, pinned, last_used, created_at
         FROM application WHERE id = ?`
      )
      .get(id) as
      | {
          id: string
          name: string
          path: string
          icon: string | null
          category: string | null
          source: string | null
          pinned: number
          last_used: number | null
          created_at: number
        }
      | undefined
    return row ? this.row(row) : undefined
  }

  setPinned(id: string, v: boolean): DesktopApp | undefined {
    this.db.db.prepare('UPDATE application SET pinned = ? WHERE id = ?').run(v ? 1 : 0, id)
    this.afterChange()
    return this.get(id)
  }

  setCategory(id: string, category?: string): DesktopApp | undefined {
    this.db.db.prepare('UPDATE application SET category = ? WHERE id = ?').run(category ?? null, id)
    this.afterChange()
    return this.get(id)
  }

  touchUsed(id: string): void {
    this.db.db.prepare('UPDATE application SET last_used = ? WHERE id = ?').run(Date.now(), id)
    this.afterChange()
  }

  remove(id: string): void {
    this.db.db.prepare('DELETE FROM application WHERE id = ?').run(id)
    this.logger.business(`删除应用记录「${id}」`)
    this.afterChange()
  }

  /** 最近使用的应用 */
  recent(limit = 10): DesktopApp[] {
    const rows = this.db.db
      .prepare(
        `SELECT id, name, path, icon, category, source, pinned, last_used, created_at
         FROM application WHERE last_used IS NOT NULL
         ORDER BY last_used DESC LIMIT ?`
      )
      .all(limit) as Array<{
      id: string
      name: string
      path: string
      icon: string | null
      category: string | null
      source: string | null
      pinned: number
      last_used: number | null
      created_at: number
    }>
    return rows.map((r) => this.row(r))
  }

  private row(r: {
    id: string
    name: string
    path: string
    icon: string | null
    category: string | null
    source: string | null
    pinned: number
    last_used: number | null
    created_at: number
  }): DesktopApp {
    return {
      id: r.id,
      name: r.name,
      path: r.path,
      icon: r.icon ?? undefined,
      category: r.category ?? undefined,
      source: (r.source as DesktopApp['source']) ?? undefined,
      pinned: !!r.pinned,
      lastUsed: r.last_used ?? undefined,
      createdAt: r.created_at
    }
  }

  private afterChange(): void {
    eventBus.emit('application:updated', { apps: this.list() })
  }
}
