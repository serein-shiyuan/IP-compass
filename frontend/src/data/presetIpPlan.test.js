import { describe, it, expect } from 'vitest'
import presetIpPlan from './presetIpPlan.js'

function validateIpPlan(plan) {
  const errors = []
  if (!plan || typeof plan !== 'object') {
    errors.push('IP 方案数据不能为空')
    return errors
  }
  if (!plan.positioning?.oneLine || plan.positioning.oneLine.length < 5) {
    errors.push('一句话定位需至少 5 个字')
  }
  if (!plan.positioning?.tag) {
    errors.push('专属标签不能为空')
  }
  if (!Array.isArray(plan.positioning?.values) || plan.positioning.values.length === 0) {
    errors.push('账号提供的价值至少 1 条')
  }
  if (!Array.isArray(plan.contentMatrix?.mainLines) || plan.contentMatrix.mainLines.length < 2) {
    errors.push('内容主线至少 2 条')
  }
  if (!Array.isArray(plan.topTopics) || plan.topTopics.length < 3) {
    errors.push('选题至少 3 条')
  }
  return errors
}

describe('presetIpPlan 数据完整性', () => {
  it('TC-004: 应通过 validateIpPlan 所有校验', () => {
    const errors = validateIpPlan(presetIpPlan)
    expect(errors).toEqual([])
  })

  it('TC-007: 长文本和特殊字符应正常存在且可 JSON 序列化', () => {
    const json = JSON.stringify(presetIpPlan)
    expect(json).toBeTruthy()
    const parsed = JSON.parse(json)
    expect(parsed.summary.length).toBeGreaterThan(10)
    expect(parsed.positioning.profileDesign.length).toBeGreaterThan(10)
  })

  it('TC-004-边界: 主线条目应为 5 条', () => {
    expect(presetIpPlan.contentMatrix.mainLines).toHaveLength(5)
  })

  it('TC-004-边界: 前 10 条选题应完整', () => {
    expect(presetIpPlan.topTopics).toHaveLength(10)
    presetIpPlan.topTopics.forEach((t) => {
      expect(t.title).toBeTruthy()
      expect(t.direction).toBeTruthy()
    })
  })
})
