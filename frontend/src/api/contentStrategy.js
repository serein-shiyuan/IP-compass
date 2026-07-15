import { ApiError, fetchWithTimeout, parseEnvelope } from './client.js'

export async function generateColumns(userId, positioningCard, regenerate = false, ipPlan = null) {
  const res = await fetchWithTimeout('/api/content/columns/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, positioningCard, regenerate, ipPlan })
  })
  const data = await parseEnvelope(res)
  if (!data.columns || !Array.isArray(data.columns)) {
    throw new ApiError('服务器返回的栏目数据非法', 'INVALID_COLUMNS')
  }
  return { columns: data.columns, generatedAt: data.generatedAt, source: data.source || 'fallback' }
}

export async function getColumns(userId) {
  const res = await fetchWithTimeout(`/api/content/columns?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  const data = await parseEnvelope(res)
  if (!data.columns || !Array.isArray(data.columns)) {
    throw new ApiError('服务器返回的栏目数据非法', 'INVALID_COLUMNS')
  }
  return { columns: data.columns, generatedAt: data.generatedAt }
}

export async function deleteColumns(userId) {
  const res = await fetchWithTimeout(`/api/content/columns?userId=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
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

export async function addTopic(userId, topic) {
  const res = await fetchWithTimeout('/api/content/topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, topic })
  })
  const data = await parseEnvelope(res)
  if (!data.topic || typeof data.topic !== 'object') {
    throw new ApiError('服务器返回的选题数据非法', 'INVALID_TOPIC')
  }
  return data.topic
}
