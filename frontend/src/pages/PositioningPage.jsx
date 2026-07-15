import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  loadStage1,
  saveStage1,
  loadStage2Messages,
  saveStage2Messages,
  clearIpPlanProgress,
  clearIpPlanData,
  setIpPlanCompleted,
  isIpPlanCompleted,
  saveIpPlanSummary
} from '../lib/ipPlanStore.js'
import { saveIpPlanToDB, getIpPlanFromDB, deleteIpPlanFromDB } from '../lib/ipPlanDb.js'
import { chatIpPlan, generateIpPlan } from '../api/ipPlan.js'
import { confirmPositioning, updatePositioningCard } from '../api/positioning.js'
import { BackIcon, SendIcon, CompassLogo } from '../components/Icons.jsx'
import { track, TrackingEvents } from '../lib/tracking.js'

const STAGE1_CONFIG = [
  {
    step: 1,
    question: '你希望这个账号最核心的出发点是？',
    subtitle: '动机决定账号长期方向，我们将为你定制专属方案',
    key: 'q1',
    options: [
      { value: 'record_life', label: '记录生活' },
      { value: 'personal_brand', label: '建立个人品牌' },
      { value: 'get_clients', label: '获得客户' },
      { value: 'portfolio', label: '求职作品集' },
      { value: 'find_peers', label: '寻找同频' }
    ]
  },
  {
    step: 2,
    question: '选出你拥有的素材类型',
    subtitle: '不止视频和照片，你的一切经历都是素材',
    key: 'q2',
    options: [
      { value: 'photo', label: '照片' },
      { value: 'work_experience', label: '工作经历' },
      { value: 'skill', label: '技能' },
      { value: 'travel', label: '旅行' },
      { value: 'friends', label: '朋友群像' },
      { value: 'handmade', label: '手作' },
      { value: 'dance', label: '舞蹈' },
      { value: 'sing', label: '唱歌' },
      { value: 'photography', label: '摄影' },
      { value: 'photoshoot', label: '约拍' },
      { value: 'startup', label: '摆摊/创业' },
      { value: 'other', label: '其他' }
    ]
  },
  {
    step: 3,
    question: '你最想连接哪类用户？',
    subtitle: '越具体，AI 越能为你匹配精准的连接策略',
    key: 'q3',
    options: [
      { value: 'hobby_community', label: '同好社区', emoji: '🌸', desc: '和我有相同热爱的人' },
      { value: 'target_customers', label: '目标客户', emoji: '🎯', desc: '可能为我付费的人' },
      { value: 'career_network', label: '职场人脉', emoji: '🏢', desc: '同行、前辈、潜在合作者' },
      { value: 'general_interest', label: '泛兴趣用户', emoji: '🌍', desc: '对生活方式感兴趣的普通人' }
    ]
  }
]

function StepHeader({ title, currentStep, totalSteps = 3 }) {
  return (
    <div style={{ padding: '24px 0 20px' }}>
      <div
        style={{
          fontSize: 12,
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom: 8
        }}
      >
        问题 {currentStep}/{totalSteps}
      </div>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>{title}</h1>
      <div
        style={{
          marginTop: 18,
          height: 4,
          borderRadius: 2,
          background: 'rgba(139,92,246,0.12)',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            width: `${(currentStep / totalSteps) * 100}%`,
            height: '100%',
            background: 'var(--color-purple)',
            transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
          }}
        />
      </div>
    </div>
  )
}

function TypewriterText({ text, speed = 28, onDone }) {
  const [display, setDisplay] = useState('')
  const indexRef = useRef(0)
  const doneRef = useRef(false)

  useEffect(() => {
    setDisplay('')
    indexRef.current = 0
    doneRef.current = false
    if (!text) {
      onDone?.()
      return
    }
    const chars = Array.from(text)
    const id = setInterval(() => {
      if (indexRef.current >= chars.length) {
        clearInterval(id)
        if (!doneRef.current) {
          doneRef.current = true
          onDone?.()
        }
        return
      }
      indexRef.current += 1
      setDisplay(chars.slice(0, indexRef.current).join(''))
    }, speed)
    return () => clearInterval(id)
  }, [text, speed, onDone])

  return <span>{display}</span>
}

function StepDots({ current, onJump }) {
  return (
    <div className="step-dots fade-up">
      {[1, 2, 3].map((s) => {
        const isCurrent = s === current
        const isDone = s < current
        const clickable = isDone && onJump
        return (
          <button
            key={s}
            type="button"
            className={`step-dot ${isCurrent ? 'step-dot--active' : ''} ${clickable ? 'step-dot--clickable' : ''}`}
            onClick={clickable ? () => onJump(s) : undefined}
            aria-label={isCurrent ? '当前步骤' : clickable ? `返回第${s}步` : '未完成步骤'}
            disabled={!clickable && !isCurrent}
          />
        )
      })}
      <span className="step-dots__label">AI深入</span>
    </div>
  )
}

function Stage1Step() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const stepIndex = (state?.step ?? 1) - 1
  const config = STAGE1_CONFIG[stepIndex]
  const [stage1, setStage1] = useState(() => loadStage1() || {})

  useEffect(() => {
    if (!config) {
      navigate('/positioning')
    }
  }, [config, navigate])

  useEffect(() => {
    if (config?.step === 1) {
      track(TrackingEvents.POSITIONING_START, {
        entry: 'welcome'
      })
    }
  }, [config?.step])

  if (!config) return null

  const updateStage1 = (patch) => {
    const next = { ...stage1, ...patch }
    setStage1(next)
    saveStage1(next)
  }

  const goNext = () => {
    if (config.step < 3) {
      navigate('/positioning/stage1', { state: { step: config.step + 1 } })
    } else {
      const q2Array = Array.isArray(stage1.q2) ? stage1.q2 : []
      track(TrackingEvents.POSITIONING_STAGE1_COMPLETE, {
        q1_answer: stage1.q1 || '',
        q2_tags_count: q2Array.length,
        q3_answer: stage1.q3 || '',
        skip_count: [stage1.q1, q2Array.length > 0, stage1.q3].filter(Boolean).length < 3 ? 1 : 0
      })
      navigate('/positioning/stage2')
    }
  }

  const goPrev = () => {
    if (config.step > 1) {
      navigate('/positioning/stage1', { state: { step: config.step - 1 } })
    } else {
      navigate(-1)
    }
  }

  const jumpToStep = (step) => {
    navigate('/positioning/stage1', { state: { step } })
  }

  return (
    <div className="page" style={{ minHeight: '100vh' }}>
      {config.step === 1 ? (
        <MotivationPage
          title={config.question}
          subtitle={config.subtitle}
          value={stage1.q1 || ''}
          onChange={(q1) => updateStage1({ q1 })}
          onNext={goNext}
          onJump={jumpToStep}
        />
      ) : config.step === 2 ? (
        <>
          <button
            type="button"
            className="floating-prev-btn"
            onClick={goPrev}
            aria-label="返回上一题"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <AssetsPage
            title={config.question}
            subtitle={config.subtitle}
            value={Array.isArray(stage1.q2) ? stage1.q2 : []}
            onChange={(q2) => updateStage1({ q2 })}
            onNext={goNext}
            onJump={jumpToStep}
          />
        </>
      ) : (
        <>
          <button
            type="button"
            className="floating-prev-btn"
            onClick={goPrev}
            aria-label="返回上一题"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <AudiencePage
            title={config.question}
            subtitle={config.subtitle}
            value={stage1.q3 || ''}
            onChange={(q3) => updateStage1({ q3 })}
            onNext={goNext}
            onJump={jumpToStep}
          />
        </>
      )}
    </div>
  )
}

const Q1_ICONS = {
  record_life: (<><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>),
  personal_brand: (<path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />),
  get_clients: (<><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></>),
  portfolio: (<><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /></>),
  find_peers: (<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>)
}

