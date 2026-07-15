import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { BackIcon } from '../components/Icons.jsx'
import { getIpPlan, getPositioningCardFromIpPlan } from '../lib/ipPlanStore.js'
import { getDiagnosisReport, generateDiagnosisReport, saveDiagnosisReport, getDiagnosisHistory, deleteDiagnosisHistory } from '../api/diagnosis.js'
import { track, TrackingEvents } from '../lib/tracking.js'

const DRAFT_KEY = 'draft_content'
const HISTORY_KEY = 'diagnosis_history'
const MAX_HISTORY = 50

function getDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function getLocalHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)))
  } catch {
    // ignore
  }
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function RadarChart({ dimensions }) {
  const size = 220
  const center = size / 2
  const radius = 80
  const count = dimensions.length
  const angleOffset = -Math.PI / 2

  const points = dimensions.map((d, i) => {
    const angle = angleOffset + (i * 2 * Math.PI) / count
    const r = ((d.score ?? 0) / 10) * radius
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)]
  })

  const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ') + ' Z'
  const labelPoints = dimensions.map((d, i) => {
    const angle = angleOffset + (i * 2 * Math.PI) / count
    const r = radius + 22
    return [center + r * Math.cos(angle), center + r * Math.sin(angle)]
  })

  return (
    <svg width={size} height={size} style={{ display: 'block', margin: '0 auto' }}>
      {[0.2, 0.4, 0.6, 0.8, 1].map((scale) => (
        <circle
          key={scale}
          cx={center}
          cy={center}
          r={radius * scale}
          fill="none"
          stroke="rgba(139,92,246,0.15)"
          strokeWidth={1}
        />
      ))}
      {dimensions.map((_, i) => {
        const angle = angleOffset + (i * 2 * Math.PI) / count
        const x2 = center + radius * Math.cos(angle)
        const y2 = center + radius * Math.sin(angle)
        return (
          <line
            key={i}
            x1={center}
            y1={center}
            x2={x2}
            y2={y2}
            stroke="rgba(139,92,246,0.15)"
            strokeWidth={1}
          />
        )
      })}
      <path d={pathData} fill="rgba(139,92,246,0.15)" stroke="var(--color-purple)" strokeWidth={2} />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r={3} fill="var(--color-purple)" />
      ))}
      {labelPoints.map((p, i) => {
        const d = dimensions[i]
        const shortName = d.name.replace(/[吸引力匹配度合理性完整性信息量情绪设计]/g, '')
        return (
          <text
            key={i}
            x={p[0]}
            y={p[1]}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill="var(--color-text-secondary)"
          >
            {shortName}
          </text>
        )
      })}
    </svg>
  )
}

