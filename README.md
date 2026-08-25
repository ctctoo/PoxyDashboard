# 总控台（Dashboard）

一个运行在本机的桌面「总控台」，用来管理你的服务与任务、监控这台电脑在跑什么、聚合本机应用 / 工作区 / 本地大模型 / AI Agent、集中查看实时日志，并支持 ⌘K 全键盘命令面板与 ⌘J 日志中心。

## 技术栈

- Electron 39 + electron-vite 5 + Vue 3.5 + TypeScript
- Tailwind CSS v4（自动/浅色/深色三态主题）
- Pinia（状态管理）、vuedraggable（卡片拖拽排序）、lucide 图标
- 主进程采用模块化运行时架构：`core/` 提供 `runtimeEngine`（调度 / 状态机）/ `eventBus`（进程内事件总线）/ `permission`（权限校验）；`modules/` 分业务模块（application / models / workspace）。主进程负责进程管理 / 端口扫描 / 日志采集 / 通知 / 配置存储，渲染进程只通过类型化 IPC 通信（contextIsolation 开启）。

## 功能

### 首页（系统总览）
- 一屏纵览本机运行状态：CPU / 内存 / 磁盘占用，以及运行中的应用数、服务数、容器数、数据库数、AI Agent 数、工作区数、本地模型数、待处理告警数。
- 顶部提供快捷搜索（⌘K 入口）与全局操作；各指标卡片点击可跳转对应视图。
- 磁盘卡片展示各驱动器可用空间；告警卡片汇总配置失效、端口冲突、异常退出等需要关注的事项。

### 启动台
- 添加服务 / 任务：选择工作区文件夹后自动识别项目类型（Node/pnpm/yarn/bun、Hexo、Hugo、Django、FastAPI、Flask、Go、Rust、Deno、.NET、Maven/Gradle、静态站点等）并给出候选命令，识别到常用脚本时自动推断端口；也可以「选择脚本」（自动生成执行命令）或完全手动填写。
- service 是长期服务（端口语义，运行后自动发现监听端口）；task 是批处理（强制无端口，按退出码判定结果）。
- 卡片：大按钮启动/停止（任务是运行/中止）；右侧常显一排小按钮：复制链接、日志、诊断、重启、编辑、删除。
- 配置失效（目录/脚本丢失、命令不在 PATH）直接标出原因并禁用启动；「启动诊断」给出修复建议。
- 筛选：服务（全部/运行中/已停止/异常）、任务（全部/运行中/成功/失败/已取消）即时切换。
- 排序：鼠标拖拽；聚焦卡片后按空格进入键盘排序（方向键移动、空格确认、Esc 取消）。
- 快捷操作：一键停止全部运行中的应用（二次确认，逐个安全停止，绝不按端口杀进程）。

### 服务监控
- 概览卡：在线服务 / 后台应用 / 总 CPU / 总内存（附最近一分钟负载曲线）/ 端口警告 / 最后更新。
- 服务表格：PID、端口（点击直接打开）、目录（由命令行推测）、负载、时长、状态、启动者溯源徽标（Codex / Claude / Kimi / VS Code / Cursor / 终端 / 总控台 / 系统）。
- 新端口提醒：页面打开期间新出现的监听端口单独提醒，可「加入启动台」（自动识别项目并原子认领进程）、「忽略提醒」（保留在服务表格，且持久记住不再打扰）或「忽略并隐藏」。首次扫描的存量端口不会误报，总控台自己启动的应用端口也不会误报。
- 系统/GUI 进程默认折叠在「应用后台」；被隐藏的服务可在「已隐藏的服务」中恢复。
- 关注的进程：输入关键字（如 `ffmpeg`）回车，匹配进程实时列出。
- 数据库与 Docker 容器已独立为侧边栏入口（见下），服务表格仅展示普通监听服务。

### 数据库
- 独立侧边栏入口，展示本机数据库实例（MySQL / Redis / PostgreSQL 等）：图标、名称、版本、状态、端口。
- 运行中优先排序；可对运行中的库「停止」、对已停止的库「启动」（有 Windows 服务的走服务启停）。
- 点击端口徽标打开管理页；已停止的库可「移除」记录（不影响实际进程）。

### Docker
- 独立侧边栏入口，展示本机 Docker 容器：名称、镜像、状态、端口映射。
- 运行中优先排序；可「停止」（docker stop）/「启动」（docker start）容器。
- 每个映射端口独立徽标，点击打开对应服务页。

### 日志中心（⌘J）
- 所有应用按「运行中优先」排列；点任意一行查看实时日志。
- 底部固定「总控台自身日志」入口。
- 支持自动滚动、仅错误过滤、清屏、复制。

### 设置中心
- 任务完成通知开关（系统通知，切走页面也能收到）。
- 外观三态：自动 / 浅色 / 深色。
- 关于：版本、本地端口、工作目录、数据目录、运行环境。

