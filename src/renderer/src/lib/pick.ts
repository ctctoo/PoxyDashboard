import { api } from './api'

/** 弹出文件选择器，选择一个可执行文件（.exe/.cmd/.bat/.com） */
export function pickExecutable(): Promise<string | null> {
  return api.pickExecutable()
}