export default function DiagnosisReportPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { userId } = useAuth()
  const ipPlan = useMemo(() => getIpPlan(), [])
  const positioningCard = useMemo(() => getPositioningCardFromIpPlan(ipPlan), [ipPlan])

  const reportIdFromUrl = searchParams.get('reportId') || ''

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [history, setHistory] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [historyFull, setHistoryFull] = useState(false)

  const isReportSaved = useMemo(() => {
    return history.some((item) => item.id === report?.reportId)
  }, [history, report])

  const savedTimerRef = useRef(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        let data = null
        if (reportIdFromUrl) {
          data = await getDiagnosisReport(userId, reportIdFromUrl)
        }

        if (!data) {
          const draft = getDraft()
          if (!draft || !draft.topic) {
            throw new Error('未找到诊断报告，请返回录入页重新提交')
          }
          const generated = await generateDiagnosisReport(userId, draft, positioningCard, ipPlan)
          data = generated
        }

        setReport(data)
        track(TrackingEvents.DIAGNOSIS_COMPLETED, {
          total_score: data.totalScore,
          low_score_count: (data.dimensions || []).filter((d) => d.isLow).length,
          insufficient_count: (data.dimensions || []).filter((d) => d.isInsufficient).length,
          generation_duration: 0
        })
      } catch (err) {
        setError(err.message || '加载报告失败')
      } finally {
        setLoading(false)
      }
    }

    if (userId) load()
  }, [userId, reportIdFromUrl, positioningCard])

  useEffect(() => {
    if (!userId) return
    getDiagnosisHistory(userId)
      .then((data) => setHistory(data))
      .catch(() => setHistory(getLocalHistory()))
  }, [userId])

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current)
      }
    }
  }, [])

  const handleSave = async () => {
    if (!report || isReportSaved || saved) return
    setSaving(true)
    setHistoryFull(false)
    if (savedTimerRef.current) {
      clearTimeout(savedTimerRef.current)
      savedTimerRef.current = null
    }
    try {
      const draft = getDraft()
      await saveDiagnosisReport(userId, {
        reportId: report.reportId,
        topic: draft?.topic || '',
        totalScore: report.totalScore,
        rating: report.rating,
        dimensions: report.dimensions
      })

      const newItem = {
        id: report.reportId,
        date: new Date().toISOString(),
        topic: draft?.topic || '',
        totalScore: report.totalScore,
        rating: report.rating,
        dimensions: report.dimensions
      }
      const nextHistory = [newItem, ...history].slice(0, MAX_HISTORY)
      setHistory(nextHistory)
      saveLocalHistory(nextHistory)
      setSaved(true)
      track(TrackingEvents.DIAGNOSIS_SAVED, {
        total_score: report.totalScore,
        report_id: report.reportId
      })
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      if (err.code === 'HISTORY_FULL') {
        setHistoryFull(true)
      } else {
        setError(err.message || '保存失败')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleClearOldHistory = async () => {
    if (!report) return
    const keepCount = Math.max(1, Math.floor(MAX_HISTORY / 2))
    const nextHistory = history.slice(0, keepCount)
    setHistory(nextHistory)
    saveLocalHistory(nextHistory)
    setHistoryFull(false)
    await handleSave()
  }

  const handleRedo = () => {
    track(TrackingEvents.DIAGNOSIS_REDONE, {
      previous_score: report?.totalScore ?? 0,
      new_score: 0
    })
    navigate('/diagnosis/input')
  }

  const handleGoHome = () => {
    navigate('/home')
  }

  const handleDeleteHistory = async (id) => {
    try {
      await deleteDiagnosisHistory(userId, id)
      const nextHistory = history.filter((item) => item.id !== id)
      setHistory(nextHistory)
      saveLocalHistory(nextHistory)
    } catch (err) {
      setError(err.message || '删除失败')
    }
  }

  const sortedDimensions = useMemo(() => {
    if (!report?.dimensions) return []
    return [...report.dimensions].sort((a, b) => {
      if (a.isInsufficient && !b.isInsufficient) return 1
      if (!a.isInsufficient && b.isInsufficient) return -1
      return (a.score ?? 0) - (b.score ?? 0)
    })
  }, [report])

  return (
    <div className="page" style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <div className="top-nav">
        <button className="top-nav__back" onClick={() => navigate('/diagnosis/input')}>
          <BackIcon size={20} />
          <span>诊断报告</span>
        </button>
      </div>

      <div className="container" style={{ paddingTop: 80 }}>
        {loading && (
          <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>AI 正在分析你的内容...</p>
          </div>
        )}

        {error && !loading && (
          <div className="glass-card" style={{ padding: 20, marginBottom: 16, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#b91c1c', lineHeight: 1.5 }}>{error}</p>
            <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
              <button className="btn btn-outline" onClick={handleRedo}>修改内容重新诊断</button>
              <button className="btn btn-outline" onClick={handleGoHome}>返回首页</button>
            </div>
          </div>
        )}

        {!loading && !error && report && (
          <>
            <div className="glass-card" style={{ padding: 24, marginBottom: 16, textAlign: 'center' }}>
              <p style={{ margin: '0 0 8px', fontSize: 14, color: 'var(--color-text-secondary)' }}>发布前诊断总分</p>
              <h1 style={{ margin: 0, fontSize: 48, fontWeight: 700, color: 'var(--color-text)' }}>{report.totalScore}</h1>
              <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 600, color: 'var(--color-purple)' }}>{report.rating}</p>
              <div style={{ marginTop: 20 }}>
                <RadarChart dimensions={report.dimensions} />
              </div>
            </div>

            <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>维度明细</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sortedDimensions.map((dim) => (
                  <div key={dim.name}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 500, color: dim.isLow ? '#b91c1c' : 'var(--color-text)' }}>{dim.name}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: dim.isInsufficient ? 'var(--color-text-tertiary)' : dim.isLow ? '#b91c1c' : 'var(--color-text)' }}>
                        {dim.isInsufficient ? '信息不足' : `${dim.score}/10`}
                      </span>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(139,92,246,0.1)', overflow: 'hidden', marginBottom: 6 }}>
                      <div
                        style={{
                          width: dim.isInsufficient ? '0%' : `${dim.score * 10}%`,
                          height: '100%',
                          borderRadius: 3,
                          background: dim.isLow ? '#ef4444' : 'var(--color-purple)'
                        }}
                      />
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{dim.advice}</p>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <button className="btn btn-purple btn-full" onClick={handleSave} disabled={saving || isReportSaved || saved}>
                {saving ? '保存中...' : isReportSaved || saved ? '已保存' : '保存报告'}
              </button>
              {historyFull && (
                <div className="glass-card" style={{ padding: 14, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
                  <p style={{ margin: '0 0 10px', fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>
                    历史记录已满（最多 {MAX_HISTORY} 条），无法继续保存。可清理旧记录后再试。
                  </p>
                  <button className="btn btn-sm btn-outline" onClick={handleClearOldHistory}>
                    清理旧记录并保存
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={handleRedo}>
                  修改内容重新诊断
                </button>
                <button className="btn btn-outline" style={{ flex: 1 }} onClick={handleGoHome}>
                  返回首页
                </button>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>历史记录</h3>
                <button className="btn btn-sm btn-outline" onClick={() => setShowHistory((v) => !v)}>
                  {showHistory ? '收起' : '展开'}
                </button>
              </div>
              {showHistory && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {history.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>暂无保存的诊断报告</p>
                  ) : (
                    history.map((item) => (
                      <div key={item.id} className="activity-item" style={{ justifyContent: 'space-between' }}>
                        <div>
                          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500 }}>{item.topic || '未命名诊断'}</p>
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            {formatDate(item.date)} · {item.totalScore}分 · {item.rating}
                          </p>
                        </div>
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => handleDeleteHistory(item.id)}
                        >
                          删除
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
