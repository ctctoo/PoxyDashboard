# 「AI Agent 控制管理」模块 需求分析

- 日期：2026-08-21
- 状态：需求分析（待评审）
- 上游：`2026-08-18-ai-agent-management-design.md`（已批准并实现）
- 关联代码：`src/main/agentAggregator.ts`、`agentDetect.ts`、`agentLauncher.ts`、`src/main/ipc.ts`、`src/renderer/src/views/AgentView.vue`、`src/renderer/src/stores/agents.ts`、`src/shared/types.ts`

---

## 0. 结论摘要

现有 AI Agent 模块已完成 **v1（识别 + 监控 + 基本进程控制）**，运行良好。本需求分析基于代码走读，识别出 **7 大类可完善需求**，按对用户价值 / 投入成本排序为 **P0 / P1 / P2 三批**：

- **P0（当前缺失、直接影响可用性与正确性）**：agent 根进程状态卡死、任务进程语义化、未知 agent 兜底启动、自动刷新探测、排序/分组筛选。
- **P1（显著提升效率与体验）**：会话活动/最近任务感知、自定义 agent 目录、健康度诊断、托盘/全局入口、日志聚合。
- **P2（锦上添花）**：资源治理（限制）、会话级解析、多工作区、分享/导出、统计报表。

> 建议按 P0 → P1 → P2 分批排期，每批交付后做一次回归（见 §6 验收标准）。

---

## 1. 现状能力盘点（走读结论）

| 能力 | 实现位置 | 说明 |
| --- | --- | --- |
| 进程聚合（应用本体 + 派生任务） | `agentAggregator.ts::aggregateAgents` | 沿父链找 ai 根进程，`descendants` 收集整树，按 `SYSTEM_NOISE` + 同名 exe 过滤噪音任务 |
| 已安装探测（未运行也能识别） | `agentDetect.ts::detectInstalledAgents` | PATH + npm 全局 bin 双来源 |
| 启动命令目录 | `agentLauncher.ts::AGENT_CATALOG` | 内置 cursor/codex/claude/kimi/chatgpt/gemini/windsurf/cline/opencode |
| 启动目录持久化 | `config.ts::agentDirs` + `ConfigFile.agentDirs` | 每 kind 保存一个工作目录 |
| IPC 控制 | `ipc.ts`（`agents:stopTask/stopAgent/startAgent/restartAgent/getLaunchDir/setLaunchDir`） | start/restart 走 `resolveAgentLaunch` + `spawnCommandLine` |
| 渲染卡片视图 | `AgentView.vue` + `stores/agents.ts` | 状态条、资源统计、端口 chip、可折叠任务列表、二次确认 |
| 命令面板集成 | palette | `打开 AI Agent` 切换视图 |

### 1.1 数据结构（现状）

- `AgentRow`：`status: 'running' | 'idle' | 'not-running'`；`tasks: AgentTaskProcess[]`。
- `AgentTaskProcess`：`pid/name/cmdline/cpu/memMB/ports/createdAt`。
- 数据来源：主进程 `monitor.ts` 扫描时构建 `snapshot.agents`（运行中聚合 + `mergeInstalledAgents` 并入未启动项）。

---

## 2. 现状缺口识别（逐项）

### 缺口 A：agent 根进程"失活但未消失"导致状态卡死
- **现象**：`aggregateAgents` 以「根进程是否仍在扫描列表」为存在判定。若 agent 应用本体退出但留下孤儿子进程（任务），整树仍可能被聚合，状态显示为 `running`/`idle`，但根 PID 已失效，`stopAgent`/`restartAgent` 依据的 `row.pid` 已不存在，操作无效。
- **影响**：用户看到"运行中"却无法控制，误判。
- **建议**：聚合时校验根进程存活（`data.procs.has(root)`）＋ 增加"根失活但有任务"的中间态（如 `orphan`），或对失活根执行清理并展示孤儿任务供单独结束。

### 缺口 B：任务进程"语义化"不足
- **现状**：任务进程仅展示原始 `cmdline`，无法一眼看出"这个 agent 在干什么"（如正在跑测试、起 dev server、跑脚本）。
- **建议**：在 `AgentTaskProcess` 增加 `kind`/`activity` 字段（通过命令行启发式识别），如 `test`/`dev-server`/`build`/`install`/`script`/`shell`；卡片上用小徽标区分，并支持按活动类型筛选。

