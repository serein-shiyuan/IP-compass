import { ApiError, fetchWithTimeout, parseEnvelope } from './client.js'

export async function generateTopics(userId, columns, positioningCard, ipPlan = null) {
  const res = await fetchWithTimeout('/api/content/topics/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, columns, positioningCard, ipPlan })
  })
  const data = await parseEnvelope(res)
  if (!data.topics || !Array.isArray(data.topics)) {
    throw new ApiError('服务器返回的选题数据非法', 'INVALID_TOPICS')
  }
  return { topics: data.topics, generatedAt: data.generatedAt, source: data.source || 'fallback' }
}

export async function getTopics(userId) {
  const res = await fetchWithTimeout(`/api/content/topics?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  const data = await parseEnvelope(res)
  if (!data.topics || !Array.isArray(data.topics)) {
    throw new ApiError('服务器返回的选题数据非法', 'INVALID_TOPICS')
  }
  return { topics: data.topics, generatedAt: data.generatedAt }
}

export async function updateTopicStatus(userId, id, status) {
  const res = await fetchWithTimeout(`/api/content/topics/${encodeURIComponent(id)}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, status })
  })
  return parseEnvelope(res)
}

export async function deleteTopic(userId, id) {
  const res = await fetchWithTimeout(`/api/content/topics/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}

export async function cleanupDiscardedTopics(userId) {
  const res = await fetchWithTimeout(`/api/content/topics/cleanup?userId=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}
