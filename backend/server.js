import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { randomUUID } from 'crypto'
import { generateCard, normalizeCard } from './lib/positioning.js'
import { generateColumns } from './lib/contentStrategy.js'
import { generateTopics } from './lib/topicPool.js'
import { checkContentBias, validateDraftContent, generateDiagnosisReport } from './lib/diagnosis.js'
import { analyzeAttribution } from './lib/attribution.js'
import { generateOptimizationSuggestions } from './lib/optimization.js'
import { chatNextQuestion, generateIpPlan, validateIpPlan, extractPositioningCardFromIpPlan } from './lib/ipPlan.js'

const app = express()
const PORT = process.env.PORT || 3001

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
if (!DEEPSEEK_API_KEY) {
  console.error('[FATAL] DEEPSEEK_API_KEY is not set. Please create backend/.env and add DEEPSEEK_API_KEY=sk-...')
  process.exit(1)
}

// 严格 UUID v4 正则（与前端共享的校验规则）
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

app.use(cors())
app.use(express.json({ limit: '1mb' }))

// 统一响应 envelope
const ok = (data) => ({ ok: true, data })
const fail = (code, message, extra = null) => {
  const error = { code, message }
  if (extra && typeof extra === 'object') {
    Object.assign(error, extra)
  }
  return { ok: false, error }
}

// 健康检查
app.get('/api/health', (_req, res) => {
  res.json(ok({ status: 'ok', timestamp: new Date().toISOString() }))
})

// 创建匿名用户：后端生成 UUID v4，MVP 不持久化
app.post('/api/auth/anonymous', (_req, res) => {
  try {
    const userId = randomUUID()
    res.json(ok({
      userId,
      isAnonymous: true,
      createdAt: new Date().toISOString()
    }))
  } catch (err) {
    console.error('UUID generation failed:', err)
    res.status(500).json(fail('UUID_GENERATION_FAILED', '无法创建用户标识，请刷新重试'))
  }
})

// 获取当前用户：仅校验 UUID 格式是否合法
app.get('/api/auth/me', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || userId.trim() === '') {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识不能为空'))
  }

  // 严格 UUID v4 格式校验
  if (!UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  res.json(ok({ userId, isAnonymous: true, isValid: true }))
})

// 内存中保存定位卡（MVP 不持久化到数据库）
const cardStore = new Map()

