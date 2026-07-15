// IP 方案生成与对话追问逻辑

const FREEFORM_QUESTION = '基于你刚才的选择，有没有什么想补充的？比如你的素材细节、能力特长、喜欢的文案或句子、或者觉得自己和别人不一样的地方——想到什么说什么，不用组织语言。'

const GAP_QUESTION = '你的内容会更偏"干货分享"还是"故事记录"？这会帮我判断文案风格。'

function safeJoin(arr, sep = '、') {
  return Array.isArray(arr) ? arr.filter((s) => typeof s === 'string' && s.trim()).join(sep) : ''
}

function parseMessages(messages) {
  return (messages || []).filter((m) => m && typeof m === 'object' && typeof m.role === 'string')
}

function getQ2Label(value) {
  const map = {
    photo: '照片',
    work_experience: '工作经历',
    skill: '技能',
    travel: '旅行',
    friends: '朋友群像',
    handwork: '手作',
    dance: '舞蹈',
    singing: '唱歌',
    photography: '摄影',
    portrait_shoot: '约拍',
    entrepreneurship: '摆摊/创业',
    other: '真实经历'
  }
  return map[value] || '真实经历'
}

function formatChatHistory(stage1, messages) {
  const purposeMap = {
    record_life: '记录生活',
    personal_brand: '建立个人品牌',
    get_clients: '获得客户',
    portfolio: '求职作品集',
    find_peers: '寻找同频'
  }

  const lines = []
  lines.push('## Stage 1 诊断答案')
  lines.push(`- 出发方向（Q1）：${purposeMap[stage1.q1] || stage1.q1}`)
  lines.push(`- 素材资产（Q2）：${safeJoin((stage1.q2 || []).map(getQ2Label))}`)
  lines.push(`- 目标用户（Q3）：${stage1.q3 || ''}`)
  if (stage1.q1_custom) lines.push(`- 目的补充：${stage1.q1_custom}`)

  const history = parseMessages(messages)
  if (history.length > 0) {
    lines.push('')
    lines.push('## Stage 2 对话记录')
    for (const m of history) {
      const label = m.role === 'assistant' ? 'AI' : '用户'
      lines.push(`${label}：${m.content}`)
    }
  }
  return lines.join('\n')
}

function buildChatPrompt(stage1, messages, platform = '小红书/抖音') {
  const historyText = formatChatHistory(stage1, messages)
  const parsed = parseMessages(messages)
  const assistantTurns = parsed.filter((m) => m.role === 'assistant').map((m) => m.content)
  const userTurns = parsed.filter((m) => m.role === 'user').map((m) => m.content)
  const hasAskedFreeform = assistantTurns.some((c) => c.includes(FREEFORM_QUESTION) || c.includes('想补充'))
  const hasAskedGap = assistantTurns.some((c) => c.includes(GAP_QUESTION) || c.includes('干货') || c.includes('故事'))
  const userHasResponded = userTurns.length > 0

  return `[角色]
你是 IP 诊断顾问。你的核心能力是从用户提供的一切信息中，推断、合成、创造一份完整的个人 IP 方案。
你不需要采访用户——你只需要拿着用户给你的原料，直接做菜。

[输入信息]
${historyText}

[工作流程]
Step 1 — 信息盘点（内部，不输出）
- 已明确：列出用户直接提供的信息
- 可推断：列出可以从已有信息推断的
  · 从用户喜欢的文案 → 推断文风、价值观、情绪基调
  · 从用户列出的素材 → 分组归类为内容主线
  · 从用户自述的经历 → 提取人设关键词
- 真正缺失的：最多 2 项（不会影响方案主体）

Step 2 — 直接合成完整方案
基于已有信息生成全部内容，能推断的全部推断，不留空。

Step 3 — 缺口提问（仅 1-2 个问题）
只有当缺失信息影响方案质量时才提问。
问题必须一次性能回答，不问"能具体说说吗"。
用户回答简短 → 直接接受，不追问。

Step 4 — 输出最终方案

[提问规则]
- 最多 2 个问题
- 不连续追问同一方向
- 用户回答简短 → 直接接受，纳入方案
- 用户说"没有了" → 跳过，直接生成方案
- 用户主动提供细节 → 直接纳入，不追问

[禁止行为]
- 不问"能具体说说吗""举个例子""还有吗"
- 不让用户自己设计内容策略、选题、运营方案
- 不评价用户的回答是否充分
- 不追问"你打算怎么通过内容传递价值"
- 不追问"你打算具体分享哪些主题"

[阶段判断逻辑]
当前状态：
- 已问自由补充问题：${hasAskedFreeform}
- 已问缺口问题：${hasAskedGap}
- 用户已回答次数：${userTurns.length}

判断规则：
1. 如果还没问过自由补充问题 → 问自由补充问题
2. 如果已问过自由补充问题且用户已回答，且还没问过缺口问题 → 判断是否需要问缺口问题
   - 如果用户已经提供了足够的素材/文案/经历信息 → 直接结束，生成方案
   - 如果用户回答很简短或缺乏风格参考 → 问缺口问题
3. 如果用户说"没有了/没有/不知道" → 直接结束
4. 如果已问过缺口问题且用户已回答 → 结束
5. 如果用户已主动提供了大量信息（素材细节+文案+经历） → 可以直接结束

平台默认：${platform}。

## 输出格式（严格 JSON，不要 markdown 代码块）
{
  "done": false,
  "question": "下一个要问的问题",
  "hint": "给用户的一点提示，帮助她展开回答"
}

结束时的格式：
{
  "done": true,
  "question": "我来帮你整理一份完整的 IP 方案",
  "hint": ""
}`
}

