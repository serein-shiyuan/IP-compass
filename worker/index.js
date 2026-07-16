import { Router, json, error } from 'itty-router'
import { generateCard, normalizeCard } from '../backend/lib/positioning.js'
import { generateColumns } from '../backend/lib/contentStrategy.js'
import { generateTopics } from '../backend/lib/topicPool.js'
import { checkContentBias, validateDraftContent, generateDiagnosisReport } from '../backend/lib/diagnosis.js'
import { analyzeAttribution } from '../backend/lib/attribution.js'
import { generateOptimizationSuggestions } from '../backend/lib/optimization.js'
import { chatNextQuestion, generateIpPlan, validateIpPlan, extractPositioningCardFromIpPlan } from '../backend/lib/ipPlan.js'

const router = Router()

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function ok(data) {
  return { ok: true, data }
}

function fail(code, message, extra = null) {
  const error = { code, message }
  if (extra && typeof extra === 'object') Object.assign(error, extra)
  return { ok: false, error }
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders
    }
  })
}

function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}

async function getKey(env, store, userId) {
  const raw = await env.IP_COMPASS_KV.get(`${store}:${userId}`)
  return raw ? JSON.parse(raw) : null
}

async function setKey(env, store, userId, value) {
  await env.IP_COMPASS_KV.put(`${store}:${userId}`, JSON.stringify(value))
}

async function deleteKey(env, store, userId) {
  await env.IP_COMPASS_KV.delete(`${store}:${userId}`)
}

router.options('*', handleOptions)

router.get('/api/health', () => jsonResponse(ok({ status: 'ok', timestamp: new Date().toISOString() })))

router.post('/api/auth/anonymous', () => {
  try {
    const userId = crypto.randomUUID()
    return jsonResponse(ok({ userId, isAnonymous: true, createdAt: new Date().toISOString() }))
  } catch (err) {
    return jsonResponse(fail('UUID_GENERATION_FAILED', '无法创建用户标识，请刷新重试'), 500)
  }
})

router.get('/api/auth/me', (req) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) {
    return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  }
  return jsonResponse(ok({ userId, isAnonymous: true, isValid: true }))
})

function validateStageAnswers(stage1, stage2) {
  const errors = []
  if (!stage1 || typeof stage1 !== 'object') {
    errors.push('Stage 1 答案不能为空')
    return errors
  }
  for (const key of ['q1', 'q2', 'q3']) {
    const val = stage1[key]
    if (val === undefined || val === null || val === '') {
      errors.push(`Stage 1 缺少必填字段：${key}`)
    }
  }
  if (!Array.isArray(stage2) || stage2.length < 4) {
    errors.push('Stage 2 至少需要 4 个问答')
    return errors
  }
  for (let i = 0; i < stage2.length; i++) {
    const item = stage2[i]
    if (!item || typeof item !== 'object') {
      errors.push(`Stage 2 第 ${i + 1} 项格式错误`)
      continue
    }
    if (typeof item.question !== 'string' || item.question.trim() === '') {
      errors.push(`Stage 2 第 ${i + 1} 项缺少问题`)
    }
    if (typeof item.answer !== 'string' || item.answer.trim() === '') {
      errors.push(`Stage 2 第 ${i + 1} 项缺少回答`)
    }
  }
  return errors
}

router.post('/api/positioning/generate', async (req, env) => {
  const { userId, stage1, stage2 } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) {
    return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  }
  const errors = validateStageAnswers(stage1, stage2)
  if (errors.length > 0) return jsonResponse(fail('INVALID_ANSWERS', errors.join('；')), 400)

  try {
    const { card, source } = await generateCard(stage1, stage2, { deepseekApiKey: env.DEEPSEEK_API_KEY })
    await setKey(env, 'card', userId, { card, confirmed: false, createdAt: new Date().toISOString() })
    return jsonResponse(ok({ positioningCard: card, source }))
  } catch (err) {
    return jsonResponse(fail('GENERATION_FAILED', '定位卡生成失败，请重试'), 500)
  }
})

