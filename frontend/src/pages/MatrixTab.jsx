import { useEffect, useState } from 'react'
import { generateColumns, getColumns, deleteColumns } from '../api/contentStrategy.js'
import { track, TrackingEvents } from '../lib/tracking.js'

const COLUMNS_KEY = 'ipcompass_columns'

function getCachedColumns() {
  try {
    const raw = localStorage.getItem(COLUMNS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveCachedColumns(columns, generatedAt) {
  localStorage.setItem(COLUMNS_KEY, JSON.stringify({ columns, generatedAt }))
}

function clearCachedColumns() {
  localStorage.removeItem(COLUMNS_KEY)
}

export function getColumnsFromCache() {
  return getCachedColumns()
}

export default function MatrixTab({ userId, positioningCard, ipPlan }) {
  const [columns, setColumns] = useState([])
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const cached = getCachedColumns()
        if (cached?.columns?.length > 0) {
          setColumns(cached.columns)
          setGeneratedAt(cached.generatedAt)
          setLoading(false)
          return
        }

        const serverData = await getColumns(userId)
        setColumns(serverData.columns)
        setGeneratedAt(serverData.generatedAt)
        saveCachedColumns(serverData.columns, serverData.generatedAt)
      } catch (err) {
        if (err.code === 'COLUMNS_NOT_FOUND') {
          await doGenerate(false)
        } else {
          setError(err.message || '加载失败')
        }
      } finally {
        setLoading(false)
      }
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  const doGenerate = async (regenerate) => {
    if (!positioningCard) return
    setGenerating(true)
    setError(null)
    const startTime = Date.now()
    try {
      const { columns: data, generatedAt: at, source } = await generateColumns(userId, positioningCard, regenerate, ipPlan)
      setColumns(data)
      setGeneratedAt(at)
      saveCachedColumns(data, at)
      track(TrackingEvents.COLUMN_GENERATED, {
        column_count: data.length,
        generation_duration: Date.now() - startTime
      })
      if (source === 'fallback') {
        setError('AI 生成未就绪，当前为智能兜底结果。')
      }
    } catch (err) {
      setError(err.message || '栏目生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  const handleRegenerate = async () => {
    setShowRegenerateConfirm(false)
    clearCachedColumns()
    await deleteColumns(userId)
    await doGenerate(true)
  }

  return (
    <div>
      {error && (
        <div className="glass-card" style={{ padding: 16, marginBottom: 16, background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.2)' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div className="spinner" />
          <p style={{ marginTop: 16, color: 'var(--color-text-secondary)' }}>正在生成栏目矩阵...</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {columns.map((column, idx) => (
              <ColumnCard
                key={idx}
                index={idx + 1}
                column={column}
                expanded={expanded === idx}
                onToggle={() => setExpanded(expanded === idx ? null : idx)}
              />
            ))}
          </div>

          {generatedAt && (
            <p style={{ marginTop: 20, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              生成于 {new Date(generatedAt).toLocaleString('zh-CN')}
            </p>
          )}

          <div style={{ marginTop: 32 }}>
            <button
              className="btn btn-outline btn-full"
              onClick={() => setShowRegenerateConfirm(true)}
              disabled={generating}
            >
              {generating ? '生成中...' : '重新生成'}
            </button>
          </div>
        </>
      )}

      {showRegenerateConfirm && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>重新生成栏目</h3>
            <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              重新生成会替换当前栏目矩阵，已生成的选题数据也会被清除。
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => setShowRegenerateConfirm(false)}>
                取消
              </button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={handleRegenerate}>
                确认重新生成
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ColumnCard({ index, column, expanded, onToggle }) {
  return (
    <div
      className="glass-card"
      style={{ padding: 20, cursor: 'pointer', transition: 'box-shadow 0.2s ease' }}
      onClick={onToggle}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'var(--color-purple-light)',
                color: 'var(--color-purple)',
                fontSize: 12,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {index}
            </span>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>{column.name}</h3>
          </div>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {column.goal}
          </p>
        </div>
        <span style={{ fontSize: 20, color: 'var(--color-text-secondary)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
          ▼
        </span>
      </div>

      {expanded && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--color-text-secondary)' }}>内容形式</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{column.format}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--color-text-secondary)' }}>更新频率</p>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{column.frequency}</p>
            </div>
          </div>
          <div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-secondary)' }}>解决的用户痛点</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {column.painPoints.map((point, idx) => (
                <span key={idx} className="tag-purple">{point}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
