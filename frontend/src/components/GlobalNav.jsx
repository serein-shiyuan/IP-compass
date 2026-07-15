import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { getIpPlan, isIpPlanCompleted } from '../lib/ipPlanStore.js'

const POSITIONING_KEY = 'ipcompass_ip_plan_completed'

function isPositioningCompleted() {
  return localStorage.getItem(POSITIONING_KEY) === 'true' || Boolean(getIpPlan())
}

// 功能菜单项
const NAV_ITEMS = [
  { key: 'home', label: '首页', path: '/', locked: false },
  {
    key: 'diagnose',
    label: '功能',
    locked: false,
    children: [
      { key: 'positioning', label: '账号定位', path: '/positioning' },
      { key: 'content-strategy', label: '内容矩阵', path: '/content-strategy' },
      { key: 'diagnosis-input', label: '发布前诊断', path: '/diagnosis/input' },
      { key: 'data-input', label: '数据分析', path: '/data/input' },
      { key: 'optimization', label: '优化建议', path: '/optimization' }
    ]
  }
]

export default function GlobalNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const [done, setDone] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [hint, setHint] = useState('')

  const isStage2 = location.pathname === '/positioning/stage2'
  const chatComplete = isIpPlanCompleted()

  useEffect(() => {
    setDone(isPositioningCompleted())
  }, [location.pathname])

  useEffect(() => {
    if (!hint) return
    const t = setTimeout(() => setHint(''), 2500)
    return () => clearTimeout(t)
  }, [hint])

  const isHomeActive = location.pathname === '/'
  const isUserActive = location.pathname === '/home'

  const isActive = (path) => {
    if (path === '/') return isHomeActive
    return location.pathname.startsWith(path)
  }

  const handleNav = (item) => {
    setMenuOpen(false)
    if (item.path === '/') {
      navigate('/')
      return
    }
    // 需要定位完成
    if (!done) {
      setHint('请先生成账号定位')
      return
    }
    navigate(item.path)
  }

  const handleChildNav = (child) => {
    setMenuOpen(false)
    // 账号定位本身不需要锁定
    if (child.key === 'positioning') {
      navigate(child.path)
      return
    }
    if (!done) {
      setHint('请先生成账号定位')
      return
    }
    navigate(child.path)
  }

  return (
    <>
      <nav className="global-nav">
        <a
          href="/"
          className="global-nav__brand"
          onClick={(e) => {
            e.preventDefault()
            handleNav({ path: '/' })
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#8b5cf6' }}>
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" opacity="0.6" />
            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
          </svg>
          <span>IP Compass</span>
        </a>

        <div className="global-nav__divider" />

        <ul className="global-nav__list">
          <li>
            <button
              type="button"
              className={`global-nav__item ${isActive('/') ? 'global-nav__item--active' : ''}`}
              onClick={() => handleNav({ path: '/' })}
            >
              首页
              {isActive('/') && <span className="global-nav__dot" />}
            </button>
          </li>
          <li className="global-nav__dropdown">
            <button
              type="button"
              className={`global-nav__item ${menuOpen ? 'global-nav__item--open' : ''}`}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              功能
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s ease', transform: menuOpen ? 'rotate(180deg)' : 'none' }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {menuOpen && (
              <div className="global-nav__menu">
                {NAV_ITEMS[1].children.map((child) => {
                  const locked = child.key !== 'positioning' && !done
                  return (
                    <button
                      key={child.key}
                      type="button"
                      className={`global-nav__menu-item ${locked ? 'global-nav__menu-item--locked' : ''}`}
                      onClick={() => handleChildNav(child)}
                    >
                      <span>{child.label}</span>
                      {locked && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </li>
        </ul>

        <div className="global-nav__divider" />

        {isStage2 ? (
          <div className="global-nav__progress">
            <div className="step-dots step-dots--inline">
              {[1, 2, 3].map((s) => (
                <button
                  key={s}
                  type="button"
                  className="step-dot step-dot--clickable"
                  onClick={() => navigate('/positioning/stage1', { state: { step: s } })}
                  aria-label={`返回第${s}步`}
                />
              ))}
            </div>
            <span className="global-nav__progress-label">{chatComplete ? '对话完成' : 'AI深入'}</span>
          </div>
        ) : (
          <button
            type="button"
            className={`global-nav__user ${isUserActive ? 'global-nav__user--active' : ''}`}
            aria-label="用户"
            onClick={() => navigate('/home')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            {isUserActive && <span className="global-nav__dot" />}
          </button>
        )}
      </nav>

      {hint && (
        <div className="global-nav__hint">
          {hint}
        </div>
      )}
    </>
  )
}
