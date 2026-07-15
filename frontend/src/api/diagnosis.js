import { ApiError, fetchWithTimeout, parseEnvelope } from './client.js'

export async function checkBias({ title, script, tags, positioningCard, ipPlan }) {
  const res = await fetchWithTimeout('/api/diagnosis/bias-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, script, tags, positioningCard, ipPlan })
  })
  const data = await parseEnvelope(res)
  return {
    hasBias: Boolean(data.hasBias),
    rules: Array.isArray(data.rules) ? data.rules : []
  }
}

export async function saveDiagnosisDraft(userId, content) {
  const res = await fetchWithTimeout('/api/diagnosis/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, content })
  })
  const data = await parseEnvelope(res)
  if (typeof data.draftId !== 'string') {
    throw new ApiError('服务器返回的草稿 ID 非法', 'INVALID_DRAFT_ID')
  }
  return data.draftId
}

export async function generateDiagnosisReport(userId, content, positioningCard, ipPlan = null) {
  const res = await fetchWithTimeout('/api/diagnosis/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, content, positioningCard, ipPlan })
  })
  const data = await parseEnvelope(res)
  if (typeof data.reportId !== 'string') {
    throw new ApiError('服务器返回的报告 ID 非法', 'INVALID_REPORT_ID')
  }
  return data
}

export async function getDiagnosisReport(userId, reportId) {
  const res = await fetchWithTimeout(`/api/diagnosis/report?userId=${encodeURIComponent(userId)}&reportId=${encodeURIComponent(reportId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  const data = await parseEnvelope(res)
  return data.report
}

export async function saveDiagnosisReport(userId, report) {
  const res = await fetchWithTimeout('/api/diagnosis/save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, report })
  })
  return parseEnvelope(res)
}

export async function getDiagnosisHistory(userId) {
  const res = await fetchWithTimeout(`/api/diagnosis/history?userId=${encodeURIComponent(userId)}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  const data = await parseEnvelope(res)
  return Array.isArray(data.history) ? data.history : []
}

export async function deleteDiagnosisHistory(userId, id) {
  const res = await fetchWithTimeout(`/api/diagnosis/history/${encodeURIComponent(id)}?userId=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  return parseEnvelope(res)
}
