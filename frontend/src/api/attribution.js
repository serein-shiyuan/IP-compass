import { fetchWithTimeout, parseEnvelope } from './client.js'

export async function analyzeAttribution({ userId, videos, positioningCard, dashboard, ipPlan }) {
  const res = await fetchWithTimeout('/api/attribution/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, videos, positioningCard, dashboard, ipPlan })
  })
  return parseEnvelope(res)
}

export async function getAttribution(userId) {
  const res = await fetchWithTimeout(`/api/attribution?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}
