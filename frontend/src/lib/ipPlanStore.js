const STAGE1_KEY = 'ipcompass_ip_plan_stage1'
const STAGE1_SESSION_KEY = 'ipcompass_ip_plan_stage1_session'
const MESSAGES_SESSION_KEY = 'ipcompass_ip_plan_stage2_messages'
const SUMMARY_KEY = 'ip_plan_summary'
const COMPLETED_KEY = 'ipcompass_ip_plan_completed'
const IP_PLAN_KEY = 'ipcompass_ip_plan'
const LEGACY_CARD_KEY = 'ipcompass_positioning_card'

export function loadStage1() {
  try {
    // 优先 sessionStorage，回退 localStorage
    const sessionRaw = sessionStorage.getItem(STAGE1_SESSION_KEY)
    if (sessionRaw) return JSON.parse(sessionRaw)
    const raw = localStorage.getItem(STAGE1_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveStage1(stage1) {
  try {
    const data = JSON.stringify(stage1)
    sessionStorage.setItem(STAGE1_SESSION_KEY, data)
    localStorage.setItem(STAGE1_KEY, data)
  } catch {
    // 忽略存储失败
  }
}

export function loadStage2Messages() {
  try {
    const raw = sessionStorage.getItem(MESSAGES_SESSION_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveStage2Messages(messages) {
  try {
    sessionStorage.setItem(MESSAGES_SESSION_KEY, JSON.stringify(messages))
  } catch {
    // 忽略存储失败
  }
}

export function saveIpPlanSummary(summary) {
  try {
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary))
  } catch {
    // 忽略存储失败
  }
}

export function loadIpPlanSummary() {
  try {
    const raw = localStorage.getItem(SUMMARY_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setIpPlanCompleted(completed = true) {
  try {
    localStorage.setItem(COMPLETED_KEY, completed ? 'true' : 'false')
  } catch {
    // 忽略
  }
}

export function isIpPlanCompleted() {
  try {
    return localStorage.getItem(COMPLETED_KEY) === 'true'
  } catch {
    return false
  }
}

export function clearIpPlanProgress() {
  try {
    sessionStorage.removeItem(STAGE1_SESSION_KEY)
    sessionStorage.removeItem(MESSAGES_SESSION_KEY)
    localStorage.removeItem(STAGE1_KEY)
  } catch {
    // 忽略
  }
}

export function clearIpPlanData() {
  try {
    clearIpPlanProgress()
    localStorage.removeItem(SUMMARY_KEY)
    localStorage.removeItem(COMPLETED_KEY)
    localStorage.removeItem(IP_PLAN_KEY)
    localStorage.removeItem('ipcompass_ip_plan_source')
  } catch {
    // 忽略
  }
}

export function getIpPlan() {
  try {
    const raw = localStorage.getItem(IP_PLAN_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.positioning) return parsed
    }
    const legacy = localStorage.getItem(LEGACY_CARD_KEY)
    if (legacy) {
      const card = JSON.parse(legacy)
      return { positioning: card, summary: card.oneLinePositioning || '' }
    }
    return null
  } catch {
    return null
  }
}

export function getPositioningCardFromIpPlan(ipPlan) {
  if (!ipPlan) return null
  if (ipPlan.positioning) {
    const p = ipPlan.positioning
    return {
      oneLinePositioning: p.oneLine || p.oneLinePositioning || '',
      persona: Array.isArray(p.persona) && p.persona.length > 0
        ? p.persona
        : [p.personaDetail?.description || ''],
      promises: Array.isArray(p.values) && p.values.length > 0 ? p.values : p.promises || [],
      tags: p.tags || (p.tag ? [p.tag.replace(/^#/, '')] : []),
      profileAdvice: p.profileAdvice,
      ...p
    }
  }
  return ipPlan
}
