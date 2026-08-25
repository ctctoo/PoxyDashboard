import { randomUUID } from 'crypto'
import type { Database } from '../../storage/database'
import type { LoggerService } from '../../logger'
import type { LocalModel, LocalModelConfig, ModelEnv, ModelRuntime } from '../../../shared/types'
import { detectModelEnvs, defaultPortFor } from './detect'
import { buildCommand } from './command'
import { ModelProcessManager } from './process'
import { eventBus } from '../../core/eventBus'

/**
 * Module 8：本地大模型管理。
 * - 自动检测本机运行框架（ollama / llama.cpp / vLLM 等）
 * - 登记模型实例（模型文件/模型名 + 地址端口参数）
 * - 使用相应命令启动/停止本地模型（OpenAI 兼容服务，不含对话功能）
 */
export class ModelService {
  private processes: ModelProcessManager

  constructor(
    private db: Database,
    private logger: LoggerService
  ) {
    this.processes = new ModelProcessManager(logger)
    this.processes.onRuntime = (id) => this.emitRuntime(id)
  }

  /** 自动检测本机运行框架 */
  detectEnvs(): ModelEnv[] {
    return detectModelEnvs()
  }

  list(): LocalModel[] {
    const rows = this.db.db
      .prepare(
        `SELECT id, name, runtime, model, bin_path, host, port, extra_args, dir, command, pinned, created_at
         FROM local_model ORDER BY pinned DESC, created_at ASC`
      )
      .all() as unknown as Array<ModelRowRaw>
    return rows.map((r) => this.mergeRuntime(this.row(r)))
  }

  get(id: string): LocalModel | undefined {
    const row = this.db.db
      .prepare(
        `SELECT id, name, runtime, model, bin_path, host, port, extra_args, dir, command, pinned, created_at
         FROM local_model WHERE id = ?`
      )
      .get(id) as ModelRowRaw | undefined
    return row ? this.mergeRuntime(this.row(row)) : undefined
  }