function validatePositioningCard(card) {
  const errors = []
  if (!card || typeof card !== 'object') {
    errors.push('定位卡数据不能为空')
    return errors
  }
  const requiredFields = ['oneLinePositioning', 'persona', 'promises', 'tags', 'profileAdvice']
  for (const field of requiredFields) {
    if (!(field in card)) errors.push(`定位卡缺少字段：${field}`)
  }
  if (errors.length > 0) return errors

  const oneLine = String(card.oneLinePositioning || '')
  const oneLineLen = Array.from(oneLine).length
  if (oneLineLen < 10 || oneLineLen > 50) errors.push(`一句话定位需 10-50 字，当前 ${oneLineLen} 字`)

  const persona = Array.isArray(card.persona) ? card.persona : []
  if (persona.length < 1 || persona.length > 3) errors.push(`人设说明需 1-3 句，当前 ${persona.length} 句`)
  persona.forEach((s, i) => {
    const len = Array.from(String(s)).length
    if (len < 10 || len > 80) errors.push(`人设说明第 ${i + 1} 句需 10-80 字，当前 ${len} 字`)
  })

  const promises = Array.isArray(card.promises) ? card.promises : []
  if (promises.length < 1 || promises.length > 3) errors.push(`内容承诺需 1-3 条，当前 ${promises.length} 条`)
  promises.forEach((s, i) => {
    const len = Array.from(String(s)).length
    if (len < 5 || len > 40) errors.push(`内容承诺第 ${i + 1} 条需 5-40 字，当前 ${len} 字`)
  })

  const tags = Array.isArray(card.tags) ? card.tags : []
  if (tags.length < 5 || tags.length > 8) errors.push(`专属标签需 5-8 个，当前 ${tags.length} 个`)
  const seen = new Set()
  tags.forEach((t, i) => {
    const s = String(t).trim()
    const len = Array.from(s).length
    if (len < 2 || len > 8) errors.push(`专属标签第 ${i + 1} 个需 2-8 字，当前 ${len} 字`)
    if (seen.has(s)) errors.push(`专属标签重复：${s}`)
    seen.add(s)
  })
  return errors
}

router.post('/api/positioning/confirm', async (req, env) => {
  const { userId, positioningCard, ipPlan } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) {
    return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  }

  let normalizedCard = null
  let storedIpPlan = null

  if (ipPlan && typeof ipPlan === 'object') {
    const errors = validateIpPlan(ipPlan)
    if (errors.length > 0) return jsonResponse(fail('VALIDATION_FAILED', errors.join('；')), 400)
    storedIpPlan = { ...ipPlan }
    normalizedCard = extractPositioningCardFromIpPlan(storedIpPlan)
    if (!normalizedCard) return jsonResponse(fail('NORMALIZE_FAILED', '无法从 IP 方案提取定位卡'), 400)
  } else {
    const errors = validatePositioningCard(positioningCard)
    if (errors.length > 0) return jsonResponse(fail('VALIDATION_FAILED', errors.join('；')), 400)
    normalizedCard = normalizeCard(positioningCard)
    if (!normalizedCard) return jsonResponse(fail('NORMALIZE_FAILED', '定位卡字段格式无法归一化'), 400)
  }

  const existing = await getKey(env, 'card', userId)
  const confirmedAt = new Date().toISOString()
  await setKey(env, 'card', userId, { card: normalizedCard, confirmed: true, createdAt: existing?.createdAt || confirmedAt, confirmedAt })

  if (storedIpPlan) {
    await setKey(env, 'ipplan', userId, { ipPlan: storedIpPlan, source: 'user', confirmed: true, confirmedAt, updatedAt: confirmedAt })
  }

  return jsonResponse(ok({ confirmedAt, homeState: 'positioned' }))
})

router.put('/api/positioning/card', async (req, env) => {
  const { userId, positioningCard, ipPlan } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) {
    return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  }

  let normalizedCard = null
  let storedIpPlan = null

  if (ipPlan && typeof ipPlan === 'object') {
    const errors = validateIpPlan(ipPlan)
    if (errors.length > 0) return jsonResponse(fail('VALIDATION_FAILED', errors.join('；')), 400)
    storedIpPlan = { ...ipPlan }
    normalizedCard = extractPositioningCardFromIpPlan(storedIpPlan)
    if (!normalizedCard) return jsonResponse(fail('NORMALIZE_FAILED', '无法从 IP 方案提取定位卡'), 400)
  } else {
    const errors = validatePositioningCard(positioningCard)
    if (errors.length > 0) return jsonResponse(fail('VALIDATION_FAILED', errors.join('；')), 400)
    normalizedCard = normalizeCard(positioningCard)
    if (!normalizedCard) return jsonResponse(fail('NORMALIZE_FAILED', '定位卡字段格式无法归一化'), 400)
  }

  const existing = await getKey(env, 'card', userId)
  const updatedAt = new Date().toISOString()
  await setKey(env, 'card', userId, { card: normalizedCard, confirmed: existing?.confirmed || false, createdAt: existing?.createdAt || updatedAt, updatedAt })

  if (storedIpPlan) {
    const existingIpPlan = await getKey(env, 'ipplan', userId)
    await setKey(env, 'ipplan', userId, {
      ipPlan: storedIpPlan,
      source: existingIpPlan?.source || 'user',
      confirmed: existingIpPlan?.confirmed || false,
      confirmedAt: existingIpPlan?.confirmedAt,
      updatedAt
    })
  }

  return jsonResponse(ok({ updatedAt, positioningCard: normalizedCard, ipPlan: storedIpPlan }))
})