### 缺口 C：未知 agent 无法自动启动 / 缺少"自定义 agent"入口
- **现状**：`AGENT_CATALOG` 之外的 agent（如新出的 CLI、自定义工具）只能"手动打开"，无兜底。
- **建议**：提供「添加自定义 agent」能力——用户填写名称、启动命令、图标、默认工作目录，持久化到配置；未知 agent 卡显示"可配置启动命令"而非仅提示手动打开。

### 缺口 D：已安装探测仅在启动时跑一次
- **现状**：`refreshInstalledAgents` 在 `monitor.start()` 时探测一次。用户中途 `npm i -g` 新 agent 后，未重启总控台则一直不出现。
- **建议**：加入低频重探（如每 10 分钟或手动刷新按钮），或在 `apps:changed`/某操作后触发重探；提供 UI 手动刷新。

### 缺口 E：缺少排序 / 分组 / 筛选
- **现状**：卡片按 `status` + CPU 排序，无交互式筛选（仅顶部统计）。
- **建议**：增加状态筛选（全部/运行中/空闲/未启动）、按 kind 分组、按 CPU/内存排序、搜索框（按 label/kind）。

### 缺口 F：agent 活动感知（会话/最近任务）缺失
- **建议（P1）**：轻量读取 agent 的最近活动痕迹（如 Codex 会话目录、Claude 日志 mtime），在卡片上展示"最近活动 / 上次运行时长"，让用户知道 agent 是否在"真实工作"而非空闲挂起。

### 缺口 G：无健康度诊断
- **建议（P1）**：对运行中的 agent 做健康度评估（CPU 持续为 0 但挂着端口、进程数异常、端口被占等），给出 `健康 / 可疑 / 异常` 徽标与一句诊断文案，与启动台的"启动诊断"体验对齐。

### 缺口 H：启动目录体验粗糙
- **现状**：只能通过系统目录选择器设置一个全局目录，且无法清除（`clearLaunchDir` store 有但 UI 未暴露）。
- **建议（P1）**：卡片上支持"清除启动目录"；对 CLI 型 agent 支持"最近项目目录"快捷选择（复用 `detectProject` 历史）。

### 缺口 I：缺少全局入口与后台感知
- **建议（P1）**：托盘菜单加入"打开 AI Agent / 一键停止全部 agent（二次确认）"；主窗口非聚焦时 agent 异常可发系统通知。

### 缺口 J：缺少 agent 日志聚合
- **建议（P1）**：对由总控台 `spawnCommandLine` 启动的 agent，接管其 stdout/stderr 写入日志中心（复用 `logger.ts`），与 `logs` store 打通，形成"日志中心可见 agent 输出"。

### 缺口 K：无统计与导出
- **建议（P2）**：按日统计每个 agent 的运行时长 / CPU 峰值；支持导出当前 agent 快照为 JSON（排障用）。

### 缺口 L：测试覆盖不足
- **现状**：`docs/tests/test-cases.md` 已含 AI Agent 手工用例；单测侧已有 `agentAggregator` 相关测试但**缺少**：`agentDetect`（PATH/npm bin 命中与未命中）、`agentLauncher`（`resolveAgentLaunch` 找不到时返回 undefined、目录带空格加引号）、聚合对「根失活/孤儿」的边界。
- **建议**：补齐上述单测；完善 UI 用例（自定义 agent、筛选、清除目录）。

---

## 3. 完善需求（按优先级拆分）

### 3.1 P0 —— 正确性与可用性

| 需求 | 说明 | 涉及 |
| --- | --- | --- |
| REQ-01 根失活孤儿处理 | 聚合识别"根已死但有孤儿任务"，提供单独结束任务入口，状态标注孤儿 | `agentAggregator`、`AgentView`、`types` |
| REQ-02 任务活动语义化 | `AgentTaskProcess` 增加活动类型识别与徽标、按活动筛选 | `agentAggregator`、`types`、`AgentView` |
| REQ-03 自定义 agent 兜底启动 | 支持用户配置自定义 agent（名称/命令/图标/目录），未知 agent 不再只提示手动 | `agentLauncher`、`config`、`ipc`、store、视图 |
| REQ-04 已安装探测可刷新 | 低频自动重探 + UI 手动刷新，保证新增 agent 及时出现 | `monitor`、`agentDetect`、`ipc`、store、视图 |
| REQ-05 排序/分组/筛选 | 状态筛选、kind 分组、CPU/内存排序、关键字搜索 | store、`AgentView` |

### 3.2 P1 —— 效率与体验

