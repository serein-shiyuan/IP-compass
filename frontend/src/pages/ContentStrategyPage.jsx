import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { BackIcon } from '../components/Icons.jsx'
import { track, TrackingEvents } from '../lib/tracking.js'
import { getIpPlan, getPositioningCardFromIpPlan } from '../lib/ipPlanStore.js'
import MatrixTab from './MatrixTab.jsx'
import TopicPoolTab from './TopicPoolTab.jsx'

const TABS = [
  { id: 'matrix', label: '栏目矩阵' },
  { id: 'topics', label: '选题池' }
]

export default function ContentStrategyPage() {
  const navigate = useNavigate()
  const { userId } = useAuth()
  const [activeTab, setActiveTab] = useState('matrix')
  const ipPlan = getIpPlan()
  const positioningCard = getPositioningCardFromIpPlan(ipPlan)

  useEffect(() => {
    track(TrackingEvents.CONTENT_STRATEGY_VIEWED, { active_tab: activeTab })
  }, [activeTab])

  if (!positioningCard) {
    return (
      <div className="page" style={{ minHeight: '100vh' }}>
        <div className="top-nav">
          <button className="top-nav__back" onClick={() => navigate('/home')}>
            <BackIcon size={20} />
            <span>内容策略</span>
          </button>
        </div>
        <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            还没有定位卡，先去完成账号定位吧
          </p>
          <button className="btn btn-purple" style={{ marginTop: 16 }} onClick={() => navigate('/positioning')}>
            开始定位
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page" style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <div className="top-nav">
        <button className="top-nav__back" onClick={() => navigate('/home')}>
          <BackIcon size={20} />
          <span>内容策略</span>
        </button>
      </div>

      <div className="container">
        <div style={{ marginTop: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>内容策略</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            从栏目矩阵到具体选题，一步步落地你的内容方向
          </p>
        </div>

        <div className="tab-bar" style={{ marginBottom: 20 }}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`tab-bar__item ${activeTab === tab.id ? 'tab-bar__item--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'matrix' && <MatrixTab userId={userId} positioningCard={positioningCard} ipPlan={ipPlan} />}
        {activeTab === 'topics' && <TopicPoolTab userId={userId} positioningCard={positioningCard} ipPlan={ipPlan} />}
      </div>
    </div>
  )
}
