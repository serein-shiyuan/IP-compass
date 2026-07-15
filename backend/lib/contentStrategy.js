// 栏目矩阵生成逻辑：优先 DeepSeek V4，失败或无 Key 时规则兜底

const FORMAT_OPTIONS = ['短视频', '图文笔记', '口播', '合集', '直播切片', '轻量图文']

function buildPrompt(positioningCard, ipPlanSummary = '') {
  return `你是一位资深内容策略顾问。请根据以下账号定位卡，设计 3-6 个内容栏目方向。

## 账号定位卡
- 一句话定位：${positioningCard.oneLinePositioning}
- 人设说明：${(positioningCard.persona || []).join('；')}
- 内容承诺：${(positioningCard.promises || []).join('；')}
- 专属标签：${(positioningCard.tags || []).join('、')}
${ipPlanSummary ? `\n## IP 方案摘要\n${ipPlanSummary}\n` : ''}
请严格按照以下 JSON 格式返回，不要包含任何 markdown 代码块标记或其他说明：
{
  "columns": [
    {
      "name": "栏目名称，4-15字",
      "goal": "栏目目标，10-50字，说明这个栏目解决用户什么问题",
      "format": "内容形式，从以下枚举中选择一个：短视频、图文笔记、口播、合集、直播切片、轻量图文",
      "frequency": "更新频率建议，如每周1期、每周2-3期、每月1期",
      "painPoints": ["用户痛点1", "用户痛点2", "用户痛点3"]
    }
  ]
}

要求：
1. columns 数组包含 3-6 个栏目。
2. 每个栏目必须包含 name、goal、format、frequency、painPoints。
3. name 4-15 字，goal 10-50 字，painPoints 2-5 个。
4. 栏目之间要有差异，覆盖定位卡中的不同人设标签和内容承诺。
5. format 必须是给定枚举之一。`
}

export function normalizeColumns(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.columns)) {
    return null
  }

  const columns = raw.columns
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const name = String(item.name || '').trim()
      const goal = String(item.goal || '').trim()
      const format = String(item.format || '').trim()
      const frequency = String(item.frequency || '').trim()
      const painPoints = Array.isArray(item.painPoints)
        ? item.painPoints.filter((p) => typeof p === 'string' && p.trim() !== '').map((p) => p.trim())
        : []

      if (!name || !goal || !format || !frequency || painPoints.length === 0) return null
      if (!FORMAT_OPTIONS.includes(format)) return null

      return { name, goal, format, frequency, painPoints }
    })
    .filter(Boolean)

  if (columns.length < 3 || columns.length > 6) {
    return null
  }

  return { columns }
}

export function fallbackColumns(positioningCard) {
  const tags = positioningCard.tags || ['真实真诚', '女性成长', '长期主义']
  const persona = positioningCard.persona || ['真实可信', '持续分享']
  const promises = positioningCard.promises || ['获得可执行的内容建议']

  return {
    columns: [
      {
        name: `${tags[0] || '成长'}日记`,
        goal: `通过真实记录降低信任门槛，让用户感受到${persona[0] || '真诚'}的一面`,
        format: '图文笔记',
        frequency: '每周 2-3 期',
        painPoints: ['不知道怎么开始', '担心内容没人看', '害怕暴露真实生活']
      },
      {
        name: `${tags[1] || '干货'}锦囊`,
        goal: `${promises[0] || '提供可执行的方法'}，帮助用户快速拿到结果`,
        format: '短视频',
        frequency: '每周 1 期',
        painPoints: ['信息太碎不成体系', '学了很多不会用', '找不到适合自己的方法']
      },
      {
        name: 'ta的问答',
        goal: '回应用户真实困惑，建立陪伴感和专业信任',
        format: '口播',
        frequency: '每周 1 期',
        painPoints: ['有具体问题无人解答', '想参考真实经验', '希望被理解']
      },
      {
        name: `${tags[2] || '长期主义'}清单`,
        goal: '用清单化内容降低阅读门槛，沉淀可持续关注的内容资产',
        format: '合集',
        frequency: '每月 2 期',
        painPoints: ['不知道如何规划内容', '缺乏长期视角', '想系统学习']
      }
    ]
  }
}

export async function generateColumns(positioningCard, options = {}) {
  const { deepseekApiKey, deepseekApiUrl = 'https://api.deepseek.com/chat/completions', ipPlanSummary = '' } = options

  if (!deepseekApiKey) {
    return { data: fallbackColumns(positioningCard), source: 'fallback' }
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
          { role: 'system', content: '你是一个资深内容策略顾问，只输出严格 JSON。' },
          { role: 'user', content: buildPrompt(positioningCard, ipPlanSummary) }
        ],
        temperature: 0.7,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!res.ok) {
      throw new Error(`DeepSeek API ${res.status}`)
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) throw new Error('Empty AI response')

    const parsed = JSON.parse(content)
    const normalized = normalizeColumns(parsed)
    if (!normalized) throw new Error('AI response structure invalid')

    return { data: normalized, source: 'ai' }
  } catch (err) {
    console.error('AI column generation failed, fallback to rules:', err)
    return { data: fallbackColumns(positioningCard), source: 'fallback' }
  }
}
