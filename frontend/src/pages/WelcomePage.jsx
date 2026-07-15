import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  ButterflyIcon,
  CompassIcon,
  StrategyIcon,
  PreDiagnosisIcon,
  ReviewIcon,
  LockIcon
} from '../components/Icons.jsx'
import { getIpPlan, getPositioningCardFromIpPlan } from '../lib/ipPlanStore.js'
import { track, TrackingEvents } from '../lib/tracking.js'

const POSITIONING_KEY = 'ipcompass_ip_plan_completed'
const LEGACY_POSITIONING_KEY = 'ipcompass_positioning_completed'
const HISTORY_KEY = 'ipcompass_diagnosis_history'

const FEATURE_PILLS = [
  '认识自我',
  '差异化定位',
  '内容矩阵',
  '发布诊断',
  '数据复盘',
  '长期主义账号'
]

const PAIN_CARDS = [
  {
    num: '01',
    icon: 'sad',
    text: '我拍了很多内容，但发出去就像石沉大海，不知道哪里出了问题。'
  },
  {
    num: '02',
    icon: 'trending-down',
    text: '每次刷到同行爆款，就觉得自己的东西不够好，越做越没有信心。'
  },
  {
    num: '03',
    icon: 'clock',
    text: '我知道要坚持发，但不知道下一条该发什么，坐在屏幕前发呆半小时。'
  }
]

const STEPS = [
  {
    id: 'positioning',
    num: '01',
    name: '账号定位卡 · 5 条内容主线',
    sub: '完成定位诊断',
    desc: '回答 3+3 个问题，生成个人 IP 方案',
    icon: <CompassIcon size={18} />
  },
  {
    id: 'strategy',
    num: '02',
    name: '栏目矩阵 · 50 条备选选题',
    sub: '生成内容策略',
    desc: '基于定位自动设计栏目与选题池',
    icon: <StrategyIcon size={18} />
  },
  {
    id: 'prediagnosis',
    num: '03',
    name: '评分报告 · 优化建议',
    sub: '发布前诊断',
    desc: '8 维度检查标题、文案、标签与定位一致性',
    icon: <PreDiagnosisIcon size={18} />
  },
  {
    id: 'review',
    num: '04',
    name: '数据看板 · 栏目归因',
    sub: '发布后数据复盘',
    desc: '录入视频数据，7 指标趋势对比',
    icon: <ReviewIcon size={18} />
  },
  {
    id: 'optimization',
    num: '05',
    name: '优化建议 · 可加入选题池',
    sub: '获得优化建议',
    desc: 'AI 分析弱势指标，生成下一条行动方向',
    icon: <CompassIcon size={18} />
  }
]

const FAQ_ITEMS = [
  {
    q: '这需要付费吗？',
    a: '当前 MVP 阶段全部功能免费使用。后续可能推出高级 AI 次数包，但基础诊断与定位功能会保持免费。'
  },
  {
    q: 'AI 生成的方案靠谱吗？',
    a: 'IP Compass 优先调用 DeepSeek 进行推演，并基于你的真实回答生成方案。如果 AI 服务不可用，会自动切换为规则兜底，确保你始终能拿到结果。'
  },
  {
    q: '我的数据安全吗？',
    a: '你的回答和方案默认存储在浏览器本地（localStorage / IndexedDB），不会上传到第三方。匿名用户 ID 仅用于区分会话。'
  },
  {
    q: '我刚开始做账号，数据很少怎么办？',
    a: '数据复盘功能需要至少 3 条视频数据才有参考价值。但定位诊断和内容策略不需要任何历史数据，新手可以从第一步开始。'
  }
]

