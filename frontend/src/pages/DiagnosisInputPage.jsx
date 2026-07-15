import { useEffect, useMemo, useRef, useState } from 'react'

import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { BackIcon } from '../components/Icons.jsx'
import { getIpPlan, getPositioningCardFromIpPlan } from '../lib/ipPlanStore.js'
import { checkBias, saveDiagnosisDraft, generateDiagnosisReport } from '../api/diagnosis.js'
import { track, TrackingEvents } from '../lib/tracking.js'

const DRAFT_KEY = 'draft_content'

const FORMAT_OPTIONS = [
  { value: '', label: '请选择内容形式' },
  { value: '口播', label: '口播' },
  { value: 'Vlog', label: 'Vlog' },
  { value: '图文', label: '图文' },
  { value: '直播切片', label: '直播切片' }
]

function getDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {
    // ignore
  }
}

function clearDraft() {
  sessionStorage.removeItem(DRAFT_KEY)
}

function getTopicsFromCache() {
  try {
    const raw = localStorage.getItem('ipcompass_topics')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function getTopicById(topicId) {
  const cached = getTopicsFromCache()
  return cached?.topics?.find((t) => t.id === topicId) || null
}

function validateForm(form) {
  const errors = {}
  if (!form.topic || form.topic.trim() === '') {
    errors.topic = '请输入或选择选题'
  }
  if (!form.format) {
    errors.format = '请选择内容形式'
  }
  const titleLen = Array.from(form.title || '').length
  if (titleLen < 5 || titleLen > 30) {
    errors.title = `标题需 5-30 字，当前 ${titleLen} 字`
  }
  const scriptLen = Array.from(form.script || '').length
  if (scriptLen < 10 || scriptLen > 500) {
    errors.script = `文案需 10-500 字，当前 ${scriptLen} 字`
  }
  return errors
}

export default function DiagnosisInputPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { userId, status: authStatus, initialize } = useAuth()
  const ipPlan = useMemo(() => getIpPlan(), [])
  const positioningCard = useMemo(() => getPositioningCardFromIpPlan(ipPlan), [ipPlan])

  const initialTopicId = searchParams.get('topicId') || ''
  const initialTitle = searchParams.get('title') || ''

  // 诊断页需要用户标识，若未初始化则自动创建匿名用户
  useEffect(() => {
    if (!userId && authStatus !== 'loading') {
      initialize({ createIfMissing: true })
    }
  }, [userId, authStatus, initialize])

  const [form, setForm] = useState(() => {
    const draft = getDraft()
    if (draft) {
      return {
        topicId: draft.topicId || '',
        topic: draft.topic || '',
        targetUser: draft.targetUser || '',
        painPoint: draft.painPoint || '',
        format: draft.format || '',
        title: draft.title || '',
        script: draft.script || '',
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        coverImage: draft.coverImage || null
      }
    }
    return {
      topicId: initialTopicId,
      topic: initialTitle,
      targetUser: '',
      painPoint: '',
      format: '',
      title: '',
      script: '',
      tags: [],
      coverImage: null
    }
  })

  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [biasResult, setBiasResult] = useState(null)
  const [saveHint, setSaveHint] = useState(null)
  const fileInputRef = useRef(null)
  const filledTopicIdRef = useRef('')

  // 从选题池带入选题时，补充目标用户/痛点/内容要点
  useEffect(() => {
    if (!initialTopicId) return
    if (filledTopicIdRef.current === initialTopicId) return
    filledTopicIdRef.current = initialTopicId

    const topic = getTopicById(initialTopicId)
    setForm((prev) => ({
      ...prev,
      topicId: initialTopicId,
      topic: initialTitle || topic?.title || prev.topic,
      painPoint: topic?.painPoints?.[0] || prev.painPoint,
      tags: topic?.painPoints?.slice(0, 2) || prev.tags
    }))
  }, [initialTopicId, initialTitle])

  // 自动保存草稿
  useEffect(() => {
    const timer = setTimeout(() => {
      saveDraft({ ...form, savedAt: new Date().toISOString() })
    }, 800)
    return () => clearTimeout(timer)
  }, [form])

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleClearTopic = () => {
    setForm((prev) => ({ ...prev, topicId: '', topic: '' }))
    setSearchParams({})
  }

  const handleAddTag = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const value = e.target.value.trim()
    if (!value) return
    if (form.tags.includes(value)) return
    if (form.tags.length >= 5) return
    setForm((prev) => ({ ...prev, tags: [...prev.tags, value] }))
    e.target.value = ''
  }

  const handleRemoveTag = (value) => {
    setForm((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== value) }))
  }

  const handleCoverChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setErrors((prev) => ({ ...prev, coverImage: '仅支持 JPG/PNG 格式' }))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, coverImage: '图片大小不超过 5MB' }))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setForm((prev) => ({ ...prev, coverImage: String(reader.result) }))
      setErrors((prev) => ({ ...prev, coverImage: undefined }))
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveCover = () => {
    setForm((prev) => ({ ...prev, coverImage: null }))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleCheckBias = async () => {
    const validationErrors = validateForm(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setChecking(true)
    setBiasResult(null)
    try {
      const result = await checkBias({
        title: form.title,
        script: form.script,
        tags: form.tags,
        positioningCard,
        ipPlan
      })
      setBiasResult(result)
    } catch (err) {
      setErrors((prev) => ({ ...prev, global: err.message || '纠偏检查失败' }))
    } finally {
      setChecking(false)
    }
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const draftId = await saveDiagnosisDraft(userId, form)
      saveDraft({ ...form, draftId, savedAt: new Date().toISOString() })
      setSaveHint('草稿已保存')
      setTimeout(() => setSaveHint(null), 2000)
    } catch (err) {
      setErrors((prev) => ({ ...prev, global: err.message || '保存失败' }))
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    const validationErrors = validateForm(form)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) return

    setSubmitting(true)
    track(TrackingEvents.DIAGNOSIS_SUBMITTED, {
      has_topic: Boolean(form.topicId),
      has_cover: Boolean(form.coverImage),
      format: form.format,
      title_length: Array.from(form.title || '').length,
      script_length: Array.from(form.script || '').length,
      tag_count: form.tags.length
    })
    try {
      const report = await generateDiagnosisReport(userId, form, positioningCard, ipPlan)
      saveDraft({ ...form, reportId: report.reportId, savedAt: new Date().toISOString() })
      navigate(`/diagnosis/report?reportId=${encodeURIComponent(report.reportId)}`)
    } catch (err) {
      setErrors((prev) => ({ ...prev, global: err.message || '提交失败' }))
      setSubmitting(false)
    }
  }

  return (
    <div className="page" style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <div className="top-nav">
        <button className="top-nav__back" onClick={() => navigate('/content-strategy')}>
          <BackIcon size={20} />
          <span>发布前诊断</span>
        </button>
      </div>

      <div className="container" style={{ paddingTop: 80 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>内容信息录入</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            完善内容信息，为诊断报告提供依据
          </p>
        </div>

        {(errors.global || saveHint) && (
          <div
            className="glass-card"
            style={{
              padding: 14,
              marginBottom: 16,
              background: errors.global ? 'rgba(239,68,68,0.08)' : 'rgba(16,185,129,0.08)',
              borderColor: errors.global ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)'
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: errors.global ? '#b91c1c' : '#047857', lineHeight: 1.5 }}>
              {errors.global || saveHint}
            </p>
          </div>
        )}

        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <label className="form-label">关联选题</label>
          {form.topicId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span className="tag-purple">{form.topic}</span>
              <button className="btn btn-sm btn-outline" onClick={handleClearTopic}>
                取消关联
              </button>
            </div>
          ) : (
            <input
              type="text"
              className="form-input"
              value={form.topic}
              onChange={(e) => handleChange('topic', e.target.value)}
              placeholder="手动输入选题，或从选题池点击「开始诊断」带入"
            />
          )}
          {errors.topic && <p className="form-error">{errors.topic}</p>}
        </div>

        <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="form-group">
            <label className="form-label">目标用户</label>
            <input
              type="text"
              className="form-input"
              value={form.targetUser}
              onChange={(e) => handleChange('targetUser', e.target.value)}
              placeholder="这条内容最想吸引谁？"
            />
          </div>

          <div className="form-group">
            <label className="form-label">针对痛点</label>
            <input
              type="text"
              className="form-input"
              value={form.painPoint}
              onChange={(e) => handleChange('painPoint', e.target.value)}
              placeholder="解决用户的什么具体问题？"
            />
          </div>

          <div className="form-group">
            <label className="form-label">内容形式</label>
            <select
              className="form-select"
              value={form.format}
              onChange={(e) => handleChange('format', e.target.value)}
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {errors.format && <p className="form-error">{errors.format}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">标题</label>
            <input
              type="text"
              className="form-input"
              value={form.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="5-30 字，具体且有吸引力"
            />
            <p className="form-hint">{Array.from(form.title).length}/30 字</p>
            {errors.title && <p className="form-error">{errors.title}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">文案/脚本</label>
            <textarea
              className="form-textarea"
              value={form.script}
              onChange={(e) => handleChange('script', e.target.value)}
              placeholder="10-500 字，写出核心观点、案例或行动建议"
              rows={6}
            />
            <p className="form-hint">{Array.from(form.script).length}/500 字</p>
            {errors.script && <p className="form-error">{errors.script}</p>}
          </div>

          <div className="form-group">
            <label className="form-label">话题标签</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {form.tags.map((tag) => (
                <span key={tag} className="tag-purple tag-removable">
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)}>×</button>
                </span>
              ))}
              {form.tags.length < 5 && (
                <input
                  type="text"
                  className="tag-input"
                  placeholder="输入后回车添加"
                  onKeyDown={handleAddTag}
                />
              )}
            </div>
            <p className="form-hint">已添加 {form.tags.length}/5 个，回车添加</p>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">封面图</label>
            {form.coverImage ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={form.coverImage}
                  alt="封面预览"
                  style={{ width: '100%', maxWidth: 240, borderRadius: 'var(--radius-md)', display: 'block' }}
                />
                <button
                  className="btn btn-sm btn-outline"
                  style={{ marginTop: 8 }}
                  onClick={handleRemoveCover}
                >
                  移除封面
                </button>
              </div>
            ) : (
              <>
                <button
                  className="btn btn-outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  上传封面
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  style={{ display: 'none' }}
                  onChange={handleCoverChange}
                />
                <p className="form-hint">支持 JPG/PNG，不超过 5MB</p>
              </>
            )}
            {errors.coverImage && <p className="form-error">{errors.coverImage}</p>}
          </div>
        </div>

        {biasResult && (
          <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>
              {biasResult.hasBias ? '发现潜在问题' : '暂未发现明显问题'}
            </h3>
            {biasResult.rules.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {biasResult.rules.map((rule, idx) => (
                  <div key={idx} style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'rgba(234,179,8,0.08)' }}>
                    <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: '#92400e' }}>{rule.message}</p>
                    <p style={{ margin: 0, fontSize: 13, color: '#92400e', lineHeight: 1.5 }}>{rule.suggestion}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                标题、文案与标签整体匹配，可以继续提交诊断。
              </p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <button
            className="btn btn-purple btn-full"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? '提交中...' : '提交诊断'}
          </button>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1 }}
              onClick={handleCheckBias}
              disabled={checking}
            >
              {checking ? '检查中...' : '检查纠偏'}
            </button>
            <button
              className="btn btn-outline"
              style={{ flex: 1 }}
              onClick={handleSaveDraft}
              disabled={saving}
            >
              {saving ? '保存中...' : '保存草稿'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
