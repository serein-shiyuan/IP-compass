import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import {
  CompassIcon,
  StrategyIcon,
  PreDiagnosisIcon,
  ReviewIcon,
  LockIcon
} from '../components/Icons.jsx'
import { getIpPlan, getPositioningCardFromIpPlan } from '../lib/ipPlanStore.js'

const POSITIONING_KEY = 'ipcompass_ip_plan_completed'
const LEGACY_POSITIONING_KEY = 'ipcompass_positioning_completed'
const HISTORY_KEY = 'ipcompass_diagnosis_history'

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
  if (localStorage.getItem(POSITIONING_KEY) === 'true' || localStorage.getItem(LEGACY_POSITIONING_KEY) === 'true') return true
  const ipPlan = getIpPlan()
  return Boolean(ipPlan)
}

function setPositioningCompleted(value) {
  localStorage.setItem(POSITIONING_KEY, value ? 'true' : 'false')
}

export default function HomePage() {
  const navigate = useNavigate()
  const { userId, dataCleared } = useAuth()
  const [positioningDone, setPositioningDone] = useState(isPositioningCompleted)
  const [card, setCard] = useState(null)
  const [history] = useState(getHistory)

  useEffect(() => {
    setPositioningDone(isPositioningCompleted())
    const ipPlan = getIpPlan()
    setCard(getPositioningCardFromIpPlan(ipPlan))
  }, [])

  const handleStartPositioning = () => {
    const completed = localStorage.getItem(POSITIONING_KEY) === 'true'
    if (completed && card) {
      navigate('/positioning/card')
    } else {
      navigate('/positioning')
    }
  }

  const features = [
    {
      id: 'positioning',
      name: '账号定位卡',
      desc: '回答 3+3 个问题，生成个人 IP 方案',
      icon: <CompassIcon size={18} />,
      locked: false
    },
    {
      id: 'strategy',
      name: '栏目矩阵',
      desc: '基于定位自动设计栏目与选题池',
      icon: <StrategyIcon size={18} />,
      locked: !positioningDone
    },
    {
      id: 'prediagnosis',
      name: '评分报告',
      desc: '8 维度检查标题、文案、标签与定位一致性',
      icon: <PreDiagnosisIcon size={18} />,
      locked: !positioningDone
    },
    {
      id: 'review',
      name: '数据看板',
      desc: '录入视频数据，7 指标趋势对比',
      icon: <ReviewIcon size={18} />,
      locked: !positioningDone
    },
    {
      id: 'optimization',
      name: '优化建议',
      desc: 'AI 分析弱势指标，生成下一条行动方向',
      icon: <CompassIcon size={18} />,
      locked: !positioningDone
    }
  ]

  return (
    <div className="page home" style={{ paddingTop: 72 }}>
      <div className="container">
        {dataCleared && (
          <div className="banner" style={{ background: '#fee2e2', color: '#991b1b', marginTop: 16 }}>
            检测到数据已清除，请重新开始定位
          </div>
        )}

        {!dataCleared && (
          <div className="banner" style={{ marginTop: 16 }}>
            绑定手机号，解锁云同步
          </div>
        )}

        <div className="home__greeting">
          <h1 className="home__hello">你好，创作者</h1>
          <p className="home__date">{formatToday()}</p>
        </div>

        <div className="glass-card status-card">
          {!positioningDone ? (
            <>
              <h2 className="status-card__title">完成账号定位</h2>
              <p className="status-card__desc">解锁全部功能，找到你的差异化方向</p>
              <div className="status-card__action">
                <button className="btn btn-purple btn-full" onClick={handleStartPositioning}>
                  开始诊断
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="status-card__title">定位已完成</h2>
              <p className="status-card__summary">{card?.oneLinePositioning || '找到你的差异化内容方向'}</p>
              <div className="status-card__tags">
                {(card?.tags || ['她要长青']).slice(0, 3).map((tag) => (
                  <span key={tag} className="tag-purple">{tag.startsWith('#') ? tag : `#${tag}`}</span>
                ))}
              </div>
              <div className="status-card__action">
                <button className="btn btn-outline btn-full" onClick={() => navigate('/positioning/card')}>
                  查看定位卡
                </button>
              </div>
            </>
          )}
        </div>

        <h2 className="section-title">功能中心</h2>
        <div className="feature-grid">
          {features.map((item) => (
            <div
              key={item.id}
              className={`feature-item ${item.locked ? 'feature-item--locked' : ''}`}
              onClick={() => {
                if (item.locked) return
                if (item.id === 'positioning') {
                  handleStartPositioning()
                } else if (item.id === 'strategy') {
                  navigate('/content-strategy')
                } else if (item.id === 'prediagnosis') {
                  navigate('/diagnosis/input')
                } else if (item.id === 'review') {
                  navigate('/data/input')
                } else if (item.id === 'optimization') {
                  navigate('/optimization')
                }
              }}
            >
              {item.locked && (
                <span className="feature-item__lock">
                  <LockIcon size={16} />
                </span>
              )}
              <div className="feature-item__icon">{item.icon}</div>
              <div className="feature-item__name">{item.name}</div>
              <div className="feature-item__desc">{item.desc}</div>
            </div>
          ))}
        </div>

        <h2 className="section-title">最近动态</h2>
        {history.length === 0 ? (
          <div className="empty-state">暂无记录，开始你的第一次诊断吧</div>
        ) : (
          <div className="activity-list">
            {history.slice(0, 5).map((item, idx) => (
              <div key={idx} className="activity-item">
                <div className="activity-item__icon">{item.type === 'review' ? '复' : '诊'}</div>
                <div className="activity-item__text">{item.title}</div>
                <div className="activity-item__time">{item.time}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: 24, padding: '0 24px' }}>
        <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          当前用户 ID：{userId?.slice(0, 8)}...
        </p>
      </div>
    </div>
  )
}