  /** 新增模型实例（返回 null 表示参数非法） */
  add(input: {
    name: string
    runtime: ModelRuntime
    model: string
    binPath?: string
    host?: string
    port?: number
    extraArgs?: string
    dir?: string
    pinned?: boolean
  }): LocalModel | null {
    const runtime = input.runtime
    const model = input.model.trim()
    if (!model) {
      this.logger.business(`新增模型失败：未填写模型名称/路径`)
      return null
    }
    const id = randomUUID()
    const name = input.name.trim() || model.split(/[\\/]/).pop() || model
    const host = input.host?.trim() || '127.0.0.1'
    const port = input.port && input.port > 0 ? Math.round(input.port) : defaultPortFor(runtime)
    const binPath = input.binPath?.trim() || undefined
    const extraArgs = input.extraArgs?.trim() || undefined
    const dir = input.dir?.trim() || undefined
    const command = buildCommand({ runtime, model, binPath, host, port, extraArgs, dir })
    this.db.db
      .prepare(
        `INSERT INTO local_model (id, name, runtime, model, bin_path, host, port, extra_args, dir, command, pinned, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        name,
        runtime,
        model,
        binPath ?? null,
        host,
        port,
        extraArgs ?? null,
        dir ?? null,
        command,
        input.pinned ? 1 : 0,
        Date.now()
      )
    this.logger.business(`新增模型「${name}」（${runtime} :${port}）`)
    this.afterChange()
    return this.get(id) ?? null
  }

  /** 预览启动命令（不持久化） */
  previewCommand(input: {
    runtime: ModelRuntime
    model: string
    binPath?: string
    host?: string
    port?: number
    extraArgs?: string
    dir?: string
  }): string {
    return buildCommand({
      runtime: input.runtime,
      model: input.model.trim(),
      binPath: input.binPath?.trim() || undefined,
      host: input.host?.trim() || '127.0.0.1',
      port: input.port && input.port > 0 ? Math.round(input.port) : defaultPortFor(input.runtime),
      extraArgs: input.extraArgs?.trim() || undefined,
      dir: input.dir?.trim() || undefined
    })
  }

  update(id: string, patch: Partial<LocalModelConfig>): LocalModel | undefined {
    const cur = this.get(id)
    if (!cur) return undefined
    // 运行中则先停止
    if (['starting', 'running'].includes(cur.status)) void this.stop(id)
    const merged: LocalModelConfig = { ...cur, ...patch }
    const command = buildCommand({
      runtime: merged.runtime,
      model: merged.model,
      binPath: merged.binPath,
      host: merged.host,
      port: merged.port,
      extraArgs: merged.extraArgs,
      dir: merged.dir
    })
    this.db.db
      .prepare(
        `UPDATE local_model SET name=?, runtime=?, model=?, bin_path=?, host=?, port=?, extra_args=?, dir=?, command=?, pinned=? WHERE id=?`
      )
      .run(
        merged.name,
        merged.runtime,
        merged.model,
        merged.binPath ?? null,
        merged.host,
        merged.port,
        merged.extraArgs ?? null,
        merged.dir ?? null,
        command,
        merged.pinned ? 1 : 0,
        id
      )
    this.logger.business(`更新模型「${merged.name}」`)
    this.afterChange()
    return this.get(id)
  }

  remove(id: string): void {
    const cur = this.get(id)
    if (['starting', 'running'].includes(cur?.status ?? 'stopped')) void this.stop(id)
    this.db.db.prepare('DELETE FROM local_model WHERE id = ?').run(id)
    this.processes.forget(id)
    this.logger.business(`删除模型实例「${cur?.name ?? id}」`)
    this.afterChange()
  }

  setPinned(id: string, v: boolean): LocalModel | undefined {
    this.db.db.prepare('UPDATE local_model SET pinned = ? WHERE id = ?').run(v ? 1 : 0, id)
    this.afterChange()
    return this.get(id)
  }

  /** 启动模型实例 */
  start(id: string): LocalModel {
    const cur = this.get(id)
    if (!cur) return { ...this.stopped(id), status: 'error', error: '模型不存在' }
    const running = this.processes.start(cur)
    this.logger.business(
      running.status === 'error'
        ? `启动模型「${cur.name}」失败：${running.error}`
        : `启动模型「${cur.name}」（pid=${running.pid}）`
    )
    this.emitRuntime(id)
    return this.mergeRuntime(cur, running)
  }

  /** 停止模型实例 */
  async stop(id: string): Promise<LocalModel> {
    const cur = this.get(id)
    const stopped = (await this.processes.stop(id)) ?? this.stopped(id)
    if (cur) this.logger.business(`停止模型「${cur.name}」：${stopped.status}`)
    this.emitRuntime(id)
    return this.get(id) ?? stopped
  }

  stopAll(): void {
    void this.processes.stopAll()
  }

  /** 运行状态（来自进程管理器） */
  private processState(id: string): LocalModel | undefined {
    return this.processes.get(id)
  }

  private stopped(id: string): LocalModel {
    return {
      id,
      name: id,
      runtime: 'custom',
      model: '',
      host: '127.0.0.1',
      port: 8000,
      status: 'stopped',
      createdAt: Date.now()
    }
  }

  /** 将配置与运行状态合并 */
  private mergeRuntime(cfg: LocalModel, rt?: LocalModel): LocalModel {
    const live = this.processState(cfg.id)
    const status = rt?.status ?? live?.status ?? 'stopped'
    return {
      ...cfg,
      status,
      pid: rt?.pid ?? live?.pid,
      startedAt: rt?.startedAt ?? live?.startedAt,
      exitCode: rt?.exitCode ?? live?.exitCode,
      error: rt?.error ?? live?.error
    }
  }

  private emitRuntime(id: string): void {
    const model = this.get(id)
    if (!model) return
    eventBus.emit('model:runtime', { id, model })
  }

  private row(r: ModelRowRaw): LocalModel {
    return {
      id: r.id,
      name: r.name,
      runtime: r.runtime as ModelRuntime,
      model: r.model,
      binPath: r.bin_path ?? undefined,
      host: r.host,
      port: r.port,
      extraArgs: r.extra_args ?? undefined,
      dir: r.dir ?? undefined,
      command: r.command ?? undefined,
      pinned: !!r.pinned,
      createdAt: r.created_at,
      status: 'stopped'
    }
  }

  private afterChange(): void {
    eventBus.emit('model:updated', { models: this.list() })
  }
}

interface ModelRowRaw {
  id: string
  name: string
  runtime: string
  model: string
  bin_path: string | null
  host: string
  port: number
  extra_args: string | null
  dir: string | null
  command: string | null
  pinned: number
  created_at: number
}
