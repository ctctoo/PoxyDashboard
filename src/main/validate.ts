import { existsSync, statSync } from 'fs'
import type { AppConfig, ValidationIssue, ValidationResult } from '../shared/types'
import { findExecutable, hasShellSyntax, tokenize } from './commands'

export function validateAppConfig(app: AppConfig): ValidationResult {
  const issues: ValidationIssue[] = []
  if (!app.name.trim()) issues.push({ level: 'error', message: '名称不能为空', fix: '填写应用名称' })
  if (!app.command.trim()) issues.push({ level: 'error', message: '启动命令为空', fix: '填写命令、选择脚本或使用项目候选命令' })
  if (app.dir) {
    if (!existsSync(app.dir)) {
      issues.push({ level: 'error', message: `工作目录不存在：${app.dir}`, fix: '重新选择文件夹' })
    } else if (!statSync(app.dir).isDirectory()) {
      issues.push({ level: 'error', message: `工作目录不是文件夹：${app.dir}`, fix: '重新选择文件夹' })
    }
  } else if (app.kind === 'task' && !app.scriptPath) {
    issues.push({ level: 'warning', message: '批处理任务未指定工作目录', fix: '建议为任务选择稳定、会备份的自动化目录' })
  }
  if (app.scriptPath && !existsSync(app.scriptPath)) {
    issues.push({
      level: 'error',
      message: `脚本不存在：${app.scriptPath}`,
      fix: '重新选择脚本。脚本移动、改名或删除都会使任务失效，建议放在长期稳定的自动化目录'
    })
  }
  if (app.kind === 'service' && app.port != null && (app.port < 1 || app.port > 65535)) {
    issues.push({ level: 'error', message: `端口号无效：${app.port}`, fix: '填写 1-65535 之间的端口' })
  }
  if (app.command && !hasShellSyntax(app.command)) {
    const [exe] = tokenize(app.command)
    if (exe) {
      if (/^[A-Za-z]:[\\/]/.test(exe) || exe.startsWith('\\\\')) {
        if (!existsSync(exe)) issues.push({ level: 'error', message: `可执行文件不存在：${exe}`, fix: '检查命令中的路径' })
      } else if (!findExecutable(exe, app.dir)) {
        issues.push({
          level: 'error',
          message: `找不到可执行命令：${exe}`,
          fix: '检查 PATH 环境变量或改为完整路径（MongoDB 等常见安装目录会自动识别，也可尝试重启总控台后重试）'
        })
      }
    }
  }
  if (app.kind === 'service' && !app.port) {
    issues.push({ level: 'warning', message: '服务未声明期望端口', fix: '可在编辑中填写端口；若服务实际监听端口，运行后会自动显示' })
  }
  return { ok: !issues.some((i) => i.level === 'error'), issues }
}
