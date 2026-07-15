import { fetchWithTimeout, parseEnvelope } from './client.js'

export async function submitVideoData(userId, videos) {
  const res = await fetchWithTimeout('/api/video-data/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, videos })
  })
  return parseEnvelope(res)
}

export async function getVideoData(userId) {
  const res = await fetchWithTimeout(`/api/video-data?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}