### AI Agent
- **只读展示当前正在运行的 AI agent**（Codex / Claude / OpenCode / Kimi / ChatGPT / Gemini / Windsurf / Cursor / Cline 等），聚合为卡片视图，不提供任何启动/停止/重启等控制能力。
- **自动检测**：覆盖命令行版（npm 全局 bin / PATH / `~/.codex/bin` / `~/.local/bin`）与桌面应用版（`%LOCALAPPDATA%\Programs\` 下的 Cursor、Windsurf、ChatGPT 桌面版等），已安装即自动出现。
- 每张卡片展示状态、PID、运行时长（本次启动 + 会话累计）、CPU / 内存占用、监听端口、健康度（正常 / 可疑 / 异常），展开可查看派生的任务进程（命令行推断 + 活动类型识别）。
- **精确识别**：AI 判定采用命令名边界匹配 + 浏览器黑名单，避免把 Edge/Chrome 等误判为 agent。
- 支持按 CPU / 内存 / 任务数 / 最近活动排序、关键字搜索、按类型分组。
- 集成命令面板：`打开 AI Agent` 可一键切换视图。

### 本机应用
- 独立侧边栏入口，聚合本机已安装应用：扫描开始菜单、注册表卸载项与 `Program Files`，自动归类（开发 / 浏览器 / 工具 / 游戏 / 其他）。
- 一键启动应用；支持「置顶」常用应用、关键字搜索、按分类筛选。
- 可手动「添加应用」登记非标准安装位置的程序（指定名称、可执行路径、图标）。
- 集成命令面板：`打开应用管理` 切换视图、`启动「应用名」` 直接拉起本机应用。

### 工作区
- 独立侧边栏入口，登记你常用的项目目录。
- 自动识别技术栈（Node / Python / Go / Rust / .NET / 静态站点等）并给出推荐启动命令。
- 支持「打开目录」（文件管理器）、「在终端打开」、「一键启动」（按推荐命令运行，进入启动台管理）。
- 关键字搜索与 Grid/列表视图切换。

### 本地大模型
- 独立侧边栏入口，自动发现本机本地推理框架实例（ollama / llama.cpp / vllm 等）。
- 展示已加载/可用的 GGUF 模型、框架类型、监听端口与运行状态。
- 支持对模型实例「启动 / 停止」（按框架对应的进程管理），点击端口徽标打开模型服务页。

### 命令面板（⌘K）
- 全局搜索并执行：添加服务/任务、启动/停止/重启任意应用、打开页面（总览 / 应用管理 / 工作区 / 启动台 / 监控 / 数据库 / Docker / AI Agent / 日志 / 设置）、查看日志、启动本机应用、打开/启动工作区、停止全部、开关任务通知、切换主题、查看总控台日志，全键盘操作。

### 加载与体验
- 应用启动时展示品牌启动动画，按步骤加载配置 / 应用 / 进程 / Agent / 总览 / 应用管理 / 工作区 / 本地模型，待首帧数据就绪后淡出。
- 各视图（总览 / 应用管理 / 工作区 / 本地模型 / 监控 / AI Agent / 数据库 / Docker / 启动台）在数据未就绪时显示骨架屏加载动画，而非空白或误导性的空态。
- 视图切换带淡入 + 位移动画，交互更平滑；支持自动 / 浅色 / 深色三态主题。

## 使用要点

- 红色按钮（删除、结束进程、停止全部）需要二次确认。
- 批处理任务退出语义：`0` = 成功；`130` = 用户主动取消（显示「已取消」）；其他非零 = 失败；总控台按钮主动中止单独显示为「已中止」。
- 选择批处理脚本时，只保存脚本的**绝对路径**和生成的执行命令，不会复制或托管脚本内容。脚本移动、改名或删除后任务会失效；建议把个人脚本放在长期稳定、会单独备份的自动化目录。
- 停止总控台不会自动停止已启动的独立服务；配置里的应用、图标、关注关键字、隐藏/置顶标记都会保留。
- 停止操作只按 PID 安全结束对应进程树（`taskkill /T /F`），绝不按端口杀进程。

## 数据与目录

| 项目 | 位置 |
| --- | --- |
| 配置 | `%APPDATA%\dashboard\data\config.json`（原子写入） |
| 应用日志 | `%APPDATA%\dashboard\data\logs\<appId>.log`（单文件滚动上限 5MB） |
| 只读状态接口 | `http://127.0.0.1:16888/` 与 `/api/apps`（可用环境变量 `DASH_STATUS_PORT` 覆盖；被占用时自动改用随机端口，实际端口见设置中心） |

## 开发

