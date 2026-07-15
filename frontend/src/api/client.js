const DEFAULT_TIMEOUT = 8000

export class ApiError extends Error {
  constructor(message, code, status) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

export async function fetchWithTimeout(url, options = {}, timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ApiError('网络超时，请重试', 'NETWORK_TIMEOUT', 0)
    }
    throw new ApiError(err.message || '网络请求失败', 'NETWORK_ERROR', 0)
  } finally {
    clearTimeout(timer)
  }
}

export async function parseEnvelope(res) {
  let json
  try {
    json = await res.json()
  } catch {
    throw new ApiError('服务器返回格式异常', 'PARSE_ERROR', res.status)
  }

  if (!res.ok || json.ok === false) {
    const code = json.error?.code || 'UNKNOWN_ERROR'
    const message = json.error?.message || '请求失败'
    throw new ApiError(message, code, res.status)
  }

  return json.data
}

export async function createAnonymousUser() {
  const res = await fetchWithTimeout('/api/auth/anonymous', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })
  const data = await parseEnvelope(res)
  if (typeof data.userId !== 'string') {
    throw new ApiError('服务器返回非法用户标识', 'INVALID_RESPONSE')
  }
  return data
}

export async function validateUser(userId) {
  const res = await fetchWithTimeout(`/api/auth/me?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}

export async function healthCheck() {
  const res = await fetchWithTimeout('/api/health', { method: 'GET' }, 5000)
  return parseEnvelope(res)
}