function buildIpPlanPrompt(stage1, messages, platform = '小红书/抖音') {
  const historyText = formatChatHistory(stage1, messages)

  return `[角色]
你是 IP 诊断顾问。你的核心能力是从用户提供的一切信息中，推断、合成、创造一份完整的个人 IP 方案。
你不需要采访用户——你只需要拿着用户给你的原料，直接做菜。

[输入信息]
${historyText}

[工作流程]

Step 1 — 信息盘点（内部，不输出）
- 已明确：列出用户直接提供的信息
- 可推断：列出可以从已有信息推断的
  · 从用户喜欢的文案 → 推断文风、价值观、情绪基调
  · 从用户列出的素材 → 分组归类为内容主线
  · 从用户自述的经历 → 提取人设关键词
- 真正缺失的：最多 2 项（不会影响方案主体）

Step 2 — 直接合成完整方案
基于已有信息，生成以下全部内容。能推断的全部推断，不留空。

[输出结构]

─── 展示层：账号名片 8 字段 ───
1. 专属标签
   从用户喜欢的文案中提取核心意象词（如"长青""苔花""鼎沸"），
   创造有诗性但不张扬的标签。每条视频必带。

2. 一句话定位
   融合出发点 + 差异化 + 目标用户，一句话说清账号是什么。

3. 人设关键词
   从文案风格、自述经历中提取 5-8 个词。
   用户说不清自己 → 从她喜欢的文案反推。

4. 账号价值
   基于素材和能力推断用户能持续提供什么。

5. 简介设计
   昵称建议（结合文案意象和个人特质创造）+
   简介文案（融合人设关键词 + 账号价值 + 目标用户痛点）

6. 置顶三条内容
   三条内容方向描述。

7. 置顶哪三条
   具体推荐，标注每条对应内容主线。

8. 核心观众及痛点
   将 Q3 目标用户细分为 2-3 类，每类标注画像、现状、痛点。

─── 存储层 ───
9. 视觉风格（主色调、封面风格、视觉调性）
10. 文案风格（以用户提供的文案为锚点，提取句式特征、情绪基调）
11. 内容矩阵（2-4 条主线，每条标注优先级/占比/方向/标签/视频形式/关键词）
12. 推荐选题池（每条主线 3-5 个选题，标注对应主线和标题建议）

[推断规则]

■ 专属标签的创造方法
  从用户文案中提取一个核心意象 → 转化为标签
  要求：有诗性但不张扬，有记忆点，用户可自发传播
  示例：用户文案含"长青"→ #她要长青
        用户文案含"苔花"→ #苔花也有春天
        用户文案含"鼎沸"→ #祝她鼎沸
  如果用户没有提供文案 → 从素材和出发方向创造意象

■ 内容矩阵的分组方法
  将用户列出的素材按"情感内核"分组成 2-4 条主线：
  - 照片/审美类 → 审美与自我养成
  - 工作/摆摊/职业经历 → 小城女孩作品集
  - 朋友/群像/日常 → 生命力群像
  - 文案/长文/观点 → 温柔坚韧成长
  - 体验/尝试/新鲜事物 → 我替女孩试一次
  每条主线推断：视频形式、语气关键词、占比

■ 文案风格的提取方法
  以用户提供的文案为锚点：
  - 提取句式特征（如"我祝你...也祝你..."、"不必...祝她..."）
  - 提取情绪基调（温柔克制/清醒坚定/诗性留白）
  - 生成"适合句式"和"不适合句式"
  如果用户没有提供文案 → 根据出发方向和素材推断风格

■ 用户记忆点的创造方法
  从整体气质中提炼一句话，让用户记住"她是谁"。
  不是总结功能，是创造意象。
  示例："她不是在喊口号，她是在把自己养成一棵树。"

■ Q1 出发方向的推断影响
  记录生活 → 生活切片为主，差异化经历穿插；vlog 为主，照片图文为辅
  建立个人品牌 → 专业输出为主，个人故事增强信任；口播为主，案例展示为辅
  获得客户 → 客户案例为主，方法论输出建立专业度；口播+案例混剪
  求职作品集 → 作品展示为主，创作过程增强立体感；作品集+幕后花絮
  寻找同频 → 情感共鸣为主，共同经历引发认同；口播+vlog 混合

[禁止行为]
- 不让用户自己设计内容策略、选题、运营方案
- 不留空字段，所有字段必须填充（用推断补全）
- 不使用模板化语言，每个方案必须独一无二

平台默认：${platform}。

## 输出结构（严格 JSON，不要 markdown 代码块）
{
  "userProfile": {
    "core": { "ageRange": "", "portrait": "", "painPoints": [""], "needs": [""], "contentDirection": "" },
    "diffusion": { "ageRange": "", "portrait": "", "painPoints": [""], "needs": [""], "contentDirection": "" },
    "potential": { "ageRange": "", "portrait": "", "painPoints": [""], "needs": [""], "contentDirection": "" }
  },
  "positioning": {
    "tag": "",
    "oneLine": "",
    "personaKeywords": [""],
    "values": [""],
    "profileDesign": "",
    "topPosts": [
      { "title": "", "direction": "" }
    ],
    "topPostSelection": "",
    "audience": {
      "categories": [""],
      "painPoints": [""],
      "details": [
        { "group": "", "portrait": "", "current": "", "pain": "" }
      ]
    }
  },
  "style": {
    "visual": { "keywords": [""], "suitable": [""], "unsuitable": [""], "advice": "" },
    "copywriting": { "keywords": [""], "suitable": [""], "unsuitable": [""], "example": "" },
    "shooting": [
      { "type": "凝视型", "definition": "", "suitable": "", "example": "" },
      { "type": "运动型", "definition": "", "suitable": "", "example": "" },
      { "type": "第三视角型", "definition": "", "suitable": "", "example": "" }
    ]
  },
  "strategy": {
    "visual": { "tone": "", "cover": "", "vibe": "" },
    "copywriting": { "tone": "", "sentencePatterns": [""], "mood": "", "anchor": "" },
    "contentMatrix": [
      { "name": "", "priority": "", "ratio": "", "direction": "", "tags": [""], "format": "", "keywords": [""] }
    ],
    "topicPool": [
      { "matrix": "", "title": "", "points": [""], "source": "" }
    ]
  },
  "publishingStandards": {
    "coreCriteria": [""],
    "bottomLines": [""],
    "checklist": [""]
  },
  "summary": ""
}

## 质量要求
- positioning 中 8 个字段必须完整。
- positioning.tag 要有诗性、有记忆点、可传播。从用户文案意象中创造。
- positioning.topPosts 必须 3 条。
- positioning.audience 必须包含 categories 和 painPoints，details 可选。
- strategy.contentMatrix 必须体现按"情感内核"分组的方法。
- strategy.topicPool 每条主线 3-5 个选题，必须对应一条主线。
- strategy.copywriting.anchor 必须以用户提供的文案为锚点。
- summary 在 200-300 字之间，必须包含用户记忆点意象。`
}

