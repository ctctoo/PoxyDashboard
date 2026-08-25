import type { Database } from '../storage/database'
import type { LoggerService } from '../logger'
import type { ProcessManager } from '../processManager'
import { PermissionManager } from '../core/permission'
import { RuntimeEngine } from '../core/runtimeEngine'
import { eventBus } from '../core/eventBus'
import { ApplicationService } from './application/service'
import { WorkspaceService } from './workspace/service'
import { ModelService } from './models/service'

/**
 * 模块注册中心：统一实例化 core 层与业务模块，供 IPC 层调用。
 */
export interface ModuleRegistry {
  database: Database
  permission: PermissionManager
  runtime: RuntimeEngine
  applications: ApplicationService
  workspaces: WorkspaceService
  models: ModelService
}

export function createModules(
  db: Database,
  logger: LoggerService,
  pm: ProcessManager
): ModuleRegistry {
  const permission = new PermissionManager(eventBus, logger)
  const runtime = new RuntimeEngine(logger)
  const applications = new ApplicationService(db, logger)
  const workspaces = new WorkspaceService(db, logger)
  const models = new ModelService(db, logger)

  // 将现有 ProcessManager 纳入 runtimeEngine 的启动/停止处理器（Module 5 编排层）
  runtime.startHandler = async (entity) => {
    const app = applications.list().find((a) => a.id === entity.id)
    if (app) {
      pm.start({
        id: app.id,
        kind: 'service',
        name: app.name,
        icon: app.icon,
        command: `"${app.path}"`,
        createdAt: Date.now()
      })
    }
  }
  runtime.stopHandler = async (entity) => {
    const app = applications.list().find((a) => a.id === entity.id)
    if (app) {
      // 已托管进程由 ProcessManager 停止；外部应用由系统自身管理，仅标记状态
      void pm.stop(app.id)
    }
  }

  return { database: db, permission, runtime, applications, workspaces, models }
}