function validateStageAnswers(stage1, stage2) {
  const errors = []
  if (!stage1 || typeof stage1 !== 'object') {
    errors.push('Stage 1 答案不能为空')
    return errors
  }
  const requiredStage1 = ['q1', 'q2', 'q3']
  for (const key of requiredStage1) {
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

// 生成定位卡：优先 DeepSeek V4，失败或无 Key 时规则兜底
app.post('/api/positioning/generate', async (req, res) => {
  const { userId, stage1, stage2 } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const errors = validateStageAnswers(stage1, stage2)
  if (errors.length > 0) {
    return res.status(400).json(fail('INVALID_ANSWERS', errors.join('；')))
  }

  try {
    const { card, source } = await generateCard(stage1, stage2, {
      deepseekApiKey: DEEPSEEK_API_KEY
    })
    cardStore.set(userId, { card, confirmed: false, createdAt: new Date().toISOString() })
    res.json(ok({ positioningCard: card, source }))
  } catch (err) {
    console.error('Generate positioning card failed:', err)
    res.status(500).json(fail('GENERATION_FAILED', '定位卡生成失败，请重试'))
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
    if (!(field in card)) {
      errors.push(`定位卡缺少字段：${field}`)
    }
  }
  if (errors.length > 0) return errors

  // 一句话定位：10-50 字
  const oneLine = String(card.oneLinePositioning || '')
  const oneLineLen = Array.from(oneLine).length
  if (oneLineLen < 10 || oneLineLen > 50) {
    errors.push(`一句话定位需 10-50 字，当前 ${oneLineLen} 字`)
  }

  // 人设说明：1-3 句，每句 10-80 字
  const persona = Array.isArray(card.persona) ? card.persona : []
  if (persona.length < 1 || persona.length > 3) {
    errors.push(`人设说明需 1-3 句，当前 ${persona.length} 句`)
  }
  persona.forEach((s, i) => {
    const len = Array.from(String(s)).length
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
    const len = Array.from(String(s)).length
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
    const len = Array.from(s).length
    if (len < 2 || len > 8) {
      errors.push(`专属标签第 ${i + 1} 个需 2-8 字，当前 ${len} 字`)
    }
    if (seen.has(s)) {
      errors.push(`专属标签重复：${s}`)
    }
    seen.add(s)
  })

  return errors
}

// 确认定位（兼容旧定位卡与新 IP 方案）
app.post('/api/positioning/confirm', (req, res) => {
  const { userId, positioningCard, ipPlan } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  let normalizedCard = null
  let storedIpPlan = null

  if (ipPlan && typeof ipPlan === 'object') {
    const errors = validateIpPlan(ipPlan)
    if (errors.length > 0) {
      return res.status(400).json(fail('VALIDATION_FAILED', errors.join('；')))
    }
    storedIpPlan = { ...ipPlan }
    normalizedCard = extractPositioningCardFromIpPlan(storedIpPlan)
    if (!normalizedCard) {
      return res.status(400).json(fail('NORMALIZE_FAILED', '无法从 IP 方案提取定位卡'))
    }
  } else {
    const errors = validatePositioningCard(positioningCard)
    if (errors.length > 0) {
      return res.status(400).json(fail('VALIDATION_FAILED', errors.join('；')))
    }
    normalizedCard = normalizeCard(positioningCard)
    if (!normalizedCard) {
      return res.status(400).json(fail('NORMALIZE_FAILED', '定位卡字段格式无法归一化'))
    }
  }

  const existing = cardStore.get(userId)
  const confirmedAt = new Date().toISOString()
  cardStore.set(userId, {
    card: normalizedCard,
    confirmed: true,
    createdAt: existing?.createdAt || confirmedAt,
    confirmedAt
  })

  if (storedIpPlan) {
    ipPlanStore.set(userId, {
      ipPlan: storedIpPlan,
      source: 'user',
      confirmed: true,
      confirmedAt,
      updatedAt: confirmedAt
    })
  }

  res.json(ok({ confirmedAt, homeState: 'positioned' }))
})

// 更新定位卡（兼容旧定位卡与新 IP 方案）
app.put('/api/positioning/card', (req, res) => {
  const { userId, positioningCard, ipPlan } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  let normalizedCard = null
  let storedIpPlan = null

  if (ipPlan && typeof ipPlan === 'object') {
    const errors = validateIpPlan(ipPlan)
    if (errors.length > 0) {
      return res.status(400).json(fail('VALIDATION_FAILED', errors.join('；')))
    }
    storedIpPlan = { ...ipPlan }
    normalizedCard = extractPositioningCardFromIpPlan(storedIpPlan)
    if (!normalizedCard) {
      return res.status(400).json(fail('NORMALIZE_FAILED', '无法从 IP 方案提取定位卡'))
    }
  } else {
    const errors = validatePositioningCard(positioningCard)
    if (errors.length > 0) {
      return res.status(400).json(fail('VALIDATION_FAILED', errors.join('；')))
    }
    normalizedCard = normalizeCard(positioningCard)
    if (!normalizedCard) {
      return res.status(400).json(fail('NORMALIZE_FAILED', '定位卡字段格式无法归一化'))
    }
  }

  const existing = cardStore.get(userId)
  const updatedAt = new Date().toISOString()
  cardStore.set(userId, {
    card: normalizedCard,
    confirmed: existing?.confirmed || false,
    createdAt: existing?.createdAt || updatedAt,
    updatedAt
  })

  if (storedIpPlan) {
    const existingIpPlan = ipPlanStore.get(userId)
    ipPlanStore.set(userId, {
      ipPlan: storedIpPlan,
      source: existingIpPlan?.source || 'user',
      confirmed: existingIpPlan?.confirmed || false,
      confirmedAt: existingIpPlan?.confirmedAt,
      updatedAt
    })
  }

  res.json(ok({ updatedAt, positioningCard: normalizedCard, ipPlan: storedIpPlan }))
})

// 获取定位卡
app.get('/api/positioning/card', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = cardStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('CARD_NOT_FOUND', '未找到定位卡'))
  }

  const ipPlanRecord = ipPlanStore.get(userId)
  res.json(ok({
    positioningCard: record.card,
    isConfirmed: record.confirmed,
    ipPlan: ipPlanRecord?.ipPlan || null
  }))
})

