# 「AI Agent 管理」模块设计

- 日期：2026-08-18
- 状态：已批准（进入实现规划前）

## 1. 背景与目标

当前总控台已具备进程监控、服务/任务管理、日志中心，并能通过 `classifyOrigin` 识别进程的来源（AI 助手 / 编辑器 / 终端 / 系统 / 总控台）。本模块在此基础上，为「电脑中的 AI agent 工具」提供统一管理入口。

**已确认的核心目标（按优先级）：**

1. **统一监控** — 集中看到本机跑着哪些 AI agent（Codex / Cursor / Claude / Kimi 等），实时状态、资源占用、当前在跑什么任务（进程级命令行推断）。
2. **进程控制** — 既能停止/重启 agent 应用本体，也能安全结束 agent 派生的任务进程。
3. **任务追踪** — 进程级追踪：通过进程树把 agent 应用与其派生任务关联，通过命令行推断任务内容。

**明确不做（本期）：**
- 资源治理（限制 agent 的 CPU/内存/端口）。
- 会话级解析（读取 `~/.codex` 会话、Claude 日志等）。
- 控制级对接（从总控台向 agent 发起新任务）。

## 2. 架构方案

采用**方案 A：Agent 聚合视图**。

- 新增第 5 个视图 **「AI Agent」**（`view.key = 'agents'`），位于「服务监控」之后。
- 每个 agent 应用本体聚合为一张卡；卡片展开显示其派生的任务进程。
- 复用现有能力：`classifyOrigin`（识别 agent 来源）、`buildChildrenMap` / `descendants`（进程树遍历）、`killTree`（安全结束进程树）、`spawnCommandLine`（拉起应用）。

### 关键决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 聚合位置 | 主进程 monitor.ts 扫描时构建 | 逻辑内聚，复用进程树；渲染层只展示 |
| 重启策略 | 内置启动命令表 | 常见 agent 可自动重启；未知的明确提示 |
| 追踪深度 | 进程级 | 复用现有扫描能力，实现最轻 |

## 3. 数据模型（主进程）

### 新增类型（`src/shared/types.ts`）

```ts
/** Agent 派生的单个任务进程 */
export interface AgentTaskProcess {
  pid: number
  name: string
  cmdline: string
  cpu: number
  memMB: number
  ports: number[]
  createdAt: number
}

/** 一个 AI agent（应用本体 + 派生任务）聚合行 */
export interface AgentRow {
  id: string           // 稳定标识（agent 根进程 pid，或 `${kind}:${firstPid}`）
  kind: string         // 'codex' | 'cursor' | 'claude' | 'kimi' | 'chatgpt' | 'gemini' | 'windsurf' | 'cline' | 'ai'
  label: string        // 显示名（复用 friendlyLabel）
  icon: string
  status: 'running' | 'idle'   // running=有任务进程或监听端口；idle=仅应用本体空闲
  pid: number          // agent 应用根进程 pid
  createdAt: number
  cpu: number          // 整树 CPU 汇总（%）
  memMB: number        // 整树内存汇总
  ports: number[]      // 整树监听端口
  taskCount: number    // 派生任务进程数
  tasks: AgentTaskProcess[]
}
```

`MonitorSnapshot` 增加可选字段：`agents?: AgentRow[]`。

### 启动命令表（新文件 `src/main/agentLauncher.ts`）

为常见 agent 维护「识别 key → 启动命令」映射，用于重启：

```ts
// key 与 portScanner 中 AI_CMDS / AI_NAMES 保持一致
const AGENT_LAUNCH: Record<string, string | undefined> = {
  cursor: 'cursor',            // 从 PATH / 已知路径解析
  codex: 'codex',
  claude: 'claude',
  kimi: 'kimi',
  chatgpt: 'chatgpt',
  gemini: 'gemini',
  windsurf: 'windsurf',
  cline: 'code --reuse-window ...' // 以 Cline 为例，实际按需配置
}
```

- `resolveAgentLaunch(kind): string | undefined`：返回可执行命令；找不到返回 `undefined`。
- 重启时若为 `undefined`，渲染层明确提示「无法自动重启，请手动打开」。

## 4. 主进程聚合逻辑

在 `monitor.ts` 的 `processScan` 阶段调用新的聚合函数 `aggregateAgents(data, ownTree)`（可放入新文件 `src/main/agentAggregator.ts`），并把结果写入 `snapshot.agents`。

聚合算法：