```bash
npm install
npm run dev          # 开发模式（HMR）
npm run typecheck    # 主进程 + 渲染进程类型检查
npm test             # 单元测试（vitest）
npm run build        # 类型检查 + 构建到 out/
npm run build:unpack # 构建并生成免安装目录（--dir，不解包安装包）
npm run build:win    # 打包 Windows 安装包（NSIS）
npm run build:mac    # 打包 macOS 安装包（dmg）
npm run build:linux  # 打包 Linux 安装包（AppImage / deb）
```

> 构建脚本默认走 npmmirror 的 electron-builder 二进制镜像；如需要官方源，去掉命令中的 `cross-env ELECTRON_BUILDER_BINARIES_MIRROR=...` 前缀即可。

> 如果 npm 的 install-scripts 策略拦截了 Electron 二进制下载：
> `node node_modules/electron/install.js`，并确认 `node_modules/electron/path.txt` 内容为 `electron.exe`（无换行）。

### 冒烟测试

设置环境变量 `DASH_SMOKE=<png 保存路径>` 后运行 `npm run dev`：应用会自动加载、遍历全部视图、启动/停止示例服务与任务、操作命令面板，输出 DOM 校验日志并截图后退出。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `⌘K` / `Ctrl+K` | 命令面板 |
| `⌘J` / `Ctrl+J` | 日志中心 |
| `F12` | 开发者工具（开发模式） |

快捷键由主进程 `before-input-event` 捕获，不会被浏览器保留键（如 ⌘L）冲突。

## 项目结构

```
src/
├── main/                      # Electron 主进程
│   ├── index.ts               # 窗口 / 托盘 / 快捷键 / 本地只读 HTTP 服务
│   ├── ipc.ts                 # 主进程 IPC 路由总入口
│   ├── commands.ts            # 命令解析 / 执行引擎（tokenize / parseCommand / spawnCommandLine / 可执行文件查找 / 进程树结束）
│   ├── config.ts              # JSON 配置存储（原子写入）
│   ├── logger.ts              # 环形缓冲 + 滚动日志文件
│   ├── notify.ts              # 系统通知
│   ├── validate.ts            # 服务 / 任务配置校验（失效检测）
│   ├── processManager.ts      # 启停、进程树安全停止、退出码语义
│   ├── monitor.ts             # 端口扫描调度、新端口提醒、运行中 agent 聚合
│   ├── portScanner.ts         # PowerShell 采集监听端口与进程信息、溯源分类
│   ├── projectDetect.ts       # 项目类型识别 / 脚本命令生成（Node/Hexo/Go/Rust/Deno/.NET 等）
│   ├── dbDetect.ts            # 本机数据库实例发现（MySQL/Redis/PostgreSQL 等）
│   ├── dockerScan.ts          # 本机 Docker 容器枚举
│   ├── agentAggregator.ts     # AI agent 进程树聚合（应用本体 + 派生任务 + 活动识别 + 健康度）
│   ├── agentDetect.ts         # agent 检测知识模块（只读展示，控制逻辑未调用）
│   ├── agentLauncher.ts       # agent 启动命令知识模块（只读展示，控制逻辑未调用）
│   ├── core/                  # 运行时核心
│   │   ├── runtimeEngine.ts   # 运行时引擎（调度 / 状态机）
│   │   ├── eventBus.ts        # 进程内事件总线
│   │   └── permission.ts      # 权限 / 安全校验
│   ├── modules/               # 业务模块
│   │   ├── application/       # 本机应用管理器（Module 2：开始菜单 / 注册表 / Program Files 发现 + 持久化）
│   │   │   ├── discover.ts / discoverWorker.ts / service.ts
│   │   ├── models/            # 本地大模型模块（LocalModel：框架检测 / 进程管理 / 命令生成）
│   │   │   ├── command.ts / detect.ts / process.ts / service.ts
│   │   ├── workspace/         # 工作区服务
│   │   │   └── service.ts
│   │   ├── index.ts / ipc.ts
│   └── storage/               # 持久化
│       └── database.ts        # 本地数据存储
├── preload/                   # contextBridge 类型化 API（index.ts + 类型声明）
├── renderer/                  # Vue 3 界面
│   ├── src/
│   │   ├── views/             # 首页 / 监控 / 启动台 / 本机应用 / 工作区 / 数据库 / Docker / AI Agent / 本地大模型 / 日志 / 设置
│   │   ├── stores/            # Pinia 状态：应用 / 监控 / 系统概览 / 命令面板 / 日志 / 设置
│   │   ├── components/        # ViewLoading.vue（骨架屏）、AgentCard.vue（agent 卡片）等
│   │   └── composables/       # 跨视图组合式逻辑（加载态、键盘排序等）
│   └── index.html
└── shared/                    # 主进程与渲染进程共享的类型定义与 API 契约
    ├── types.ts / api.ts
```

> 说明：`agentLauncher.ts` / `agentDetect.ts` 作为独立的启动命令 / 检测知识模块保留，当前 AI Agent 业务为只读展示，已不调用其控制逻辑。