router.get('/api/positioning/card', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) {
    return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  }
  const record = await getKey(env, 'card', userId)
  if (!record) return jsonResponse(fail('CARD_NOT_FOUND', '未找到定位卡'), 404)
  const ipPlanRecord = await getKey(env, 'ipplan', userId)
  return jsonResponse(ok({ positioningCard: record.card, isConfirmed: record.confirmed, ipPlan: ipPlanRecord?.ipPlan || null }))
})

function validatePositioningCardShape(card) {
  const errors = []
  if (!card || typeof card !== 'object') {
    errors.push('定位卡数据不能为空')
    return errors
  }
  const requiredFields = ['oneLinePositioning', 'persona', 'promises', 'tags', 'profileAdvice']
  for (const field of requiredFields) {
    if (!(field in card)) errors.push(`定位卡缺少字段：${field}`)
  }
  return errors
}

router.post('/api/content/columns/generate', async (req, env) => {
  const { userId, positioningCard, regenerate, ipPlan } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) {
    return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  }

  const effectiveCard = (ipPlan && ipPlan.positioning) ? extractPositioningCardFromIpPlan(ipPlan) : positioningCard
  const shapeErrors = validatePositioningCardShape(effectiveCard)
  if (shapeErrors.length > 0) return jsonResponse(fail('INVALID_CARD', shapeErrors.join('；')), 400)

  if (regenerate) await deleteKey(env, 'columns', userId)

  try {
    const { data, source } = await generateColumns(effectiveCard, { deepseekApiKey: env.DEEPSEEK_API_KEY, ipPlanSummary: ipPlan?.summary || '', ipPlan })
    const generatedAt = new Date().toISOString()
    await setKey(env, 'columns', userId, { columns: data.columns, generatedAt, source })
    return jsonResponse(ok({ columns: data.columns, generatedAt, source }))
  } catch (err) {
    return jsonResponse(fail('GENERATION_FAILED', '栏目矩阵生成失败，请重试'), 500)
  }
})

router.get('/api/content/columns', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const record = await getKey(env, 'columns', userId)
  if (!record) return jsonResponse(fail('COLUMNS_NOT_FOUND', '未找到栏目数据'), 404)
  return jsonResponse(ok({ columns: record.columns, generatedAt: record.generatedAt }))
})

router.delete('/api/content/columns', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  await deleteKey(env, 'columns', userId)
  return jsonResponse(ok({ deletedAt: new Date().toISOString() }))
})

const MAX_TOPICS_PER_USER = 50
const VALID_TOPIC_STATUSES = ['pending', 'used', 'discarded']

router.post('/api/content/topics/generate', async (req, env) => {
  const { userId, columns, positioningCard, ipPlan } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  if (!Array.isArray(columns) || columns.length < 3 || columns.length > 6) {
    return jsonResponse(fail('INVALID_COLUMNS', '栏目数量需为 3-6 个'), 400)
  }

  const effectiveCard = (ipPlan && ipPlan.positioning) ? extractPositioningCardFromIpPlan(ipPlan) : positioningCard
  const shapeErrors = validatePositioningCardShape(effectiveCard)
  if (shapeErrors.length > 0) return jsonResponse(fail('INVALID_CARD', shapeErrors.join('；')), 400)

  try {
    const { topics, source } = await generateTopics(columns, effectiveCard, { deepseekApiKey: env.DEEPSEEK_API_KEY, ipPlanSummary: ipPlan?.summary || '', ipPlan })
    const generatedAt = new Date().toISOString()
    await setKey(env, 'topics', userId, { topics, generatedAt, source })
    return jsonResponse(ok({ topics, generatedAt, source }))
  } catch (err) {
    return jsonResponse(fail('GENERATION_FAILED', '选题池生成失败，请重试'), 500)
  }
})

router.get('/api/content/topics', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const record = await getKey(env, 'topics', userId)
  if (!record) return jsonResponse(fail('TOPICS_NOT_FOUND', '未找到选题数据'), 404)
  return jsonResponse(ok({ topics: record.topics, generatedAt: record.generatedAt }))
})

