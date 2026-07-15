import { ApiError, fetchWithTimeout, parseEnvelope } from './client.js'

const STORAGE_KEY = 'ipcompass_optimization'

export function getStoredOptimization(userId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function storeOptimization(userId, data) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(data))
  } catch {
    // 忽略存储失败
  }
}

export function getAddedSuggestionIds(userId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_added_${userId}`)
    if (!raw) return new Set()
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? new Set(arr) : new Set()
  } catch {
    return new Set()
  }
}

export function addAddedSuggestionId(userId, suggestionId) {
  const set = getAddedSuggestionIds(userId)
  set.add(suggestionId)
  try {
    localStorage.setItem(`${STORAGE_KEY}_added_${userId}`, JSON.stringify(Array.from(set)))
  } catch {
    // 忽略存储失败
  }
}

export async function generateOptimizationSuggestions(userId, ipPlan = null) {
  const res = await fetchWithTimeout('/api/optimization/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, ipPlan })
  })
  const data = await parseEnvelope(res)
  if (!Array.isArray(data.suggestions)) {
    throw new ApiError('服务器返回的优化建议格式非法', 'INVALID_SUGGESTIONS')
  }
  storeOptimization(userId, data)
  return data
}

export async function getOptimizationSuggestions(userId) {
  const res = await fetchWithTimeout(`/api/optimization?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  const data = await parseEnvelope(res)
  if (!Array.isArray(data.suggestions)) {
    throw new ApiError('服务器返回的优化建议格式非法', 'INVALID_SUGGESTIONS')
  }
  storeOptimization(userId, data)
  return data
}
