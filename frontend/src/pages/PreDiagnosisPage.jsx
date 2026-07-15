import { useSearchParams, useNavigate } from 'react-router-dom'
import { BackIcon } from '../components/Icons.jsx'

export default function PreDiagnosisPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const title = searchParams.get('title') || '未命名选题'

  return (
    <div className="page" style={{ minHeight: '100vh' }}>
      <div className="top-nav">
        <button className="top-nav__back" onClick={() => navigate('/content-strategy')}>
          <BackIcon size={20} />
          <span>发布前诊断</span>
        </button>
      </div>
      <div className="container" style={{ paddingTop: 80 }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 12px' }}>发布前诊断（P09）</h2>
          <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            选题：{title}
          </p>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
            该功能将在后续版本中实现，用于对单个选题进行封面、标题、文案结构等维度的诊断。
          </p>
        </div>
      </div>
    </div>
  )
}