const PAIN_ICONS = {
  sad: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2" />
      <line x1="9" y1="9" x2="9.01" y2="9" />
      <line x1="15" y1="9" x2="15.01" y2="9" />
    </svg>
  ),
  'trending-down': (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  ),
  clock: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(139,92,246,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function formatToday() {
  const d = new Date()
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(d)
}

function getHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function isPositioningCompleted() {
  return localStorage.getItem(POSITIONING_KEY) === 'true' || localStorage.getItem(LEGACY_POSITIONING_KEY) === 'true'
}

function hasIpPlan() {
  return Boolean(getIpPlan())
}

export default function WelcomePage() {
  const navigate = useNavigate()
  const { status, userId, initialize } = useAuth()
  const [hasPlan, setHasPlan] = useState(false)
  const [positioningDone, setPositioningDone] = useState(false)
  const [card, setCard] = useState(null)
  const [history] = useState(getHistory)
  const [loading, setLoading] = useState(false)
  const [openFaq, setOpenFaq] = useState(null)
  const section1Ref = useRef(null)

  useEffect(() => {
    setHasPlan(hasIpPlan())
    setPositioningDone(isPositioningCompleted())
    const ipPlan = getIpPlan()
    setCard(getPositioningCardFromIpPlan(ipPlan))
  }, [status, userId])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    )

    document.querySelectorAll('.js-reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [hasPlan])

  const handleStart = async () => {
    if (loading) return
    setLoading(true)
    try {
      if (!userId) {
        await initialize({ createIfMissing: true })
      }
      navigate('/positioning')
    } catch (err) {
      alert(err.message || '初始化失败，请刷新重试')
    } finally {
      setLoading(false)
    }
  }

  const handleScrollToSection1 = () => {
    section1Ref.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleFeatureClick = (id) => {
    if (id === 'positioning') {
      if (hasPlan) {
        navigate('/positioning/card')
      } else {
        handleStart()
      }
    } else if (id === 'strategy') {
      navigate('/content-strategy')
    } else if (id === 'prediagnosis') {
      navigate('/diagnosis/input')
    } else if (id === 'review') {
      navigate('/data/input')
    } else if (id === 'optimization') {
      navigate('/optimization')
    }
  }

  const toggleFaq = (idx) => {
    setOpenFaq(openFaq === idx ? null : idx)
  }

  // 落地页（始终显示新用户页面）
  return (
    <div className="page welcome">
      <div className="welcome__bg">
        <div className="welcome__glow" />
        <ButterflyIcon className="welcome__butterfly" />
      </div>

      {/* Hero 区 */}
      <section className="welcome__hero">
        <div className="welcome__hero-inner">
          <p className="welcome__hero-label">SYSTEM / 2026</p>
          <h1 className="welcome__hero-title">IP Compass</h1>
          <p className="welcome__hero-sub">个人 IP 内容诊断与陪跑系统</p>
          <p className="welcome__hero-desc">从自身差异化出发，打造可持续增长的内容账号</p>

          <div className="welcome__pills">
            {FEATURE_PILLS.map((pill) => (
              <span key={pill} className="feature-pill">{pill}</span>
            ))}
          </div>

          <button className="btn btn-dark welcome__hero-cta" onClick={handleStart} disabled={loading}>
            {loading ? '准备中…' : '探索'}
          </button>
        </div>

        <button className="welcome__scroll" onClick={handleScrollToSection1} aria-label="向下滚动">
          <span className="welcome__scroll-text">SCROLL</span>
          <svg className="welcome__scroll-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="rgba(44,44,44,0.25)" strokeWidth="1.5">
            <path d="M4 6L8 10L12 6" />
          </svg>
        </button>
      </section>

      <div ref={section1Ref} className="welcome__sections">
        {/* 痛点共鸣 */}
        <section className="welcome-section js-reveal">
          <div className="welcome-section__container">
            <h2 className="welcome-section__title">你有没有过这些感觉？</h2>
            <p className="welcome-section__hint">如果你的回答是「有」，请继续往下看</p>
            <div className="pain-grid">
              {PAIN_CARDS.map((item) => (
                <div key={item.num} className="pain-card glass-surface">
                  <span className="pain-card__quote">"</span>
                  <span className="pain-card__num">{item.num}</span>
                  <div className="pain-card__icon">{PAIN_ICONS[item.icon]}</div>
                  <p className="pain-card__text">{item.text}</p>
                </div>
              ))}
            </div>
            <p className="welcome-section__foot js-reveal">
              你不是不努力，也不是没素材。你只是缺少一个帮你把「自身特性」「用户需求」「平台规则」连接起来的系统。
            </p>
          </div>
        </section>

        {/* 五步流程 */}
        <section className="welcome-section js-reveal">
          <div className="welcome-section__container">
            <h2 className="welcome-section__title">从"不知道发什么"到"知道下一条怎么改"</h2>
            <p className="welcome-section__hint">只需要五步</p>
            <div className="steps-timeline">
              <div className="steps-timeline__line" />
              {STEPS.map((step) => (
                <div key={step.id} className="step-tl">
                  <div className="step-tl__dot" />
                  <div className="step-tl__body">
                    <div className="step-tl__head">
                      <span className="step-tl__num">{step.num}</span>
                      <span className="step-tl__name">{step.name}</span>
                    </div>
                    <div className="step-tl__sub">{step.sub}</div>
                    <p className="step-tl__desc">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="welcome-section js-reveal">
          <div className="welcome-section__container welcome-section__container--narrow">
            <h2 className="welcome-section__title">常见问题</h2>
            <p className="welcome-section__hint">你可能会想知道的</p>
            <div className="faq-list">
              {FAQ_ITEMS.map((item, idx) => (
                <div
                  key={idx}
                  className={`faq-item glass-surface ${openFaq === idx ? 'is-open' : ''}`}
                  onClick={() => toggleFaq(idx)}
                >
                  <div className="faq-item__bar" />
                  <div className="faq-item__head">
                    <div className="faq-item__label">
                      <span className="faq-item__num">Q{idx + 1}</span>
                      <span className="faq-item__q">{item.q}</span>
                    </div>
                    <svg
                      className={`faq-item__arrow ${openFaq === idx ? 'is-rotated' : ''}`}
                      width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="rgba(139,92,246,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                  <div className="faq-item__answer-wrap" style={{
                    maxHeight: openFaq === idx ? '200px' : '0',
                    marginTop: openFaq === idx ? '10px' : '0'
                  }}>
                    <p className="faq-item__answer">{item.a}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 底部 CTA */}
        <section className="welcome-section welcome-section--cta js-reveal">
          <div className="welcome-section__container welcome-section__container--narrow">
            <h2 className="cta-title">算法会变，人心不变</h2>
            <button className="btn btn-dark cta-button" onClick={handleStart} disabled={loading}>
              {loading ? '准备中…' : '免费开始诊断'}
            </button>
            <p className="cta-meta">已有 1,000+ 个账号正在用 IP Compass 做内容规划</p>
          </div>
        </section>
      </div>
    </div>
  )
}
