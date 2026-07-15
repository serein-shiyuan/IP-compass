import {
  INDUSTRY_BENCHMARKS,
  HIGH_THRESHOLD,
  LOW_THRESHOLD,
  ATTRIBUTION_TYPES,
  ATTRIBUTION_TYPE_KEYS
} from '../constants/industry_benchmarks.js'

// 参与归因计算的原始指标
const RAW_METRIC_KEYS = ['playCount', 'completionRate', 'likes', 'comments', 'saves', 'shares', 'newFollowers']

function safeNumber(value) {
  const n = Number(value)
  return Number.isNaN(n) ? null : n
}

// 计算中位数
function median(values) {
  const sorted = values.filter((v) => v !== null && v !== undefined).sort((a, b) => a - b)
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// 异常值剔除：> 中位数 3 倍视为异常
export function removeOutliers(videos) {
  const normalVideos = []
  let abnormalCount = 0

  RAW_METRIC_KEYS.forEach((key) => {
    const values = videos.map((v) => safeNumber(v[key])).filter((v) => v !== null)
    const m = median(values)
    const upperLimit = m * 3

    videos.forEach((video, index) => {
      const value = safeNumber(video[key])
      if (value !== null && value > upperLimit) {
        if (!normalVideos[index]) normalVideos[index] = { ...video }
        normalVideos[index][key] = null
        abnormalCount += 1
      } else if (normalVideos[index]) {
        normalVideos[index][key] = value
      } else if (!normalVideos[index]) {
        normalVideos[index] = { ...video, [key]: value }
      }
    })
  })

  return { videos: normalVideos, abnormalCount }
}

// 计算单条视频的比率指标（playCount 为 0 时返回 null）
function computeRates(video) {
  const playCount = safeNumber(video.playCount)
  if (playCount === null || playCount === 0) {
    return {
      completionRate: safeNumber(video.completionRate),
      likesRate: null,
      commentsRate: null,
      savesRate: null,
      sharesRate: null,
      followRate: null
    }
  }

  return {
    completionRate: safeNumber(video.completionRate),
    likesRate: safeNumber(video.likes) !== null ? (safeNumber(video.likes) / playCount) * 100 : null,
    commentsRate: safeNumber(video.comments) !== null ? (safeNumber(video.comments) / playCount) * 100 : null,
    savesRate: safeNumber(video.saves) !== null ? (safeNumber(video.saves) / playCount) * 100 : null,
    sharesRate: safeNumber(video.shares) !== null ? (safeNumber(video.shares) / playCount) * 100 : null,
    followRate: safeNumber(video.newFollowers) !== null ? (safeNumber(video.newFollowers) / playCount) * 100 : null
  }
}

// 计算平均指标（原始 + 比率）
function computeAverages(videos) {
  const avg = {}

  // 原始指标平均
  RAW_METRIC_KEYS.forEach((key) => {
    const values = videos.map((v) => safeNumber(v[key])).filter((v) => v !== null)
    avg[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  })

  // 比率指标平均
  const rateKeys = ['completionRate', 'likesRate', 'commentsRate', 'savesRate', 'sharesRate', 'followRate']
  rateKeys.forEach((key) => {
    const values = videos.map((v) => computeRates(v)[key]).filter((v) => v !== null)
    avg[key] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  })

  // 互动率 = (点赞率 + 评论率 + 收藏率 + 转发率) / 4
  const engagementValues = videos.map((v) => {
    const r = computeRates(v)
    if (r.likesRate === null || r.commentsRate === null || r.savesRate === null || r.sharesRate === null) return null
    return (r.likesRate + r.commentsRate + r.savesRate + r.sharesRate) / 4
  }).filter((v) => v !== null)
  avg.engagementRate = engagementValues.length > 0
    ? engagementValues.reduce((a, b) => a + b, 0) / engagementValues.length
    : 0

  return avg
}

// 预匹配归因类型：按 PRD 定义的 4 种组合条件
export function preMatchAttributions(videos) {
  if (!Array.isArray(videos) || videos.length === 0) return []

  const avg = computeAverages(videos)
  const matched = []

  // 点高完低：点赞率 ≥ 3% × 1.2 且 完播率 ≤ 25% × 0.8
  if (avg.likesRate >= INDUSTRY_BENCHMARKS.likesRate * HIGH_THRESHOLD &&
      avg.completionRate <= INDUSTRY_BENCHMARKS.completionRate * LOW_THRESHOLD) {
    matched.push('high_likes_low_completion')
  }

  // 完高互低：完播率 ≥ 25% × 1.2 且 互动率 ≤ ((3%+0.5%+1.5%+0.5%)/4) × 0.8
  const engagementBenchmark = (INDUSTRY_BENCHMARKS.likesRate + INDUSTRY_BENCHMARKS.commentsRate +
    INDUSTRY_BENCHMARKS.savesRate + INDUSTRY_BENCHMARKS.sharesRate) / 4
  if (avg.completionRate >= INDUSTRY_BENCHMARKS.completionRate * HIGH_THRESHOLD &&
      avg.engagementRate <= engagementBenchmark * LOW_THRESHOLD) {
    matched.push('high_completion_low_engagement')
  }

  // 收高粉低：收藏率 ≥ 1.5% × 1.2 且 关注转化率 ≤ 1% × 0.8
  if (avg.savesRate >= INDUSTRY_BENCHMARKS.savesRate * HIGH_THRESHOLD &&
      avg.followRate <= INDUSTRY_BENCHMARKS.followRate * LOW_THRESHOLD) {
    matched.push('high_saves_low_follow')
  }

  // 播低粉好：播放量 < 1000 且 关注转化率 ≥ 1% × 1.2
  if (avg.playCount < INDUSTRY_BENCHMARKS.playCountLow &&
      avg.followRate >= INDUSTRY_BENCHMARKS.followRate * HIGH_THRESHOLD) {
    matched.push('low_plays_good_follow')
  }

  return matched
}

// 计算关键指标摘要
function summarizeMetrics(videos) {
  const summary = {}
  const avg = computeAverages(videos)

  const labels = {
    playCount: '播放量',
    completionRate: '完播率（%）',
    likesRate: '点赞率（%）',
    commentsRate: '评论率（%）',
    savesRate: '收藏率（%）',
    sharesRate: '转发率（%）',
    followRate: '关注转化率（%）',
    engagementRate: '互动率（%）'
  }

  Object.keys(labels).forEach((key) => {
    const value = avg[key]
    summary[key] = {
      avg: typeof value === 'number' ? Math.round(value * 100) / 100 : 0,
      benchmark: INDUSTRY_BENCHMARKS[key] || null
    }
  })

  return summary
}

function buildAttributionPrompt(videos, positioningCard, dashboard, preMatchedTypes, ipPlanSummary = '') {
  const summary = summarizeMetrics(videos)
  const typeList = preMatchedTypes.length > 0
    ? preMatchedTypes.map((k) => `${ATTRIBUTION_TYPES[k]?.name}（${ATTRIBUTION_TYPES[k]?.description}）`).join('\n')
    : '无明显匹配，请基于数据整体判断'

  const metricsText = Object.keys(summary).map((key) => {
    const s = summary[key]
    const benchmarkText = s.benchmark !== null ? `，行业均值 ${s.benchmark}${key === 'playCount' ? '' : '%'}` : ''
    return `- ${key === 'playCount' ? '播放量' : key === 'engagementRate' ? '互动率' : key + ''}：均值 ${s.avg}${benchmarkText}`
  }).join('\n')

  return `你是一位资深短视频数据分析师。请根据以下账号定位、已录入视频数据和行业均值，分析视频表现问题的原因，并返回结构化的归因诊断。

## 账号定位
- 一句话定位：${positioningCard?.oneLinePositioning || '未提供'}
- 人设说明：${(positioningCard?.persona || []).join('；')}
- 内容承诺：${(positioningCard?.promises || []).join('；')}
- 定位标签：${(positioningCard?.tags || []).join('、')}
${ipPlanSummary ? `\n## IP 方案摘要\n${ipPlanSummary}\n` : ''}
## 视频数据摘要（已剔除异常值）
${metricsText}

## 预匹配归因类型（请重点分析这些方向）
${typeList}

## 可识别的归因类型
- high_likes_low_completion：点高完低（点赞率高但完播率低）
- high_completion_low_engagement：完高互低（完播率高但互动率低）
- high_saves_low_follow：收高粉低（收藏率高但涨粉率低）
- low_plays_good_follow：播低粉好（播放量低但涨粉转化好）

## 输出要求
请严格按照以下 JSON 格式返回，不要包含任何 markdown 代码块标记：
{
  "attributions": [
    {
      "type": "high_likes_low_completion",
      "dataEvidence": "基于数据的具体证据，1-2 句话",
      "contentAnalysis": "从内容角度分析原因，2-3 句话"
    }
  ]
}

注意：
1. 只返回 JSON，不要有其他说明。
2. type 必须严格是 high_likes_low_completion / high_completion_low_engagement / high_saves_low_follow / low_plays_good_follow 之一。
3. 如果无明显问题，可返回空数组 []。
4. dataEvidence 和 contentAnalysis 都不能为空。`
}

function normalizeAttributions(raw, allowedKeys = ATTRIBUTION_TYPE_KEYS) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item) => item && typeof item === 'object' && allowedKeys.includes(item.type))
    .map((item) => ({
      type: item.type,
      name: ATTRIBUTION_TYPES[item.type]?.name || item.type,
      dataEvidence: String(item.dataEvidence || '').trim() || '数据表现与行业均值参考线存在偏离',
      contentAnalysis: String(item.contentAnalysis || '').trim() || '建议结合账号定位优化对应内容环节'
    }))
}

function fallbackAttributions(preMatchedTypes) {
  return preMatchedTypes.map((key) => ({
    type: key,
    name: ATTRIBUTION_TYPES[key]?.name || key,
    dataEvidence: ATTRIBUTION_TYPES[key]?.description || '',
    contentAnalysis: '当前数据偏离行业均值参考线，建议对照账号定位逐一优化对应环节。'
  }))
}

export async function analyzeAttribution(videos, positioningCard, dashboard, options = {}) {
  const { deepseekApiKey, deepseekApiUrl = 'https://api.deepseek.com/chat/completions', ipPlanSummary = '' } = options

  if (!Array.isArray(videos) || videos.length === 0) {
    return { attributions: [], isInsufficient: true, abnormalCount: 0 }
  }

  const isInsufficient = videos.length < 3
  const { videos: normalVideos, abnormalCount } = removeOutliers(videos)
  const preMatchedTypes = preMatchAttributions(normalVideos)

  if (!deepseekApiKey) {
    return {
      attributions: preMatchedTypes.length > 0 ? fallbackAttributions(preMatchedTypes) : [],
      isInsufficient,
      abnormalCount
    }
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
          { role: 'system', content: '你是一位资深短视频数据分析师，只输出严格 JSON。' },
          { role: 'user', content: buildAttributionPrompt(normalVideos, positioningCard, dashboard, preMatchedTypes, ipPlanSummary) }
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
    const attributions = normalizeAttributions(parsed?.attributions)

    // 如果 AI 返回为空，使用预匹配兜底
    if (attributions.length === 0 && preMatchedTypes.length > 0) {
      return { attributions: fallbackAttributions(preMatchedTypes), isInsufficient, abnormalCount, source: 'fallback' }
    }

    return { attributions, isInsufficient, abnormalCount, source: 'ai' }
  } catch (err) {
    console.error('AI attribution failed, fallback to rules:', err)
    return {
      attributions: preMatchedTypes.length > 0 ? fallbackAttributions(preMatchedTypes) : [],
      isInsufficient,
      abnormalCount,
      source: 'fallback'
    }
  }
}
