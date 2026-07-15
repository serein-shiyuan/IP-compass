// 发布前诊断：本地纠偏规则库（T-016）

const SENSATIONAL_KEYWORDS = [
  '震惊', '惊呆', '疯了', '爆款', '必看', '绝密', '内幕', '曝光', '揭秘',
  '99% 的人不知道', '看完沉默了', '全网首发', '紧急通知', '马上删除'
]

const TITLE_SCRIPT_MISMATCH_PATTERNS = [
  { key: '钱', message: '标题提到金钱/收益，但文案未展开说明', check: (title, script) => /\d+万|\d+千|赚|收入|副业/.test(title) && !/\d+万|\d+千|赚|收入|副业|价格|成本/.test(script) },
  { key: '时间', message: '标题提到具体时间效果，但文案未给出对应路径', check: (title, script) => /\d+天|\d+周|\d+个月|立刻|马上/.test(title) && !/步骤|方法|行动|第一周|第一天/.test(script) }
]

function hasSensationalTitle(title) {
  const t = String(title || '')
  return SENSATIONAL_KEYWORDS.some((kw) => t.includes(kw))
}

function calculateOverlap(tags, positioningTags) {
  if (!Array.isArray(tags) || tags.length === 0) return 0
  if (!Array.isArray(positioningTags) || positioningTags.length === 0) return 1
  const set = new Set(positioningTags.map((t) => String(t).trim()))
  const matched = tags.filter((t) => set.has(String(t).trim())).length
  return matched / tags.length
}

export function checkContentBias({ title, script, tags, positioningCard }) {
  const rules = []

  if (hasSensationalTitle(title)) {
    rules.push({
      type: 'sensational_title',
      message: '标题含有夸张或诱导性词汇，可能被平台判定为标题党',
      suggestion: '尝试用具体场景或数据替代夸张词，例如把“震惊”改为“我发现了”'
    })
  }

  for (const pattern of TITLE_SCRIPT_MISMATCH_PATTERNS) {
    if (pattern.check(String(title || ''), String(script || ''))) {
      rules.push({
        type: 'title_script_mismatch',
        message: pattern.message,
        suggestion: '在文案中补充标题承诺的具体信息或案例，让标题与内容一致'
      })
    }
  }

  const overlap = calculateOverlap(tags, positioningCard?.tags)
  if (tags?.length > 0 && overlap < 0.3) {
    rules.push({
      type: 'topic_mismatch',
      message: '话题标签与账号定位标签重合度较低，可能影响推荐精准度',
      suggestion: `从定位标签中选择更贴合的词：${(positioningCard?.tags || []).slice(0, 3).join('、')}`
    })
  }

  return {
    hasBias: rules.length > 0,
    rules
  }
}

export function validateDraftContent(content) {
  const errors = []
  if (!content || typeof content !== 'object') {
    errors.push('内容数据不能为空')
    return errors
  }

  const required = ['topic', 'format', 'title', 'script']
  for (const key of required) {
    if (!content[key] || String(content[key]).trim() === '') {
      errors.push(`缺少必填字段：${key}`)
    }
  }

  const titleLen = Array.from(String(content.title || '')).length
  if (content.title && (titleLen < 5 || titleLen > 30)) {
    errors.push(`标题需 5-30 字，当前 ${titleLen} 字`)
  }

  const scriptLen = Array.from(String(content.script || '')).length
  if (content.script && (scriptLen < 10 || scriptLen > 500)) {
    errors.push(`文案需 10-500 字，当前 ${scriptLen} 字`)
  }

  return errors
}

// 8 维度诊断报告（F007）
const DIMENSION_NAMES = [
  '标题清晰度',
  '前3秒钩子吸引力',
  '关键词匹配度',
  '话题组合合理性',
  '脚本结构完整性',
  '画面信息量',
  '音乐情绪匹配',
  '评论引导设计'
]

const DEFAULT_ADVICE = {
  标题清晰度: '标题应直接点明内容价值，避免歧义或过度抽象',
  前3秒钩子吸引力: '开头用具体场景、冲突或疑问抓住注意力',
  关键词匹配度: '标题和文案中融入账号定位关键词',
  话题组合合理性: '选择 2-5 个与定位相关的话题标签',
  脚本结构完整性: '文案包含开头-中间-结尾，信息递进清晰',
  画面信息量: '上传与标题呼应的封面图，提升点击转化率',
  音乐情绪匹配: '根据文案情绪基调选择契合的背景音乐',
  评论引导设计: '结尾提出具体问题或邀请用户分享经验'
}

function clampScore(score) {
  if (score === null || score === undefined) return null
  const n = Number(score)
  if (Number.isNaN(n)) return null
  return Math.max(0, Math.min(10, Math.round(n)))
}

function charCount(str) {
  return Array.from(String(str || '')).length
}

