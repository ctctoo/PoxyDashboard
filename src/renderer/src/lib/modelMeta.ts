import type { ModelRuntime } from '@shared/types'

/** 各框架显示名称 */
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

/** 各框架图标 */
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

/** 各框架默认端口 */
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

/** 各框架默认模型文件过滤器（用于文件选择器） */
export const runtimeExtensions: Partial<Record<ModelRuntime, string[]>> = {
  llamacpp: ['gguf'],
  'llamacpp-python': ['gguf'],
  koboldcpp: ['gguf', 'bin'],
  gpt4all: ['gguf', 'bin']
}
