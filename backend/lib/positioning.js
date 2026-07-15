// 定位卡生成逻辑：优先调用 DeepSeek V4，失败或无 API Key 时用规则兜底

const DEFAULT_FALLBACK_TAGS = ['真实真诚', '女性成长', '长期主义', '内容创业', '个人 IP']

function buildPrompt(stage1, stage2) {
  const purposeMap = {
    record_life: '记录生活',
    personal_brand: '建立个人品牌',
    get_clients: '获得客户',
    find_peers: '寻找同类'
  }
  const audienceMap = {
    hobby_community: '同好社区',
    target_customers: '目标客户',
    career_network: '职场人脉',
    general_interest: '泛兴趣用户'
  }

  const purpose = purposeMap[stage1.q1] || stage1.q1
  const audience = audienceMap[stage1.q3] || stage1.q3
  const assets = Array.isArray(stage1.q2) ? stage1.q2.join('、') : stage1.q2

  const stage2Text = stage2
    .map((item, idx) => `Q${idx + 1}：${item.question}\nA${idx + 1}：${item.answer}`)
    .join('\n\n')

  return `你是一位资深的个人 IP 内容策略师。请根据以下用户回答，生成一份账号定位卡。

## 用户基础信息
- 做账号目的：${purpose}
- 现有素材资产：${assets}
- 最想连接的用户类型：${audience}

## AI 深度追问回答
${stage2Text}

请严格按照以下 JSON 格式返回，不要包含任何 markdown 代码块标记或其他说明：
{
  "oneLinePositioning": "一句话定位，15-30字，概括这个账号的独特价值",
  "persona": ["人设说明句1", "人设说明句2", "人设说明句3"],
  "promises": ["内容承诺1", "内容承诺2", "内容承诺3"],
  "tags": ["标签1", "标签2", "标签3", "标签4", "标签5"],
  "profileAdvice": {
    "avatar": "头像建议，20字以内",
    "nickname": "昵称建议，20字以内",
    "bio": "简介建议，30字以内",
    "cover": "背景图建议，20字以内"
  }
}

要求：
1. oneLinePositioning 15-30 字，自然真诚，避免过度营销。
2. persona 为 1-3 句人设说明，每句 10-40 字，体现真实可信的人格特质。
3. promises 为 1-3 条内容承诺，每条 10-40 字，明确用户关注这个账号能获得什么。
4. tags 为 5-8 个专属内容标签，每个 2-8 字，不可重复。不足时补充通用标签如真实真诚/女性成长/长期主义/内容创业/个人IP。
5. profileAdvice 每条 20 字以内，可直接执行。`
}

export function normalizeCard(raw) {
  if (!raw || typeof raw !== 'object') return null

  const oneLinePositioning =
    typeof raw.oneLinePositioning === 'string' ? raw.oneLinePositioning.trim() : ''
  const persona = Array.isArray(raw.persona)
    ? raw.persona.filter((t) => typeof t === 'string' && t.trim() !== '').map((t) => t.trim())
    : []
  const promises = Array.isArray(raw.promises)
    ? raw.promises.filter((t) => typeof t === 'string' && t.trim() !== '').map((t) => t.trim())
    : []
  let tags = Array.isArray(raw.tags)
    ? raw.tags.filter((t) => typeof t === 'string' && t.trim() !== '').map((t) => t.trim())
    : []

  // 标签去重
  tags = [...new Set(tags)]

  // 标签不足时补充通用标签
  if (tags.length < 5) {
    const used = new Set(tags)
    for (const tag of DEFAULT_FALLBACK_TAGS) {
      if (used.has(tag)) continue
      tags.push(tag)
      used.add(tag)
      if (tags.length >= 5) break
    }
  }

  const profileAdvice = raw.profileAdvice && typeof raw.profileAdvice === 'object' ? raw.profileAdvice : {}

  if (!oneLinePositioning || persona.length === 0 || promises.length === 0 || tags.length === 0) {
    return null
  }

  return {
    oneLinePositioning,
    persona,
    promises,
    tags,
    profileAdvice: {
      avatar: typeof profileAdvice.avatar === 'string' ? profileAdvice.avatar : '建议使用真人头像或代表自己风格的设计',
      nickname: typeof profileAdvice.nickname === 'string' ? profileAdvice.nickname : '昵称简洁 + 领域关键词',
      bio: typeof profileAdvice.bio === 'string' ? profileAdvice.bio : '一句话说明你能为用户带来什么',
      cover: typeof profileAdvice.cover === 'string' ? profileAdvice.cover : '选择能代表你内容风格的图片'
    }
  }
}

function fallbackCard(stage1, stage2) {
  const purposeMap = {
    record_life: '记录真实生活，积累个人内容资产',
    personal_brand: '建立专业可信的个人品牌',
    get_clients: '通过内容获取潜在客户',
    find_peers: '找到同频的同类人'
  }
  const audienceMap = {
    hobby_community: '同好社区',
    target_customers: '目标客户',
    career_network: '职场人脉',
    general_interest: '泛兴趣用户'
  }

  const purpose = purposeMap[stage1.q1] || stage1.q1
  const audience = audienceMap[stage1.q3] || stage1.q3
  const assets = Array.isArray(stage1.q2) ? stage1.q2.join('、') : stage1.q2
  const secondAnswer = stage2[1]?.answer || '真诚'

  return {
    oneLinePositioning: `帮${audience}通过「${assets}」找到${purpose}`,
    persona: [
      `真实可信，愿意把${assets}背后的故事讲出来`,
      `${secondAnswer}，说话像朋友一样直接`,
      '持续分享，相信长期积累比短期爆款更重要'
    ],
    promises: [
      '看见普通人也能做的内容路径',
      '获得可执行的主页优化建议',
      '找到属于自己的表达节奏'
    ],
    tags: ['真实真诚', '女性成长', '长期主义', '内容创业', '个人IP'],
    profileAdvice: {
      avatar: '干净纯色背景 + 人物正面',
      nickname: '简洁 + 领域关键词',
      bio: '一句话定位 + 更新频率',
      cover: '代表性作品拼接'
    }
  }
}

export async function generateCard(stage1, stage2, options = {}) {
  const { deepseekApiKey, deepseekApiUrl = 'https://api.deepseek.com/chat/completions' } = options

  if (!deepseekApiKey) {
    return { card: fallbackCard(stage1, stage2), source: 'fallback' }
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
          { role: 'system', content: '你是一个资深个人 IP 内容策略师，只输出严格 JSON。' },
          { role: 'user', content: buildPrompt(stage1, stage2) }
        ],
        temperature: 0.7,
        max_tokens: 900,
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
    const card = normalizeCard(parsed)
    if (!card) throw new Error('AI response structure invalid')

    return { card, source: 'ai' }
  } catch (err) {
    console.error('AI generation failed, fallback to rules:', err)
    return { card: fallbackCard(stage1, stage2), source: 'fallback' }
  }
}