// 栏目矩阵内存存储（MVP）
const columnsStore = new Map()

function validatePositioningCardShape(card) {
  const errors = []
  if (!card || typeof card !== 'object') {
    errors.push('定位卡数据不能为空')
    return errors
  }
  const requiredFields = ['oneLinePositioning', 'persona', 'promises', 'tags', 'profileAdvice']
  for (const field of requiredFields) {
    if (!(field in card)) {
      errors.push(`定位卡缺少字段：${field}`)
    }
  }
  return errors
}

// 生成栏目矩阵
app.post('/api/content/columns/generate', async (req, res) => {
  const { userId, positioningCard, regenerate, ipPlan } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const effectiveCard = (ipPlan && ipPlan.positioning)
    ? extractPositioningCardFromIpPlan(ipPlan)
    : positioningCard

  const shapeErrors = validatePositioningCardShape(effectiveCard)
  if (shapeErrors.length > 0) {
    return res.status(400).json(fail('INVALID_CARD', shapeErrors.join('；')))
  }

  if (regenerate) {
    columnsStore.delete(userId)
  }

  try {
    const { data, source } = await generateColumns(effectiveCard, {
      deepseekApiKey: DEEPSEEK_API_KEY,
      ipPlanSummary: ipPlan?.summary || ''
    })
    const generatedAt = new Date().toISOString()
    columnsStore.set(userId, { columns: data.columns, generatedAt, source })
    res.json(ok({ columns: data.columns, generatedAt, source }))
  } catch (err) {
    console.error('Generate columns failed:', err)
    res.status(500).json(fail('GENERATION_FAILED', '栏目矩阵生成失败，请重试'))
  }
})

// 获取栏目矩阵
app.get('/api/content/columns', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = columnsStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('COLUMNS_NOT_FOUND', '未找到栏目数据'))
  }

  res.json(ok({ columns: record.columns, generatedAt: record.generatedAt }))
})

// 删除栏目矩阵
app.delete('/api/content/columns', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  columnsStore.delete(userId)
  res.json(ok({ deletedAt: new Date().toISOString() }))
})

// 选题池内存存储（MVP）
const topicsStore = new Map()
const MAX_TOPICS_PER_USER = 50
const VALID_TOPIC_STATUSES = ['pending', 'used', 'discarded']

// 生成选题池
app.post('/api/content/topics/generate', async (req, res) => {
  const { userId, columns, positioningCard, ipPlan } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  if (!Array.isArray(columns) || columns.length < 3 || columns.length > 6) {
    return res.status(400).json(fail('INVALID_COLUMNS', '栏目数量需为 3-6 个'))
  }

  const effectiveCard = (ipPlan && ipPlan.positioning)
    ? extractPositioningCardFromIpPlan(ipPlan)
    : positioningCard

  const shapeErrors = validatePositioningCardShape(effectiveCard)
  if (shapeErrors.length > 0) {
    return res.status(400).json(fail('INVALID_CARD', shapeErrors.join('；')))
  }

  try {
    const { topics, source } = await generateTopics(columns, effectiveCard, {
      deepseekApiKey: DEEPSEEK_API_KEY,
      ipPlanSummary: ipPlan?.summary || ''
    })
    const generatedAt = new Date().toISOString()
    topicsStore.set(userId, { topics, generatedAt, source })
    res.json(ok({ topics, generatedAt, source }))
  } catch (err) {
    console.error('Generate topics failed:', err)
    res.status(500).json(fail('GENERATION_FAILED', '选题池生成失败，请重试'))
  }
})

// 获取选题池
app.get('/api/content/topics', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = topicsStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('TOPICS_NOT_FOUND', '未找到选题数据'))
  }

  res.json(ok({ topics: record.topics, generatedAt: record.generatedAt }))
})

