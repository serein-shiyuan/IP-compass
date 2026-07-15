import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { submitVideoData, getVideoData } from '../api/videoData.js'
import { getTopics } from '../api/contentStrategy.js'
import { track, TrackingEvents } from '../lib/tracking.js'

const MAX_ROWS = 7
const VIDEO_METRICS = [
  { key: 'playCount', label: '播放量', placeholder: '0' },
  { key: 'completionRate', label: '完播率(%)', placeholder: '0-100' },
  { key: 'likes', label: '点赞', placeholder: '0' },
  { key: 'comments', label: '评论', placeholder: '0' },
  { key: 'saves', label: '收藏', placeholder: '0' },
  { key: 'shares', label: '分享', placeholder: '0' },
  { key: 'newFollowers', label: '新增粉丝', placeholder: '0' }
]

function createEmptyRow() {
  return {
    playCount: '',
    completionRate: '',
    likes: '',
    comments: '',
    saves: '',
    shares: '',
    newFollowers: '',
    topicId: null,
    topicTitle: ''
  }
}

const DEMO_ROWS = [
  { playCount: '12500', completionRate: '28', likes: '420', comments: '38', saves: '26', shares: '12', newFollowers: '15', topicId: null, topicTitle: '成长｜长期主义' },
  { playCount: '8900', completionRate: '35', likes: '310', comments: '52', saves: '41', shares: '8', newFollowers: '22', topicId: null, topicTitle: '' },
  { playCount: '21000', completionRate: '22', likes: '680', comments: '24', saves: '18', shares: '31', newFollowers: '9', topicId: null, topicTitle: '审美｜自我养成' },
  { playCount: '5600', completionRate: '41', likes: '180', comments: '65', saves: '55', shares: '5', newFollowers: '31', topicId: null, topicTitle: '' },
  { playCount: '15400', completionRate: '30', likes: '510', comments: '41', saves: '33', shares: '19', newFollowers: '18', topicId: null, topicTitle: '女性力量' },
  { playCount: '7200', completionRate: '38', likes: '245', comments: '29', saves: '22', shares: '7', newFollowers: '14', topicId: null, topicTitle: '' },
  { playCount: '18900', completionRate: '25', likes: '595', comments: '33', saves: '27', shares: '25', newFollowers: '11', topicId: null, topicTitle: '利他｜运营复盘' }
]

function normalizeNumber(value) {
  if (value === '' || value === null || value === undefined) return ''
  const s = String(value).replace(/[^0-9.]/g, '')
  return s
}

function validateRows(rows) {
  const errors = {}
  const validRows = []

  rows.forEach((row, index) => {
    const rowErrors = []
    const hasAnyValue = VIDEO_METRICS.some((m) => String(row[m.key]).trim() !== '')
    if (!hasAnyValue) {
      errors[index] = rowErrors
      return
    }

    VIDEO_METRICS.forEach((metric) => {
      const value = String(row[metric.key]).trim()
      if (value === '') {
        rowErrors.push(`${metric.label} 不能为空`)
        return
      }
      const num = Number(value)
      if (Number.isNaN(num) || num < 0) {
        rowErrors.push(`${metric.label} 需为大于等于 0 的数字`)
        return
      }
      if (metric.key === 'completionRate' && num > 100) {
        rowErrors.push(`${metric.label} 不能超过 100%`)
      }
    })

    if (rowErrors.length === 0) {
      validRows.push({ ...row, videoIndex: index + 1 })
    }
    errors[index] = rowErrors
  })

  return { errors, validRows }
}