| 需求 | 说明 | 涉及 |
| --- | --- | --- |
| REQ-06 活动/最近任务感知 | 轻量读取最近活动痕迹，展示"上次活动" | `agentAggregator`、`AgentView` |
| REQ-07 健康度诊断 | 运行中 agent 的健康/可疑/异常评估与诊断文案 | 新模块 `agentHealth`、`AgentView` |
| REQ-08 启动目录增强 | 清除目录、最近项目快捷选择 | `agents` store、`AgentView` |
| REQ-09 托盘/全局入口 | 托盘菜单打开视图、停止全部 agent（二次确认）、异常通知 | `index.ts`、`ipc`、notify |
| REQ-10 agent 日志聚合 | 总控台启动的 agent 输出进日志中心 | `processManager`、`logger`、`ipc` |

### 3.3 P2 —— 增值

| 需求 | 说明 | 涉及 |
| --- | --- | --- |
| REQ-11 资源治理 | 限制 agent CPU/内存/端口（v1 明确不做，本期仍列为远期） | 主进程新模块 |
| REQ-12 会话级解析 | 读取 `~/.codex` 等会话内容 | 主进程新模块 |
| REQ-13 多工作区 | 一个 agent 绑定多个项目目录、分别启动 | config、launcher、视图 |
| REQ-14 统计/导出 | 运行时长/CPU 峰值统计、快照导出 JSON | 新模块 + 视图 |

---

## 4. 受影响文件（规划）

**主进程 `src/main/`：**
- `agentAggregator.ts`：孤儿根判定、任务活动识别、失活清理
- `agentLauncher.ts`：自定义 agent 命令表合并、`resolveAgentLaunch` 扩展
- `agentDetect.ts`：重探、自定义 agent 纳入探测
- `agentHealth.ts`（新增）：健康度评估
- `monitor.ts`：重探调度、`snapshot.agents` 语义增强
- `ipc.ts`：新增 `agents:customAdd`、`agents:refresh`、`agents:logs` 等通道
- `config.ts` / `types.ts`：`customAgents`、`AgentTaskProcess.activity`、`AgentRow.orphan` 等字段

**渲染进程 `src/renderer/src/`：**
- `views/AgentView.vue`：筛选条、分组、任务徽标、孤儿态、自定义 agent 弹窗
- `stores/agents.ts`：filter/sort/group、刷新、自定义 agent action

**测试：**
- `tests/agentDetect.test.ts`、`tests/agentLauncher.test.ts`（新增）
- `tests/agentAggregator.test.ts`：补孤儿 / 活动识别用例
- `docs/tests/test-cases.md`：补自定义 agent、筛选、清除目录用例

---

## 5. 设计要点（实现前的关键约束）

1. **稳定标识**：保持 `AgentRow.id` 幂等；孤儿态不得因 pid 复用而误并到新 agent（结合 `createdAt` + kind 校验）。
2. **killTree 安全**：停止/退出一律沿用 `killTree` 按进程树安全结束，绝不按端口/按命令名杀进程（沿用启动台红线）。
3. **识别精度**：任务活动识别、自定义 agent 均沿用 `portScanner` 的边界匹配 + 浏览器黑名单，避免误判。
4. **探测频率**：自动重探须带节流（建议 ≥5 分钟），避免高频 PowerShell 调用开销。
5. **兼容性**：`ConfigFile` 新增字段必须向后兼容（缺失时回退默认，参考现有 `agentDirs` 的容错写法）。

---

## 6. 验收标准（Done 定义）

- **REQ-01**：人为杀掉 agent 应用本体但留孤儿子进程，卡片显示孤儿态，可单独结束孤儿任务，不误报"运行中"。
- **REQ-02**：运行 npm test / pnpm dev 的任务在卡片上出现对应活动徽标；可按活动筛选。
- **REQ-03**：可添加自定义 agent，填命令后能一键启动；未知 agent 卡出现"配置启动命令"入口。
- **REQ-04**：`npm i -g` 新 agent 后，手动刷新（或 ≤10 分钟内自动）即出现该 agent 卡。
- **REQ-05**：支持状态筛选 / kind 分组 / CPU 内存排序 / 关键字搜索，均即时生效。
- **REQ-06/07/08/09/10**：按各自 P1 需求验收，均有可见 UI 或通知表现。
- **回归**：现有 v1 功能（识别、聚合、启停、重启、启动目录）全部通过 `docs/tests/test-cases.md` 中 AI Agent 用例，`npm run typecheck`、`npm test` 全绿。

