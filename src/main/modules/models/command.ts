import type { ModelRuntime } from '../../../shared/types'

/**
 * 构建各框架的启动命令。返回带引号的命令字符串，供 spawnCommandLine 解析。
 * 不含对话功能，仅启动本地模型推理服务（OpenAI 兼容 HTTP 服务）。
 */

function quote(p: string): string {
  return p.includes(' ') ? `"${p}"` : p
}

export interface BuildContext {
  runtime: ModelRuntime
  model: string
  binPath?: string
  host: string
  port: number
  extraArgs?: string
  dir?: string
}

/** 拆分多行额外参数为参数数组 */
function extraArgsList(extraArgs?: string): string[] {
  if (!extraArgs) return []
  return extraArgs
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => quote(s))
}

export function buildCommand(ctx: BuildContext): string {
  const { runtime, host, port, extraArgs } = ctx
  const extras = extraArgsList(extraArgs).join(' ')
  const prefix = extras ? ` ${extras}` : ''

  switch (runtime) {
    case 'ollama':
      // ollama serve 默认监听 11434；可用 OLLAMA_HOST 指定地址端口
      return `ollama serve`
    case 'llamacpp':
    case 'llamacpp-python': {
      const bin = ctx.binPath ? quote(ctx.binPath) : 'llama-server'
      return `${bin} -m ${quote(ctx.model)} --host ${host} --port ${port}${prefix}`
    }
    case 'vllm':
      // vllm serve <model> --host --port
      return `vllm serve ${quote(ctx.model)} --host ${host} --port ${port}${prefix}`
    case 'lmstudio':
      return `lm-studio --model ${quote(ctx.model)} --host ${host} --port ${port}${prefix}`
    case 'koboldcpp': {
      const bin = ctx.binPath ? quote(ctx.binPath) : 'koboldcpp'
      return `${bin} ${quote(ctx.model)} --host ${host} --port ${port}${prefix}`
    }
    case 'textgen':
      // text-generation-webui: python server.py --listen --api --listen-port
      return `python server.py --listen --listen-port ${port}${prefix}`
    case 'gpt4all':
      return `gpt4all --model ${quote(ctx.model)} --port ${port}${prefix}`
    case 'custom': {
      const bin = ctx.binPath ? quote(ctx.binPath) : ''
      return bin ? `${bin} ${quote(ctx.model)} --host ${host} --port ${port}${prefix}` : ``
    }
    default:
      return `${runtime} ${quote(ctx.model)}${prefix}`
  }
}

/** 各框架默认端口（用于表单默认值） */
export const runtimeDefaultPort: Record<ModelRuntime, number> = {
  ollama: 11434,
  llamacpp: 8080,
  vllm: 8000,
  lmstudio: 1234,
  koboldcpp: 5001,
  textgen: 7860,
  'llamacpp-python': 8000,
  gpt4all: 4891,
  custom: 8000
}

export const runtimeLabels: Record<ModelRuntime, string> = {
  ollama: 'Ollama',
  llamacpp: 'llama.cpp',
  vllm: 'vLLM',
  lmstudio: 'LM Studio',
  koboldcpp: 'KoboldCpp',
  textgen: 'text-generation-webui',
  'llamacpp-python': 'llama-cpp-python',
  gpt4all: 'GPT4All',
  custom: '自定义'
}

export const runtimeIcons: Record<ModelRuntime, string> = {
  ollama: '🦙',
  llamacpp: '🧠',
  vllm: '⚡',
  lmstudio: '🟣',
  koboldcpp: '🐉',
  textgen: '🖥️',
  'llamacpp-python': '🐍',
  gpt4all: '💬',
  custom: '⚙️'
}