// 添加单条选题
app.post('/api/content/topics', (req, res) => {
  const { userId, topic } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  if (!topic || typeof topic !== 'object') {
    return res.status(400).json(fail('INVALID_TOPIC', '选题数据不能为空'))
  }

  if (typeof topic.title !== 'string' || topic.title.trim() === '') {
    return res.status(400).json(fail('INVALID_TITLE', '选题标题不能为空'))
  }

  const points = Array.isArray(topic.points)
    ? topic.points.filter((p) => typeof p === 'string' && p.trim() !== '')
    : []
  if (points.length === 0) {
    return res.status(400).json(fail('INVALID_POINTS', '选题要点不能为空'))
  }

  const record = topicsStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('TOPICS_NOT_FOUND', '未找到选题数据，请先生成选题池'))
  }

  // 选题池 50 条上限
  if (record.topics.length >= MAX_TOPICS_PER_USER) {
    return res.status(409).json(fail('POOL_FULL', '选题池已满，请清理旧选题后再添加'))
  }

  // 按 referenceSuggestionId 幂等：同一建议不重复添加
  const referenceSuggestionId = typeof topic.referenceSuggestionId === 'string' && topic.referenceSuggestionId.trim()
    ? topic.referenceSuggestionId.trim()
    : null
  if (referenceSuggestionId) {
    const existing = record.topics.find((t) => t.referenceSuggestionId === referenceSuggestionId)
    if (existing) {
      return res.json(ok({ topic: existing, updatedAt: new Date().toISOString() }))
    }
  }

  const normalized = {
    id: `topic_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    columnId: topic.columnId || record.topics[0]?.columnId || 'col_0',
    title: topic.title.trim(),
    points: points.slice(0, 3),
    materialAdvice: typeof topic.materialAdvice === 'string' ? topic.materialAdvice.trim() : '结合自身真实经历或案例进行创作',
    painPoints: Array.isArray(topic.painPoints)
      ? topic.painPoints.filter((p) => typeof p === 'string' && p.trim() !== '').slice(0, 3)
      : [],
    status: 'pending',
    source: typeof topic.source === 'string' && topic.source.trim() ? topic.source.trim() : 'manual',
    referenceSuggestionId,
    createdAt: new Date().toISOString()
  }

  record.topics.push(normalized)

  res.json(ok({ topic: normalized, updatedAt: new Date().toISOString() }))
})

// 更新选题状态
app.put('/api/content/topics/:id/status', (req, res) => {
  const { id } = req.params
  const { userId, status } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  if (!VALID_TOPIC_STATUSES.includes(status)) {
    return res.status(400).json(fail('INVALID_STATUS', `状态必须是 ${VALID_TOPIC_STATUSES.join('/')} 之一`))
  }

  const record = topicsStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('TOPICS_NOT_FOUND', '未找到选题数据'))
  }

  const topic = record.topics.find((t) => t.id === id)
  if (!topic) {
    return res.status(404).json(fail('TOPIC_NOT_FOUND', '未找到该选题'))
  }

  // used 不可逆
  if (topic.status === 'used' && status !== 'used') {
    return res.status(400).json(fail('STATUS_LOCKED', '已用选题不可恢复'))
  }

  topic.status = status
  topic.updatedAt = new Date().toISOString()

  res.json(ok({ updatedAt: topic.updatedAt }))
})

// 清理弃用选题（必须放在 /:id 路由之前，避免被当作 id 参数）
app.delete('/api/content/topics/cleanup', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = topicsStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('TOPICS_NOT_FOUND', '未找到选题数据'))
  }

  const beforeCount = record.topics.length
  record.topics = record.topics.filter((t) => t.status !== 'discarded')
  const deletedCount = beforeCount - record.topics.length

  res.json(ok({ deletedCount, deletedAt: new Date().toISOString() }))
})

// 删除单条选题
app.delete('/api/content/topics/:id', (req, res) => {
  const { id } = req.params
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = topicsStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('TOPICS_NOT_FOUND', '未找到选题数据'))
  }

  const topic = record.topics.find((t) => t.id === id)
  if (!topic) {
    return res.status(404).json(fail('TOPIC_NOT_FOUND', '未找到该选题'))
  }

  if (!['discarded', 'used'].includes(topic.status)) {
    return res.status(400).json(fail('DELETE_NOT_ALLOWED', '仅弃用或已用选题可删除'))
  }

  record.topics = record.topics.filter((t) => t.id !== id)

  res.json(ok({ deletedAt: new Date().toISOString() }))
})

// 诊断草稿内存存储（MVP）
const diagnosisDraftStore = new Map()

// 检查内容纠偏
app.post('/api/diagnosis/bias-check', (req, res) => {
  const { title, script, tags, positioningCard, ipPlan } = req.body

  if (typeof title !== 'string' || title.trim() === '') {
    return res.status(400).json(fail('INVALID_TITLE', '标题不能为空'))
  }
  if (typeof script !== 'string' || script.trim() === '') {
    return res.status(400).json(fail('INVALID_SCRIPT', '文案不能为空'))
  }
  if (!Array.isArray(tags)) {
    return res.status(400).json(fail('INVALID_TAGS', '话题标签必须是数组'))
  }

  const effectiveCard = (ipPlan && ipPlan.positioning)
    ? extractPositioningCardFromIpPlan(ipPlan)
    : positioningCard

  try {
    const result = checkContentBias({ title, script, tags, positioningCard: effectiveCard })
    res.json(ok(result))
  } catch (err) {
    console.error('Bias check failed:', err)
    res.status(500).json(fail('CHECK_FAILED', '纠偏检查失败'))
  }
})

// 封面图上传（MVP 由前端本地 base64 处理，此处保留接口占位）
app.post('/api/upload/cover', (req, res) => {
  res.status(501).json(fail('NOT_IMPLEMENTED', 'MVP 封面图由前端本地压缩为 base64，不上传服务器'))
})

// 提交诊断草稿
app.post('/api/diagnosis/draft', (req, res) => {
  const { userId, content } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const validationErrors = validateDraftContent(content)
  if (validationErrors.length > 0) {
    return res.status(400).json(fail('INVALID_CONTENT', validationErrors.join('；')))
  }

  const draftId = randomUUID()
  const savedAt = new Date().toISOString()
  diagnosisDraftStore.set(draftId, { userId, content, savedAt })

  res.json(ok({ draftId, savedAt }))
})

// 诊断报告内存存储（MVP）
const diagnosisReportStore = new Map()
const MAX_HISTORY_PER_USER = 50

function validateReportPositioningCardShape(card) {
  const errors = []
  if (!card || typeof card !== 'object') {
    errors.push('定位卡数据不能为空')
    return errors
  }
  const requiredFields = ['oneLinePositioning', 'persona', 'promises', 'tags', 'profileAdvice']
  for (const field of requiredFields) {
    if (!(field in card)) {
      errors.push(`定位卡缺少字段：${field}`)
    }
  }
  return errors
}

// 生成诊断报告
app.post('/api/diagnosis/report', async (req, res) => {
  const { userId, content, positioningCard, ipPlan } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const validationErrors = validateDraftContent(content)
  if (validationErrors.length > 0) {
    return res.status(400).json(fail('INVALID_CONTENT', validationErrors.join('；')))
  }

  const effectiveCard = (ipPlan && ipPlan.positioning)
    ? extractPositioningCardFromIpPlan(ipPlan)
    : positioningCard

  const shapeErrors = validateReportPositioningCardShape(effectiveCard)
  if (shapeErrors.length > 0) {
    return res.status(400).json(fail('INVALID_CARD', shapeErrors.join('；')))
  }

  try {
    const report = await generateDiagnosisReport(content, effectiveCard, {
      deepseekApiKey: DEEPSEEK_API_KEY,
      ipPlanSummary: ipPlan?.summary || ''
    })
    const reportId = randomUUID()
    const createdAt = new Date().toISOString()
    const record = { reportId, userId, content, positioningCard: effectiveCard, ...report, createdAt }
    diagnosisReportStore.set(reportId, record)

    res.json(ok({ reportId, totalScore: report.totalScore, rating: report.rating, dimensions: report.dimensions, createdAt, source: report.source }))
  } catch (err) {
    console.error('Generate diagnosis report failed:', err)
    res.status(500).json(fail('DIAGNOSIS_FAILED', '诊断失败，请稍后重试'))
  }
})

// 获取诊断报告
app.get('/api/diagnosis/report', (req, res) => {
  const { userId, reportId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }
  if (typeof reportId !== 'string' || reportId.trim() === '') {
    return res.status(400).json(fail('INVALID_REPORT_ID', '报告 ID 不能为空'))
  }

  const record = diagnosisReportStore.get(reportId)
  if (!record || record.userId !== userId) {
    return res.status(404).json(fail('REPORT_NOT_FOUND', '未找到诊断报告'))
  }

  res.json(ok({ report: record }))
})

// 诊断历史记录内存存储（MVP）
const diagnosisHistoryStore = new Map()

function validateReport(report) {
  const errors = []
  if (!report || typeof report !== 'object') {
    errors.push('报告数据不能为空')
    return errors
  }
  if (typeof report.reportId !== 'string' || report.reportId.trim() === '') {
    errors.push('report.reportId 必填')
  }
  if (typeof report.totalScore !== 'number') {
    errors.push('report.totalScore 必填且为数字')
  }
  if (typeof report.rating !== 'string') {
    errors.push('report.rating 必填')
  }
  if (!Array.isArray(report.dimensions)) {
    errors.push('report.dimensions 必填且为数组')
  }
  return errors
}

// 保存诊断报告到历史记录
app.post('/api/diagnosis/save', (req, res) => {
  const { userId, report } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const validationErrors = validateReport(report)
  if (validationErrors.length > 0) {
    return res.status(400).json(fail('INVALID_REPORT', validationErrors.join('；')))
  }

  let history = diagnosisHistoryStore.get(userId) || []
  if (history.length >= MAX_HISTORY_PER_USER) {
    return res.status(409).json(fail('HISTORY_FULL', '历史记录已满，请清理旧记录后再保存'))
  }

  const item = {
    id: report.reportId,
    date: new Date().toISOString(),
    topic: report.topic || '',
    totalScore: report.totalScore,
    rating: report.rating,
    dimensions: report.dimensions
  }
  history = [item, ...history]
  diagnosisHistoryStore.set(userId, history)

  res.json(ok({ savedAt: item.date, historyCount: history.length }))
})

// 获取诊断历史记录
app.get('/api/diagnosis/history', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const history = diagnosisHistoryStore.get(userId) || []
  res.json(ok({ history }))
})

// 删除单条历史记录
app.delete('/api/diagnosis/history/:id', (req, res) => {
  const { id } = req.params
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  let history = diagnosisHistoryStore.get(userId) || []
  const beforeCount = history.length
  history = history.filter((item) => item.id !== id)
  if (history.length === beforeCount) {
    return res.status(404).json(fail('HISTORY_NOT_FOUND', '未找到该历史记录'))
  }

  diagnosisHistoryStore.set(userId, history)
  res.json(ok({ deletedAt: new Date().toISOString(), historyCount: history.length }))
})

// 视频数据内存存储（MVP）
const videoDataStore = new Map()
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
        if (Number.isNaN(num) || num < 0 || num > 100) {
          errors.push(`第 ${row} 行完播率需在 0-100 之间`)
        }
      } else {
        const num = Number(value)
        if (!Number.isInteger(num) || num < 0) {
          errors.push(`第 ${row} 行 ${key} 需为大于等于 0 的整数`)
        }
      }
    }

    if (video.topicId && !validTopicIds.has(video.topicId)) {
      errors.push(`第 ${row} 行关联的选题不存在`)
    }

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

// 提交视频数据
app.post('/api/video-data/submit', (req, res) => {
  const { userId, videos } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const topicRecord = topicsStore.get(userId)
  const { errors, validVideos } = validateVideoData(videos, topicRecord?.topics)
  if (errors.length > 0) {
    return res.status(400).json(fail('VALIDATION_FAILED', errors.join('；'), { details: errors }))
  }

  const submittedAt = new Date().toISOString()
  const record = { videos: validVideos, submittedAt, isInsufficient: validVideos.length < 3 }
  videoDataStore.set(userId, record)

  // 视频数据变更后，看板与归因结果失效，下次访问时重新生成
  dashboardStore.delete(userId)
  attributionStore.delete(userId)

  res.json(ok({ submittedAt, count: validVideos.length, isInsufficient: record.isInsufficient }))
})

// 获取视频数据
app.get('/api/video-data', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = videoDataStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('DATA_NOT_FOUND', '未找到视频数据'))
  }

  res.json(ok(record))
})

// 看板数据内存存储（MVP）
const dashboardStore = new Map()
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

function generateDashboard(userId) {
  const videoRecord = videoDataStore.get(userId)
  const videos = videoRecord?.videos || []
  const topicRecord = topicsStore.get(userId)
  const topics = topicRecord?.topics || []
  const columnRecord = columnsStore.get(userId)
  const columns = columnRecord?.columns || []

  const columnMap = new Map(columns.map((c) => [c.id, c.name || c.id]))
  const topicMap = new Map(topics.map((t) => [t.id, { columnId: t.columnId, title: t.title }]))

  const chartsByMetric = {}
  DASHBOARD_METRICS.forEach((metric) => {
    const trendDataPoints = videos.map((video, index) => ({
      label: `视频${index + 1}`,
      value: safeNumber(video[metric.key])
    }))

    const groups = new Map()
    videos.forEach((video) => {
      const topic = topicMap.get(video.topicId)
      const columnName = topic ? columnMap.get(topic.columnId) || '未分类栏目' : '未关联'
      if (!groups.has(columnName)) {
        groups.set(columnName, { values: [], count: 0 })
      }
      const value = safeNumber(video[metric.key])
      if (value !== null) {
        groups.get(columnName).values.push(value)
      }
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

// 生成看板数据
app.post('/api/dashboard/generate', (req, res) => {
  const { userId } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const videoRecord = videoDataStore.get(userId)
  if (!videoRecord || !Array.isArray(videoRecord.videos) || videoRecord.videos.length === 0) {
    return res.status(400).json(fail('VIDEO_DATA_REQUIRED', '未找到视频数据，请先录入视频数据'))
  }

  try {
    const dashboard = generateDashboard(userId)
    dashboardStore.set(userId, dashboard)
    res.json(ok(dashboard))
  } catch (err) {
    console.error('Generate dashboard failed:', err)
    res.status(500).json(fail('GENERATION_FAILED', '看板生成失败'))
  }
})

// 获取看板数据
app.get('/api/dashboard', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const dashboard = dashboardStore.get(userId)
  if (!dashboard) {
    return res.status(404).json(fail('DASHBOARD_NOT_FOUND', '未找到看板数据'))
  }

  res.json(ok({ dashboard, isInsufficient: dashboard.isInsufficient }))
})

// IP 方案内存存储（MVP）
const ipPlanStore = new Map()

function validateStage1(stage1) {
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
  return errors
}

// Stage 2 单轮对话：返回下一个问题或结束信号
app.post('/api/ai/ip-plan/chat', async (req, res) => {
  const { userId, stage1, messages } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const stage1Errors = validateStage1(stage1)
  if (stage1Errors.length > 0) {
    return res.status(400).json(fail('INVALID_STAGE1', stage1Errors.join('；')))
  }

  if (!Array.isArray(messages)) {
    return res.status(400).json(fail('INVALID_MESSAGES', 'messages 必须是数组'))
  }

  try {
    const result = await chatNextQuestion(stage1, messages, { deepseekApiKey: DEEPSEEK_API_KEY })
    res.json(ok(result))
  } catch (err) {
    console.error('IP plan chat failed:', err)
    res.status(500).json(fail('CHAT_FAILED', '对话失败，请重试'))
  }
})

// 生成完整 IP 方案
app.post('/api/ai/ip-plan', async (req, res) => {
  const { userId, stage1, messages } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const stage1Errors = validateStage1(stage1)
  if (stage1Errors.length > 0) {
    return res.status(400).json(fail('INVALID_STAGE1', stage1Errors.join('；')))
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json(fail('INVALID_MESSAGES', 'Stage 2 对话记录不能为空'))
  }

  try {
    const { ipPlan, source } = await generateIpPlan(stage1, messages, {
      deepseekApiKey: DEEPSEEK_API_KEY
    })
    const generatedAt = new Date().toISOString()
    ipPlanStore.set(userId, { ipPlan, source, generatedAt })

    // 同步更新定位卡，保持下游旧接口兼容
    cardStore.set(userId, {
      card: ipPlan.positioning,
      confirmed: false,
      createdAt: generatedAt
    })

    res.json(ok({ ipPlan, source, generatedAt }))
  } catch (err) {
    console.error('Generate IP plan failed:', err)
    res.status(500).json(fail('GENERATION_FAILED', 'IP 方案生成失败，请稍后重试'))
  }
})

// 获取 IP 方案
app.get('/api/ai/ip-plan', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = ipPlanStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('IP_PLAN_NOT_FOUND', '未找到 IP 方案，请先生成'))
  }

  res.json(ok(record))
})

// 优化建议内存存储（MVP）
const optimizationStore = new Map()

function getLatestDiagnosisReport(userId) {
  let latest = null
  for (const record of diagnosisReportStore.values()) {
    if (record.userId === userId) {
      if (!latest || new Date(record.createdAt) > new Date(latest.createdAt)) {
        latest = record
      }
    }
  }
  return latest
}

// 生成优化建议
app.post('/api/optimization/generate', async (req, res) => {
  const { userId, ipPlan } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  let positioningCard = null
  if (ipPlan && ipPlan.positioning) {
    positioningCard = extractPositioningCardFromIpPlan(ipPlan)
  }

  if (!positioningCard) {
    const cardRecord = cardStore.get(userId)
    if (!cardRecord || !cardRecord.card) {
      return res.status(404).json(fail('CARD_NOT_FOUND', '未找到定位卡，请先生成定位卡'))
    }
    positioningCard = cardRecord.card
  }

  const attributionResult = attributionStore.get(userId) || null
  const diagnosisReport = getLatestDiagnosisReport(userId)
  const videoRecord = videoDataStore.get(userId)
  const videoData = videoRecord ? { videos: videoRecord.videos } : { videos: [] }

  try {
    const { suggestions, source } = await generateOptimizationSuggestions(
      attributionResult,
      diagnosisReport,
      positioningCard,
      videoData,
      { deepseekApiKey: DEEPSEEK_API_KEY, ipPlanSummary: ipPlan?.summary || '' }
    )
    const generatedAt = new Date().toISOString()
    optimizationStore.set(userId, { suggestions, source, generatedAt })
    res.json(ok({ suggestions, source, generatedAt }))
  } catch (err) {
    console.error('Generate optimization suggestions failed:', err)
    res.status(500).json(fail('GENERATION_FAILED', '优化建议生成失败，请稍后重试'))
  }
})

// 获取优化建议
app.get('/api/optimization', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = optimizationStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('OPTIMIZATION_NOT_FOUND', '未找到优化建议，请先生成'))
  }

  res.json(ok(record))
})

// 归因结果内存存储（MVP）
const attributionStore = new Map()

function validateAttributionRequest(body) {
  const errors = []
  if (!body || typeof body !== 'object') {
    errors.push('请求体不能为空')
    return errors
  }
  if (!Array.isArray(body.videos) || body.videos.length === 0) {
    errors.push('videos 不能为空数组')
  }
  if (!body.positioningCard || typeof body.positioningCard !== 'object') {
    errors.push('positioningCard 不能为空')
  }
  if (!body.dashboard || typeof body.dashboard !== 'object') {
    errors.push('dashboard 不能为空')
  }
  return errors
}

// AI 归因分析
app.post('/api/attribution/analyze', async (req, res) => {
  const { userId, videos, positioningCard, dashboard, ipPlan } = req.body

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const effectiveCard = (ipPlan && ipPlan.positioning)
    ? extractPositioningCardFromIpPlan(ipPlan)
    : positioningCard

  const validationErrors = validateAttributionRequest({ ...req.body, positioningCard: effectiveCard })
  if (validationErrors.length > 0) {
    return res.status(400).json(fail('VALIDATION_FAILED', validationErrors.join('；'), { details: validationErrors }))
  }

  try {
    const result = await analyzeAttribution(videos, effectiveCard, dashboard, {
      deepseekApiKey: DEEPSEEK_API_KEY,
      ipPlanSummary: ipPlan?.summary || ''
    })
    const record = { ...result, generatedAt: new Date().toISOString() }
    attributionStore.set(userId, record)
    res.json(ok(record))
  } catch (err) {
    console.error('Analyze attribution failed:', err)
    res.status(500).json(fail('ANALYSIS_FAILED', '归因分析失败，请稍后重试'))
  }
})

// 获取归因结果
app.get('/api/attribution', (req, res) => {
  const { userId } = req.query

  if (typeof userId !== 'string' || !UUID_V4_RE.test(userId)) {
    return res.status(400).json(fail('INVALID_USER_ID', '用户标识格式不正确'))
  }

  const record = attributionStore.get(userId)
  if (!record) {
    return res.status(404).json(fail('ATTRIBUTION_NOT_FOUND', '未找到归因结果'))
  }

  res.json(ok(record))
})

// 404
app.use((_req, res) => {
  res.status(404).json(fail('NOT_FOUND', '接口不存在'))
})

// 统一异常处理
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err)
  res.status(500).json(fail('INTERNAL_ERROR', '服务器内部错误'))
})

app.listen(PORT, () => {
  console.log(`IP Compass backend listening on http://localhost:${PORT}`)
})