---

## 7. 明确不做（YAGNI，与 v1 保持一致）

- 资源治理（CPU/内存/端口限制）——远期 P2，本期不实现。
- 会话级内容解析（读取 agent 私有日志做语义理解）。
- 从总控台主动向 agent 发起新任务（控制级对接）。

---

## 8. 建议实施顺序

1. **Phase 1（P0）**：REQ-01/02/03/04/05 —— 提升正确性与基础可用性。
2. **Phase 2（P1）**：REQ-06/07/08/09/10 —— 体验与效率增强。
3. **Phase 3（P2）**：REQ-11/12/13/14 —— 增值能力（可后续评估）。

---

## 9. 实施记录（2026-08-21）

本次已将下列需求落地并全量验证（`npm run typecheck` + `npm test` 通过，新增单测覆盖）：

### 已实现

| 需求 | 落地说明 |
| --- | --- |
| REQ-01 孤儿态 | `monitor.ts::buildAgentRows` 跨轮跟踪根进程失活，残留任务标记 `status:'orphan'`，卡片提供"结束残留任务"，UI 状态条/徽标/统计条均体现 |
| REQ-02 活动语义化 | `agentAggregator.ts::classifyActivity` 命令行启发式识别 test/build/dev-server/install/git/lint/script/shell/other；`AgentTaskProcess` 增加 `activity`/`activityLabel`；卡片任务行显示活动徽标 |
| REQ-03 自定义 agent | `config.ts` 持久化 `customAgents`；`agentLauncher` 合并自定义命令表（含 `withDirArg`）；UI「自定义 agent」弹窗增删 |
| REQ-04 探测可刷新 | `monitor` 每 5 分钟自动重探 + 渲染层「刷新」按钮 + `agents:refresh` IPC |
| REQ-05 排序/分组/筛选 | `stores/agents.ts` 提供状态筛选 / CPU·内存·最近活动排序 / 关键字搜索 / 按 kind 分组；UI 筛选栏 |
| REQ-06 最近活动 | `AgentRow.lastActiveAt`（末次任务心跳）→ 最近活动排序 + 卡片"累计运行"展示 |
| REQ-07 健康度 | `agentAggregator::evaluateHealth` → healthy/suspicious/abnormal，卡片徽标 + 诊断建议 |
| REQ-08 目录增强 | 卡片支持"清除启动目录" |
| REQ-09 托盘+通知 | 托盘新增「停止全部 AI Agent」；孤儿异常发系统通知（受 `settings.notifyAgentActivity` 开关控制） |
| REQ-10 日志聚合 | 总控台启动的 agent 输出接入日志中心（`agent-<kind>` 日志通道） |
| REQ-14 统计 | `AgentRow.totalRunMs` 会话内累计运行时长 + 卡片展示 |

### 明确保留（YAGNI / 范围外）

| 需求 | 原因 |
| --- | --- |
| REQ-11 资源治理 | 需操作系统级限制能力，风险高、与 v1 明确 YAGNI 一致 |
| REQ-12 会话级解析 | 读取 agent 私有会话日志，语义复杂、隐私敏感 |
| REQ-13 多工作区 | 与现有"每 agent 单目录"数据模型冲突，改动面大、价值低；当前单目录已满足核心诉求 |

### 新增/变更文件清单

- 共享：`src/shared/types.ts`、`src/shared/api.ts`
- 主进程：`agentAggregator.ts`、`agentDetect.ts`、`agentLauncher.ts`、`config.ts`、`monitor.ts`、`ipc.ts`、`index.ts`
- Preload：`preload/index.ts`
- 渲染：`stores/agents.ts`、`stores/settings.ts`、`views/AgentView.vue`、`components/AgentCard.vue`（新增）
- 测试：`tests/agentActivity.test.ts`（新增）、`tests/agentLauncher.test.ts`（扩充自定义 agent 用例）

---

## 10. 需求确认点核查（2026-08-21）

针对以下确认点逐条核查并完成修复，全量验证（`npm run typecheck` + `npm test` 106 通过 + lint 无 error）：

### 确认点 1：AI Agent 自动检测已安装应用（如 codex 等）

**已满足 + 增强**。`agentDetect.ts` 通过 PATH / npm 全局 bin 检测 CLI agent。本轮增强 `commands.ts::findExecutable` 的 `searchKnownRoots`，新增覆盖：

