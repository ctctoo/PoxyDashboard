import { describe, expect, it } from 'vitest'
import { fuzzyMatch } from '../src/renderer/src/lib/fuzzy'

describe('fuzzyMatch', () => {
  it('子序列匹配得分大于 0', () => {
    expect(fuzzyMatch('服务', '服务监控')).toBeGreaterThan(0)
    expect(fuzzyMatch('务监控', '服务监控')).toBeGreaterThan(0)
  })

  it('不匹配返回 0', () => {
    expect(fuzzyMatch('zzz', '服务监控')).toBe(0)
  })

  it('连续匹配得分更高', () => {
    const consecutive = fuzzyMatch('日志', '打开日志中心')
    const scattered = fuzzyMatch('志心中', '打开日志中心')
    expect(consecutive).toBeGreaterThan(scattered)
  })
})
