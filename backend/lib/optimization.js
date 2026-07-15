import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function loadPromptTemplate() {
  try {
    return readFileSync(join(__dirname, '../prompts/optimization_suggestions_v1.txt'), 'utf-8')
  } catch (err) {
    console.error('Failed to load optimization prompt template:', err)
    return ''
  }
}

function safeJoin(arr, sep = '、') {
  return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.trim()).join(sep) : ''
}

function buildOptimizationPrompt(attributionResult, diagnosisReport, positioningCard, videoData, ipPlanSummary = '') {
  const template = loadPromptTemplate()
  if (!template) {
    throw new Error('Prompt template not found')
  }

  const attributionSummary = (attributionResult?.attributions || []).map((item, index) => {
    return `${index + 1}. ${item.name}：${item.dataEvidence}；${item.contentAnalysis}`
  }).join('\n') || '无明显归因问题'

  const lowDimensions = (diagnosisReport?.dimensions || [])
    .filter((d) => d.isLow || d.isInsufficient || (typeof d.score === 'number' && d.score < 6))
    .map((d) => `${d.name}（${d.isInsufficient ? '信息不足' : `${d.score}/10`}）：${d.advice || ''}`)
    .join('\n') || '无低分维度'

  const videoDataSummary = (videoData?.videos || []).map((video, index) => {
    return `视频${index + 1}：播放量 ${video.playCount ?? '-'}，完播率 ${video.completionRate ?? '-'}%，点赞 ${video.likes ?? '-'}，评论 ${video.comments ?? '-'}，收藏 ${video.saves ?? '-'}，分享 ${video.shares ?? '-'}，新增粉丝 ${video.newFollowers ?? '-'}`
  }).join('\n') || '无视频数据'

  let prompt = template
    .replace('{oneLinePositioning}', positioningCard?.oneLinePositioning || '未提供')
    .replace('{persona}', safeJoin(positioningCard?.persona, '；'))
    .replace('{promises}', safeJoin(positioningCard?.promises, '；'))
    .replace('{tags}', safeJoin(positioningCard?.tags, '、'))
    .replace('{attributionSummary}', attributionSummary)
    .replace('{lowDimensions}', lowDimensions)
    .replace('{videoDataSummary}', videoDataSummary)

  if (ipPlanSummary) {
    prompt = prompt.replace(
      '### 账号定位\n',
      `### 账号定位\n\n## IP 方案摘要\n${ipPlanSummary}\n`
    )
  }

  return prompt
}

function normalizeSuggestions(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item === 'object' && typeof item.titleSuggestion === 'string' && item.titleSuggestion.trim())
    .slice(0, 5)
    .map((item, index) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `suggestion_${index + 1}`,
      direction: String(item.direction || '').trim() || '优化内容方向',
      titleSuggestion: String(item.titleSuggestion || '').trim(),
      optimizeDimension: String(item.optimizeDimension || '').trim() || '综合优化',
      caseReference: String(item.caseReference || '').trim() || '参考同类型账号高互动内容形式'
    }))
}

function fallbackSuggestions(attributionResult, positioningCard) {
  const tags = Array.isArray(positioningCard?.tags) ? positioningCard.tags : ['内容创作']
  const tag = tags[0] || '内容创作'
  const attributions = attributionResult?.attributions || []

  const suggestions = []
  if (attributions.length === 0 || attributions.some((a) => a.type === 'high_likes_low_completion')) {
    suggestions.push({
      id: 'suggestion_high_likes_low_completion_1',
      direction: `围绕「${tag}」做一期强共鸣选题，用具体数字或反常识观点吸引点击，同时优化开头节奏`,
      titleSuggestion: `${tag}的3个真相，第2个我踩过坑`,
      optimizeDimension: '选题/标题/开头',
      caseReference: '用数字+真相类标题提升封面点击率，前 3 秒直接给出痛点'
    })
  }
  if (attributions.length === 0 || attributions.some((a) => a.type === 'high_completion_low_engagement')) {
    suggestions.push({
      id: 'suggestion_high_completion_low_engagement_1',
      direction: '在文案结尾设计明确的互动提问或行动号召',
      titleSuggestion: '为什么你看了很多干货还是不会？问题出在这里',
      optimizeDimension: '互动引导',
      caseReference: '结尾用开放式问题引导评论，提升互动率'
    })
  }
  if (attributions.length === 0 || attributions.some((a) => a.type === 'high_saves_low_follow')) {
    suggestions.push({
      id: 'suggestion_high_saves_low_follow_1',
      direction: '在内容中强化人设与账号价值，设计关注理由',
      titleSuggestion: `关注我，每天分享一个${tag}实操方法`,
      optimizeDimension: '涨粉转化',
      caseReference: '在内容结尾明确告诉用户关注后能获得什么持续价值'
    })
  }
  if (attributions.length === 0 || attributions.some((a) => a.type === 'low_plays_good_follow')) {
    suggestions.push({
      id: 'suggestion_low_plays_good_follow_1',
      direction: '在保持精准转化的基础上，扩大选题覆盖面或优化封面/标题以提升播放量',
      titleSuggestion: '我整理了一份「新手避坑清单」，直接抄作业',
      optimizeDimension: '曝光放大',
      caseReference: '用可保存的实用资料提升收藏和涨粉转化，同时用大众话题标题扩大流量'
    })
  }

  return suggestions.slice(0, 5)
}

export async function generateOptimizationSuggestions(attributionResult, diagnosisReport, positioningCard, videoData, options = {}) {
  const { deepseekApiKey, deepseekApiUrl = 'https://api.deepseek.com/chat/completions', ipPlanSummary = '' } = options

  if (!deepseekApiKey) {
    return { suggestions: fallbackSuggestions(attributionResult, positioningCard), source: 'fallback' }
  }

  try {
    const prompt = buildOptimizationPrompt(attributionResult, diagnosisReport, positioningCard, videoData, ipPlanSummary)
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
          { role: 'system', content: '你是一位资深短视频内容策略师，只输出严格 JSON。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500,
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
    const suggestions = normalizeSuggestions(parsed?.suggestions)

    if (suggestions.length === 0) {
      return { suggestions: fallbackSuggestions(attributionResult, positioningCard), source: 'fallback' }
    }

    return { suggestions, source: 'ai' }
  } catch (err) {
    console.error('AI optimization suggestions failed, fallback to rules:', err)
    return { suggestions: fallbackSuggestions(attributionResult, positioningCard), source: 'fallback' }
  }
}