router.post('/api/content/topics', async (req, env) => {
  const { userId, topic } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  if (!topic || typeof topic !== 'object') return jsonResponse(fail('INVALID_TOPIC', '选题数据不能为空'), 400)
  if (typeof topic.title !== 'string' || topic.title.trim() === '') return jsonResponse(fail('INVALID_TITLE', '选题标题不能为空'), 400)

  const points = Array.isArray(topic.points) ? topic.points.filter((p) => typeof p === 'string' && p.trim() !== '') : []
  if (points.length === 0) return jsonResponse(fail('INVALID_POINTS', '选题要点不能为空'), 400)

  const record = await getKey(env, 'topics', userId)
  if (!record) return jsonResponse(fail('TOPICS_NOT_FOUND', '未找到选题数据，请先生成选题池'), 404)
  if (record.topics.length >= MAX_TOPICS_PER_USER) {
    return jsonResponse(fail('POOL_FULL', '选题池已满，请清理旧选题后再添加'), 409)
  }

  const referenceSuggestionId = typeof topic.referenceSuggestionId === 'string' && topic.referenceSuggestionId.trim()
    ? topic.referenceSuggestionId.trim()
    : null
  if (referenceSuggestionId) {
    const existing = record.topics.find((t) => t.referenceSuggestionId === referenceSuggestionId)
    if (existing) return jsonResponse(ok({ topic: existing, updatedAt: new Date().toISOString() }))
  }

  const normalized = {
    id: `topic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    columnId: topic.columnId || record.topics[0]?.columnId || 'col_0',
    title: topic.title.trim(),
    points: points.slice(0, 3),
    materialAdvice: typeof topic.materialAdvice === 'string' ? topic.materialAdvice.trim() : '结合自身真实经历或案例进行创作',
    painPoints: Array.isArray(topic.painPoints) ? topic.painPoints.filter((p) => typeof p === 'string' && p.trim() !== '').slice(0, 3) : [],
    status: 'pending',
    source: typeof topic.source === 'string' && topic.source.trim() ? topic.source.trim() : 'manual',
    referenceSuggestionId,
    createdAt: new Date().toISOString()
  }
  record.topics.push(normalized)
  await setKey(env, 'topics', userId, record)
  return jsonResponse(ok({ topic: normalized, updatedAt: new Date().toISOString() }))
})

router.put('/api/content/topics/:id/status', async (req, env) => {
  const { id } = req.params
  const { userId, status } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  if (!VALID_TOPIC_STATUSES.includes(status)) return jsonResponse(fail('INVALID_STATUS', `状态必须是 ${VALID_TOPIC_STATUSES.join('/')} 之一`), 400)

  const record = await getKey(env, 'topics', userId)
  if (!record) return jsonResponse(fail('TOPICS_NOT_FOUND', '未找到选题数据'), 404)
  const topic = record.topics.find((t) => t.id === id)
  if (!topic) return jsonResponse(fail('TOPIC_NOT_FOUND', '未找到该选题'), 404)
  if (topic.status === 'used' && status !== 'used') return jsonResponse(fail('STATUS_LOCKED', '已用选题不可恢复'), 400)

  topic.status = status
  topic.updatedAt = new Date().toISOString()
  await setKey(env, 'topics', userId, record)
  return jsonResponse(ok({ updatedAt: topic.updatedAt }))
})

router.delete('/api/content/topics/cleanup', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const record = await getKey(env, 'topics', userId)
  if (!record) return jsonResponse(fail('TOPICS_NOT_FOUND', '未找到选题数据'), 404)
  const beforeCount = record.topics.length
  record.topics = record.topics.filter((t) => t.status !== 'discarded')
  await setKey(env, 'topics', userId, record)
  return jsonResponse(ok({ deletedCount: beforeCount - record.topics.length, deletedAt: new Date().toISOString() }))
})

router.delete('/api/content/topics/:id', async (req, env) => {
  const { id } = req.params
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const record = await getKey(env, 'topics', userId)
  if (!record) return jsonResponse(fail('TOPICS_NOT_FOUND', '未找到选题数据'), 404)
  const topic = record.topics.find((t) => t.id === id)
  if (!topic) return jsonResponse(fail('TOPIC_NOT_FOUND', '未找到该选题'), 404)
  if (!['discarded', 'used'].includes(topic.status)) return jsonResponse(fail('DELETE_NOT_ALLOWED', '仅弃用或已用选题可删除'), 400)
  record.topics = record.topics.filter((t) => t.id !== id)
  await setKey(env, 'topics', userId, record)
  return jsonResponse(ok({ deletedAt: new Date().toISOString() }))
})

router.post('/api/diagnosis/bias-check', async (req) => {
  const { title, script, tags, positioningCard, ipPlan } = await req.json()
  if (typeof title !== 'string' || title.trim() === '') return jsonResponse(fail('INVALID_TITLE', '标题不能为空'), 400)
  if (typeof script !== 'string' || script.trim() === '') return jsonResponse(fail('INVALID_SCRIPT', '文案不能为空'), 400)
  if (!Array.isArray(tags)) return jsonResponse(fail('INVALID_TAGS', '话题标签必须是数组'), 400)
  const effectiveCard = (ipPlan && ipPlan.positioning) ? extractPositioningCardFromIpPlan(ipPlan) : positioningCard
  try {
    const result = checkContentBias({ title, script, tags, positioningCard: effectiveCard })
    return jsonResponse(ok(result))
  } catch (err) {
    return jsonResponse(fail('CHECK_FAILED', '纠偏检查失败'), 500)
  }
})

router.post('/api/upload/cover', () => jsonResponse(fail('NOT_IMPLEMENTED', 'MVP 封面图由前端本地压缩为 base64，不上传服务器'), 501))

router.post('/api/diagnosis/draft', async (req, env) => {
  const { userId, content } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const validationErrors = validateDraftContent(content)
  if (validationErrors.length > 0) return jsonResponse(fail('INVALID_CONTENT', validationErrors.join('；')), 400)
  const draftId = crypto.randomUUID()
  const savedAt = new Date().toISOString()
  await setKey(env, 'diagnosisDraft', draftId, { userId, content, savedAt })
  return jsonResponse(ok({ draftId, savedAt }))
})

function validateReportPositioningCardShape(card) {
  const errors = []
  if (!card || typeof card !== 'object') {
    errors.push('定位卡数据不能为空')
    return errors
  }
  const requiredFields = ['oneLinePositioning', 'persona', 'promises', 'tags', 'profileAdvice']
  for (const field of requiredFields) {
    if (!(field in card)) errors.push(`定位卡缺少字段：${field}`)
  }
  return errors
}

router.post('/api/diagnosis/report', async (req, env) => {
  const { userId, content, positioningCard, ipPlan } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const validationErrors = validateDraftContent(content)
  if (validationErrors.length > 0) return jsonResponse(fail('INVALID_CONTENT', validationErrors.join('；')), 400)

  const effectiveCard = (ipPlan && ipPlan.positioning) ? extractPositioningCardFromIpPlan(ipPlan) : positioningCard
  const shapeErrors = validateReportPositioningCardShape(effectiveCard)
  if (shapeErrors.length > 0) return jsonResponse(fail('INVALID_CARD', shapeErrors.join('；')), 400)

  try {
    const report = await generateDiagnosisReport(content, effectiveCard, { deepseekApiKey: env.DEEPSEEK_API_KEY, ipPlanSummary: ipPlan?.summary || '' })
    const reportId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const record = { reportId, userId, content, positioningCard: effectiveCard, ...report, createdAt }
    await setKey(env, 'diagnosisReport', reportId, record)
    return jsonResponse(ok({ reportId, totalScore: report.totalScore, rating: report.rating, dimensions: report.dimensions, createdAt, source: report.source }))
  } catch (err) {
    return jsonResponse(fail('DIAGNOSIS_FAILED', '诊断失败，请稍后重试'), 500)
  }
})

router.get('/api/diagnosis/report', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  const reportId = url.searchParams.get('reportId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  if (!reportId) return jsonResponse(fail('INVALID_REPORT_ID', '报告 ID 不能为空'), 400)
  const record = await getKey(env, 'diagnosisReport', reportId)
  if (!record || record.userId !== userId) return jsonResponse(fail('REPORT_NOT_FOUND', '未找到诊断报告'), 404)
  return jsonResponse(ok({ report: record }))
})

function validateReport(report) {
  const errors = []
  if (!report || typeof report !== 'object') {
    errors.push('报告数据不能为空')
    return errors
  }
  if (typeof report.reportId !== 'string' || report.reportId.trim() === '') errors.push('report.reportId 必填')
  if (typeof report.totalScore !== 'number') errors.push('report.totalScore 必填且为数字')
  if (typeof report.rating !== 'string') errors.push('report.rating 必填')
  if (!Array.isArray(report.dimensions)) errors.push('report.dimensions 必填且为数组')
  return errors
}

router.post('/api/diagnosis/save', async (req, env) => {
  const { userId, report } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const validationErrors = validateReport(report)
  if (validationErrors.length > 0) return jsonResponse(fail('INVALID_REPORT', validationErrors.join('；')), 400)

  let history = (await getKey(env, 'diagnosisHistory', userId)) || []
  if (history.length >= 50) return jsonResponse(fail('HISTORY_FULL', '历史记录已满，请清理旧记录后再保存'), 409)

  const item = { id: report.reportId, date: new Date().toISOString(), topic: report.topic || '', totalScore: report.totalScore, rating: report.rating, dimensions: report.dimensions }
  history = [item, ...history]
  await setKey(env, 'diagnosisHistory', userId, history)
  return jsonResponse(ok({ savedAt: item.date, historyCount: history.length }))
})

router.get('/api/diagnosis/history', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const history = (await getKey(env, 'diagnosisHistory', userId)) || []
  return jsonResponse(ok({ history }))
})

router.delete('/api/diagnosis/history/:id', async (req, env) => {
  const { id } = req.params
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  let history = (await getKey(env, 'diagnosisHistory', userId)) || []
  const beforeCount = history.length
  history = history.filter((item) => item.id !== id)
  if (history.length === beforeCount) return jsonResponse(fail('HISTORY_NOT_FOUND', '未找到该历史记录'), 404)
  await setKey(env, 'diagnosisHistory', userId, history)
  return jsonResponse(ok({ deletedAt: new Date().toISOString(), historyCount: history.length }))
})

const MAX_VIDEO_ROWS = 7
const VIDEO_METRICS = ['playCount', 'completionRate', 'likes', 'comments', 'saves', 'shares', 'newFollowers']

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function validateVideoData(videos, topics) {
  const errors = []
  if (!Array.isArray(videos)) {
    errors.push('videos 必须是数组')
    return { errors, validVideos: [] }
  }
  if (videos.length === 0) {
    errors.push('至少需要录入 1 条视频数据')
    return { errors, validVideos: [] }
  }
  if (videos.length > MAX_VIDEO_ROWS) {
    errors.push(`最多录入 ${MAX_VIDEO_ROWS} 条视频数据`)
    return { errors, validVideos: [] }
  }

  const validTopicIds = new Set(topics?.map((t) => t.id) || [])
  const validVideos = []

  videos.forEach((video, index) => {
    const row = index + 1
    if (!video || typeof video !== 'object') {
      errors.push(`第 ${row} 行数据格式错误`)
      return
    }
    for (const key of VIDEO_METRICS) {
      const value = video[key]
      if (value === undefined || value === null || value === '') {
        errors.push(`第 ${row} 行 ${key} 不能为空`)
        continue
      }
      if (key === 'completionRate') {
        const num = Number(value)
        if (Number.isNaN(num) || num < 0 || num > 100) errors.push(`第 ${row} 行完播率需在 0-100 之间`)
      } else {
        const num = Number(value)
        if (!Number.isInteger(num) || num < 0) errors.push(`第 ${row} 行 ${key} 需为大于等于 0 的整数`)
      }
    }
    if (video.topicId && !validTopicIds.has(video.topicId)) errors.push(`第 ${row} 行关联的选题不存在`)
    const normalized = {
      videoIndex: row,
      playCount: Math.max(0, Math.floor(Number(video.playCount))),
      completionRate: Math.min(100, Math.max(0, Number(video.completionRate))),
      likes: Math.max(0, Math.floor(Number(video.likes))),
      comments: Math.max(0, Math.floor(Number(video.comments))),
      saves: Math.max(0, Math.floor(Number(video.saves))),
      shares: Math.max(0, Math.floor(Number(video.shares))),
      newFollowers: Math.max(0, Math.floor(Number(video.newFollowers))),
      topicId: video.topicId || null
    }
    validVideos.push(normalized)
  })
  return { errors, validVideos }
}

router.post('/api/video-data/submit', async (req, env) => {
  const { userId, videos } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const topicRecord = await getKey(env, 'topics', userId)
  const { errors, validVideos } = validateVideoData(videos, topicRecord?.topics)
  if (errors.length > 0) return jsonResponse(fail('VALIDATION_FAILED', errors.join('；'), { details: errors }), 400)

  const submittedAt = new Date().toISOString()
  const record = { videos: validVideos, submittedAt, isInsufficient: validVideos.length < 3 }
  await setKey(env, 'videoData', userId, record)
  await deleteKey(env, 'dashboard', userId)
  await deleteKey(env, 'attribution', userId)
  return jsonResponse(ok({ submittedAt, count: validVideos.length, isInsufficient: record.isInsufficient }))
})

router.get('/api/video-data', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const record = await getKey(env, 'videoData', userId)
  if (!record) return jsonResponse(fail('DATA_NOT_FOUND', '未找到视频数据'), 404)
  return jsonResponse(ok(record))
})

const DASHBOARD_METRICS = [
  { key: 'playCount', label: '播放量' },
  { key: 'completionRate', label: '完播率' },
  { key: 'likes', label: '点赞' },
  { key: 'comments', label: '评论' },
  { key: 'saves', label: '收藏' },
  { key: 'shares', label: '分享' },
  { key: 'newFollowers', label: '新增粉丝' }
]

function safeNumber(value) {
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

async function generateDashboard(env, userId) {
  const videoRecord = await getKey(env, 'videoData', userId)
  const videos = videoRecord?.videos || []
  const topicRecord = await getKey(env, 'topics', userId)
  const topics = topicRecord?.topics || []
  const columnRecord = await getKey(env, 'columns', userId)
  const columns = columnRecord?.columns || []

  const columnMap = new Map(columns.map((c) => [c.id, c.name || c.id]))
  const topicMap = new Map(topics.map((t) => [t.id, { columnId: t.columnId, title: t.title }]))

  const chartsByMetric = {}
  DASHBOARD_METRICS.forEach((metric) => {
    const trendDataPoints = videos.map((video, index) => ({ label: `视频${index + 1}`, value: safeNumber(video[metric.key]) }))
    const groups = new Map()
    videos.forEach((video) => {
      const topic = topicMap.get(video.topicId)
      const columnName = topic ? columnMap.get(topic.columnId) || '未分类栏目' : '未关联'
      if (!groups.has(columnName)) groups.set(columnName, { values: [], count: 0 })
      const value = safeNumber(video[metric.key])
      if (value !== null) groups.get(columnName).values.push(value)
      groups.get(columnName).count += 1
    })
    const comparisonGroups = Array.from(groups.entries()).map(([label, group]) => ({
      label,
      avgValue: group.values.length > 0 ? Math.round((group.values.reduce((a, b) => a + b, 0) / group.values.length) * 10) / 10 : 0,
      count: group.count
    }))
    chartsByMetric[metric.key] = {
      trendChart: { metric: metric.key, label: metric.label, dataPoints: trendDataPoints },
      comparisonChart: { metric: metric.key, label: metric.label, groups: comparisonGroups }
    }
  })

  return {
    metrics: DASHBOARD_METRICS.map((m) => ({ key: m.key, label: m.label })),
    isInsufficient: videos.length < 3,
    chartsByMetric,
    generatedAt: new Date().toISOString()
  }
}

router.post('/api/dashboard/generate', async (req, env) => {
  const { userId } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const videoRecord = await getKey(env, 'videoData', userId)
  if (!videoRecord || !Array.isArray(videoRecord.videos) || videoRecord.videos.length === 0) {
    return jsonResponse(fail('VIDEO_DATA_REQUIRED', '未找到视频数据，请先录入视频数据'), 400)
  }
  try {
    const dashboard = await generateDashboard(env, userId)
    await setKey(env, 'dashboard', userId, dashboard)
    return jsonResponse(ok(dashboard))
  } catch (err) {
    return jsonResponse(fail('GENERATION_FAILED', '看板生成失败'), 500)
  }
})

router.get('/api/dashboard', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const dashboard = await getKey(env, 'dashboard', userId)
  if (!dashboard) return jsonResponse(fail('DASHBOARD_NOT_FOUND', '未找到看板数据'), 404)
  return jsonResponse(ok({ dashboard, isInsufficient: dashboard.isInsufficient }))
})

function validateStage1(stage1) {
  const errors = []
  if (!stage1 || typeof stage1 !== 'object') {
    errors.push('Stage 1 答案不能为空')
    return errors
  }
  for (const key of ['q1', 'q2', 'q3']) {
    const val = stage1[key]
    if (val === undefined || val === null || val === '') errors.push(`Stage 1 缺少必填字段：${key}`)
  }
  return errors
}

router.post('/api/ai/ip-plan/chat', async (req, env) => {
  const { userId, stage1, messages } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const stage1Errors = validateStage1(stage1)
  if (stage1Errors.length > 0) return jsonResponse(fail('INVALID_STAGE1', stage1Errors.join('；')), 400)
  if (!Array.isArray(messages)) return jsonResponse(fail('INVALID_MESSAGES', 'messages 必须是数组'), 400)
  try {
    const result = await chatNextQuestion(stage1, messages, { deepseekApiKey: env.DEEPSEEK_API_KEY })
    return jsonResponse(ok(result))
  } catch (err) {
    return jsonResponse(fail('CHAT_FAILED', '对话失败，请重试'), 500)
  }
})

router.post('/api/ai/ip-plan', async (req, env) => {
  const { userId, stage1, messages } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const stage1Errors = validateStage1(stage1)
  if (stage1Errors.length > 0) return jsonResponse(fail('INVALID_STAGE1', stage1Errors.join('；')), 400)
  if (!Array.isArray(messages) || messages.length === 0) return jsonResponse(fail('INVALID_MESSAGES', 'Stage 2 对话记录不能为空'), 400)
  try {
    const { ipPlan, source } = await generateIpPlan(stage1, messages, { deepseekApiKey: env.DEEPSEEK_API_KEY })
    const generatedAt = new Date().toISOString()
    await setKey(env, 'ipplan', userId, { ipPlan, source, generatedAt })
    await setKey(env, 'card', userId, { card: ipPlan.positioning, confirmed: false, createdAt: generatedAt })
    return jsonResponse(ok({ ipPlan, source, generatedAt }))
  } catch (err) {
    return jsonResponse(fail('GENERATION_FAILED', 'IP 方案生成失败，请稍后重试'), 500)
  }
})

router.get('/api/ai/ip-plan', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const record = await getKey(env, 'ipplan', userId)
  if (!record) return jsonResponse(fail('IP_PLAN_NOT_FOUND', '未找到 IP 方案，请先生成'), 404)
  return jsonResponse(ok(record))
})

async function getLatestDiagnosisReport(env, userId) {
  const list = await env.IP_COMPASS_KV.list({ prefix: 'diagnosisReport:' })
  let latest = null
  for (const key of list.keys) {
    const raw = await env.IP_COMPASS_KV.get(key.name)
    const record = raw ? JSON.parse(raw) : null
    if (record && record.userId === userId) {
      if (!latest || new Date(record.createdAt) > new Date(latest.createdAt)) latest = record
    }
  }
  return latest
}

router.post('/api/optimization/generate', async (req, env) => {
  const { userId, ipPlan } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)

  let positioningCard = null
  if (ipPlan && ipPlan.positioning) positioningCard = extractPositioningCardFromIpPlan(ipPlan)
  if (!positioningCard) {
    const cardRecord = await getKey(env, 'card', userId)
    if (!cardRecord || !cardRecord.card) return jsonResponse(fail('CARD_NOT_FOUND', '未找到定位卡，请先生成定位卡'), 404)
    positioningCard = cardRecord.card
  }

  const attributionResult = await getKey(env, 'attribution', userId)
  const diagnosisReport = await getLatestDiagnosisReport(env, userId)
  const videoRecord = await getKey(env, 'videoData', userId)
  const videoData = videoRecord ? { videos: videoRecord.videos } : { videos: [] }

  try {
    const { suggestions, source } = await generateOptimizationSuggestions(attributionResult, diagnosisReport, positioningCard, videoData, { deepseekApiKey: env.DEEPSEEK_API_KEY, ipPlanSummary: ipPlan?.summary || '' })
    const generatedAt = new Date().toISOString()
    await setKey(env, 'optimization', userId, { suggestions, source, generatedAt })
    return jsonResponse(ok({ suggestions, source, generatedAt }))
  } catch (err) {
    return jsonResponse(fail('GENERATION_FAILED', '优化建议生成失败，请稍后重试'), 500)
  }
})

router.get('/api/optimization', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const record = await getKey(env, 'optimization', userId)
  if (!record) return jsonResponse(fail('OPTIMIZATION_NOT_FOUND', '未找到优化建议，请先生成'), 404)
  return jsonResponse(ok(record))
})

function validateAttributionRequest(body) {
  const errors = []
  if (!body || typeof body !== 'object') {
    errors.push('请求体不能为空')
    return errors
  }
  if (!Array.isArray(body.videos) || body.videos.length === 0) errors.push('videos 不能为空数组')
  if (!body.positioningCard || typeof body.positioningCard !== 'object') errors.push('positioningCard 不能为空')
  if (!body.dashboard || typeof body.dashboard !== 'object') errors.push('dashboard 不能为空')
  return errors
}

router.post('/api/attribution/analyze', async (req, env) => {
  const { userId, videos, positioningCard, dashboard, ipPlan } = await req.json()
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const effectiveCard = (ipPlan && ipPlan.positioning) ? extractPositioningCardFromIpPlan(ipPlan) : positioningCard
  const validationErrors = validateAttributionRequest({ videos, positioningCard: effectiveCard, dashboard })
  if (validationErrors.length > 0) return jsonResponse(fail('VALIDATION_FAILED', validationErrors.join('；'), { details: validationErrors }), 400)

  try {
    const result = await analyzeAttribution(videos, effectiveCard, dashboard, { deepseekApiKey: env.DEEPSEEK_API_KEY, ipPlanSummary: ipPlan?.summary || '' })
    const record = { ...result, generatedAt: new Date().toISOString() }
    await setKey(env, 'attribution', userId, record)
    return jsonResponse(ok(record))
  } catch (err) {
    return jsonResponse(fail('ANALYSIS_FAILED', '归因分析失败，请稍后重试'), 500)
  }
})

router.get('/api/attribution', async (req, env) => {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId || !UUID_V4_RE.test(userId)) return jsonResponse(fail('INVALID_USER_ID', '用户标识格式不正确'), 400)
  const record = await getKey(env, 'attribution', userId)
  if (!record) return jsonResponse(fail('ATTRIBUTION_NOT_FOUND', '未找到归因结果'), 404)
  return jsonResponse(ok(record))
})

router.all('*', () => jsonResponse(fail('NOT_FOUND', '接口不存在'), 404))

export default {
  async fetch(request, env, ctx) {
    if (!env.DEEPSEEK_API_KEY) {
      return jsonResponse(fail('CONFIG_ERROR', 'DEEPSEEK_API_KEY not configured'), 500)
    }
    return router.fetch(request, env, ctx).catch((err) => {
      return jsonResponse(fail('INTERNAL_ERROR', '服务器内部错误'), 500)
    })
  }
}
