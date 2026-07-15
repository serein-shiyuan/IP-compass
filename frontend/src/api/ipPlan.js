import { ApiError, fetchWithTimeout, parseEnvelope } from './client.js'

export async function chatIpPlan(userId, stage1, messages) {
  const res = await fetchWithTimeout('/api/ai/ip-plan/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, stage1, messages })
  }, 35000)
  const data = await parseEnvelope(res)
  if (typeof data.done !== 'boolean' || typeof data.question !== 'string') {
    throw new ApiError('服务器返回的对话数据非法', 'INVALID_CHAT_RESPONSE')
  }
  return data
}

export async function generateIpPlan(userId, stage1, messages) {
  const res = await fetchWithTimeout('/api/ai/ip-plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, stage1, messages })
  }, 60000)
  const data = await parseEnvelope(res)
  if (!data.ipPlan || typeof data.ipPlan !== 'object') {
    throw new ApiError('服务器返回的 IP 方案非法', 'INVALID_IP_PLAN')
  }
  return data
}

export async function getIpPlan(userId) {
  const res = await fetchWithTimeout(`/api/ai/ip-plan?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}