export function normalizeIpPlan(raw) {
  if (!raw || typeof raw !== 'object') return null

  const profileLayer = (layer) => ({
    ageRange: String(layer?.ageRange || '').trim() || '25-35 岁',
    portrait: String(layer?.portrait || '').trim() || '关注个人成长的女性用户',
    painPoints: Array.isArray(layer?.painPoints) ? layer.painPoints.filter((s) => typeof s === 'string').slice(0, 5) : ['缺乏清晰方向'],
    needs: Array.isArray(layer?.needs) ? layer.needs.filter((s) => typeof s === 'string').slice(0, 5) : ['获得可执行的方法'],
    contentDirection: String(layer?.contentDirection || '').trim() || '真实经验 + 方法论'
  })

  const userProfile = {
    core: profileLayer(raw.userProfile?.core),
    diffusion: profileLayer(raw.userProfile?.diffusion),
    potential: profileLayer(raw.userProfile?.potential)
  }

  const personaKeywords = Array.isArray(raw.positioning?.personaKeywords)
    ? raw.positioning.personaKeywords.slice(0, 5)
    : Array.isArray(raw.positioning?.persona?.keywords)
      ? raw.positioning.persona.keywords.slice(0, 5)
      : ['真实', '真诚']
  const personaDescription = String(raw.positioning?.persona?.description || '').trim() || '真实可信的内容创作者'
  const values = Array.isArray(raw.positioning?.values) ? raw.positioning.values.filter((s) => typeof s === 'string').slice(0, 5) : ['提供可执行的方法']

  const rawTopPosts = Array.isArray(raw.positioning?.topPosts)
    ? raw.positioning.topPosts.slice(0, 3).map((t) => ({
        title: String(t?.title || '').trim() || '置顶内容',
        direction: String(t?.direction || '').trim() || '说明置顶原因'
      }))
    : []
  while (rawTopPosts.length < 3) {
    rawTopPosts.push({ title: `置顶内容 ${rawTopPosts.length + 1}`, direction: '说明置顶原因' })
  }

  const positioning = {
    tag: String(raw.positioning?.tag || '').trim() || '#真实成长',
    oneLine: String(raw.positioning?.oneLine || '').trim() || '未提供',
    personaKeywords,
    values,
    profileDesign: String(raw.positioning?.profileDesign || '').trim() || '一句话说明账号价值、昵称建议、头像风格',
    topPosts: rawTopPosts,
    topPostSelection: String(raw.positioning?.topPostSelection || '').trim() || '选择最能代表账号价值和差异化的三条内容置顶',
    audience: {
      categories: Array.isArray(raw.positioning?.audience?.categories)
        ? raw.positioning.audience.categories.filter((s) => typeof s === 'string').slice(0, 5)
        : ['核心观众'],
      painPoints: Array.isArray(raw.positioning?.audience?.painPoints)
        ? raw.positioning.audience.painPoints.filter((s) => typeof s === 'string').slice(0, 5)
        : ['缺乏清晰方向']
    },
    // 兼容旧版定位卡字段，供下游 AI 接口直接使用
    oneLinePositioning: String(raw.positioning?.oneLine || '').trim() || '未提供',
    persona: [personaDescription, ...personaKeywords.map((k) => `具有${k}的特质`)].slice(0, 3),
    promises: values.length > 0 ? values : ['提供真实可执行的方法'],
    tags: [String(raw.positioning?.tag || '').trim().replace(/^#/, ''), ...personaKeywords].filter(Boolean).slice(0, 8),
    profileAdvice: {
      avatar: '干净真人头像，能体现个人风格',
      nickname: '简洁 + 领域/特质关键词',
      bio: String(raw.positioning?.oneLine || '').trim() || '一句话说明账号价值',
      cover: '代表内容风格或人设的封面图'
    }
  }

  const style = {
    visual: {
      keywords: Array.isArray(raw.style?.visual?.keywords) ? raw.style.visual.keywords.slice(0, 5) : ['干净'],
      suitable: Array.isArray(raw.style?.visual?.suitable) ? raw.style.visual.suitable.slice(0, 5) : ['自然光'],
      unsuitable: Array.isArray(raw.style?.visual?.unsuitable) ? raw.style.visual.unsuitable.slice(0, 5) : ['过度滤镜'],
      advice: String(raw.style?.visual?.advice || '').trim() || '保持视觉一致性'
    },
    copywriting: {
      keywords: Array.isArray(raw.style?.copywriting?.keywords) ? raw.style.copywriting.keywords.slice(0, 5) : ['真诚'],
      suitable: Array.isArray(raw.style?.copywriting?.suitable) ? raw.style.copywriting.suitable.slice(0, 5) : ['具体场景'],
      unsuitable: Array.isArray(raw.style?.copywriting?.unsuitable) ? raw.style.copywriting.unsuitable.slice(0, 5) : ['说教'],
      example: String(raw.style?.copywriting?.example || '').trim() || '示例句式'
    },
    shooting: ['凝视型', '运动型', '第三视角型'].map((type, idx) => {
      const s = raw.style?.shooting?.[idx] || {}
      return {
        type,
        definition: String(s.definition || '').trim() || `${type}拍摄方式`,
        suitable: String(s.suitable || '').trim() || '适合表达真实感',
        example: String(s.example || '').trim() || '示例'
      }
    })
  }

  const publishingStandards = {
    coreCriteria: Array.isArray(raw.publishingStandards?.coreCriteria) ? raw.publishingStandards.coreCriteria.slice(0, 5) : ['符合定位'],
    bottomLines: Array.isArray(raw.publishingStandards?.bottomLines) ? raw.publishingStandards.bottomLines.slice(0, 5) : ['不夸大'],
    checklist: Array.isArray(raw.publishingStandards?.checklist) ? raw.publishingStandards.checklist.slice(0, 8) : ['检查标签']
  }

  const summary = String(raw.summary || '').trim() || `${positioning.oneLine}，面向${userProfile.core.portrait}，提供${safeJoin(positioning.values, '、')}。`

  const strategy = {
    visual: {
      tone: String(raw.strategy?.visual?.tone || raw.style?.visual?.tone || '').trim() || '干净自然',
      cover: String(raw.strategy?.visual?.cover || raw.style?.visual?.cover || '').trim() || '真人出镜 + 低饱和背景',
      vibe: String(raw.strategy?.visual?.vibe || raw.style?.visual?.vibe || '').trim() || '有呼吸感的真实氛围'
    },
    copywriting: {
      tone: String(raw.strategy?.copywriting?.tone || raw.style?.copywriting?.tone || '').trim() || '真诚克制',
      sentencePatterns: Array.isArray(raw.strategy?.copywriting?.sentencePatterns)
        ? raw.strategy.copywriting.sentencePatterns.filter((s) => typeof s === 'string').slice(0, 6)
        : Array.isArray(raw.style?.copywriting?.suitable)
          ? raw.style.copywriting.suitable.slice(0, 6)
          : ['我有一个发现', '我试过'],
      mood: String(raw.strategy?.copywriting?.mood || raw.style?.copywriting?.mood || '').trim() || '温暖有力量',
      anchor: String(raw.strategy?.copywriting?.anchor || raw.style?.copywriting?.anchor || raw.style?.copywriting?.example || '').trim() || '示例句式'
    },
    contentMatrix: Array.isArray(raw.strategy?.contentMatrix)
      ? raw.strategy.contentMatrix.slice(0, 5).map((m) => ({
          name: String(m?.name || '').trim() || '主线内容',
          priority: String(m?.priority || '').trim() || 'P1',
          ratio: String(m?.ratio || '').trim() || '30%',
          direction: String(m?.direction || '').trim() || '真实经验分享',
          tags: Array.isArray(m?.tags) ? m.tags.filter((s) => typeof s === 'string').slice(0, 5) : ['真实'],
          format: String(m?.format || '').trim() || '口播',
          keywords: Array.isArray(m?.keywords) ? m.keywords.filter((s) => typeof s === 'string').slice(0, 8) : ['成长']
        }))
      : [],
    topicPool: Array.isArray(raw.strategy?.topicPool)
      ? raw.strategy.topicPool.slice(0, 20).map((t) => ({
          matrix: String(t?.matrix || '').trim() || '主线内容',
          title: String(t?.title || '').trim() || '选题标题',
          points: Array.isArray(t?.points) ? t.points.filter((s) => typeof s === 'string').slice(0, 3) : ['内容要点'],
          source: String(t?.source || '').trim() || ''
        }))
      : []
  }

  return {
    userProfile,
    positioning,
    style,
    strategy,
    publishingStandards,
    summary
  }
}

function fallbackChatNextQuestion(stage1, messages) {
  const parsed = parseMessages(messages)
  const assistantTurns = parsed.filter((m) => m.role === 'assistant').map((m) => m.content)
  const userTurns = parsed.filter((m) => m.role === 'user').map((m) => m.content)

  const hasAskedFreeform = assistantTurns.some((c) => c.includes(FREEFORM_QUESTION) || c.includes('想补充'))
  const hasAskedGap = assistantTurns.some((c) => c.includes(GAP_QUESTION) || c.includes('干货') || c.includes('故事'))

  const lastUserContent = userTurns.length > 0 ? userTurns[userTurns.length - 1] : ''
  const isNoAnswer = /没有|没了|不知道|想不出|不清楚|不太|不说|跳过|算了|差不多|就这样/i.test(lastUserContent)

  // 阶段 1：还没问自由补充
  if (!hasAskedFreeform) {
    return {
      done: false,
      question: FREEFORM_QUESTION,
      hint: '素材细节、能力特长、喜欢的文案、独特经历，想到什么说什么。'
    }
  }

  // 阶段 2：已问自由补充，用户回答了
  if (hasAskedFreeform && userTurns.length >= 1 && !hasAskedGap) {
    // 用户说"没有了" → 直接结束
    if (isNoAnswer) {
      return { done: true, question: '我来帮你整理一份完整的 IP 方案', hint: '' }
    }
    // 用户回答内容丰富（超过 30 字）→ 直接结束
    if (lastUserContent.length > 30) {
      return { done: true, question: '我来帮你整理一份完整的 IP 方案', hint: '' }
    }
    // 用户回答简短 → 问一个缺口问题
    return {
      done: false,
      question: GAP_QUESTION,
      hint: '选一个你觉得更舒服的方向就好。'
    }
  }

  // 阶段 3：已问缺口问题，用户回答后结束
  return { done: true, question: '我来帮你整理一份完整的 IP 方案', hint: '' }
}

export async function chatNextQuestion(stage1, messages, options = {}) {
  const { deepseekApiKey, deepseekApiUrl = 'https://api.deepseek.com/chat/completions' } = options

  if (!deepseekApiKey) {
    return fallbackChatNextQuestion(stage1, messages)
  }

  try {
    const prompt = buildChatPrompt(stage1, messages)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)

    const res = await fetch(deepseekApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是 IP 诊断顾问，从用户原料中推断合成完整 IP 方案。最多问 2 个问题，不追问。只输出严格 JSON。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.75,
        max_tokens: 800,
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
    const done = parsed.done === true
    const question = String(parsed.question || '').trim()
    const hint = String(parsed.hint || '').trim()

    if (!done && !question) throw new Error('AI response missing question')

    return { done, question, hint }
  } catch (err) {
    console.error('AI chat next question failed, fallback to rules:', err?.message || err)
    return fallbackChatNextQuestion(stage1, messages)
  }
}

function fallbackIpPlan(stage1) {
  const assets = Array.isArray(stage1.q2) ? stage1.q2 : [stage1.q2]
  const asset = getQ2Label(assets[0] || '真实经历')
  const purpose = stage1.q1 || 'record_life'

  const q1FormatMap = {
    record_life: 'vlog 为主，照片图文为辅',
    personal_brand: '口播为主，案例展示为辅',
    get_clients: '口播+案例混剪',
    portfolio: '作品集+幕后花絮',
    find_peers: '口播+vlog 混合'
  }

  return {
    userProfile: {
      core: { ageRange: '25-35 岁', portrait: '在职业/生活中寻求成长的女性', painPoints: ['缺乏方向', '容易自我怀疑'], needs: ['真实经验', '可执行方法'], contentDirection: '真实成长 + 方法论' },
      diffusion: { ageRange: '22-40 岁', portrait: '对个人成长、生活方式感兴趣的泛女性用户', painPoints: ['信息过载', '难以坚持'], needs: ['情绪共鸣', '简单路径'], contentDirection: '轻量启发 + 陪伴感' },
      potential: { ageRange: '18-45 岁', portrait: '偶尔刷到内容并被吸引的潜在用户', painPoints: ['时间碎片化', '内容审美疲劳'], needs: ['快速获得价值感'], contentDirection: '高信息密度 + 强开头' }
    },
    positioning: {
      tag: '#真实成长',
      oneLine: `用${asset}帮助女性找到属于自己的成长路径`,
      personaKeywords: ['真实', '真诚', '长期主义', '克制', '温暖'],
      values: ['真实可执行的方法', '情绪陪伴与共鸣', '长期主义的坚持样本'],
      profileDesign: '昵称建议：2-3 个简洁+领域/特质关键词；头像用干净真人照；简介一句话说明账号价值，融合人设关键词、账号价值和目标用户痛点。',
      topPosts: [
        { title: `我的${asset}起点`, direction: '让用户第一眼了解我是谁、能提供什么价值' },
        { title: `一个关于${asset}的真实选择`, direction: '展示差异化经历和价值观' },
        { title: `${asset}带给我的 3 个改变`, direction: '用具体结果建立信任' }
      ],
      topPostSelection: '置顶三条分别说明“我是谁”“我为什么可信”“我能带来什么价值”，形成主页闭环',
      audience: {
        categories: ['25-35 岁寻求成长的职场女性', '对个人成长感兴趣的泛女性用户'],
        painPoints: ['不知道自己擅长什么', '想输出内容但缺乏方向', '害怕暴露真实生活'],
        details: [
          { group: '25-35 岁职场女性', portrait: '一二线城市、有自我成长意识', current: '工作/生活中感到停滞，想要突破', pain: '不知道从哪里开始，缺少真实样本' },
          { group: '对个人成长感兴趣的泛女性用户', portrait: '18-40 岁、关注生活方式', current: '被碎片化信息包围', pain: '想要有陪伴感的内容，而非说教' }
        ]
      }
    },
    style: {
      visual: { keywords: ['干净', '自然', '有呼吸感'], suitable: ['自然光', '生活化场景', '真人出镜'], unsuitable: ['过度美颜', '嘈杂背景', '花字堆砌'], advice: '服装选择低饱和纯色，出镜保持眼神稳定，字幕简洁' },
      copywriting: { keywords: ['真诚', '具体', '克制'], suitable: ['我有一个发现', '我试过', '你可以试试'], unsuitable: ['你必须', '所有人', '绝对'], example: '我不是专家，只是把走过的路讲给你听' },
      shooting: [
        { type: '凝视型', definition: '固定机位，面向镜头直接讲述', suitable: '观点输出、经验分享', example: '口播讲述一个成长认知' },
        { type: '运动型', definition: '边做动作边讲述或记录过程', suitable: '生活实验、教程类', example: '边整理房间边聊断舍离' },
        { type: '第三视角型', definition: '像纪录片一样记录自己', suitable: 'Vlog、情绪氛围', example: '记录一次独处下午茶' }
      ]
    },
    strategy: {
      visual: { tone: '干净自然', cover: '真人出镜 + 低饱和背景', vibe: '有呼吸感的真实氛围' },
      copywriting: { tone: '真诚克制', sentencePatterns: ['我有一个发现', '我试过', '你可以试试'], mood: '温暖有力量', anchor: '我不是专家，只是把走过的路讲给你听' },
      contentMatrix: [
        { name: `${asset}真实记录`, priority: 'P0', ratio: '40%', direction: `用真实场景展示${asset}中的细节和感受`, tags: ['真实', '生活感', '陪伴'], format: q1FormatMap[purpose] || '口播+vlog 混合', keywords: ['真实经历', '生活记录', '成长'] },
        { name: '差异化方法分享', priority: 'P1', ratio: '35%', direction: '把个人做法提炼成轻量方法，供观众参考', tags: ['方法论', '可执行', '真诚'], format: '口播', keywords: ['方法', '经验', '步骤'] },
        { name: '情绪共鸣内容', priority: 'P2', ratio: '25%', direction: '表达过程中的困惑、选择和心路历程', tags: ['情绪', '共鸣', '成长'], format: '口播', keywords: ['心路', '共鸣', '陪伴'] }
      ],
      topicPool: [
        { matrix: `${asset}真实记录`, title: `我的${asset}起点`, points: ['讲清楚最初的契机', '展示真实状态', '引出后续变化'], source: '' },
        { matrix: '差异化方法分享', title: '我是怎么做到不焦虑的', points: ['分享一个具体做法', '给出可执行步骤', '强调长期主义'], source: '' },
        { matrix: '情绪共鸣内容', title: '如果你也觉得自己不够特别', points: ['用自身经历回应', '提供情绪认同', '给出轻量行动建议'], source: '' }
      ]
    },
    publishingStandards: {
      coreCriteria: ['与定位标签一致', '提供真实价值', '开头 3 秒有钩子'],
      bottomLines: ['不制造焦虑', '不夸大结果', '不攻击他人'],
      checklist: ['标题是否符合定位', '文案是否有具体场景', '封面是否信息清晰', '标签是否相关']
    },
    summary: `面向 25-35 岁关注个人成长的女性，用${asset}帮助她们找到真实、可执行的成长路径。内容以真实经验 + 方法论为主线，强调长期主义和陪伴感。`
  }
}

export function validateIpPlan(plan) {
  const errors = []
  if (!plan || typeof plan !== 'object') {
    errors.push('IP 方案数据不能为空')
    return errors
  }
  if (!plan.positioning?.oneLine || String(plan.positioning.oneLine).trim().length < 5) {
    errors.push('一句话定位需至少 5 个字')
  }
  if (!plan.positioning?.tag || String(plan.positioning.tag).trim().length === 0) {
    errors.push('专属标签不能为空')
  }
  if (!Array.isArray(plan.positioning?.values) || plan.positioning.values.length === 0) {
    errors.push('账号提供的价值至少 1 条')
  }
  if (!Array.isArray(plan.positioning?.personaKeywords) || plan.positioning.personaKeywords.length === 0) {
    errors.push('人设关键词至少 1 个')
  }
  if (!Array.isArray(plan.positioning?.topPosts) || plan.positioning.topPosts.length < 3) {
    errors.push('置顶三条内容必须完整')
  }
  if (!plan.positioning?.profileDesign || String(plan.positioning.profileDesign).trim().length === 0) {
    errors.push('简介设计方法不能为空')
  }
  if (!Array.isArray(plan.positioning?.audience?.categories) || plan.positioning.audience.categories.length === 0) {
    errors.push('核心观众类别至少 1 个')
  }
  if (!Array.isArray(plan.positioning?.audience?.painPoints) || plan.positioning.audience.painPoints.length === 0) {
    errors.push('观众痛点至少 1 条')
  }
  if (!plan.summary || String(plan.summary).trim().length < 20) {
    errors.push('IP 方案摘要至少 20 字')
  }
  const matrix = Array.isArray(plan.contentMatrix?.mainLines)
    ? plan.contentMatrix.mainLines
    : Array.isArray(plan.strategy?.contentMatrix)
      ? plan.strategy.contentMatrix
      : []
  if (matrix.length === 0) {
    errors.push('内容矩阵至少 1 条主线')
  }
  return errors
}

function extractPositioningCardFromIpPlan(ipPlan) {
  if (!ipPlan || !ipPlan.positioning) return null
  const p = ipPlan.positioning
  const personaDesc = p.personaDetail?.description || (Array.isArray(p.persona) ? p.persona[0] : '') || '真实真诚的内容创作者'
  const personaKeywords = Array.isArray(p.personaKeywords)
    ? p.personaKeywords
    : (Array.isArray(p.personaDetail?.keywords) ? p.personaDetail.keywords : [])
  const values = Array.isArray(p.values) && p.values.length > 0 ? p.values : ['提供真实可执行的方法']
  const tag = String(p.tag || '').replace(/^#/, '').trim() || '真实成长'

  const persona = [
    personaDesc,
    ...personaKeywords.slice(0, 2).map((k) => `具有${k}的特质`)
  ].filter((s) => String(s).trim().length >= 10).slice(0, 3)

  if (persona.length === 0) {
    persona.push(personaDesc.length >= 10 ? personaDesc : '真实真诚的内容创作者')
  }

  const promises = values.slice(0, 3).map((v) => String(v).trim()).filter((s) => s.length >= 5)
  if (promises.length === 0) promises.push('提供真实可执行的方法')

  const tags = [tag, ...personaKeywords].filter(Boolean).slice(0, 8)
  while (tags.length < 5) {
    tags.push(...['真实', '成长', '长期主义', '女性', 'IP'].filter((t) => !tags.includes(t)))
  }

  return {
    oneLinePositioning: String(p.oneLine || p.oneLinePositioning || '').trim() || '未提供',
    persona,
    promises,
    tags: tags.slice(0, 8),
    profileAdvice: p.profileAdvice || {
      avatar: '干净真人头像，能体现个人风格',
      nickname: '简洁 + 领域/特质关键词',
      bio: String(p.oneLine || p.oneLinePositioning || '').trim() || '一句话说明账号价值',
      cover: '代表内容风格或人设的封面图'
    }
  }
}

export { extractPositioningCardFromIpPlan }

export async function generateIpPlan(stage1, messages, options = {}) {
  const { deepseekApiKey, deepseekApiUrl = 'https://api.deepseek.com/chat/completions' } = options

  if (!deepseekApiKey) {
    return { ipPlan: fallbackIpPlan(stage1), source: 'fallback' }
  }

  try {
    const prompt = buildIpPlanPrompt(stage1, messages)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)

    const res = await fetch(deepseekApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${deepseekApiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是 IP 诊断顾问，从用户原料中推断合成完整 IP 方案，能推断的全部推断不留空。只输出严格 JSON。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.75,
        max_tokens: 6000,
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
    const ipPlan = normalizeIpPlan(parsed)
    if (!ipPlan) throw new Error('AI response structure invalid')

    return { ipPlan, source: 'ai' }
  } catch (err) {
    console.error('AI IP plan generation failed, fallback to rules:', err?.message || err)
    if (err?.response) {
      try {
        const text = await err.response.text()
        console.error('DeepSeek error response:', text)
      } catch {}
    }
    return { ipPlan: fallbackIpPlan(stage1), source: 'fallback' }
  }
}
