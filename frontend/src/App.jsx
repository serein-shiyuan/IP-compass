import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx'
import { trackPageView } from './lib/tracking.js'
import GlobalNav from './components/GlobalNav.jsx'
import FoggyGlassCanvas from './components/FoggyGlassCanvas.jsx'
import WelcomePage from './pages/WelcomePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import HomePage from './pages/HomePage.jsx'
import PositioningPage from './pages/PositioningPage.jsx'
import ContentStrategyPage from './pages/ContentStrategyPage.jsx'
import DiagnosisInputPage from './pages/DiagnosisInputPage.jsx'
import DiagnosisReportPage from './pages/DiagnosisReportPage.jsx'
import DataInputPage from './pages/DataInputPage.jsx'
import DataDashboardPage from './pages/DataDashboardPage.jsx'
import OptimizationPage from './pages/OptimizationPage.jsx'

function RouterContent() {
  const { status, initialize } = useAuth()
  const location = useLocation()

  useEffect(() => {
    // 首次打开只检查是否已有匿名 ID，不自动创建，保证 P01 欢迎页可见
    initialize({ createIfMissing: false })
  }, [initialize])

  useEffect(() => {
    trackPageView(location.pathname + location.search)
  }, [location.pathname, location.search])

  return (
    <>
      <GlobalNav />
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/home" element={<HomePage />} />
        <Route path="/positioning/*" element={<PositioningPage />} />
        <Route path="/content-strategy" element={<ContentStrategyPage />} />
        <Route path="/diagnosis/input" element={<DiagnosisInputPage />} />
        <Route path="/diagnosis/report" element={<DiagnosisReportPage />} />
        <Route path="/data/input" element={<DataInputPage />} />
        <Route path="/data/dashboard" element={<DataDashboardPage />} />
        <Route path="/optimization" element={<OptimizationPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <FoggyGlassCanvas />
      <RouterContent />
    </AuthProvider>
  )
}

export default App
