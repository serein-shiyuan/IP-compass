import { ApiError, fetchWithTimeout, parseEnvelope } from './client.js'

export async function generatePositioningCard(userId, stage1, stage2) {
  const res = await fetchWithTimeout('/api/positioning/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, stage1, stage2 })
  })
  const data = await parseEnvelope(res)
  if (!data.positioningCard || typeof data.positioningCard !== 'object') {
    throw new ApiError('服务器返回的定位卡数据非法', 'INVALID_CARD')
  }
  return { card: data.positioningCard, source: data.source || 'fallback' }
}

export async function confirmPositioning(userId, ipPlan) {
  const res = await fetchWithTimeout('/api/positioning/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ipPlan })
  })
  return parseEnvelope(res)
}

export async function getPositioningCard(userId) {
  const res = await fetchWithTimeout(`/api/positioning/card?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}

export async function updatePositioningCard(userId, ipPlan) {
  const res = await fetchWithTimeout('/api/positioning/card', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ipPlan })
  })
  return parseEnvelope(res)
}
