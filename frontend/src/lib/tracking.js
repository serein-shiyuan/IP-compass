// 基础数据埋点（23 个事件）
// MVP 阶段仅本地存储，不上报第三方；服务端接入后可扩展为批量上报。

const TRACKING_KEY = 'ipcompass_tracking_events'
const SESSION_KEY = 'ipcompass_tracking_session'
const MAX_QUEUE = 1000

export const TrackingEvents = {
  APP_OPEN: 'app_open',
  REGISTER_SUCCESS: 'register_success',
  POSITIONING_START: 'positioning_start',
  POSITIONING_STAGE1_COMPLETE: 'positioning_stage1_complete',
  POSITIONING_STAGE2_COMPLETE: 'positioning_stage2_complete',
  POSITIONING_CARD_GENERATED: 'positioning_card_generated',
  POSITIONING_CARD_CONFIRMED: 'positioning_card_confirmed',
  POSITIONING_CARD_REJECTED: 'positioning_card_rejected',
  CONTENT_STRATEGY_VIEWED: 'content_strategy_viewed',
  COLUMN_GENERATED: 'column_generated',
  TOPIC_GENERATED: 'topic_generated',
  TOPIC_STATUS_CHANGED: 'topic_status_changed',
  DIAGNOSIS_SUBMITTED: 'diagnosis_submitted',
  DIAGNOSIS_COMPLETED: 'diagnosis_completed',
  DIAGNOSIS_SAVED: 'diagnosis_saved',
  DIAGNOSIS_REDONE: 'diagnosis_redone',
  DATA_INPUT_SUBMITTED: 'data_input_submitted',
  REVIEW_COMPLETED: 'review_completed',
  OPTIMIZATION_GENERATED: 'optimization_generated',
  SUGGESTION_ADDED_TO_POOL: 'suggestion_added_to_pool',
  CORE_LOOP_COMPLETED: 'core_loop_completed',
  AI_ERROR: 'ai_error',
  PAGE_VIEW: 'page_view'
}

function getSessionId() {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY)
    if (!sid) {
      sid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      sessionStorage.setItem(SESSION_KEY, sid)
    }
    return sid
  } catch {
    return 'session-unknown'
  }
}

function getDeviceType() {
  const ua = navigator.userAgent
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return 'mobile'
  return 'desktop'
}

function readQueue() {
  try {
    const raw = localStorage.getItem(TRACKING_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(TRACKING_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)))
  } catch {
    // 存储失败时静默丢弃，不阻断业务
  }
}

export function track(event, params = {}) {
  try {
    const payload = {
      event,
      params: { ...params },
      timestamp: Date.now(),
      session_id: getSessionId(),
      device_type: getDeviceType(),
      url: window.location.href,
      page_id: window.location.pathname
    }

    const queue = readQueue()
    queue.push(payload)
    writeQueue(queue)

    // 开发环境打印，便于调试
    if (import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.log('[TRACK]', event, payload.params)
    }
  } catch {
    // 埋点失败绝不阻断业务
  }
}

export function trackPageView(pageId, sourcePage) {
  track(TrackingEvents.PAGE_VIEW, {
    page_id: pageId || window.location.pathname,
    source_page: sourcePage || document.referrer
  })
}

export function trackAiError(functionId, errorType, retryCount = 0, apiProvider = 'deepseek') {
  track(TrackingEvents.AI_ERROR, {
    api_provider: apiProvider,
    error_type: errorType || 'unknown',
    function_id: functionId,
    retry_count: retryCount
  })
}

export function getTrackingQueue() {
  return readQueue()
}

export function clearTrackingQueue() {
  try {
    localStorage.removeItem(TRACKING_KEY)
  } catch {
    // ignore
  }
}

export function flushTrackingQueue() {
  // MVP 阶段无服务端埋点接口，仅返回当前队列供外部使用或调试
  return readQueue()
}
