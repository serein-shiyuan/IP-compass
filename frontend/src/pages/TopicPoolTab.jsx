import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { generateTopics, getTopics, updateTopicStatus, deleteTopic, cleanupDiscardedTopics } from '../api/topicPool.js'
import { getColumnsFromCache } from './MatrixTab.jsx'
import { track, TrackingEvents } from '../lib/tracking.js'

const TOPICS_KEY = 'ipcompass_topics'
const MAX_TOPICS = 50

const STATUS_CONFIG = {
  pending: { label: '待用', className: 'topic-status topic-status--pending' },
  used: { label: '已用', className: 'topic-status topic-status--used' },
  discarded: { label: '弃用', className: 'topic-status topic-status--discarded' }
}

function getCachedTopics() {
  try {
    const raw = localStorage.getItem(TOPICS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCachedTopics(topics, generatedAt) {
  localStorage.setItem(TOPICS_KEY, JSON.stringify({ topics, generatedAt }))
}

function clearCachedTopics() {
  localStorage.removeItem(TOPICS_KEY)
}

export default function TopicPoolTab({ userId, positioningCard, ipPlan }) {
  const navigate = useNavigate()
  const [topics, setTopics] = useState([])
  const [generatedAt, setGeneratedAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const [columnFilter, setColumnFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const columns = useMemo(() => getColumnsFromCache()?.columns || [], [])

  useEffect(() => {
    async function load() {
      try {
        const cached = getCachedTopics()
        if (cached?.topics?.length > 0) {
          setTopics(cached.topics)
          setGeneratedAt(cached.generatedAt)
          setLoading(false)
          return
        }

        const serverData = await getTopics(userId)
        setTopics(serverData.topics)
        setGeneratedAt(serverData.generatedAt)
        saveCachedTopics(serverData.topics, serverData.generatedAt)
      } catch (err) {
        if (err.code === 'TOPICS_NOT_FOUND') {
          await doGenerate()
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

  const doGenerate = async () => {
    if (columns.length === 0) {
      setError('未找到栏目矩阵，请先生成栏目矩阵')
      return
    }
    setGenerating(true)
    setError(null)
    const startTime = Date.now()
    try {
      const { topics: data, generatedAt: at, source } = await generateTopics(userId, columns, positioningCard, ipPlan)
      setTopics(data)
      setGeneratedAt(at)
      saveCachedTopics(data, at)
      track(TrackingEvents.TOPIC_GENERATED, {
        topic_count: data.length,
        generation_duration: Date.now() - startTime
      })
      if (source !== 'ai') {
        setError('AI 生成未就绪，当前为智能兜底结果。')
      }
    } catch (err) {
      setError(err.message || '选题生成失败，请重试')
    } finally {
      setGenerating(false)
    }
  }

  const handleStatusChange = async (topic, nextStatus) => {
    const prevTopics = topics
    const nextTopics = topics.map((t) => (t.id === topic.id ? { ...t, status: nextStatus, updatedAt: new Date().toISOString() } : t))
    setTopics(nextTopics)
    saveCachedTopics(nextTopics, generatedAt)
    track(TrackingEvents.TOPIC_STATUS_CHANGED, {
      topic_id: topic.id,
      old_status: topic.status,
      new_status: nextStatus
    })
    try {
      await updateTopicStatus(userId, topic.id, nextStatus)
    } catch (err) {
      setTopics(prevTopics)
      saveCachedTopics(prevTopics, generatedAt)
      setError(err.message || '状态更新失败')
    }
  }

  const handleDelete = async (topic) => {
    const prevTopics = topics
    const nextTopics = topics.filter((t) => t.id !== topic.id)
    setTopics(nextTopics)
    saveCachedTopics(nextTopics, generatedAt)
    try {
      await deleteTopic(userId, topic.id)
    } catch (err) {
      setTopics(prevTopics)
      saveCachedTopics(prevTopics, generatedAt)
      setError(err.message || '删除失败')
    }
  }

  const handleCleanup = async () => {
    const prevTopics = topics
    const nextTopics = topics.filter((t) => t.status !== 'discarded')
    setTopics(nextTopics)
    saveCachedTopics(nextTopics, generatedAt)
    try {
      await cleanupDiscardedTopics(userId)
    } catch (err) {
      setTopics(prevTopics)
      saveCachedTopics(prevTopics, generatedAt)
      setError(err.message || '清理失败')
    }
  }

  const filteredTopics = useMemo(() => {
    return topics.filter((t) => {
      const matchColumn = columnFilter === 'all' || t.columnId === columnFilter
      const matchStatus = statusFilter === 'all' || t.status === statusFilter
      return matchColumn && matchStatus
    })
  }, [topics, columnFilter, statusFilter])

  const pendingCount = topics.filter((t) => t.status === 'pending').length
  const discardedCount = topics.filter((t) => t.status === 'discarded').length
  const isAllUsed = topics.length > 0 && pendingCount === 0 && discardedCount === 0
  const isAtLimit = topics.length >= MAX_TOPICS

  const handleStartDiagnosis = (topic) => {
    navigate(`/diagnosis/input?topicId=${encodeURIComponent(topic.id)}&title=${encodeURIComponent(topic.title)}`)
  }

  return (
    <div>
      {error && (
        <div className="glass-card" style={{ padding: 16, marginBottom: 16, background: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.2)' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>{error}</p>
        </div>
      )}

      {isAtLimit && (
        <div className="glass-card" style={{ padding: 16, marginBottom: 16, background: 'rgba(59,130,246,0.08)', borderColor: 'rgba(59,130,246,0.2)' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#1d4ed8', lineHeight: 1.5 }}>
            选题池已达到 {MAX_TOPICS} 条上限，清理弃用选题后可继续生成。
          </p>
        </div>
      )}

      <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <select
            className="filter-select"
            value={columnFilter}
            onChange={(e) => setColumnFilter(e.target.value)}
          >
            <option value="all">全部栏目</option>
            {columns.map((col, idx) => (
              <option key={idx} value={`col_${idx}`}>{col.name}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="pending">待用</option>
            <option value="used">已用</option>
            <option value="discarded">弃用</option>
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {discardedCount > 0 && (
              <button className="btn btn-outline" onClick={handleCleanup}>
                清理弃用 ({discardedCount})
              </button>
            )}
            <button className="btn btn-purple" onClick={doGenerate} disabled={generating}>
              {generating ? '生成中...' : '重新生成'}
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div className="spinner" />
          <p style={{ marginTop: 16, color: 'var(--color-text-secondary)' }}>正在生成选题池...</p>
        </div>
      ) : (
        <>
          {filteredTopics.length === 0 ? (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ margin: 0, color: 'var(--color-text-secondary)' }}>
                {topics.length === 0 ? '还没有选题，点击重新生成开始创建' : '没有符合条件的选题'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {filteredTopics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  column={columns.find((_, idx) => `col_${idx}` === topic.columnId)}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                  onStartDiagnosis={handleStartDiagnosis}
                />
              ))}
            </div>
          )}

          {isAllUsed && topics.length > 0 && (
            <div className="glass-card" style={{ padding: 20, marginTop: 16, textAlign: 'center', background: 'rgba(16,185,129,0.08)', borderColor: 'rgba(16,185,129,0.2)' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#047857' }}>
                全部选题已使用，可重新生成新的选题池。
              </p>
            </div>
          )}

          {generatedAt && (
            <p style={{ marginTop: 20, fontSize: 12, color: 'var(--color-text-secondary)', textAlign: 'center' }}>
              共 {filteredTopics.length} 条选题{columnFilter === 'all' && statusFilter === 'all' ? '' : '（已筛选）'} · 生成于 {new Date(generatedAt).toLocaleString('zh-CN')}
            </p>
          )}
        </>
      )}
    </div>
  )
}

function TopicCard({ topic, column, onStatusChange, onDelete, onStartDiagnosis }) {
  const status = STATUS_CONFIG[topic.status]
  const canDelete = topic.status === 'discarded' || topic.status === 'used'

  return (
    <div className="glass-card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
            {column && <span className="tag-purple" style={{ fontSize: 11 }}>{column.name}</span>}
            <span className={status.className}>{status.label}</span>
          </div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, lineHeight: 1.5 }}>{topic.title}</h3>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-secondary)' }}>内容要点</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: '#2c2c2c' }}>
          {topic.points.map((p, idx) => (
            <li key={idx}>{p}</li>
          ))}
        </ul>
      </div>

      <div style={{ marginBottom: 12 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-secondary)' }}>素材建议</p>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#2c2c2c' }}>{topic.materialAdvice}</p>
      </div>

      <div style={{ marginBottom: 16 }}>
        <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--color-text-secondary)' }}>针对痛点</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {topic.painPoints.map((p, idx) => (
            <span key={idx} className="tag-purple">{p}</span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
        {topic.status !== 'pending' && topic.status !== 'used' && (
          <button className="btn btn-sm btn-outline" onClick={() => onStatusChange(topic, 'pending')}>移回待用</button>
        )}
        {topic.status !== 'used' && (
          <button className="btn btn-sm btn-purple" onClick={() => onStatusChange(topic, 'used')}>标记已用</button>
        )}
        {topic.status !== 'discarded' && (
          <button className="btn btn-sm btn-outline" onClick={() => onStatusChange(topic, 'discarded')}>弃用</button>
        )}
        {canDelete && (
          <button className="btn btn-sm btn-outline" style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }} onClick={() => onDelete(topic)}>
            删除
          </button>
        )}
        <button className="btn btn-sm btn-outline" style={{ marginLeft: 'auto' }} onClick={() => onStartDiagnosis(topic)}>
          开始诊断
        </button>
      </div>
    </div>
  )
}
