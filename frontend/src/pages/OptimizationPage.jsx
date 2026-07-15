import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { BackIcon } from '../components/Icons.jsx'
import { getIpPlan } from '../lib/ipPlanStore.js'
import { addTopic, getColumns } from '../api/contentStrategy.js'
import {
  generateOptimizationSuggestions,
  getOptimizationSuggestions,
  getStoredOptimization,
  getAddedSuggestionIds,
  addAddedSuggestionId
} from '../api/optimization.js'

function getSourceLabel(source) {
  return source === 'ai' ? 'AI 生成' : '规则兜底'
}

function formatTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return ''
  }
}

export default function OptimizationPage() {
  const navigate = useNavigate()
  const { userId, status: authStatus, initialize } = useAuth()
  const ipPlan = getIpPlan()

  const [suggestions, setSuggestions] = useState([])
  const [source, setSource] = useState('fallback')
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [columns, setColumns] = useState([])
  const [columnsLoading, setColumnsLoading] = useState(false)

  const [addedIds, setAddedIds] = useState(new Set())
  const [addingId, setAddingId] = useState(null)
  const [addError, setAddError] = useState(null)

  useEffect(() => {
    if (!userId && authStatus !== 'loading') {
      initialize({ createIfMissing: true })
    }
  }, [userId, authStatus, initialize])

  useEffect(() => {
    if (!userId) return
    setAddedIds(getAddedSuggestionIds(userId))
    loadSuggestions(false)
    loadColumns()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function loadSuggestions(forceGenerate = false) {
    setLoading(true)
    setError(null)
    try {
      let data = null
      if (!forceGenerate) {
        try {
          data = await getOptimizationSuggestions(userId)
        } catch (err) {
          if (err.code !== 'OPTIMIZATION_NOT_FOUND') throw err
        }
      }
      if (!data) {
        data = await generateOptimizationSuggestions(userId, ipPlan)
      }
      setSuggestions(data.suggestions || [])
      setSource(data.source || 'fallback')
      setGeneratedAt(data.generatedAt || null)
    } catch (err) {
      const cached = getStoredOptimization(userId)
      if (cached && Array.isArray(cached.suggestions) && cached.suggestions.length > 0) {
        setSuggestions(cached.suggestions)
        setSource(cached.source || 'fallback')
        setGeneratedAt(cached.generatedAt || null)
        setError(`${err.message || '获取失败'}，已展示缓存建议`)
      } else {
        setSuggestions([])
        setError(err.message || '优化建议获取失败')
      }
    } finally {
      setLoading(false)
    }
  }

  async function loadColumns() {
    setColumnsLoading(true)
    try {
      const data = await getColumns(userId)
      setColumns(data.columns || [])
    } catch {
      setColumns([])
    } finally {
      setColumnsLoading(false)
    }
  }

  const handleRegenerate = async () => {
    if (loading) return
    await loadSuggestions(true)
  }

  const handleAddToTopicPool = async (suggestion) => {
    if (!userId || addingId || addedIds.has(suggestion.id)) return

    setAddError(null)
    setAddingId(suggestion.id)

    try {
      let currentColumns = columns
      if (currentColumns.length === 0 && !columnsLoading) {
        try {
          const data = await getColumns(userId)
          currentColumns = data.columns || []
          setColumns(currentColumns)
        } catch {
          currentColumns = []
        }
      }

      if (currentColumns.length === 0) {
        throw new Error('未找到栏目数据，请先生成栏目矩阵和选题池')
      }

      const topic = {
        columnId: currentColumns[0].id,
        title: suggestion.titleSuggestion,
        points: [
          suggestion.direction,
          suggestion.caseReference,
          `优化维度：${suggestion.optimizeDimension}`
        ],
        materialAdvice: suggestion.caseReference,
        painPoints: [],
        source: 'optimization',
        referenceSuggestionId: suggestion.id
      }

      await addTopic(userId, topic)
      addAddedSuggestionId(userId, suggestion.id)
      setAddedIds((prev) => new Set([...prev, suggestion.id]))
    } catch (err) {
      setAddError(err.message || '加入选题池失败')
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="page" style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <div className="top-nav">
        <button className="top-nav__back" onClick={() => navigate('/data/dashboard')}>
          <BackIcon size={20} />
          <span>优化建议</span>
        </button>
      </div>

      <div className="container" style={{ paddingTop: 80 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>下一条优化建议</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            基于归因诊断与诊断报告，生成 3-5 条可执行的内容优化方向
          </p>
        </div>

        {loading && (
          <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>正在生成优化建议...</p>
          </div>
        )}

        {!loading && error && (
          <div className="glass-card" style={{ padding: 20, marginBottom: 16, background: 'rgba(239,68,68,0.08)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-error)' }}>{error}</p>
            <button className="btn btn-purple" onClick={() => loadSuggestions(false)}>
              重试
            </button>
          </div>
        )}

        {!loading && suggestions.length === 0 && !error && (
          <div className="glass-card" style={{ padding: 32, textAlign: 'center' }}>
            <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--color-text-secondary)' }}>
              暂无优化建议，请确认已完成定位卡、视频数据录入与归因分析。
            </p>
            <button className="btn btn-purple" onClick={handleRegenerate}>
              重新生成
            </button>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
                来源：{getSourceLabel(source)}
                {generatedAt && <span style={{ marginLeft: 12 }}>{formatTime(generatedAt)}</span>}
              </div>
              <button className="btn btn-outline" onClick={handleRegenerate} disabled={loading}>
                重新生成
              </button>
            </div>

            {addError && (
              <div className="glass-card" style={{ padding: 12, marginBottom: 16, background: 'rgba(239,68,68,0.08)' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--color-error)' }}>{addError}</p>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {suggestions.map((suggestion, index) => {
                const isAdded = addedIds.has(suggestion.id)
                const isAdding = addingId === suggestion.id
                return (
                  <div key={suggestion.id || index} className="glass-card" style={{ padding: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 500,
                          background: 'rgba(139,92,246,0.12)',
                          color: '#7c3aed'
                        }}
                      >
                        {suggestion.optimizeDimension || '综合优化'}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>#{index + 1}</span>
                    </div>

                    <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 10px', lineHeight: 1.4 }}>
                      {suggestion.titleSuggestion}
                    </h3>

                    <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                      {suggestion.direction}
                    </p>

                    <div
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        background: 'rgba(0,0,0,0.03)',
                        marginBottom: 16
                      }}
                    >
                      <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)', lineHeight: 1.5 }}>
                        参考：{suggestion.caseReference}
                      </p>
                    </div>

                    <button
                      className="btn btn-purple"
                      disabled={isAdded || isAdding}
                      onClick={() => handleAddToTopicPool(suggestion)}
                      style={{ opacity: isAdded || isAdding ? 0.6 : 1 }}
                    >
                      {isAdding ? '加入中...' : isAdded ? '已加入选题池' : '加入选题池'}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