export default function DataInputPage() {
  const navigate = useNavigate()
  const { userId, status: authStatus, initialize } = useAuth()

  const [rows, setRows] = useState(DEMO_ROWS)
  const [errors, setErrors] = useState({})
  const [globalError, setGlobalError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [showTopicModal, setShowTopicModal] = useState(false)
  const [activeRowIndex, setActiveRowIndex] = useState(null)
  const [topics, setTopics] = useState([])
  const [topicsLoading, setTopicsLoading] = useState(false)

  useEffect(() => {
    if (!userId && authStatus !== 'loading') {
      initialize({ createIfMissing: true })
    }
  }, [userId, authStatus, initialize])

  useEffect(() => {
    if (!userId) return
    getVideoData(userId)
      .then((data) => {
        if (data?.videos?.length > 0) {
          setRows(
            data.videos.map((v) => ({
              playCount: String(v.playCount ?? ''),
              completionRate: String(v.completionRate ?? ''),
              likes: String(v.likes ?? ''),
              comments: String(v.comments ?? ''),
              saves: String(v.saves ?? ''),
              shares: String(v.shares ?? ''),
              newFollowers: String(v.newFollowers ?? ''),
              topicId: v.topicId || null,
              topicTitle: v.topicTitle || ''
            }))
          )
        }
      })
      .catch(() => {
        // 未录入过则保持默认空行
      })
  }, [userId])

  const canAddRow = rows.length < MAX_ROWS

  const handleChange = (index, key, value) => {
    setRows((prev) => {
      const next = [...prev]
      const normalized = key === 'completionRate' ? normalizeNumber(value) : value.replace(/[^0-9]/g, '')
      next[index] = { ...next[index], [key]: normalized }
      return next
    })
    setErrors((prev) => ({ ...prev, [index]: [] }))
    setGlobalError(null)
  }

  const handleAddRow = () => {
    setRows((prev) => {
      if (prev.length >= MAX_ROWS) return prev
      return [...prev, createEmptyRow()]
    })
  }

  const handleRemoveRow = (index) => {
    setRows((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [createEmptyRow()] : next
    })
    setErrors((prev) => {
      const next = { ...prev }
      delete next[index]
      return next
    })
  }

  const openTopicModal = (index) => {
    setActiveRowIndex(index)
    setShowTopicModal(true)
    setTopicsLoading(true)
    getTopics(userId)
      .then((data) => setTopics(data?.topics || []))
      .catch(() => setTopics([]))
      .finally(() => setTopicsLoading(false))
  }

  const handleSelectTopic = (topic) => {
    if (activeRowIndex === null) return
    setRows((prev) => {
      const next = [...prev]
      next[activeRowIndex] = { ...next[activeRowIndex], topicId: topic.id, topicTitle: topic.title }
      return next
    })
    setShowTopicModal(false)
    setActiveRowIndex(null)
  }

  const handleClearTopic = (index) => {
    setRows((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], topicId: null, topicTitle: '' }
      return next
    })
  }

  const handleSubmit = async () => {
    setGlobalError(null)
    const { errors: rowErrors, validRows } = validateRows(rows)
    setErrors(rowErrors)

    if (validRows.length === 0) {
      setGlobalError('请至少完整填写 1 行视频数据')
      return
    }

    const hasErrors = Object.values(rowErrors).some((arr) => arr.length > 0)
    if (hasErrors) {
      setGlobalError('请修正表格中的错误后再提交')
      return
    }

    setSubmitting(true)
    try {
      await submitVideoData(userId, validRows)
      navigate('/data/dashboard')
    } catch (err) {
      setGlobalError(err.message || '提交失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  const isInsufficient = rows.filter((r) => VIDEO_METRICS.some((m) => String(r[m.key]).trim() !== '')).length < 3

  return (
    <div className="page" style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <div className="container" style={{ paddingTop: 80, maxWidth: 848 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>视频数据录入</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            录入 1-7 条已发布视频数据，生成复盘报告
          </p>
        </div>

        {globalError && (
          <div
            className="glass-card"
            style={{
              padding: 14,
              marginBottom: 16,
              background: 'rgba(239,68,68,0.08)',
              borderColor: 'rgba(239,68,68,0.2)'
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: '#b91c1c', lineHeight: 1.5 }}>{globalError}</p>
          </div>
        )}

        <div className="glass-card" style={{ width: 800, maxWidth: '100%', padding: '16px 0', margin: '0 auto 16px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>序号</th>
                {VIDEO_METRICS.map((metric) => (
                  <th key={metric.key} style={{ textAlign: 'left', padding: '8px 6px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                    {metric.label}
                  </th>
                ))}
                <th style={{ textAlign: 'left', padding: '8px 6px', fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>关联选题</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td style={{ padding: '6px' }}>
                    <span style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>{index + 1}</span>
                  </td>
                  {VIDEO_METRICS.map((metric) => (
                    <td key={metric.key} style={{ padding: '6px', verticalAlign: 'top' }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="form-input"
                        style={{ minWidth: 56, fontSize: 13, padding: '8px 4px', textAlign: 'center' }}
                        value={row[metric.key]}
                        onChange={(e) => handleChange(index, metric.key, e.target.value)}
                        placeholder={metric.placeholder}
                      />
                    </td>
                  ))}
                  <td style={{ padding: '6px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                    {row.topicId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span className="tag-purple" style={{ fontSize: 12 }}>{row.topicTitle || '已关联'}</span>
                        <button className="btn btn-sm btn-outline" onClick={() => handleClearTopic(index)}>清除</button>
                      </div>
                    ) : (
                      <button className="btn btn-sm btn-outline" onClick={() => openTopicModal(index)}>
                        关联选题
                      </button>
                    )}
                  </td>
                  <td style={{ padding: '6px', verticalAlign: 'top' }}>
                    <button
                      className="btn btn-sm btn-outline"
                      style={{ color: '#b91c1c', borderColor: 'rgba(239,68,68,0.3)' }}
                      onClick={() => handleRemoveRow(index)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {Object.entries(errors).map(([index, errs]) =>
            errs.length > 0 ? (
              <div key={index} style={{ marginTop: 8, padding: 8, borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.08)' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#b91c1c' }}>
                  第 {Number(index) + 1} 行：{errs.join('、')}
                </p>
              </div>
            ) : null
          )}
        </div>

        {canAddRow && (
          <button className="btn btn-outline btn-full" onClick={handleAddRow} style={{ marginBottom: 16 }}>
            + 添加视频（最多 {MAX_ROWS} 条）
          </button>
        )}

        {/* 上传数据截图：v1.5 开发，当前锁定 */}
        <div
          className="glass-card"
          style={{
            padding: 20,
            marginBottom: 16,
            background: 'rgba(255,255,255,0.3)',
            border: '1px dashed rgba(44,44,44,0.2)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            position: 'relative',
            opacity: 0.75,
            pointerEvents: 'none'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 500 }}>上传数据截图</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>AI 自动识别并填入表格</p>
          <span
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              fontSize: 11,
              fontWeight: 600,
              color: '#92400e',
              background: 'rgba(234,179,8,0.15)',
              padding: '3px 10px',
              borderRadius: 999
            }}
          >
            v1.5 开发
          </span>
        </div>

        {isInsufficient && (
          <div
            className="glass-card"
            style={{
              padding: 14,
              marginBottom: 16,
              background: 'rgba(234,179,8,0.08)',
              borderColor: 'rgba(234,179,8,0.2)'
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>
              当前仅录入 {rows.filter((r) => VIDEO_METRICS.some((m) => String(r[m.key]).trim() !== '')).length} 条数据，不足 3 条。可以提交，但复盘报告会标注「数据不足」。
            </p>
          </div>
        )}

        <button className="btn btn-purple btn-full" onClick={handleSubmit} disabled={submitting}>
          {submitting ? '提交中...' : '生成复盘报告'}
        </button>
      </div>

      {showTopicModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 20
          }}
          onClick={() => setShowTopicModal(false)}
        >
          <div
            className="glass-card"
            style={{ width: '100%', maxWidth: 420, maxHeight: '70vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>关联选题</h3>
              <button className="btn btn-sm btn-outline" onClick={() => setShowTopicModal(false)}>关闭</button>
            </div>
            {topicsLoading ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center', padding: 20 }}>加载中...</p>
            ) : topics.length === 0 ? (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', textAlign: 'center', padding: 20 }}>
                暂无选题，请先在内容策略中生成选题池
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topics.map((topic) => (
                  <button
                    key={topic.id}
                    className="btn btn-outline"
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                    onClick={() => handleSelectTopic(topic)}
                  >
                    {topic.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
