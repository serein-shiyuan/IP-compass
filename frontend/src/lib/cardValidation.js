// 定位卡字段校验（与后端规则保持一致）
export function validateCard(card) {
  const errors = []
  if (!card || typeof card !== 'object') {
    errors.push('定位卡数据不能为空')
    return errors
  }

  const requiredFields = ['oneLinePositioning', 'persona', 'promises', 'tags', 'profileAdvice']
  for (const field of requiredFields) {
    if (!(field in card)) {
      errors.push(`缺少字段：${field}`)
    }
  }
  if (errors.length > 0) return errors

  // 一句话定位：10-50 字
  const oneLineLen = charCount(card.oneLinePositioning)
  if (oneLineLen < 10 || oneLineLen > 50) {
    errors.push(`一句话定位需 10-50 字，当前 ${oneLineLen} 字`)
  }

  // 人设说明：1-3 句，每句 10-80 字
  const persona = Array.isArray(card.persona) ? card.persona : []
  if (persona.length < 1 || persona.length > 3) {
    errors.push(`人设说明需 1-3 句，当前 ${persona.length} 句`)
  }
  persona.forEach((s, i) => {
    const len = charCount(s)
    if (len < 10 || len > 80) {
      errors.push(`人设说明第 ${i + 1} 句需 10-80 字，当前 ${len} 字`)
    }
  })

  // 内容承诺：1-3 条，每条 5-40 字
  const promises = Array.isArray(card.promises) ? card.promises : []
  if (promises.length < 1 || promises.length > 3) {
    errors.push(`内容承诺需 1-3 条，当前 ${promises.length} 条`)
  }
  promises.forEach((s, i) => {
    const len = charCount(s)
    if (len < 5 || len > 40) {
      errors.push(`内容承诺第 ${i + 1} 条需 5-40 字，当前 ${len} 字`)
    }
  })

  // 专属标签：5-8 个，每个 2-8 字，不可重复
  const tags = Array.isArray(card.tags) ? card.tags : []
  if (tags.length < 5 || tags.length > 8) {
    errors.push(`专属标签需 5-8 个，当前 ${tags.length} 个`)
  }
  const seen = new Set()
  tags.forEach((t, i) => {
    const s = String(t).trim()
    const len = charCount(s)
    if (len < 2 || len > 8) {
      errors.push(`专属标签第 ${i + 1} 个需 2-8 字，当前 ${len} 字`)
    }
    if (seen.has(s)) {
      errors.push(`标签重复：${s}`)
    }
    seen.add(s)
  })

  return errors
}

function charCount(str) {
  return Array.from(String(str || '')).length
}
