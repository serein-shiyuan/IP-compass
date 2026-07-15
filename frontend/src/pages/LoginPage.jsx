import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { BackIcon } from '../components/Icons.jsx'

export default function LoginPage() {
  const navigate = useNavigate()
  const { status, userId, error, initialize } = useAuth()

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    if (status === 'ready' && userId) {
      // 保持登录过渡页可见约 1.2 秒，符合 PRD「约 1-2 秒」的过渡预期
      const timer = setTimeout(() => {
        navigate('/home', { replace: true })
      }, 1200)
      return () => clearTimeout(timer)
    }
  }, [status, userId, navigate])

  const isError = status === 'error'

  return (
    <div className="page login">
      <div className="top-nav">
        <Link to="/" className="top-nav__back">
          <BackIcon size={20} />
          <span>登录</span>
        </Link>
        <div />
      </div>

      <div className="login__body">
        <div className="spinner" />
        <h2 className="login__title">正在为你创建专属空间...</h2>
        <p className="login__hint">首次使用无需手机号，进入即可开始诊断</p>

        {isError && (
          <div className="login__retry">
            <p className="login__hint" style={{ color: 'var(--color-error)' }}>
              {error || '初始化失败，请刷新页面重试'}
            </p>
            <button
              className="btn btn-outline"
              onClick={() => initialize()}
              style={{ marginTop: 12 }}
            >
              重试
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
