// 选题池生成逻辑：优先 DeepSeek V4，失败或无 Key 时规则兜底

const DEFAULT_STATUS = 'pending'
const MAX_TOPICS = 50

export function topicsFromPreset(topTopics, columns) {
  if (!Array.isArray(topTopics) || topTopics.length === 0) return null
  const validColumns = Array.isArray(columns) && columns.length > 0 ? columns : [{ name: '成长栏目' }]

  const topics = topTopics
    .filter((t) => t && typeof t === 'object' && (t.title || t.topic))
    .map((t, idx) => {
      const columnIndex = validColumns.length > 0 ? idx % validColumns.length : 0
      const columnId = `col_${columnIndex}`
      const title = String(t.title || t.topic || '').trim()
      const direction = String(t.direction || '').trim()
      const points = direction
        ? [`围绕"${direction}"展开具体场景`, '给出可执行的行动建议或情绪共鸣', '结尾回扣账号定位，引导互动']
        : ['说明选题背景与用户痛点', '给出具体观点或行动建议', '结合自身经历增强真实感']
      return {
        id: `${columnId}_${idx}_${Date.now()}`,
        columnId,
        title,
        points,
        materialAdvice: direction
          ? `结合"${direction}"方向准备真实素材或案例`
          : '结合自身经历或观察准备素材',
        painPoints: direction ? [`缺少${direction}类内容陪伴`, '找不到可执行的参考'] : ['缺少同类内容陪伴', '找不到可执行的参考'],
        status: DEFAULT_STATUS,
        createdAt: new Date().toISOString()
      }
    })

  if (topics.length === 0) return null
  return { topics: topics.slice(0, MAX_TOPICS) }
}

