import { mkdirSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import type { LoggerService } from '../logger'
import { getDataDir } from '../config'

// 延迟加载 node:sqlite：避免顶层 import 在 warning 监听器注册前触发实验性警告
const require = createRequire(import.meta.url)
type SQLiteModule = typeof import('node:sqlite')
let _sqlite: SQLiteModule | null = null
function sqlite(): SQLiteModule {
  if (!_sqlite) _sqlite = require('node:sqlite') as SQLiteModule
  return _sqlite
}

/**
 * 数据库文件封装（基于 Node 内置 SQLite，支持 FTS5）。
 * 负责建表 / 迁移 / 版本管理。
 *
 * 说明：使用 node:sqlite（Electron 39 内置）而非 better-sqlite3，
 * 避免原生模块在无编译工具链环境下重新编译的问题；两者同为真 SQLite。
 */
type DatabaseSyncInstance = InstanceType<SQLiteModule['DatabaseSync']>

export class Database {
  readonly db: DatabaseSyncInstance
  private logger: LoggerService | null

  constructor(logger?: LoggerService) {
    this.logger = logger ?? null
    const dir = join(getDataDir(), 'db')
    mkdirSync(dir, { recursive: true })
    this.db = new (sqlite().DatabaseSync)(join(dir, 'desktop-assistant.db'))
    this.db.exec('PRAGMA journal_mode = WAL;')
    this.db.exec('PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  /** 轻量迁移：以 user_version 记录 schema 版本，逐版本执行升级脚本 */
  private migrate(): void {
    const current = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    let version = Number(current?.user_version ?? 0)

    if (version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS application (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          path          TEXT NOT NULL,
          icon          TEXT,
          category      TEXT,
          source        TEXT,
          pinned        INTEGER NOT NULL DEFAULT 0,
          last_used     INTEGER,
          created_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_application_name ON application(name);
        CREATE INDEX IF NOT EXISTS idx_application_last_used ON application(last_used DESC);
        CREATE INDEX IF NOT EXISTS idx_application_category ON application(category);

        CREATE TABLE IF NOT EXISTS workspace (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          path          TEXT NOT NULL,
          type          TEXT,
          tech_stack    TEXT,
          start_command TEXT,
          port          INTEGER,
          pinned        INTEGER NOT NULL DEFAULT 0,
          last_opened   INTEGER,
          created_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_path ON workspace(path);
        CREATE INDEX IF NOT EXISTS idx_workspace_last_opened ON workspace(last_opened DESC);

        CREATE TABLE IF NOT EXISTS clipboard (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          content      TEXT NOT NULL,
          type         TEXT NOT NULL DEFAULT 'text',
          pinned       INTEGER NOT NULL DEFAULT 0,
          created_time INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_clipboard_time ON clipboard(created_time DESC);

        CREATE TABLE IF NOT EXISTS event_log (
          id       INTEGER PRIMARY KEY AUTOINCREMENT,
          type     TEXT NOT NULL,
          content  TEXT,
          time     INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_event_log_time ON event_log(time DESC);

        -- FTS5 全文索引：应用名 + 路径、工作区名 + 技术栈、剪贴板内容
        -- 外部内容表需触发器同步，确保 MATCH 检索到最新数据
        CREATE VIRTUAL TABLE IF NOT EXISTS application_fts USING fts5(
          name, path, content='application', content_rowid='rowid'
        );
        CREATE TRIGGER IF NOT EXISTS application_ai AFTER INSERT ON application BEGIN
          INSERT INTO application_fts(rowid, name, path) VALUES (new.rowid, new.name, new.path);
        END;
        CREATE TRIGGER IF NOT EXISTS application_ad AFTER DELETE ON application BEGIN
          INSERT INTO application_fts(application_fts, rowid, name, path)
            VALUES ('delete', old.rowid, old.name, old.path);
        END;
        CREATE TRIGGER IF NOT EXISTS application_au AFTER UPDATE ON application BEGIN
          INSERT INTO application_fts(application_fts, rowid, name, path)
            VALUES ('delete', old.rowid, old.name, old.path);
          INSERT INTO application_fts(rowid, name, path) VALUES (new.rowid, new.name, new.path);
        END;

        CREATE VIRTUAL TABLE IF NOT EXISTS workspace_fts USING fts5(
          name, tech_stack, content='workspace', content_rowid='rowid'
        );
        CREATE TRIGGER IF NOT EXISTS workspace_ai AFTER INSERT ON workspace BEGIN
          INSERT INTO workspace_fts(rowid, name, tech_stack)
            VALUES (new.rowid, new.name, new.tech_stack);
        END;
        CREATE TRIGGER IF NOT EXISTS workspace_ad AFTER DELETE ON workspace BEGIN
          INSERT INTO workspace_fts(workspace_fts, rowid, name, tech_stack)
            VALUES ('delete', old.rowid, old.name, old.tech_stack);
        END;
        CREATE TRIGGER IF NOT EXISTS workspace_au AFTER UPDATE ON workspace BEGIN
          INSERT INTO workspace_fts(workspace_fts, rowid, name, tech_stack)
            VALUES ('delete', old.rowid, old.name, old.tech_stack);
          INSERT INTO workspace_fts(rowid, name, tech_stack)
            VALUES (new.rowid, new.name, new.tech_stack);
        END;

        CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
          content, content='clipboard', content_rowid='id'
        );
        CREATE TRIGGER IF NOT EXISTS clipboard_ai AFTER INSERT ON clipboard BEGIN
          INSERT INTO clipboard_fts(rowid, content) VALUES (new.id, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS clipboard_ad AFTER DELETE ON clipboard BEGIN
          INSERT INTO clipboard_fts(clipboard_fts, rowid, content)
            VALUES ('delete', old.id, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS clipboard_au AFTER UPDATE ON clipboard BEGIN
          INSERT INTO clipboard_fts(clipboard_fts, rowid, content)
            VALUES ('delete', old.id, old.content);
          INSERT INTO clipboard_fts(rowid, content) VALUES (new.id, new.content);
        END;
      `)
      version = 1
    }

    if (version < 2) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS local_model (
          id            TEXT PRIMARY KEY,
          name          TEXT NOT NULL,
          runtime       TEXT NOT NULL,
          model         TEXT NOT NULL,
          bin_path      TEXT,
          host          TEXT NOT NULL DEFAULT '127.0.0.1',
          port          INTEGER NOT NULL DEFAULT 11434,
          extra_args    TEXT,
          dir           TEXT,
          command       TEXT,
          pinned        INTEGER NOT NULL DEFAULT 0,
          created_at    INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_local_model_runtime ON local_model(runtime);
      `)
      version = 2
    }

    this.db.prepare(`PRAGMA user_version = ${version}`).run()
    this.logger?.business(`数据库就绪（schema v${version}）`)
  }

  close(): void {
    try {
      this.db.close()
    } catch {
      /* 忽略 */
    }
  }
}
