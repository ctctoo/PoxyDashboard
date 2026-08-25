import { randomUUID } from 'crypto'
import { existsSync, statSync } from 'fs'
import type { Database } from '../../storage/database'
import type { Workspace } from '../../../shared/types'
import type { LoggerService } from '../../logger'
import { detectProject } from '../../projectDetect'
import { eventBus } from '../../core/eventBus'

/**
 * Module 4：Workspace Manager
 * 管理用户工作空间：自动识别项目类型/技术栈/启动命令，SQLite 持久化，FTS5 搜索。
 */
export class WorkspaceService {
  constructor(
    private db: Database,
    private logger: LoggerService
  ) {}

  list(): Workspace[] {
    const rows = this.db.db
      .prepare(
        `SELECT id, name, path, type, tech_stack, start_command, port, pinned, last_opened, created_at
         FROM workspace ORDER BY pinned DESC, last_opened DESC, name COLLATE NOCASE`
      )
      .all() as unknown as Array<WorkspaceRowRaw>
    return rows.map((r) => this.row(r))
  }

  search(query: string, limit = 20): Workspace[] {
    const q = query.trim()
    if (!q) return this.list().slice(0, limit)
    const escaped = q.replace(/"/g, '""')
    const rows = this.db.db
      .prepare(
        `SELECT w.id, w.name, w.path, w.type, w.tech_stack, w.start_command, w.port, w.pinned, w.last_opened, w.created_at
         FROM workspace_fts f JOIN workspace w ON w.rowid = f.rowid
         WHERE workspace_fts MATCH ? ORDER BY bm25(workspace_fts) LIMIT ?`
      )
      .all(`"${escaped}"`, limit) as unknown as Array<WorkspaceRowRaw>
    if (!rows.length) {
      const like = `%${query}%`
      const likeRows = this.db.db
        .prepare(
          `SELECT id, name, path, type, tech_stack, start_command, port, pinned, last_opened, created_at
           FROM workspace WHERE name LIKE ? OR path LIKE ? OR tech_stack LIKE ?
           ORDER BY pinned DESC, name LIMIT ?`
        )
        .all(like, like, like, limit) as unknown as Array<WorkspaceRowRaw>
      return likeRows.map((r) => this.row(r))
    }
    return rows.map((r) => this.row(r))
  }

  /** 登记一个工作区目录（自动识别类型/技术栈/启动命令） */
  add(path: string): Workspace | null {
    const dir = path.trim()
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      this.logger.business(`工作区登记失败：目录无效 ${dir}`)
      return null
    }
    const det = detectProject(dir)
    const existing = this.db.db.prepare('SELECT id FROM workspace WHERE path = ?').get(dir) as
      | { id: string }
      | undefined
    const type = det.type !== '未知' && det.type !== '无效目录' ? det.type : undefined
    const techStack = this.resolveStack(det)
    const primary = det.candidates[0]
    const id = existing?.id ?? randomUUID()
    if (existing) {
      this.db.db
        .prepare(
          `UPDATE workspace SET name = ?, type = ?, tech_stack = ?, start_command = ?, port = ?, last_opened = ? WHERE id = ?`
        )
        .run(
          dir.split(/[\\/]/).filter(Boolean).pop() ?? dir,
          type ?? null,
          techStack ?? null,
          primary?.command ?? null,
          primary?.port ?? null,
          Date.now(),
          id
        )
      this.logger.business(`更新工作区「${dir}」（${type ?? '未知'}）`)
    } else {
      this.db.db
        .prepare(
          `INSERT INTO workspace (id, name, path, type, tech_stack, start_command, port, last_opened, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          id,
          dir.split(/[\\/]/).filter(Boolean).pop() ?? dir,
          dir,
          type ?? null,
          techStack ?? null,
          primary?.command ?? null,
          primary?.port ?? null,
          Date.now(),
          Date.now()
        )
      this.logger.business(`登记工作区「${dir}」（${type ?? '未知'}）`)
    }
    this.afterChange()
    return this.get(id) ?? null
  }

  get(id: string): Workspace | undefined {
    const row = this.db.db
      .prepare(
        `SELECT id, name, path, type, tech_stack, start_command, port, pinned, last_opened, created_at
         FROM workspace WHERE id = ?`
      )
      .get(id) as WorkspaceRowRaw | undefined
    return row ? this.row(row) : undefined
  }

  setPinned(id: string, v: boolean): Workspace | undefined {
    this.db.db.prepare('UPDATE workspace SET pinned = ? WHERE id = ?').run(v ? 1 : 0, id)
    this.afterChange()
    return this.get(id)
  }

  touchOpened(id: string): void {
    this.db.db.prepare('UPDATE workspace SET last_opened = ? WHERE id = ?').run(Date.now(), id)
    this.afterChange()
  }

  remove(id: string): void {
    this.db.db.prepare('DELETE FROM workspace WHERE id = ?').run(id)
    this.logger.business(`删除工作区记录「${id}」`)
    this.afterChange()
  }

  /** 最近打开的工作区 */
  recent(limit = 10): Workspace[] {
    const rows = this.db.db
      .prepare(
        `SELECT id, name, path, type, tech_stack, start_command, port, pinned, last_opened, created_at
         FROM workspace WHERE last_opened IS NOT NULL ORDER BY last_opened DESC LIMIT ?`
      )
      .all(limit) as unknown as Array<WorkspaceRowRaw>
    return rows.map((r) => this.row(r))
  }

  private resolveStack(det: { type: string; notes?: string[]; candidates: Array<{ command: string; label: string }> }): string | undefined {
    const labels = det.candidates.map((c) => c.label)
    const stack: string[] = []
    const t = det.type
    if (/node/i.test(t)) stack.push('node')
    if (/java|spring/i.test(t)) stack.push('java')
    if (/python|django|fastapi|flask/i.test(t)) stack.push('python')
    if (/^go$/i.test(t)) stack.push('go')
    if (/rust/i.test(t)) stack.push('rust')
    if (/deno/i.test(t)) stack.push('deno')
    if (/\.net/i.test(t)) stack.push('dotnet')
    if (/hexo|hugo/i.test(t)) stack.push('static')
    if (labels.some((l) => /^pnpm/.test(l))) stack.push('pnpm')
    if (labels.some((l) => /^yarn/.test(l))) stack.push('yarn')
    if (labels.some((l) => /^bun/.test(l))) stack.push('bun')
    if (labels.some((l) => /^npm/.test(l))) stack.push('npm')
    if (labels.some((l) => /vite/i.test(l))) stack.push('vite')
    if (labels.some((l) => /next/i.test(l))) stack.push('next')
    return stack.length ? [...new Set(stack)].join(',') : undefined
  }

  private row(r: WorkspaceRowRaw): Workspace {
    return {
      id: r.id,
      name: r.name,
      path: r.path,
      type: r.type ?? undefined,
      techStack: r.tech_stack ?? undefined,
      startCommand: r.start_command ?? undefined,
      port: r.port ?? undefined,
      pinned: !!r.pinned,
      lastOpened: r.last_opened ?? undefined,
      createdAt: r.created_at
    }
  }

  private afterChange(): void {
    eventBus.emit('workspace:updated', { workspaces: this.list() })
  }
}

interface WorkspaceRowRaw {
  id: string
  name: string
  path: string
  type: string | null
  tech_stack: string | null
  start_command: string | null
  port: number | null
  pinned: number
  last_opened: number | null
  created_at: number
}