function fallbackReport(content, positioningCard) {
  const title = String(content.title || '')
  const script = String(content.script || '')
  const tags = Array.isArray(content.tags) ? content.tags : []
  const coverImage = content.coverImage
  const positioningTags = Array.isArray(positioningCard?.tags) ? positioningCard.tags : []

  const titleLen = charCount(title)
  const scriptLen = charCount(script)

  // 标题清晰度
  const titleClarity = titleLen >= 10 && titleLen <= 20 ? 8 : titleLen >= 5 && titleLen <= 30 ? 6 : 4

  // 前3秒钩子吸引力
  const hasHook = /\?|？|！|!|如何|为什么|怎样|居然|竟然|原来|揭秘|数字|\d+/.test(title)
  const hookScore = hasHook ? 7 : 5

  // 关键词匹配度
  const titleScriptText = title + script
  const matchedKeywords = positioningTags.filter((t) => titleScriptText.includes(String(t).trim())).length
  const keywordScore = positioningTags.length > 0
    ? Math.round((matchedKeywords / positioningTags.length) * 10)
    : 6

  // 话题组合合理性
  const overlap = tags.length > 0 && positioningTags.length > 0
    ? tags.filter((t) => positioningTags.some((p) => String(p).trim() === String(t).trim())).length / tags.length
    : 0
  const topicScore = tags.length >= 2 && tags.length <= 5 && overlap >= 0.3 ? 8
    : tags.length >= 1 && tags.length <= 5 ? 6
      : 4

  // 脚本结构完整性
  const hasStructure = /首先|第.步|第一步|开头|然后|接着|最后|总结|结论|建议/.test(script)
  const structureScore = scriptLen >= 100 && hasStructure ? 8 : scriptLen >= 50 ? 6 : 5

  // 画面信息量
  const visualInsufficient = !coverImage
  const visualScore = visualInsufficient ? null : 7

  // 音乐情绪匹配
  const musicInsufficient = scriptLen < 20
  const emotionWords = { 激昂: /加油|冲|奋斗|热血|燃/, 舒缓: /安静|慢慢|平静|温柔/, 幽默: /哈哈|搞笑|逗|梗/, 治愈: /温暖|治愈|陪伴|安心/, 严肃: /重要|注意|警惕|真相/ }
  let emotionScore = null
  if (!musicInsufficient) {
    const detected = Object.entries(emotionWords).filter(([, re]) => re.test(script))
    emotionScore = detected.length > 0 ? 7 : 6
  }

  // 评论引导设计
  const hasQuestion = /\?|？|你呢|欢迎|留言|评论|分享|你怎么看/.test(script)
  const commentScore = hasQuestion ? 7 : 5

  const scores = [
    { dimension: '标题清晰度', score: titleClarity, advice: DEFAULT_ADVICE['标题清晰度'] },
    { dimension: '前3秒钩子吸引力', score: hookScore, advice: DEFAULT_ADVICE['前3秒钩子吸引力'] },
    { dimension: '关键词匹配度', score: keywordScore, advice: DEFAULT_ADVICE['关键词匹配度'] },
    { dimension: '话题组合合理性', score: topicScore, advice: DEFAULT_ADVICE['话题组合合理性'] },
    { dimension: '脚本结构完整性', score: structureScore, advice: DEFAULT_ADVICE['脚本结构完整性'] },
    { dimension: '画面信息量', score: visualScore, advice: DEFAULT_ADVICE['画面信息量'], isInsufficient: visualInsufficient },
    { dimension: '音乐情绪匹配', score: emotionScore, advice: DEFAULT_ADVICE['音乐情绪匹配'], isInsufficient: musicInsufficient },
    { dimension: '评论引导设计', score: commentScore, advice: DEFAULT_ADVICE['评论引导设计'] }
  ]

  return normalizeReportScores(scores)
}

function normalizeReportScores(scores) {
  const map = new Map()
  for (const item of scores) {
    if (item && typeof item === 'object' && typeof item.dimension === 'string') {
      map.set(item.dimension, item)
    }
  }

  const dimensions = DIMENSION_NAMES.map((name) => {
    const item = map.get(name)
    const score = item ? clampScore(item.score) : null
    return {
      name,
      score,
      advice: (item && typeof item.advice === 'string' && item.advice.trim()) || DEFAULT_ADVICE[name],
      isLow: score !== null && score < 6,
      isInsufficient: score === null || Boolean(item?.isInsufficient)
    }
  })

  const validScores = dimensions.filter((d) => d.score !== null).map((d) => d.score)
  const totalScore = validScores.length > 0
    ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 8)
    : 0

  let rating = '需优化'
  if (totalScore >= 64) rating = '优秀'
  else if (totalScore >= 48) rating = '良好'

  return {
    totalScore,
    rating,
    dimensions
  }
}