1. 遍历 `data.procs` 中非自身进程，用现有 `classifyOrigin` 过滤出 `origin.kind === 'ai'` 的进程。
2. 对每个 ai 进程，沿父链向上找到**第一个 ai 进程**作为该 agent 的根（即：根进程的父进程不是 ai，或父进程不属于任何已识别 agent）。
3. 以根为顶，用 `descendants(root, children)` 收集整棵进程树。
4. 归属任务进程：树内除根进程外，保留「实际在干活」的进程 —— 有监听端口，或非 agent 自带的空闲/框架子进程。过滤掉与根同名/同 exe 的重复 GUI 进程，避免噪音。
5. 汇总：CPU/内存求和、端口收集、taskCount、运行时长。
6. 任务进程用命令行推断语义（直接展示 cmdline，不深入解析）。

**幂等标识**：同一 agent 的根 pid 在扫描间可能变化（重启后 pid 改变），用 `kind + 根进程首现 pid` 生成 `id`；若 pid 消失则从列表移除（下一轮扫描自然消失）。

## 5. IPC 接口（主进程 → 渲染进程）

| 通道 | 方向 | 说明 |
| --- | --- | --- |
| `agents:stopTask` | 渲染 → 主 | `{ pid }`，`killTree(pid)` 安全结束单个任务进程，二次确认由渲染层触发 |
| `agents:stopAgent` | 渲染 → 主 | `{ pid }`，`killTree(pid)` 退出 agent 应用整棵树 |
| `agents:restartAgent` | 渲染 → 主 | `{ kind }`，经 `agentLauncher` 解析命令 `spawnCommandLine` 重新拉起；无命令则返回 `{ ok: false, reason: 'unknown' }` |

复用现有 `killTree`（`src/main/commands.ts`）与二次确认（`stores/confirm.ts`）。

## 6. 渲染进程

### 视图 `src/renderer/src/views/AgentView.vue`

沿用「Control Desk」设计语言（与 OverviewCards / 监控一致）：

- **顶部统计条**：agent 总数 / 运行中数 / 总 CPU% / 总内存。
- **Agent 卡片列表**（网格，复用 `card` 样式 + 顶部状态色条）：
  - 卡片头：图标 + 名称 + 状态点（running 脉冲绿 / idle 灰）+ CPU + 内存 + 端口 chips + 运行时长。
  - 展开区（可折叠）：派生任务进程列表 —— 每行显示 名称、命令行（mono）、PID、CPU、内存，右侧「安全结束」按钮。
  - 卡片操作区：`退出`（danger，二次确认）、`重启`（ghost）。
- **空状态**：引导文案「尚未检测到 AI agent 在本机运行」。

### Store `src/renderer/src/stores/agents.ts`

- 从 monitor snapshot 读取 `agents`，暴露 `computed` 列表、`runningCount`、`totalCpu`、`totalMem`。
- 控制 action：`stopTask(pid)` / `stopAgent(pid)` / `restartAgent(kind)`，内部调 IPC 并在危险操作前弹 confirmDialog。

### 导航集成

- `App.vue` 的 `navItems` 增加 `{ key: 'agents', label: 'AI Agent', icon, code: '05' }`。
- `titles` 增加对应条目；`viewComp` map 增加 AgentView。
- 命令面板（palette store）如需，可加入「查看 AI Agent」命令（可选，本期不强求）。

## 7. 错误处理

| 场景 | 处理 |
| --- | --- |
| agent 消失 | 下一轮扫描自动移除 |
| 重启未知 agent | 明确提示「无法自动重启，请手动打开」 |
| 结束任务/退出应用 | 均二次确认 |
| 任务进程已不存在 | `killTree` 容错，前端提示已结束 |
| 权限不足结束失败 | 捕获错误，提示重试 |

## 8. 测试

新增 `tests/agentAggregator.test.ts`（对齐现有测试风格，如 `commands.test.ts`）：

- 构造进程树：一个 ai 根 + 若干子进程（含监听端口、含空闲噪音），验证：
  - agent 分组正确、任务归属正确；
  - 噪音进程被过滤；
  - CPU/内存/端口/taskCount 汇总正确；
  - idle/running 状态判定正确；
  - 幂等 id 生成、消失后移除。
- `agentLauncher` 命令表解析单测。

## 9. 范围外（YAGNI）

- 资源治理、会话级解析、向 agent 发起任务、命令面板深度集成 —— 本期不做。
