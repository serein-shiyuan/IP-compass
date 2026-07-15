import { fetchWithTimeout, parseEnvelope } from './client.js'

export async function generateDashboard(userId) {
  const res = await fetchWithTimeout('/api/dashboard/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId })
  })
  return parseEnvelope(res)
}

export async function getDashboard(userId) {
  const res = await fetchWithTimeout(`/api/dashboard?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}