function buildDiagnosisPrompt(content, positioningCard, ipPlanSummary = '') {
  return `你是一位资深短视频内容诊断师。请根据以下内容信息，从 8 个维度进行评分并给出修改建议。

## 账号定位
- 一句话定位：${positioningCard?.oneLinePositioning || '未提供'}
- 人设说明：${(positioningCard?.persona || []).join('；')}
- 内容承诺：${(positioningCard?.promises || []).join('；')}
- 定位标签：${(positioningCard?.tags || []).join('、')}
${ipPlanSummary ? `\n## IP 方案摘要\n${ipPlanSummary}\n` : ''}
## 待诊断内容
- 选题：${content.topic || ''}
- 目标用户：${content.targetUser || ''}
- 针对痛点：${content.painPoint || ''}
- 内容形式：${content.format || ''}
- 标题：${content.title || ''}
- 文案/脚本：${content.script || ''}
- 话题标签：${(content.tags || []).join('、')}
- 是否上传封面图：${content.coverImage ? '是' : '否'}

## 8 维度评分标准（每维度 0-10 整数）
1. 标题清晰度：标题是否一眼看懂核心内容和价值
2. 前3秒钩子吸引力：标题/开头是否能留住用户继续看
3. 关键词匹配度：标题和文案是否包含账号定位关键词
4. 话题组合合理性：话题标签数量是否合适、是否与定位相关
5. 脚本结构完整性：文案是否有清晰的开头-中间-结尾结构
6. 画面信息量：封面图是否与标题呼应、信息是否充足（未上传封面图时请返回 null 并标记信息不足）
7. 音乐情绪匹配：基于文案情绪基调，判断适合的音乐情绪是否与目标用户匹配（文案不足 20 字时返回 null 并标记信息不足）
8. 评论引导设计：文案是否有明确的互动引导或提问

请严格按照以下 JSON 格式返回，不要包含任何 markdown 代码块标记：
{
  "scores": [
    { "dimension": "标题清晰度", "score": 7, "advice": "具体修改建议" },
    { "dimension": "前3秒钩子吸引力", "score": 6, "advice": "具体修改建议" },
    { "dimension": "关键词匹配度", "score": 8, "advice": "具体修改建议" },
    { "dimension": "话题组合合理性", "score": 7, "advice": "具体修改建议" },
    { "dimension": "脚本结构完整性", "score": 6, "advice": "具体修改建议" },
    { "dimension": "画面信息量", "score": null, "advice": "上传与标题呼应的封面图", "isInsufficient": true },
    { "dimension": "音乐情绪匹配", "score": 7, "advice": "具体修改建议" },
    { "dimension": "评论引导设计", "score": 6, "advice": "具体修改建议" }
  ]
}`
}

export async function generateDiagnosisReport(content, positioningCard, options = {}) {
  const { deepseekApiKey, deepseekApiUrl = 'https://api.deepseek.com/chat/completions', ipPlanSummary = '' } = options

  if (!deepseekApiKey) {
    return { ...fallbackReport(content, positioningCard), source: 'fallback' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25000)

    const res = await fetch(deepseekApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一位资深短视频内容诊断师，只输出严格 JSON。' },
          { role: 'user', content: buildDiagnosisPrompt(content, positioningCard, ipPlanSummary) }
        ],
        temperature: 0.7,
        max_tokens: 1200,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!res.ok) throw new Error(`DeepSeek API ${res.status}`)

    const data = await res.json()
    const message = data.choices?.[0]?.message?.content
    if (!message) throw new Error('Empty AI response')

    const parsed = JSON.parse(message)
    const scores = Array.isArray(parsed?.scores) ? parsed.scores : []
    const report = normalizeReportScores(scores)

    // 兜底信息不足维度（AI 未正确处理时）
    const scriptLen = charCount(content.script)
    report.dimensions = report.dimensions.map((d) => {
      if (d.name === '画面信息量' && !content.coverImage) {
        return { ...d, score: null, isInsufficient: true, isLow: false }
      }
      if (d.name === '音乐情绪匹配' && scriptLen < 20) {
        return { ...d, score: null, isInsufficient: true, isLow: false }
      }
      return d
    })

    // 重新计算总分
    const validScores = report.dimensions.filter((d) => d.score !== null).map((d) => d.score)
    report.totalScore = validScores.length > 0
      ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 8)
      : 0
    if (report.totalScore >= 64) report.rating = '优秀'
    else if (report.totalScore >= 48) report.rating = '良好'
    else report.rating = '需优化'

    return { ...report, source: 'ai' }
  } catch (err) {
    console.error('AI diagnosis failed, fallback to rules:', err)
    return { ...fallbackReport(content, positioningCard), source: 'fallback' }
  }
}