function buildColumnPrompt(column, columnIndex, quota, positioningCard, ipPlanSummary = '') {
  return `你是一位资深内容选题策划。请为以下栏目生成 ${quota} 个具体可执行的选题。

## 账号定位
- 一句话定位：${positioningCard.oneLinePositioning}
- 人设说明：${(positioningCard.persona || []).join('；')}
- 内容承诺：${(positioningCard.promises || []).join('；')}
${ipPlanSummary ? `\n## IP 方案摘要\n${ipPlanSummary}\n` : ''}
## 栏目信息
- 栏目名称：${column.name}
- 栏目目标：${column.goal}
- 内容形式：${column.format}
- 更新频率：${column.frequency}
- 解决痛点：${(column.painPoints || []).join('、')}

请严格按照以下 JSON 对象格式返回 ${quota} 个选题，不要包含任何 markdown 代码块标记：
{
  "topics": [
    {
      "title": "选题标题，5-30字，具体且有吸引力",
      "points": ["要点1", "要点2", "要点3"],
      "materialAdvice": "素材建议，20-60字",
      "painPoints": ["该选题针对的用户痛点1", "该选题针对的用户痛点2"]
    }
  ]
}

要求：
1. 每个选题标题 5-30 字。
2. points 为 3 个内容要点，每句 10-40 字。
3. materialAdvice 20-60 字，说明拍摄或准备什么素材。
4. painPoints 2-3 个，体现这个选题解决的具体问题。
5. 选题要贴合栏目定位，避免泛泛而谈。`
}

export function normalizeTopics(raw, columnId) {
  if (!Array.isArray(raw)) return []

  return raw
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null
      const title = String(item.title || '').trim()
      const points = Array.isArray(item.points)
        ? item.points.filter((p) => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())
        : []
      const materialAdvice = String(item.materialAdvice || '').trim()
      const painPoints = Array.isArray(item.painPoints)
        ? item.painPoints.filter((p) => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())
        : []

      if (!title || points.length === 0) return null

      return {
        id: `${columnId}_${idx}_${Date.now()}`,
        columnId,
        title,
        points: points.slice(0, 3),
        materialAdvice: materialAdvice || '结合自身真实经历或案例进行创作',
        painPoints: painPoints.slice(0, 3),
        status: DEFAULT_STATUS,
        createdAt: new Date().toISOString()
      }
    })
    .filter(Boolean)
}

function fallbackTopics(columns, positioningCard) {
  const allTopics = []
  columns.forEach((column, idx) => {
    const columnId = `col_${idx}`
    allTopics.push(
      {
        id: `${columnId}_1`,
        columnId,
        title: `${column.name}：从 0 到 1 的入门指南`,
        points: [
          `为什么${column.name}值得关注`,
          '新手最容易踩的 3 个坑',
          '普通人也能上手的第一个动作'
        ],
        materialAdvice: '准备 1-2 个自己的真实案例或观察记录',
        painPoints: ['不知道从哪里开始', '信息太杂无法下手'],
        status: DEFAULT_STATUS,
        createdAt: new Date().toISOString()
      },
      {
        id: `${columnId}_2`,
        columnId,
        title: `我靠${column.name}解决了什么问题`,
        points: [
          '问题出现前的真实场景',
          '我尝试过的方法和踩过的坑',
          '最终有效的那一步是什么'
        ],
        materialAdvice: '整理一段自己的经历，突出前后对比',
        painPoints: ['有共鸣但没有路径', '想参考真实经验'],
        status: DEFAULT_STATUS,
        createdAt: new Date().toISOString()
      },
      {
        id: `${columnId}_3`,
        columnId,
        title: `${column.format}形式下的${column.name}表达技巧`,
        points: [
          `${column.format}的开头怎么抓注意力`,
          '信息密度与节奏控制',
          '结尾如何引导互动或关注'
        ],
        materialAdvice: '收集 2-3 个同类型爆款内容作为结构参考',
        painPoints: ['不知道怎么呈现', '做出来没人看'],
        status: DEFAULT_STATUS,
        createdAt: new Date().toISOString()
      }
    )
  })
  return allTopics.slice(0, MAX_TOPICS)
}

function distributeQuota(columnCount) {
  if (columnCount <= 0) return []
  const base = Math.floor(MAX_TOPICS / columnCount)
  const remainder = MAX_TOPICS % columnCount
  return Array.from({ length: columnCount }, (_, i) => (i < remainder ? base + 1 : base))
}

export async function generateTopics(columns, positioningCard, options = {}) {
  const { deepseekApiKey, deepseekApiUrl = 'https://api.deepseek.com/chat/completions', ipPlanSummary = '', ipPlan = null } = options

  // 优先使用 IP 方案预设中的前 10 条选题
  if (ipPlan?.topTopics) {
    const preset = topicsFromPreset(ipPlan.topTopics, columns)
    if (preset) return { topics: preset.topics, source: 'preset' }
  }

  if (!deepseekApiKey) {
    return { topics: fallbackTopics(columns, positioningCard), source: 'fallback' }
  }

  const quotas = distributeQuota(columns.length)
  const allTopics = []
  let anySuccess = false

  for (let i = 0; i < columns.length; i++) {
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
            { role: 'system', content: '你是一个资深内容选题策划，只输出严格 JSON。' },
            { role: 'user', content: buildColumnPrompt(columns[i], i, quotas[i], positioningCard, ipPlanSummary) }
          ],
          temperature: 0.75,
          max_tokens: 1200,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      })

      clearTimeout(timeout)

      if (!res.ok) throw new Error(`DeepSeek API ${res.status}`)
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('Empty AI response')

      const parsed = JSON.parse(content)
      const rawTopics = Array.isArray(parsed) ? parsed : parsed?.topics
      const topics = normalizeTopics(rawTopics, `col_${i}`)
      if (topics.length > 0) {
        allTopics.push(...topics)
        anySuccess = true
      }
    } catch (err) {
      console.error(`Generate topics for column ${i} failed:`, err)
    }
  }

  if (!anySuccess) {
    return { topics: fallbackTopics(columns, positioningCard), source: 'fallback' }
  }

  return { topics: allTopics.slice(0, MAX_TOPICS), source: 'ai' }
}
