import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: () => process.env['DASH_DATA_DIR'] || 'C:/tmp/electron-data'
  }
}))

import { Database } from '../src/main/storage/database'
import { createModules } from '../src/main/modules/index'
import { LoggerService } from '../src/main/logger'

let db: Database
let logger: LoggerService

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'models-debug-'))
  process.env['DASH_DATA_DIR'] = dir
  logger = new LoggerService(join(dir, 'logs'))
  db = new Database(logger)
})

afterAll(() => {
  db.close()
})

describe('models module bootstrap', () => {
  it('createModules works and models service functional', () => {
    // 用空 ProcessManager 近似（processManager 依赖 electron，这里用 any 传入）
    const pm = {} as never
    const mods = createModules(db, logger, pm)
    expect(mods.models).toBeDefined()

    const added = mods.models.add({
      name: '测试',
      runtime: 'ollama',
      model: 'qwen2.5:7b',
      host: '127.0.0.1',
      port: 11434
    })
    expect(added).not.toBeNull()
    expect(mods.models.list().length).toBe(1)
  })

  it('db migrated to v2 with local_model table', () => {
    const v = db.db.prepare('PRAGMA user_version').get() as { user_version: number }
    expect(v.user_version).toBe(2)
    const t = db.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='local_model'")
      .get()
    expect(t).toBeTruthy()
  })
})
