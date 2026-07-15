// Stage 1 配置
export const STAGE1_CONFIG = [
  {
    step: 1,
    question: '你为什么想做这个账号？',
    key: 'q1',
    type: 'single',
    options: [
      { value: 'record_life', label: '记录生活' },
      { value: 'personal_brand', label: '建立个人品牌' },
      { value: 'get_clients', label: '获得客户' },
      { value: 'find_peers', label: '寻找同类' }
    ],
    allowCustom: true,
    customPlaceholder: '补充说明（选填）'
  },
  {
    step: 2,
    question: '你现在有哪些素材资产？',
    key: 'q2',
    type: 'multi',
    options: [
      { value: 'career', label: '职业经历' },
      { value: 'knowledge', label: '知识技能' },
      { value: 'aesthetic', label: '审美表达' },
      { value: 'editing', label: '摄影剪辑' },
      { value: 'writing', label: '文案写作' },
      { value: 'relationship', label: '人际关系' },
      { value: 'failure', label: '失败经历' },
      { value: 'insight', label: '观察洞察' },
      { value: 'expression', label: '表达能力' },
      { value: 'unique', label: '独特经历' },
      { value: 'resource', label: '资源渠道' },
      { value: 'other', label: '其他' }
    ],
    max: 20,
    customPlaceholder: '+ 添加自定义标签'
  },
  {
    step: 3,
    question: '你最想连接哪类用户？',
    key: 'q3',
    type: 'single',
    options: [
      { value: 'hobby_community', label: '同好社区' },
      { value: 'target_customers', label: '目标客户' },
      { value: 'career_network', label: '职场人脉' },
      { value: 'general_interest', label: '泛兴趣用户' }
    ]
  }
]

// Stage 2 AI 追问问题（按用户答案动态生成占位，MVP 用固定 4 题模板）
export function buildStage2Questions(stage1) {
  const assetsText = Array.isArray(stage1.q2) ? stage1.q2.join('、') : stage1.q2
  return [
    {
      id: 's2_1',
      question: `你提到你有「${assetsText}」，其中哪一项是你最愿意持续分享的？为什么？`,
      placeholder: '输入你的回答...'
    },
    {
      id: 's2_2',
      question: '如果只能用一个词形容你想给用户留下的印象，这个词会是什么？',
      placeholder: '输入你的回答...'
    },
    {
      id: 's2_3',
      question: '你过去被朋友/同事最常求助的问题是什么？',
      placeholder: '输入你的回答...'
    },
    {
      id: 's2_4',
      question: '如果一年后你的账号只能被记住一句话，你希望那句话是什么？',
      placeholder: '输入你的回答...'
    }
  ]
}

// Stage 2 开场白：基于 Stage1 答案做个性化总结
export function buildStage2Opening(stage1) {
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

  return `你好，我是你的 IP 诊断顾问。我已经了解了你的一些信息——你想通过内容${purpose}，连接${audience}，拥有${assets}等素材。接下来我想深入问几个问题，帮你把方案打磨得更精准。`
}

// 本地纠偏规则
export function checkBias(stage1, stage2Answers) {
  const warnings = []

  // Stage 1 纠偏：涨粉导向
  if (typeof stage1.q1 === 'string' && /涨粉|粉丝|流量/.test(stage1.q1)) {
    warnings.push('涨粉是结果，不是起点。我们先聊聊你的独特价值是什么？')
  }

  // Stage 1 纠偏：模仿/跟风
  if (typeof stage1.q2 === 'string' && /模仿|跟风|爆款/.test(stage1.q2)) {
    warnings.push('模仿是学习的开始，但真实的 IP 来自你的独特经历。你觉得自己和别人最大的不同是？')
  }

  // Stage 2 纠偏：回答过短
  const lastAnswer = stage2Answers.length > 0 ? stage2Answers[stage2Answers.length - 1].answer : ''
  if (lastAnswer && lastAnswer.length < 10) {
    warnings.push('可以再具体一点吗？比如一个真实的小场景或例子。')
  }

  return warnings
}