- `%LOCALAPPDATA%\Programs\`（Cursor / Windsurf / ChatGPT / Claude Desktop 等桌面 App）
- `%APPDATA%\npm\`（pnpm/yarn 全局 CLI agent）
- `%USERPROFILE%\.codex\bin\`（Codex 官方安装器默认位置）
- `%USERPROFILE%\.local\bin\`（Claude Code 官方安装器默认位置）
- macOS/Linux：`~/.codex/bin`、`~/.local/bin`、`/opt/homebrew/bin` 等

### 确认点 2：不强制控制 agent，需查看运行状态 + 运行时间

**已满足**。状态（`running` / `idle` / `orphan` / `not-running`）+ 运行时长（`createdAt` 启动时刻、`totalRunMs` 会话累计、`lastActiveAt` 最近活动）+ 资源占用 + 任务进程展开，均已在 `AgentCard` 展示。

### 确认点 3：已检测 agent 适配正确启动命令，不编造假命令

**已核查 + 修正**。`AGENT_CATALOG` 全部为真实命令名（`codex` / `claude` / `opencode` / `gemini` / `kimi` / `chatgpt` / `cursor` / `windsurf` / `cline`→`code`），不虚构不存在的命令。配合确认点 1 的路径增强，`resolveAgentLaunch` 用 `findExecutable` 实校（找不到即返回 `undefined`，渲染层提示手动打开），**只给出可真实解析到可执行文件的启动命令**，杜绝假命令。

### 确认点 4：启动台自动识别项目启动入口 + 启动命令 + 常用命令适配

**已满足 + 扩充**。`projectDetect.ts` 已覆盖 Node(pnpm/yarn/bun/npm) / Hexo / Hugo / Django / FastAPI / Flask / Go / Rust / Maven / Gradle / 静态站点 / 脚本。本轮新增：

- **Deno**（`deno.json`/`deno.jsonc`）：有 `dev` task → `deno task dev`；否则 → `deno run --allow-net main.ts`
- **.NET**（`*.csproj` / `*.sln` / `Program.cs`）：→ `dotnet run`
- 均支持端口推断（`guessPortFromScript`）与 `resolveTypeLabel` 类型归并

### 本轮新增测试

- `tests/projectDetect.test.ts`：Deno（含/不含 dev task）、.NET（csproj / Program.cs）
- `tests/commands.test.ts`：`%LOCALAPPDATA%\Programs` 下桌面 App 型 agent 可被 `findExecutable` 解析

---

## 11. 业务变更：AI Agent 改为「只读展示运行中 agent」（2026-08-21）

**业务方向调整**：AI Agent 模块不再提供任何控制能力（启动/停止/重启/退出/自定义 agent/启动目录/刷新），只**展示当前正在运行的 agent**（含命令行版与桌面应用），强调检测的准确性。

### 变更内容

| 层级 | 变更 |
| --- | --- |
| 主进程聚合 | `monitor.ts::buildAgentRows` 简化为只返回 `aggregateAgents` 结果（运行中），**移除**：已安装未运行合并、孤儿态检测、孤儿通知、agent 自动重探 |
| 进程识别 | `portScanner.ts`：`cursor.exe`/`cursor-agent.exe` 从 editor 归入 **AI**（桌面 App 型 agent 准确识别）；`friendlyLabel` 补充 Cursor 标签 |
| IPC | `ipc.ts`：**移除全部 agent 控制通道**（stopTask / stopAgent / startAgent / restartAgent / getLaunchDir / setLaunchDir / listCustom / addCustom / removeCustom / refresh） |
| 托盘 | `index.ts`：移除「停止全部 AI Agent」菜单项与对应逻辑 |
| Preload / 共享 | 移除上述控制 API 与 `agents:changed` 事件 |
| 渲染 Store | `stores/agents.ts` 重写为纯展示：只保留运行中统计、排序/搜索/分组、`formatDuration`；**移除所有控制 action** |
| 渲染视图 | `AgentView.vue` / `AgentCard.vue` 精简：去掉启动目录、操作按钮、自定义弹窗、刷新；仅展示状态、资源、健康度、运行时长、派生任务 |

### 保留（说明）

- `agentLauncher.ts` / `agentDetect.ts`：作为独立启动命令/检测知识模块保留（含单测），当前业务已不调用。
- `ConfigStore.agentDirs` / `customAgents` 字段与方法：保留以兼容旧配置，不影响只读展示。

### 验证

`npm run typecheck`（node + web）✅、`npm test` 106 全绿 ✅、改动文件 lint 无 error ✅