function MotivationPage({ title, subtitle, value, onChange, onNext, onJump }) {
  const [selected, setSelected] = useState(value)
  const config = STAGE1_CONFIG[0]

  const handleSelect = (v) => {
    setSelected(v)
    onChange(v)
  }

  const handleNext = () => {
    setTimeout(onNext, 350)
  }

  return (
    <section className="motivation-section">
      <div className="motivation-section__inner">
        <p className="motivation-step-label fade-up">STEP 01 / 03</p>
        <StepDots current={1} onJump={onJump} />
        <h1 className="motivation-title fade-up">{title}</h1>
        <p className="motivation-subtitle fade-up">{subtitle}</p>

        <div className="motivation-card-row">
          {config.options.map((opt, idx) => {
            const isSelected = selected === opt.value
            return (
              <button
                key={opt.value}
                className={`type-card fade-up fade-up-${idx + 1} ${isSelected ? 'selected' : ''}`}
                onClick={() => handleSelect(opt.value)}
              >
                <span className="check-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="card-icon-wrap">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {Q1_ICONS[opt.value]}
                  </svg>
                </span>
                <span className="card-label">{opt.label}</span>
              </button>
            )
          })}
        </div>

        <div className="motivation-cta fade-up">
          <button className="motivation-cta-btn" onClick={handleNext} disabled={!selected}>
            下一步
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}

const Q2_ICONS = {
  photo: (<><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></>),
  work_experience: (<><rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>),
  skill: (<><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></>),
  travel: (<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />),
  friends: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  handmade: (<><path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" /><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 1-3.72-2-4.04z" /></>),
  dance: (<><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>),
  sing: (<><path d="m12 1-8 4v16l8-4 8 4V5Z" /><path d="m8 20-2 2" /><path d="m16 20 2 2" /></>),
  photography: (<><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><circle cx="12" cy="13" r="3" /></>),
  photoshoot: (<><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>),
  startup: (<path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7 M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8 M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4 M2 7h20 M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7" />),
  other: (<><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /><path d="M5 3v4" /><path d="M19 17v4" /><path d="M3 5h4" /><path d="M17 19h4" /></>)
}

function AssetsPage({ title, subtitle, value, onChange, onNext, onJump }) {
  const config = STAGE1_CONFIG[1]
  const validValues = config.options.map((o) => o.value)
  const isCustom = (v) => v.startsWith('custom::')
  const getLabel = (v) => (isCustom(v) ? v.slice(8) : (config.options.find((o) => o.value === v)?.label || v))
  const getIcon = (v) => (isCustom(v) ? Q2_ICONS.other : Q2_ICONS[v])
  const [selected, setSelected] = useState(() => (Array.isArray(value) ? value : []).filter((v) => validValues.includes(v) || isCustom(v)))
  const [flyingId, setFlyingId] = useState(null)
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)
  const canvasRef = useRef(null)

  const toggle = (v) => {
    setSelected(selected.filter((s) => s !== v))
  }

  const togglePreset = (v) => {
    const exists = selected.includes(v)
    if (exists) {
      setSelected(selected.filter((s) => s !== v))
      return
    }
    if (selected.length >= 8) return
    setFlyingId(v)
    setSelected([...selected, v])
    setTimeout(() => setFlyingId(null), 700)
  }

  const addCustom = () => {
    const text = customInput.trim()
    if (!text) return
    const customValue = `custom::${text}`
    if (selected.includes(customValue)) {
      setCustomInput('')
      setShowCustomInput(false)
      return
    }
    if (selected.length >= 8) return
    setSelected([...selected, customValue])
    setCustomInput('')
    setShowCustomInput(false)
  }

  const handleNext = () => {
    onChange(selected)
    setTimeout(onNext, 250)
  }

  return (
    <section className="motivation-section">
      <div className="motivation-section__inner">
        <p className="motivation-step-label fade-up">STEP 02 / 03</p>
        <StepDots current={2} onJump={onJump} />
        <h1 className="motivation-title fade-up">{title}</h1>
        <p className="motivation-subtitle fade-up">{subtitle}</p>

        {selected.length > 0 && (
          <div className="stage1-assets__canvas" ref={canvasRef}>
            <div className="stage1-assets__canvas-inner">
              {selected.map((v) => (
                <span
                  key={v}
                  className="stage1-assets__chip anim-pop"
                  onClick={() => toggle(v)}
                  title="点击移除"
                >
                  <span className="stage1-assets__chip-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {getIcon(v)}
                    </svg>
                  </span>
                  <span>{getLabel(v)}</span>
                  <span className="stage1-assets__chip-close">×</span>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="motivation-card-row motivation-card-row--wrap">
          {config.options.map((opt, idx) => {
            if (opt.value === 'other') {
              if (showCustomInput) {
                return (
                  <input
                    key="custom-input"
                    className="material-card material-card--input fade-up fade-up-12"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); addCustom() }
                      else if (e.key === 'Escape') { setShowCustomInput(false); setCustomInput('') }
                    }}
                    placeholder="输入后回车"
                    maxLength={20}
                    autoFocus
                    onBlur={() => { if (!customInput.trim()) { setShowCustomInput(false); setCustomInput('') } }}
                  />
                )
              }
              return (
                <button
                  key={opt.value}
                  className={`material-card fade-up fade-up-${idx + 1}`}
                  onClick={() => setShowCustomInput(true)}
                >
                  <span className="check-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                  <span className="card-icon-wrap">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {Q2_ICONS.other}
                    </svg>
                  </span>
                  <span className="card-label">{opt.label}</span>
                </button>
              )
            }
            const isSelected = selected.includes(opt.value)
            const isFlying = flyingId === opt.value
            const shouldRender = !isSelected || isFlying
            if (!shouldRender) return null
            return (
              <button
                key={opt.value}
                className={`material-card fade-up fade-up-${idx + 1} ${isFlying ? 'material-card--flying' : ''}`}
                onClick={() => togglePreset(opt.value)}
              >
                <span className="check-badge">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="card-icon-wrap">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {Q2_ICONS[opt.value]}
                  </svg>
                </span>
                <span className="card-label">{opt.label}</span>
              </button>
            )
          })}
        </div>

        <p className="material-counter fade-up">已选 {selected.length} 项</p>

        <div className="motivation-cta fade-up">
          <button className="motivation-cta-btn" onClick={handleNext} disabled={selected.length === 0}>
            下一步
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}

function AudiencePage({ title, subtitle, value, onChange, onNext, onJump }) {
  const [text, setText] = useState(value || '')
  const textareaRef = useRef(null)

  const autoResize = (el) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    if (textareaRef.current) autoResize(textareaRef.current)
  }, [text])

  const handleNext = () => {
    onChange(text.trim())
    setTimeout(onNext, 250)
  }

  const canSubmit = text.trim().length >= 5

  return (
    <section className="motivation-section">
      <div className="motivation-section__inner">
        <p className="motivation-step-label fade-up">STEP 03 / 03</p>
        <StepDots current={3} onJump={onJump} />
        <h1 className="motivation-title fade-up">{title}</h1>
        <p className="motivation-subtitle fade-up">{subtitle}</p>

        <div className="stage1-audience__free-input fade-up">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="比如：25-35 岁、在一线城市打拼、想要转行但缺乏方向的女性。她们不是缺信息，而是缺一个真实走过弯路的人帮她们减少试错成本。"
            className="audience-textarea"
            rows={3}
            autoFocus
          />
          <p className="audience-counter">{text.trim().length} 字</p>
        </div>

        <div className="motivation-cta fade-up">
          <button className="motivation-cta-btn" onClick={handleNext} disabled={!canSubmit}>
            进入 AI 对话
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}

function Stage2Step() {
  const navigate = useNavigate()
  const { userId, status: authStatus, initialize } = useAuth()
  const [stage1, setStage1] = useState(() => loadStage1())
  const [messages, setMessages] = useState(() => loadStage2Messages())
  const [input, setInput] = useState('')
  const [typingDone, setTypingDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!userId && authStatus !== 'loading') {
      initialize({ createIfMissing: true })
    }
  }, [userId, authStatus, initialize])

  useEffect(() => {
    if (!stage1) {
      navigate('/positioning')
      return
    }
    saveStage1(stage1)
  }, [stage1, navigate])

  useEffect(() => {
    saveStage2Messages(messages)
  }, [messages])

  // 初始化开场白与第一个问题
  useEffect(() => {
    if (messages.length > 0) return

    const opening = buildStage2Opening(stage1)
    async function init() {
      setLoading(true)
      try {
        const result = await chatIpPlan(userId, stage1, [])
        const initialMessages = [
          { role: 'assistant', content: opening },
          { role: 'assistant', content: result.question, hint: result.hint }
        ]
        setMessages(initialMessages)
        setTypingDone(false)
      } catch (err) {
        setError(err.message || '对话初始化失败')
      } finally {
        setLoading(false)
      }
    }
    if (userId) init()
  }, [stage1, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const isComplete = useMemo(() => {
    if (messages.length === 0) return false
    const last = messages[messages.length - 1]
    return last.role === 'assistant' && last.done === true
  }, [messages])

  const stage2TrackedRef = useRef(false)
  useEffect(() => {
    if (isComplete && !stage2TrackedRef.current) {
      stage2TrackedRef.current = true
      track(TrackingEvents.POSITIONING_STAGE2_COMPLETE, {
        chat_rounds: messages.filter((m) => m.role === 'assistant' && m.content).length,
        total_messages: messages.length,
        is_forced_complete: false
      })
    }
  }, [isComplete, messages])

  const canSend = input.trim().length > 0 && !loading && !generating && typingDone

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (typingDone && !isComplete && !generating) {
      inputRef.current?.focus()
    }
  }, [typingDone, isComplete, generating])

  const handleTypingDone = () => {
    setTypingDone(true)
  }

  const handleSend = async () => {
    if (!canSend) return
    const text = input.trim()
    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setTypingDone(false)
    setLoading(true)

    try {
      const result = await chatIpPlan(userId, stage1, nextMessages)
      const withReply = [...nextMessages, { role: 'assistant', content: result.question, hint: result.hint, done: result.done }]
      setMessages(withReply)
      setTypingDone(false)
    } catch (err) {
      setError(err.message || '发送失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!userId) return
    setGenerating(true)
    setError(null)
    const startTime = Date.now()
    try {
      const { ipPlan, source } = await generateIpPlan(userId, stage1, messages)
      await saveIpPlanToDB(userId, ipPlan, false)
      localStorage.setItem('ipcompass_ip_plan', JSON.stringify(ipPlan))
      localStorage.setItem('ipcompass_ip_plan_source', source)
      saveIpPlanSummary({ summary: ipPlan.summary, tag: ipPlan.positioning?.tag, oneLine: ipPlan.positioning?.oneLine })
      track(TrackingEvents.POSITIONING_CARD_GENERATED, {
        generation_duration: Date.now() - startTime,
        field_count: Object.keys(ipPlan.positioning || {}).length,
        is_degraded: source === 'fallback'
      })
      clearIpPlanProgress()
      setIpPlanCompleted(true)
      navigate('/positioning/card')
    } catch (err) {
      setError(err.message || 'IP 方案生成失败，请重试')
      setGenerating(false)
    }
  }

  const handleSkip = async () => {
    if (!userId) return
    setGenerating(true)
    setError(null)
    try {
      const { ipPlan, source } = await generateIpPlan(userId, stage1, [])
      await saveIpPlanToDB(userId, ipPlan, false)
      localStorage.setItem('ipcompass_ip_plan', JSON.stringify(ipPlan))
      localStorage.setItem('ipcompass_ip_plan_source', source)
      saveIpPlanSummary({ summary: ipPlan.summary, tag: ipPlan.positioning?.tag, oneLine: ipPlan.positioning?.oneLine })
      track(TrackingEvents.POSITIONING_CARD_GENERATED, {
        generation_duration: 0,
        field_count: Object.keys(ipPlan.positioning || {}).length,
        is_degraded: source === 'fallback',
        skipped: true
      })
      clearIpPlanProgress()
      setIpPlanCompleted(true)
      navigate('/positioning/card')
    } catch (err) {
      setError(err.message || '生成预设模板失败，请重试')
      setGenerating(false)
    }
  }

  if (!stage1) {
    return (
      <div className="page">
        <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <p>数据异常，请重新开始诊断</p>
          <button className="btn btn-purple" onClick={() => { clearIpPlanProgress(); navigate('/home') }}>
            返回首页
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page chat-page">
      <button
        type="button"
        className="floating-prev-btn"
        onClick={() => navigate('/positioning/stage1', { state: { step: 3 } })}
        aria-label="返回上一题"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>

      <div className="chat-body">
        <div className="chat-messages">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user'
            const isLastAi = msg.role === 'assistant' && idx === messages.length - 1 && msg.content
            const showHint = msg.role === 'assistant' && msg.hint && idx === messages.length - 1 && typingDone && !isComplete
            return (
              <div key={idx} className={`chat-message ${isUser ? 'chat-message--user' : ''}`}>
                <div className="chat-message__avatar">
                  {isUser ? (
                    <div className="chat-avatar chat-avatar--user" />
                  ) : (
                    <div className="chat-avatar chat-avatar--ai"><CompassLogo size={14} /></div>
                  )}
                </div>
                <div className="chat-message__bubble">
                  {isUser ? (
                    <p>{msg.content}</p>
                  ) : (
                    <>
                      <p>
                        {isLastAi && !typingDone ? (
                          <>
                            <TypewriterText text={msg.content} onDone={handleTypingDone} />
                            <span className="chat-cursor" />
                          </>
                        ) : (
                          msg.content || '感谢你的回答，我已经足够了解你了。'
                        )}
                      </p>
                      {showHint && (
                        <p className="chat-message__hint">💡 {msg.hint}</p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
          {loading && (
            <div className="chat-message">
              <div className="chat-message__avatar">
                <div className="chat-avatar chat-avatar--ai"><CompassLogo size={14} /></div>
              </div>
              <div className="chat-message__bubble chat-message__bubble--typing">
                <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {error && (
          <div className="container" style={{ paddingBottom: 0 }}>
            <div className="glass-card" style={{ padding: 16, marginTop: 16, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{error}</p>
            </div>
          </div>
        )}
      </div>

      <div className="chat-footer">
        {!isComplete && (
          <button
            type="button"
            className="chat-skip-bubble"
            onClick={handleSkip}
          >
            点击可跳过定制化，仅展示预设模板
          </button>
        )}
        {isComplete ? (
          <button
            className="btn btn-dark btn-full"
            onClick={handleGenerate}
            disabled={generating || !userId}
            style={{ height: 48 }}
          >
            {generating ? '生成 IP 方案中…' : !userId ? '初始化用户中…' : '生成我的个人 IP 方案'}
          </button>
        ) : (
          <div className="chat-inputbar">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={typingDone ? '输入你的回答…' : 'AI 正在输入…'}
              disabled={!typingDone || loading || generating}
              className="chat-input"
            />
            <button className="chat-send" onClick={handleSend} disabled={!canSend}>
              <SendIcon size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function buildStage2Opening(stage1) {
  const purposeMap = {
    record_life: '记录生活',
    personal_brand: '建立个人品牌',
    get_clients: '获得客户',
    portfolio: '求职作品集',
    find_peers: '寻找同频'
  }
  const audienceMap = {
    hobby_community: '同好社区',
    target_customers: '目标客户',
    career_network: '职场人脉',
    general_interest: '泛兴趣用户'
  }
  const purpose = purposeMap[stage1.q1] || stage1.q1
  const audience = audienceMap[stage1.q3] || stage1.q3
  const q2Arr = Array.isArray(stage1.q2) ? stage1.q2 : (stage1.q2 ? [stage1.q2] : [])
  const assets = q2Arr.map((v) => {
    if (v.startsWith('custom::')) return v.slice(8)
    const opt = STAGE1_CONFIG[1].options.find((o) => o.value === v)
    return opt ? opt.label : v
  }).join('、')
  return `你好，我是你的 IP 诊断顾问。你已经告诉我：你想通过内容${purpose}，连接${audience}，拥有${assets}等素材。接下来我想深入聊几个关键问题，帮你把个人 IP 方案打磨得更精准。`
}

function createEmptyIpPlan() {
  return normalizeIpPlanForUI({
    summary: '',
    positioning: {
      tag: '',
      oneLine: '',
      values: [],
      personaKeywords: [],
      personaDetail: { keywords: [], description: '' },
      profileDesign: '',
      topPosts: [
        { title: '', direction: '' },
        { title: '', direction: '' },
        { title: '', direction: '' }
      ],
      topPostSelection: '',
      audience: { categories: [], painPoints: [], details: [] }
    },
    userProfile: {
      core: { ageRange: '', portrait: '', painPoints: [], needs: [], contentDirection: '' },
      diffusion: { ageRange: '', portrait: '', painPoints: [], needs: [], contentDirection: '' },
      potential: { ageRange: '', portrait: '', painPoints: [], needs: [], contentDirection: '' }
    },
    contentMatrix: { mainLines: [], templates: [], topicFormulas: [], assetTransform: [] },
    style: {
      visual: { keywords: [], suitable: [], unsuitable: [], advice: '' },
      copywriting: { keywords: [], suitable: [], unsuitable: [], advice: '' }
    },
    topTopics: []
  })
}

function PositioningResult() {
  const navigate = useNavigate()
  const { userId, status: authStatus, initialize } = useAuth()
  const [ipPlan, setIpPlan] = useState(null)
  const [draft, setDraft] = useState(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [errors, setErrors] = useState([])
  const [chatCompleted, setChatCompleted] = useState(false)
  const [showRestartConfirm, setShowRestartConfirm] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState(null)

  useEffect(() => {
    if (!userId && authStatus !== 'loading') {
      initialize({ createIfMissing: true })
    }
  }, [userId, authStatus, initialize])

  useEffect(() => {
    if (!userId) return
    async function load() {
      try {
        const completed = isIpPlanCompleted()
        setChatCompleted(completed)
        let record = await getIpPlanFromDB(userId)
        if (!record) {
          const raw = localStorage.getItem('ipcompass_ip_plan')
          if (raw) {
            record = { ipPlan: JSON.parse(raw), isConfirmed: completed }
          }
        }
        let plan = null
        if (record?.ipPlan) {
          plan = normalizeIpPlanForUI(record.ipPlan)
        } else if (!completed) {
          plan = createEmptyIpPlan()
        }
        if (plan) {
          setIpPlan(plan)
          setDraft(JSON.parse(JSON.stringify(plan)))
          if (!completed) setEditing(true)
        }
      } catch (err) {
        console.error('加载 IP 方案失败:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userId])

  useEffect(() => {
    const hasUnsaved = editing && draft && JSON.stringify(draft) !== JSON.stringify(ipPlan)
    const handleBeforeUnload = (e) => {
      if (hasUnsaved) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [editing, draft, ipPlan])

  if (loading) {
    return (
      <div className="page" style={{ minHeight: '100vh' }}>
        <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <div className="spinner" />
          <p style={{ marginTop: 16, color: 'var(--color-text-secondary)' }}>加载中…</p>
        </div>
      </div>
    )
  }

  if (!ipPlan || !draft) {
    return (
      <div className="page">
        <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <p>IP 方案数据丢失，请重新诊断</p>
          <button
            className="btn btn-purple"
            onClick={() => {
              clearIpPlanData()
              navigate('/positioning/stage1', { state: { step: 1 }, replace: true })
            }}
          >
            重新开始
          </button>
        </div>
      </div>
    )
  }

  const hasUnsaved = editing && JSON.stringify(draft) !== JSON.stringify(ipPlan)

  const handleStartEdit = () => {
    setDraft(JSON.parse(JSON.stringify(ipPlan)))
    setEditing(true)
    setErrors([])
  }

  const handleCancelEdit = () => {
    if (hasUnsaved) {
      setShowLeaveConfirm(true)
      return
    }
    setEditing(false)
    setDraft(JSON.parse(JSON.stringify(ipPlan)))
    setErrors([])
  }

  const handleSave = async () => {
    const validationErrors = validateIpPlan(draft)
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }
    setSaving(true)
    try {
      const planToSave = denormalizeIpPlanForAPI(draft)
      await updatePositioningCard(userId, planToSave)
      localStorage.setItem('ipcompass_ip_plan', JSON.stringify(planToSave))
      await saveIpPlanToDB(userId, planToSave, false)
      saveIpPlanSummary({ summary: planToSave.summary, tag: planToSave.positioning?.tag, oneLine: planToSave.positioning?.oneLine })
      setIpPlan(draft)
      setEditing(false)
      setErrors([])
    } catch (err) {
      setErrors([err.message || '保存失败，请重试'])
    } finally {
      setSaving(false)
    }
  }

  const handleSaveDraft = async () => {
    setSaving(true)
    try {
      const planToSave = denormalizeIpPlanForAPI(draft)
      localStorage.setItem('ipcompass_ip_plan', JSON.stringify(planToSave))
      await saveIpPlanToDB(userId, planToSave, false)
      saveIpPlanSummary({ summary: planToSave.summary, tag: planToSave.positioning?.tag, oneLine: planToSave.positioning?.oneLine })
      setIpPlan(JSON.parse(JSON.stringify(draft)))
      setEditing(false)
      setErrors([])
    } catch (err) {
      setErrors([err.message || '保存草稿失败，请重试'])
    } finally {
      setSaving(false)
    }
  }

  const handleConfirm = async () => {
    const validationErrors = validateIpPlan(draft)
    if (validationErrors.length > 0) {
      setErrors(validationErrors)
      return
    }
    setConfirming(true)
    try {
      const planToSave = denormalizeIpPlanForAPI(draft)
      await confirmPositioning(userId, planToSave)
      setIpPlanCompleted(true)
      localStorage.setItem('ipcompass_ip_plan', JSON.stringify(planToSave))
      localStorage.removeItem('ipcompass_ip_plan_source')
      await saveIpPlanToDB(userId, planToSave, true)
      saveIpPlanSummary({ summary: planToSave.summary, tag: planToSave.positioning?.tag, oneLine: planToSave.positioning?.oneLine })
      track(TrackingEvents.POSITIONING_CARD_CONFIRMED, {
        edit_count: 0,
        edited_fields: [],
        duration_from_generate: 0
      })
      navigate('/home')
    } catch (err) {
      setErrors([err.message || '确认定位失败，请重试'])
    } finally {
      setConfirming(false)
    }
  }

  const handleRestart = () => {
    track(TrackingEvents.POSITIONING_CARD_REJECTED, {
      edit_count: 0,
      duration: 0
    })
    setShowRestartConfirm(true)
  }

  const doRestart = async () => {
    clearIpPlanData()
    await deleteIpPlanFromDB(userId)
    navigate('/positioning')
  }

  const handleBack = () => {
    if (hasUnsaved) {
      setPendingNavigation('/home')
      setShowLeaveConfirm(true)
      return
    }
    navigate('/home')
  }

  const confirmLeave = () => {
    setShowLeaveConfirm(false)
    setEditing(false)
    setDraft(JSON.parse(JSON.stringify(ipPlan)))
    setErrors([])
    if (pendingNavigation) {
      navigate(pendingNavigation)
      setPendingNavigation(null)
    }
  }

  return (
    <div className="report-page">
      <div className="report-page__bg">
        <div className="report-page__bg-glow" />
      </div>

      <div className="report-card">
        {!chatCompleted && (
          <div className="glass-card" style={{ padding: 14, marginBottom: 24, background: 'var(--color-purple-light)', borderColor: 'var(--color-purple-border)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--color-purple)', fontSize: 13, fontWeight: 500 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            请先完成聊天诊断定制你的专属IP方案
          </div>
        )}

        {errors.length > 0 && (
          <div className="glass-card" style={{ padding: 16, marginBottom: 24, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#b91c1c', fontWeight: 600 }}>请修正以下内容：</p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#b91c1c', lineHeight: 1.7 }}>
              {errors.map((err, idx) => <li key={idx}>{err}</li>)}
            </ul>
          </div>
        )}

        <div className="report-hero">
          <div className="report-hero__tag">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" opacity="0.6" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            账号定位方案
          </div>
          <h1 className="report-hero__name">{ipPlan.positioning.tag.replace(/^#/, '')}</h1>
        </div>

        <PositioningTab plan={ipPlan} draft={draft} editing={editing} setDraft={setDraft} />

        <div className="report-actions">
          <div className="report-actions__row">
            <button className="report-actions__secondary" onClick={() => navigate('/content-strategy')}>
              查看内容策略
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>

          <div className="report-actions__row">
            {editing ? (
              <>
                {!chatCompleted ? (
                  <button className="report-actions__secondary" onClick={() => navigate('/positioning')}>
                    去聊天诊断
                  </button>
                ) : (
                  <button className="report-actions__secondary" onClick={handleCancelEdit} disabled={saving}>
                    取消
                  </button>
                )}
                <button className="btn btn-purple" onClick={chatCompleted ? handleSave : handleSaveDraft} disabled={saving}>
                  {saving ? '保存中…' : chatCompleted ? '保存修改' : '保存草稿'}
                </button>
              </>
            ) : (
              <>
                {!chatCompleted && (
                  <button className="report-actions__secondary" onClick={() => navigate('/positioning')}>
                    去聊天诊断
                  </button>
                )}
                {chatCompleted && (
                  <button className="report-actions__secondary" onClick={handleRestart}>
                    重新诊断
                  </button>
                )}
                <button className="report-actions__secondary" onClick={handleStartEdit}>
                  编辑方案
                </button>
                {chatCompleted && (
                  <button className="btn btn-purple" onClick={handleConfirm} disabled={confirming}>
                    {confirming ? '确认中…' : '确认方案'}
                  </button>
                )}
              </>
            )}
          </div>

          <div className="report-actions__links">
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/diagnosis/input') }}>发布前顾问 →</a>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/data/input') }}>数据复盘 →</a>
          </div>
        </div>
      </div>

      {showLeaveConfirm && (
        <Modal
          title="未保存的修改"
          message="你还有未保存的修改，离开将放弃这些更改。"
          confirmText="放弃修改"
          cancelText="继续编辑"
          onConfirm={confirmLeave}
          onCancel={() => { setShowLeaveConfirm(false); setPendingNavigation(null) }}
        />
      )}

      {showRestartConfirm && (
        <Modal
          title="重新诊断"
          message="重新诊断会清除当前 IP 方案，确认继续吗？"
          confirmText="确认重新诊断"
          cancelText="取消"
          onConfirm={() => { setShowRestartConfirm(false); doRestart() }}
          onCancel={() => setShowRestartConfirm(false)}
          danger
        />
      )}
    </div>
  )
}

function PositioningTab({ plan, draft, editing, setDraft }) {
  const update = (path, value) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      let cur = next
      const keys = path.split('.')
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]]
      cur[keys[keys.length - 1]] = value
      return next
    })
  }

  const updateTopPost = (idx, field, value) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      next.positioning.topPosts[idx][field] = value
      return next
    })
  }

  const updateLayer = (layer, field, value) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      next.userProfile[layer][field] = value
      return next
    })
  }

  const Section = ({ title, children }) => (
    <div className="report-section">
      <div className="report-section__head">
        <span className="report-section__accent" />
        <span className="report-section__title">{title}</span>
      </div>
      <div className="report-section__body">{children}</div>
    </div>
  )

  const bioLines = (editing ? draft : plan).positioning.profileDesign.split('\n').filter(Boolean)

  return (
    <>
      <Section title="你的专属账号定位">
        {editing ? (
          <>
            <div className="report-edit-field">
              <label>专属标签</label>
              <input value={draft.positioning.tag} onChange={(e) => update('positioning.tag', e.target.value)} />
            </div>
            <div className="report-edit-field">
              <label>一句话定位</label>
              <input value={draft.positioning.oneLine} onChange={(e) => update('positioning.oneLine', e.target.value)} />
            </div>

          </>
        ) : (
          <>
            <div className="report-pill-row" style={{ marginBottom: 12 }}>
              <span className="report-pill report-pill--sm">{plan.positioning.tag}</span>
            </div>
            <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-text)', lineHeight: 1.5, margin: 0 }}>{plan.positioning.oneLine}</p>
          </>
        )}
      </Section>

      <Section title="你的人设关键词">
        {editing ? (
          <TagEditor items={draft.positioning.personaKeywords} onChange={(items) => update('positioning.personaKeywords', items)} max={8} />
        ) : (
          <>
            <div className="report-pill-row">
              {plan.positioning.personaKeywords.map((k) => (
                <span key={k} className="report-pill">{k}</span>
              ))}
            </div>
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.7 }}>
              {plan.positioning.personaDetail.description || '从文案风格与经历中提取的人设关键词。'}
            </p>
          </>
        )}
      </Section>

      <Section title="账号提供的价值">
        {editing ? (
          <ListEditor items={draft.positioning.values} onChange={(items) => update('positioning.values', items)} max={6} placeholder="价值点" />
        ) : (
          <div className="report-value-grid">
            {plan.positioning.values.map((v, i) => (
              <div className="report-value-pair" key={i}>
                <div className="report-value-item">
                  <div className="report-value-item__text">{v}</div>
                </div>
                {i < plan.positioning.values.length - 1 && <span className="report-value-plus">+</span>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="主页设计">
        {editing ? (
          <div className="report-profile" style={{ gridTemplateColumns: '1fr' }}>
            <div className="report-edit-field">
              <label>简介设计</label>
              <textarea rows={4} value={draft.positioning.profileDesign} onChange={(e) => update('positioning.profileDesign', e.target.value)} />
            </div>
            {draft.positioning.topPosts.map((post, idx) => (
              <div key={idx} className="report-edit-field">
                <label>置顶 {idx + 1}</label>
                <input value={post.title} onChange={(e) => updateTopPost(idx, 'title', e.target.value)} />
                <input style={{ marginTop: 8 }} value={post.direction} onChange={(e) => updateTopPost(idx, 'direction', e.target.value)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="report-profile">
            <div>
              <div className="report-profile__label">简介</div>
              <div className="report-profile__bio">
                {bioLines.map((line, i) => <p key={i}>{line}</p>)}
                <span className="report-pill report-pill--sm report-pill--ghost" style={{ marginTop: 8 }}>{plan.positioning.tag}</span>
              </div>
            </div>
            <div>
              <div className="report-profile__label">置顶三条</div>
              <div className="report-pinned-list">
                {plan.positioning.topPosts.map((post, idx) => (
                  <div key={idx} className="report-pinned-item">
                    <span className="report-pinned-item__num">{idx + 1}</span>
                    <div>
                      <p className="report-pinned-item__title">{post.title}</p>
                      <p className="report-pinned-item__desc">{post.direction}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section title="你的核心观众">
        {editing ? (
          <div className="report-persona-row" style={{ flexDirection: 'column' }}>
            {['core', 'diffusion', 'potential'].map((layer) => {
              const labels = { core: '核心人群', diffusion: '扩散人群', potential: '潜在人群' }
              const d = draft.userProfile[layer]
              return (
                <div key={layer} className="report-persona-card">
                  <div style={{ fontSize: 12, color: 'var(--color-purple)', fontWeight: 600 }}>{labels[layer]}</div>
                  <div className="report-edit-field" style={{ marginBottom: 8 }}>
                    <label>年龄/画像</label>
                    <input value={d.ageRange} onChange={(e) => updateLayer(layer, 'ageRange', e.target.value)} />
                  </div>
                  <div className="report-edit-field" style={{ marginBottom: 8 }}>
                    <label>画像描述</label>
                    <input value={d.portrait} onChange={(e) => updateLayer(layer, 'portrait', e.target.value)} />
                  </div>
                  <div className="report-edit-field" style={{ marginBottom: 8 }}>
                    <label>痛点</label>
                    <ListEditor items={d.painPoints} onChange={(items) => updateLayer(layer, 'painPoints', items)} max={5} placeholder="痛点" />
                  </div>
                  <div className="report-edit-field" style={{ marginBottom: 8 }}>
                    <label>需求</label>
                    <ListEditor items={d.needs} onChange={(items) => updateLayer(layer, 'needs', items)} max={5} placeholder="需求" />
                  </div>
                  <div className="report-edit-field" style={{ marginBottom: 0 }}>
                    <label>内容方向</label>
                    <textarea rows={2} value={d.contentDirection} onChange={(e) => updateLayer(layer, 'contentDirection', e.target.value)} />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <p style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
              你的内容是为这群人写的——她们需要被看见、被理解、被赋予选择权。
            </p>
            <div className="report-persona-row">
              {[
                { key: 'core', label: '核心人群' },
                { key: 'diffusion', label: '扩散人群' },
                { key: 'potential', label: '潜在人群' }
              ].map(({ key }) => {
                const data = plan.userProfile[key]
                const isLocked = key === 'potential'
                return (
                  <div key={key} className={`report-persona-card ${isLocked ? 'report-persona-card--locked' : ''}`}>
                    <div className="report-persona-card__age">{data.ageRange || '待补充'}</div>
                    <div className="report-persona-card__label">{data.portrait}</div>
                    <div className="report-persona-card__desc">{data.contentDirection}</div>
                    <div className="report-persona-card__pain">{data.painPoints.join(' · ')}</div>
                    <div className="report-persona-card__quote">"{data.needs.join('、')}"</div>
                    <div className="report-persona-card__solution">{data.contentDirection}</div>
                    {isLocked && (
                      <div className="report-persona-card__lock">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <div>扩散人群<br />（账号稳定后解锁）</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </Section>
    </>
  )
}

function AudienceTab({ plan, draft, editing, setDraft }) {
  const updateLayer = (layer, field, value) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      next.userProfile[layer][field] = value
      return next
    })
  }

  return (
    <>
      {['core', 'diffusion', 'potential'].map((layer) => {
        const labels = { core: '核心人群', diffusion: '扩散人群', potential: '潜在人群' }
        const data = plan.userProfile[layer]
        const draftData = draft.userProfile[layer]
        return (
          <CardSection key={layer} title={labels[layer]}>
            {editing ? (
              <>
                <label className="form-label">年龄/画像</label>
                <input className="form-input" value={draftData.ageRange} onChange={(e) => updateLayer(layer, 'ageRange', e.target.value)} />
                <label className="form-label" style={{ marginTop: 12 }}>画像描述</label>
                <input className="form-input" value={draftData.portrait} onChange={(e) => updateLayer(layer, 'portrait', e.target.value)} />
                <label className="form-label" style={{ marginTop: 12 }}>痛点</label>
                <ListEditor items={draftData.painPoints} onChange={(items) => updateLayer(layer, 'painPoints', items)} max={5} placeholder="痛点" />
                <label className="form-label" style={{ marginTop: 12 }}>她们需要什么</label>
                <ListEditor items={draftData.needs} onChange={(items) => updateLayer(layer, 'needs', items)} max={5} placeholder="需求" />
                <label className="form-label" style={{ marginTop: 12 }}>内容方向</label>
                <textarea className="form-textarea" rows={2} value={draftData.contentDirection} onChange={(e) => updateLayer(layer, 'contentDirection', e.target.value)} />
              </>
            ) : (
              <>
                <p className="card-view-text">{data.ageRange} · {data.portrait}</p>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '8px 0 0' }}><strong>痛点：</strong>{data.painPoints.join('、')}</p>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}><strong>需求：</strong>{data.needs.join('、')}</p>
                <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}><strong>方向：</strong>{data.contentDirection}</p>
              </>
            )}
          </CardSection>
        )
      })}
    </>
  )
}

function ContentTab({ plan, draft, editing, setDraft }) {
  const updateMainLine = (idx, field, value) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      next.contentMatrix.mainLines[idx][field] = value
      return next
    })
  }

  const updateList = (path, idx, field, value) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      next.contentMatrix[path][idx][field] = value
      return next
    })
  }

  return (
    <>
      <CardSection title="5 条内容主线">
        {editing ? (
          <>
            {draft.contentMatrix.mainLines.map((line, idx) => (
              <div key={idx} className="ip-plan-subsection">
                <div className="ip-plan-subsection__title">主线 {idx + 1} · {line.ratio}</div>
                <div className="ip-plan-form-grid">
                  <input className="form-input" placeholder="占比" value={line.ratio} onChange={(e) => updateMainLine(idx, 'ratio', e.target.value)} />
                  <input className="form-input" placeholder="内容方向" value={line.direction} onChange={(e) => updateMainLine(idx, 'direction', e.target.value)} />
                  <input className="form-input" placeholder="用户能获得什么" value={line.userGain} onChange={(e) => updateMainLine(idx, 'userGain', e.target.value)} />
                  <input className="form-input" placeholder="视频形式" value={line.videoFormat} onChange={(e) => updateMainLine(idx, 'videoFormat', e.target.value)} />
                  <input className="form-input" placeholder="主要目的" value={line.purpose} onChange={(e) => updateMainLine(idx, 'purpose', e.target.value)} />
                  <input className="form-input" placeholder="不要变成什么" value={line.avoidBecoming} onChange={(e) => updateMainLine(idx, 'avoidBecoming', e.target.value)} />
                </div>
                <TagEditor items={line.toneKeywords} onChange={(items) => updateMainLine(idx, 'toneKeywords', items)} max={4} />
              </div>
            ))}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {plan.contentMatrix.mainLines.map((line, idx) => (
              <div key={idx} className="ip-plan-subsection">
                <div className="ip-plan-subsection__title">{line.ratio} · {line.direction}</div>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  用户获得：{line.userGain} · 形式：{line.videoFormat} · 目的：{line.purpose}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                  语气：{line.toneKeywords.join('、')} · 避免：{line.avoidBecoming}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardSection>

      <CardSection title="3 种内容模板">
        {(editing ? draft.contentMatrix.templates : plan.contentMatrix.templates).map((t, idx) => (
          <div key={idx} className="ip-plan-subsection">
            <div className="ip-plan-subsection__title">{t.name}</div>
            {editing ? (
              <>
                <input className="form-input" placeholder="结构" value={t.structure} onChange={(e) => updateList('templates', idx, 'structure', e.target.value)} />
                <input className="form-input" style={{ marginTop: 8 }} placeholder="适合场景" value={t.bestFor} onChange={(e) => updateList('templates', idx, 'bestFor', e.target.value)} />
                <input className="form-input" style={{ marginTop: 8 }} placeholder="示例" value={t.example} onChange={(e) => updateList('templates', idx, 'example', e.target.value)} />
              </>
            ) : (
              <>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>结构：</strong>{t.structure}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>适合：</strong>{t.bestFor}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>示例：</strong>{t.example}</p>
              </>
            )}
          </div>
        ))}
      </CardSection>

      <CardSection title="选题公式">
        {editing ? (
          <>
            {draft.contentMatrix.topicFormulas.map((f, idx) => (
              <div key={idx} className="ip-plan-form-grid" style={{ marginBottom: 12 }}>
                <input className="form-input" placeholder="公式名称" value={f.name} onChange={(e) => updateList('topicFormulas', idx, 'name', e.target.value)} />
                <input className="form-input" placeholder="公式" value={f.formula} onChange={(e) => updateList('topicFormulas', idx, 'formula', e.target.value)} />
                <input className="form-input" placeholder="示例" value={f.example} onChange={(e) => updateList('topicFormulas', idx, 'example', e.target.value)} />
              </div>
            ))}
          </>
        ) : (
          <ul className="card-view-list">
            {plan.contentMatrix.topicFormulas.map((f, i) => <li key={i}><strong>{f.name}</strong>：{f.formula}。例：{f.example}</li>)}
          </ul>
        )}
      </CardSection>

      <CardSection title="素材改造速查表">
        {editing ? (
          <>
            {draft.contentMatrix.assetTransform.map((a, idx) => (
              <div key={idx} className="ip-plan-form-grid" style={{ marginBottom: 12 }}>
                <input className="form-input" placeholder="已有素材" value={a.asset} onChange={(e) => updateList('assetTransform', idx, 'asset', e.target.value)} />
                <input className="form-input" placeholder="自嗨版本" value={a.selfVersion} onChange={(e) => updateList('assetTransform', idx, 'selfVersion', e.target.value)} />
                <input className="form-input" placeholder="利她版本" value={a.altruisticVersion} onChange={(e) => updateList('assetTransform', idx, 'altruisticVersion', e.target.value)} />
              </div>
            ))}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plan.contentMatrix.assetTransform.map((a, i) => (
              <div key={i} className="ip-plan-subsection">
                <div className="ip-plan-subsection__title">{a.asset}</div>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>自嗨：{a.selfVersion}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>利她：{a.altruisticVersion}</p>
              </div>
            ))}
          </div>
        )}
      </CardSection>
    </>
  )
}

function StyleTab({ plan, draft, editing, setDraft }) {
  const update = (path, value) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      let cur = next
      const keys = path.split('.')
      for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]]
      cur[keys[keys.length - 1]] = value
      return next
    })
  }

  return (
    <>
      <CardSection title="视觉风格">
        {editing ? (
          <>
            <label className="form-label">关键词</label>
            <TagEditor items={draft.style.visual.keywords} onChange={(items) => update('style.visual.keywords', items)} max={5} />
            <label className="form-label" style={{ marginTop: 12 }}>适合画面</label>
            <ListEditor items={draft.style.visual.suitable} onChange={(items) => update('style.visual.suitable', items)} max={5} placeholder="适合画面" />
            <label className="form-label" style={{ marginTop: 12 }}>不适合画面</label>
            <ListEditor items={draft.style.visual.unsuitable} onChange={(items) => update('style.visual.unsuitable', items)} max={5} placeholder="不适合画面" />
            <label className="form-label" style={{ marginTop: 12 }}>服装/出镜/字幕建议</label>
            <textarea className="form-textarea" rows={2} value={draft.style.visual.advice} onChange={(e) => update('style.visual.advice', e.target.value)} />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {plan.style.visual.keywords.map((k) => <span key={k} className="tag-purple">{k}</span>)}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>适合：</strong>{plan.style.visual.suitable.join('、')}</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>不适合：</strong>{plan.style.visual.unsuitable.join('、')}</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>建议：</strong>{plan.style.visual.advice}</p>
          </>
        )}
      </CardSection>

      <CardSection title="文案风格">
        {editing ? (
          <>
            <label className="form-label">关键词</label>
            <TagEditor items={draft.style.copywriting.keywords} onChange={(items) => update('style.copywriting.keywords', items)} max={5} />
            <label className="form-label" style={{ marginTop: 12 }}>适合句式</label>
            <ListEditor items={draft.style.copywriting.suitable} onChange={(items) => update('style.copywriting.suitable', items)} max={5} placeholder="适合句式" />
            <label className="form-label" style={{ marginTop: 12 }}>不适合句式</label>
            <ListEditor items={draft.style.copywriting.unsuitable} onChange={(items) => update('style.copywriting.unsuitable', items)} max={5} placeholder="不适合句式" />
            <label className="form-label" style={{ marginTop: 12 }}>示例</label>
            <textarea className="form-textarea" rows={2} value={draft.style.copywriting.example} onChange={(e) => update('style.copywriting.example', e.target.value)} />
          </>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {plan.style.copywriting.keywords.map((k) => <span key={k} className="tag-purple">{k}</span>)}
            </div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>适合：</strong>{plan.style.copywriting.suitable.join('、')}</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>不适合：</strong>{plan.style.copywriting.unsuitable.join('、')}</p>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>示例：</strong>{plan.style.copywriting.example}</p>
          </>
        )}
      </CardSection>

      <CardSection title="拍摄表达形式">
        {(editing ? draft.style.shooting : plan.style.shooting).map((s, idx) => (
          <div key={idx} className="ip-plan-subsection">
            <div className="ip-plan-subsection__title">{s.type}</div>
            {editing ? (
              <>
                <input className="form-input" placeholder="定义" value={s.definition} onChange={(e) => {
                  setDraft((prev) => {
                    const next = JSON.parse(JSON.stringify(prev))
                    next.style.shooting[idx].definition = e.target.value
                    return next
                  })
                }} />
                <input className="form-input" style={{ marginTop: 8 }} placeholder="适合场景" value={s.suitable} onChange={(e) => {
                  setDraft((prev) => {
                    const next = JSON.parse(JSON.stringify(prev))
                    next.style.shooting[idx].suitable = e.target.value
                    return next
                  })
                }} />
                <input className="form-input" style={{ marginTop: 8 }} placeholder="示例" value={s.example} onChange={(e) => {
                  setDraft((prev) => {
                    const next = JSON.parse(JSON.stringify(prev))
                    next.style.shooting[idx].example = e.target.value
                    return next
                  })
                }} />
              </>
            ) : (
              <>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>{s.definition}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>适合：</strong>{s.suitable}</p>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}><strong>示例：</strong>{s.example}</p>
              </>
            )}
          </div>
        ))}
      </CardSection>
    </>
  )
}

function StandardsTab({ plan, draft, editing, setDraft }) {
  const update = (field, items) => {
    setDraft((prev) => {
      const next = JSON.parse(JSON.stringify(prev))
      next.publishingStandards[field] = items
      return next
    })
  }

  return (
    <>
      <CardSection title="发布前判断标准">
        <div className="ip-plan-subsection__title">核心检验标准</div>
        {editing ? (
          <ListEditor items={draft.publishingStandards.coreCriteria} onChange={(items) => update('coreCriteria', items)} max={6} placeholder="标准" />
        ) : (
          <ul className="card-view-list">
            {plan.publishingStandards.coreCriteria.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </CardSection>

      <CardSection title="不能偏离的底线">
        {editing ? (
          <ListEditor items={draft.publishingStandards.bottomLines} onChange={(items) => update('bottomLines', items)} max={6} placeholder="底线" />
        ) : (
          <ul className="card-view-list">
            {plan.publishingStandards.bottomLines.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </CardSection>

      <CardSection title="判断问题清单">
        {editing ? (
          <ListEditor items={draft.publishingStandards.checklist} onChange={(items) => update('checklist', items)} max={10} placeholder="问题" />
        ) : (
          <ul className="card-view-list">
            {plan.publishingStandards.checklist.map((c, i) => <li key={i}>{c}</li>)}
          </ul>
        )}
      </CardSection>

      <CardSection title="前 10 条具体选题">
        {editing ? (
          <>
            {draft.topTopics.map((t, idx) => (
              <div key={idx} className="ip-plan-form-grid" style={{ marginBottom: 12 }}>
                <input className="form-input" placeholder="标题" value={t.title} onChange={(e) => {
                  setDraft((prev) => {
                    const next = JSON.parse(JSON.stringify(prev))
                    next.topTopics[idx].title = e.target.value
                    return next
                  })
                }} />
                <input className="form-input" placeholder="方向" value={t.direction} onChange={(e) => {
                  setDraft((prev) => {
                    const next = JSON.parse(JSON.stringify(prev))
                    next.topTopics[idx].direction = e.target.value
                    return next
                  })
                }} />
              </div>
            ))}
          </>
        ) : (
          <ol className="card-view-list">
            {plan.topTopics.map((t, i) => <li key={i}><strong>{t.title}</strong> · {t.direction}</li>)}
          </ol>
        )}
      </CardSection>
    </>
  )
}

function CardSection({ title, children }) {
  return (
    <div className="glass-card" style={{ padding: 22, marginTop: 16 }}>
      <h2 style={{ fontSize: 17, fontWeight: 600, margin: '0 0 14px' }}>{title}</h2>
      {children}
    </div>
  )
}

function TagEditor({ items, onChange, max = 8 }) {
  const [input, setInput] = useState('')
  const add = () => {
    const t = input.trim()
    if (!t || items.includes(t)) return
    if (items.length >= max) return
    onChange([...items, t])
    setInput('')
  }
  const remove = (tag) => onChange(items.filter((t) => t !== tag))
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        {items.map((tag) => (
          <span key={tag} className="tag-purple tag-removable" onClick={() => remove(tag)}>
            {tag} ×
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={items.length >= max ? '已达到上限' : '添加'}
          disabled={items.length >= max}
          className="form-input"
          style={{ flex: 1 }}
        />
        <button className="btn btn-outline" onClick={add} disabled={items.length >= max}>添加</button>
      </div>
    </div>
  )
}

function ListEditor({ items, onChange, max = 6, placeholder }) {
  const [input, setInput] = useState('')
  const add = () => {
    const t = input.trim()
    if (!t) return
    if (items.length >= max) return
    onChange([...items, t])
    setInput('')
  }
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx))
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="form-input" style={{ flex: 1 }} value={item} onChange={(e) => {
              const next = [...items]
              next[idx] = e.target.value
              onChange(next)
            }} />
            <button className="btn btn-outline" onClick={() => remove(idx)}>删除</button>
          </div>
        ))}
      </div>
      {items.length < max && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={placeholder}
            className="form-input"
            style={{ flex: 1 }}
          />
          <button className="btn btn-outline" onClick={add}>添加</button>
        </div>
      )}
    </div>
  )
}

function Modal({ title, message, confirmText, cancelText, onConfirm, onCancel, danger }) {
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>{title}</h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={onCancel}>{cancelText}</button>
          <button className={danger ? 'btn btn-danger' : 'btn btn-purple'} style={{ flex: 1 }} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  )
}

function PositioningEntry() {
  const navigate = useNavigate()
  const stage1 = useMemo(() => loadStage1(), [])
  const messages = useMemo(() => loadStage2Messages(), [])
  const hasIpPlan = useMemo(() => Boolean(localStorage.getItem('ipcompass_ip_plan')), [])

  useEffect(() => {
    if (hasIpPlan) {
      navigate('/positioning/card', { replace: true })
      return
    }
    if (!stage1 || !stage1.q1) {
      navigate('/positioning/stage1', { state: { step: 1 }, replace: true })
      return
    }
    if (!stage1.q2 || !stage1.q3) {
      const step = !stage1.q2 ? 2 : 3
      navigate('/positioning/stage1', { state: { step }, replace: true })
      return
    }
    if (messages.length === 0) {
      navigate('/positioning/stage2', { replace: true })
      return
    }
    navigate('/positioning/stage2', { replace: true })
  }, [navigate, stage1, messages, hasIpPlan])

  return (
    <div className="page" style={{ minHeight: '100vh' }}>
      <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
        <div className="spinner" />
        <p style={{ marginTop: 20, color: 'var(--color-text-secondary)' }}>正在恢复进度…</p>
      </div>
    </div>
  )
}

export default function PositioningPage() {
  return (
    <Routes>
      <Route path="/" element={<PositioningEntry />} />
      <Route path="/stage1" element={<Stage1Step />} />
      <Route path="/stage2" element={<Stage2Step />} />
      <Route path="/card" element={<PositioningResult />} />
      <Route path="/result" element={<PositioningResult />} />
    </Routes>
  )
}

// 将后端生成的 ipPlan 规范化为 UI 可用结构（确保字段存在）
function normalizeIpPlanForUI(raw) {
  const ensureArray = (v) => Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []
  const ensureString = (v) => typeof v === 'string' ? v : String(v || '')
  const layer = (l) => ({
    ageRange: ensureString(l?.ageRange),
    portrait: ensureString(l?.portrait),
    painPoints: ensureArray(l?.painPoints),
    needs: ensureArray(l?.needs),
    contentDirection: ensureString(l?.contentDirection)
  })

  const positioning = {
    tag: ensureString(raw?.positioning?.tag || raw?.positioning?.tags?.[0]),
    oneLine: ensureString(raw?.positioning?.oneLine || raw?.positioning?.oneLinePositioning),
    values: ensureArray(raw?.positioning?.values || raw?.positioning?.promises),
    personaKeywords: ensureArray(raw?.positioning?.personaKeywords || raw?.positioning?.personaDetail?.keywords || raw?.positioning?.persona?.slice(1)),
    personaDetail: {
      keywords: ensureArray(raw?.positioning?.personaDetail?.keywords || raw?.positioning?.personaKeywords || raw?.positioning?.persona?.slice(1)),
      description: ensureString(raw?.positioning?.personaDetail?.description || raw?.positioning?.persona?.[0])
    },
    profileDesign: ensureString(raw?.positioning?.profileDesign || raw?.positioning?.profileAdvice?.bio),
    topPosts: Array.isArray(raw?.positioning?.topPosts)
      ? raw.positioning.topPosts.slice(0, 3).map((t) => ({ title: ensureString(t?.title), direction: ensureString(t?.direction) }))
      : Array.from({ length: 3 }, (_, i) => ({ title: `置顶内容 ${i + 1}`, direction: '待定' })),
    topPostSelection: ensureString(raw?.positioning?.topPostSelection),
    audience: {
      categories: ensureArray(raw?.positioning?.audience?.categories),
      painPoints: ensureArray(raw?.positioning?.audience?.painPoints),
      details: Array.isArray(raw?.positioning?.audience?.details)
        ? raw.positioning.audience.details.map((d) => ({
            group: ensureString(d?.group),
            portrait: ensureString(d?.portrait),
            current: ensureString(d?.current),
            pain: ensureString(d?.pain)
          }))
        : []
    }
  }

  const mainLine = (l) => ({
    ratio: ensureString(l?.ratio),
    direction: ensureString(l?.direction),
    userGain: ensureString(l?.userGain),
    videoFormat: ensureString(l?.videoFormat),
    toneKeywords: ensureArray(l?.toneKeywords),
    purpose: ensureString(l?.purpose),
    avoidBecoming: ensureString(l?.avoidBecoming)
  })

  const template = (t, name) => ({
    name: ensureString(t?.name || name),
    structure: ensureString(t?.structure),
    bestFor: ensureString(t?.bestFor),
    example: ensureString(t?.example)
  })

  const formula = (f, idx) => ({
    name: ensureString(f?.name || `公式${idx + 1}`),
    formula: ensureString(f?.formula),
    example: ensureString(f?.example)
  })

  const asset = (a) => ({
    asset: ensureString(a?.asset),
    selfVersion: ensureString(a?.selfVersion),
    altruisticVersion: ensureString(a?.altruisticVersion)
  })

  const rawMainLines = Array.isArray(raw?.contentMatrix?.mainLines)
    ? raw.contentMatrix.mainLines
    : Array.isArray(raw?.strategy?.contentMatrix)
      ? raw.strategy.contentMatrix.map((m) => ({
          ratio: ensureString(m?.ratio),
          direction: ensureString(m?.direction || m?.name),
          userGain: '',
          videoFormat: ensureString(m?.format),
          toneKeywords: ensureArray(m?.tags),
          purpose: ensureString(m?.priority),
          avoidBecoming: ''
        }))
      : []
  const mainLines = rawMainLines.length >= 2
    ? rawMainLines.slice(0, 5).map(mainLine)
    : [
        { ratio: '40%', direction: '内容方向 1', userGain: '用户获得', videoFormat: '短视频', toneKeywords: ['真诚'], purpose: '建立信任', avoidBecoming: '避免空洞' },
        { ratio: '35%', direction: '内容方向 2', userGain: '用户获得', videoFormat: '图文', toneKeywords: ['具体'], purpose: '增强共鸣', avoidBecoming: '避免煽情' },
        { ratio: '25%', direction: '内容方向 3', userGain: '用户获得', videoFormat: '口播', toneKeywords: ['犀利'], purpose: '提升传播', avoidBecoming: '避免对立' }
      ]

  const templates = ['图文文案型', '故事口播型', '生活实验型'].map((name, idx) =>
    template(raw?.contentMatrix?.templates?.[idx], name)
  )

  const topicFormulas = Array.isArray(raw?.contentMatrix?.topicFormulas)
    ? raw.contentMatrix.topicFormulas.slice(0, 5).map((f, i) => formula(f, i))
    : Array.from({ length: 5 }, (_, i) => formula({}, i))

  const assetTransform = Array.isArray(raw?.contentMatrix?.assetTransform)
    ? raw.contentMatrix.assetTransform.slice(0, 5).map(asset)
    : []

  return {
    userProfile: {
      core: layer(raw?.userProfile?.core),
      diffusion: layer(raw?.userProfile?.diffusion),
      potential: layer(raw?.userProfile?.potential)
    },
    positioning,
    contentMatrix: { mainLines, templates, topicFormulas, assetTransform },
    style: {
      visual: {
        keywords: ensureArray(raw?.style?.visual?.keywords),
        suitable: ensureArray(raw?.style?.visual?.suitable),
        unsuitable: ensureArray(raw?.style?.visual?.unsuitable),
        advice: ensureString(raw?.style?.visual?.advice)
      },
      copywriting: {
        keywords: ensureArray(raw?.style?.copywriting?.keywords),
        suitable: ensureArray(raw?.style?.copywriting?.suitable),
        unsuitable: ensureArray(raw?.style?.copywriting?.unsuitable),
        example: ensureString(raw?.style?.copywriting?.example)
      },
      shooting: ['凝视型', '运动型', '第三视角型'].map((type, idx) => ({
        type,
        definition: ensureString(raw?.style?.shooting?.[idx]?.definition),
        suitable: ensureString(raw?.style?.shooting?.[idx]?.suitable),
        example: ensureString(raw?.style?.shooting?.[idx]?.example)
      }))
    },
    publishingStandards: {
      coreCriteria: ensureArray(raw?.publishingStandards?.coreCriteria),
      bottomLines: ensureArray(raw?.publishingStandards?.bottomLines),
      checklist: ensureArray(raw?.publishingStandards?.checklist)
    },
    topTopics: Array.isArray(raw?.topTopics)
      ? raw.topTopics.slice(0, 10).map((t) => ({ title: ensureString(t?.title), direction: ensureString(t?.direction) }))
      : Array.isArray(raw?.strategy?.topicPool)
        ? raw.strategy.topicPool.slice(0, 10).map((t) => ({ title: ensureString(t?.title), direction: ensureString(t?.matrix) }))
        : Array.from({ length: 5 }, (_, i) => ({ title: `选题 ${i + 1}`, direction: '待定' })),
    summary: ensureString(raw?.summary)
  }
}

// 将 UI 结构还原为后端 ipPlan 结构，确保下游接口兼容
function denormalizeIpPlanForAPI(draft) {
  const plan = JSON.parse(JSON.stringify(draft))
  plan.positioning.oneLinePositioning = plan.positioning.oneLine
  plan.positioning.persona = [plan.positioning.personaDetail.description, ...plan.positioning.personaDetail.keywords.map((k) => `具有${k}的特质`)].slice(0, 3)
  plan.positioning.promises = plan.positioning.values.length > 0 ? plan.positioning.values : ['提供真实可执行的方法']
  plan.positioning.tags = [plan.positioning.tag.replace(/^#/, ''), ...plan.positioning.personaDetail.keywords].filter(Boolean).slice(0, 8)
  plan.positioning.profileAdvice = {
    avatar: '干净真人头像，能体现个人风格',
    nickname: '简洁 + 领域/特质关键词',
    bio: plan.positioning.oneLine,
    cover: '代表内容风格或人设的封面图'
  }
  return plan
}

function validateIpPlan(plan) {
  const errors = []
  if (!plan || typeof plan !== 'object') {
    errors.push('IP 方案数据不能为空')
    return errors
  }
  if (!plan.positioning?.oneLine || plan.positioning.oneLine.length < 5) {
    errors.push('一句话定位需至少 5 个字')
  }
  if (!plan.positioning?.tag) {
    errors.push('专属标签不能为空')
  }
  if (!Array.isArray(plan.positioning?.values) || plan.positioning.values.length === 0) {
    errors.push('账号提供的价值至少 1 条')
  }
  if (!Array.isArray(plan.contentMatrix?.mainLines) || plan.contentMatrix.mainLines.length < 2) {
    errors.push('内容主线至少 2 条')
  }
  if (!Array.isArray(plan.topTopics) || plan.topTopics.length < 3) {
    errors.push('选题至少 3 条')
  }
  return errors
}
