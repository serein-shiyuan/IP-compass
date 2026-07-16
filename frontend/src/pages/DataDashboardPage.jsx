import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { BackIcon } from '../components/Icons.jsx'
import { getIpPlan, getPositioningCardFromIpPlan } from '../lib/ipPlanStore.js'
import { generateDashboard, getDashboard } from '../api/dashboard.js'
import { getVideoData } from '../api/videoData.js'
import { analyzeAttribution, getAttribution } from '../api/attribution.js'

const METRICS = [
  { key: 'playCount', label: '播放量' },
  { key: 'completionRate', label: '完播率' },
  { key: 'likes', label: '点赞' },
  { key: 'comments', label: '评论' },
  { key: 'saves', label: '收藏' },
  { key: 'shares', label: '分享' },
  { key: 'newFollowers', label: '新增粉丝' }
]

function computeLocalDashboard(videos, topics, columns) {
  const columnMap = new Map((columns || []).map((c) => [c.id, c.name || c.id]))
  const topicMap = new Map((topics || []).map((t) => [t.id, { columnId: t.columnId, title: t.title }]))

  const chartsByMetric = {}
  METRICS.forEach((metric) => {
    const trendDataPoints = (videos || []).map((video, index) => ({
      label: `视频${index + 1}`,
      value: typeof video[metric.key] === 'number' ? video[metric.key] : null
    }))

    const groups = new Map()
    ;(videos || []).forEach((video) => {
      const topic = topicMap.get(video.topicId)
      const columnName = topic ? columnMap.get(topic.columnId) || '未分类栏目' : '未关联'
      if (!groups.has(columnName)) {
        groups.set(columnName, { values: [], count: 0 })
      }
      const value = typeof video[metric.key] === 'number' ? video[metric.key] : null
      if (value !== null) {
        groups.get(columnName).values.push(value)
      }
      groups.get(columnName).count += 1
    })

    const comparisonGroups = Array.from(groups.entries()).map(([label, group]) => ({
      label,
      avgValue: group.values.length > 0 ? Math.round((group.values.reduce((a, b) => a + b, 0) / group.values.length) * 10) / 10 : 0,
      count: group.count
    }))

    chartsByMetric[metric.key] = {
      trendChart: { metric: metric.key, label: metric.label, dataPoints: trendDataPoints },
      comparisonChart: { metric: metric.key, label: metric.label, groups: comparisonGroups }
    }
  })

  return {
    metrics: METRICS,
    isInsufficient: (videos || []).length < 3,
    chartsByMetric,
    generatedAt: new Date().toISOString()
  }
}

function formatMetricValue(value, metricKey) {
  if (value === null || value === undefined) return '-'
  if (metricKey === 'completionRate') return `${value}%`
  return String(value)
}

function TrendChart({ data, metricKey }) {
  const width = 320
  const height = 220
  const padding = { top: 24, right: 24, bottom: 40, left: 48 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const values = data.dataPoints.map((d) => d.value).filter((v) => v !== null && v !== undefined)
  const maxValue = values.length > 0 ? Math.max(...values) : 0
  const minValue = values.length > 0 ? Math.min(...values) : 0
  const range = maxValue === minValue ? 1 : maxValue - minValue

  const yForValue = (value) => {
    if (value === null || value === undefined) return null
    return padding.top + chartHeight - ((value - minValue) / range) * chartHeight
  }

  const xForIndex = (index) => padding.left + (index / (data.dataPoints.length - 1 || 1)) * chartWidth

  const segments = []
  for (let i = 0; i < data.dataPoints.length - 1; i++) {
    const y1 = yForValue(data.dataPoints[i].value)
    const y2 = yForValue(data.dataPoints[i + 1].value)
    if (y1 !== null && y2 !== null) {
      segments.push({ x1: xForIndex(i), y1, x2: xForIndex(i + 1), y2 })
    }
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
      {/* 网格线 */}
      {[0, 1, 2, 3].map((i) => {
        const y = padding.top + (i / 3) * chartHeight
        return <line key={i} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
      })}
      {/* 坐标轴 */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
      {/* Y轴刻度 */}
      <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)">
        {formatMetricValue(maxValue, metricKey)}
      </text>
      <text x={padding.left - 8} y={height - padding.bottom} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)">
        {formatMetricValue(minValue, metricKey)}
      </text>
      {/* 折线 */}
      {segments.map((seg, i) => (
        <line key={i} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} stroke="#8b5cf6" strokeWidth={2} />
      ))}
      {/* 数据点 */}
      {data.dataPoints.map((point, i) => {
        const y = yForValue(point.value)
        if (y === null) return null
        return (
          <g key={i}>
            <circle cx={xForIndex(i)} cy={y} r={4} fill="#8b5cf6" stroke="#fff" strokeWidth={2} />
            <text x={xForIndex(i)} y={y - 10} textAnchor="middle" fontSize={10} fill="var(--color-text-secondary)">
              {formatMetricValue(point.value, metricKey)}
            </text>
          </g>
        )
      })}
      {/* X轴标签 */}
      {data.dataPoints.map((point, i) => (
        <text key={i} x={xForIndex(i)} y={height - padding.bottom + 16} textAnchor="middle" fontSize={10} fill="var(--color-text-tertiary)">
          {point.label}
        </text>
      ))}
    </svg>
  )
}

function ComparisonChart({ data, metricKey }) {
  const width = 320
  const height = 220
  const padding = { top: 24, right: 16, bottom: 60, left: 48 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  const groups = data.groups || []
  const maxValue = groups.length > 0 ? Math.max(...groups.map((g) => g.avgValue || 0), 1) : 1
  const barWidth = groups.length > 0 ? Math.min(chartWidth / groups.length * 0.6, 48) : 0
  const gap = groups.length > 0 ? (chartWidth - barWidth * groups.length) / (groups.length + 1) : 0

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }}>
      {/* 网格线 */}
      {[0, 1, 2, 3].map((i) => {
        const y = padding.top + (i / 3) * chartHeight
        return <line key={i} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
      })}
      {/* 坐标轴 */}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
      <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />
      {/* Y轴刻度 */}
      <text x={padding.left - 8} y={padding.top + 4} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)">
        {formatMetricValue(maxValue, metricKey)}
      </text>
      <text x={padding.left - 8} y={height - padding.bottom} textAnchor="end" fontSize={10} fill="var(--color-text-tertiary)">
        0
      </text>
      {/* 柱状图 */}
      {groups.map((group, i) => {
        const barHeight = ((group.avgValue || 0) / maxValue) * chartHeight
        const x = padding.left + gap + i * (barWidth + gap)
        const y = height - padding.bottom - barHeight
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill="#8b5cf6" rx={4} />
            <text x={x + barWidth / 2} y={y - 6} textAnchor="middle" fontSize={10} fill="var(--color-text-secondary)">
              {formatMetricValue(group.avgValue, metricKey)}
            </text>
            <text x={x + barWidth / 2} y={height - padding.bottom + 14} textAnchor="middle" fontSize={10} fill="var(--color-text-tertiary)">
              {group.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function RadarChart({ values, labels }) {
  const width = 200
  const height = 200
  const cx = 100
  const cy = 100
  const maxR = 80
  const angles = [-Math.PI / 2, -Math.PI / 10, (3 * Math.PI) / 10, (7 * Math.PI) / 10, (11 * Math.PI) / 10]

  const pointFor = (value, index) => {
    const r = (value / 100) * maxR
    return {
      x: cx + r * Math.cos(angles[index]),
      y: cy + r * Math.sin(angles[index])
    }
  }

  const rings = [20, 40, 60, 80, 100]
  const dataPoints = values.map((v, i) => pointFor(v, i))

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', maxWidth: 240 }}>
      {rings.map((pct) => {
        const pts = angles.map((_, i) => pointFor(pct, i))
        return (
          <polygon
            key={pct}
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="rgba(44,44,44,0.06)"
            strokeWidth={1}
          />
        )
      })}
      {angles.map((_, i) => {
        const end = pointFor(100, i)
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x}
            y2={end.y}
            stroke="rgba(44,44,44,0.08)"
            strokeWidth={1}
          />
        )
      })}
      <polygon
        points={dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
        fill="rgba(139,92,246,0.15)"
        stroke="#8b5cf6"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={3} fill="#8b5cf6" />
      ))}
      {labels.map((label, i) => {
        const pos = pointFor(96, i)
        const dy = i === 0 ? -2 : i === 2 ? 4 : 0
        return (
          <text
            key={i}
            x={pos.x}
            y={pos.y + dy}
            fontSize={9}
            fill="rgba(44,44,44,0.5)"
            textAnchor="middle"
            fontWeight={500}
          >
            {label} {values[i]}
          </text>
        )
      })}
    </svg>
  )
}

function ChartFallback({ trendData, comparisonData, metricKey }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>趋势数据</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {trendData.dataPoints.map((point, i) => (
            <span key={i} style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {point.label}: {formatMetricValue(point.value, metricKey)}
            </span>
          ))}
        </div>
      </div>
      <div>
        <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600 }}>分组均值</h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {comparisonData.groups.map((group, i) => (
            <span key={i} style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
              {group.label}: {formatMetricValue(group.avgValue, metricKey)}（{group.count}条）
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function DataDashboardPage() {
  const navigate = useNavigate()
  const { userId, status: authStatus, initialize } = useAuth()
  const ipPlan = getIpPlan()
  const positioningCard = getPositioningCardFromIpPlan(ipPlan)

  const [dashboard, setDashboard] = useState(null)
  const [activeMetric, setActiveMetric] = useState('playCount')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [chartError, setChartError] = useState(false)

  const [attribution, setAttribution] = useState(null)
  const [attributionLoading, setAttributionLoading] = useState(false)
  const [attributionError, setAttributionError] = useState(null)
  const [videosForAttribution, setVideosForAttribution] = useState([])

  useEffect(() => {
    if (!userId && authStatus !== 'loading') {
      initialize({ createIfMissing: true })
    }
  }, [userId, authStatus, initialize])

  useEffect(() => {
    if (!userId) return
    setLoading(true)
    setError(null)

    getDashboard(userId)
      .then((data) => {
        if (data?.dashboard) {
          setDashboard(data.dashboard)
        } else {
          throw new Error('看板数据格式错误')
        }
      })
      .catch(() => {
        // 未生成过则请求后端生成；后端失败时基于视频数据本地计算
        generateDashboard(userId)
          .then((data) => setDashboard(data))
          .catch(() => {
            getVideoData(userId)
              .then((videoData) => {
                const computed = computeLocalDashboard(videoData.videos, [], [])
                setDashboard(computed)
              })
              .catch((err) => {
                setError(err.message || '未找到视频数据，请先录入')
              })
          })
      })
      .finally(() => setLoading(false))

    getVideoData(userId)
      .then((videoData) => {
        setVideosForAttribution(videoData?.videos || [])
      })
      .catch(() => setVideosForAttribution([]))

    getAttribution(userId)
      .then((data) => setAttribution(data))
      .catch(() => setAttribution(null))
  }, [userId])

  const activeCharts = dashboard?.chartsByMetric?.[activeMetric]
  const allZero = useMemo(() => {
    if (!activeCharts) return false
    const trendValues = activeCharts.trendChart.dataPoints.map((d) => d.value).filter((v) => v !== null)
    const compValues = activeCharts.comparisonChart.groups.map((g) => g.avgValue).filter((v) => v !== 0)
    return trendValues.length > 0 && trendValues.every((v) => v === 0) && compValues.length === 0
  }, [activeCharts])

  const handleRegenerate = async () => {
    if (!userId) return
    setLoading(true)
    try {
      const data = await generateDashboard(userId)
      setDashboard(data)
      setChartError(false)
    } catch (err) {
      setError(err.message || '生成看板失败')
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyzeAttribution = async () => {
    if (!userId || !dashboard || videosForAttribution.length === 0) return
    setAttributionLoading(true)
    setAttributionError(null)
    try {
      const data = await analyzeAttribution({
        userId,
        videos: videosForAttribution,
        positioningCard,
        dashboard,
        ipPlan
      })
      setAttribution(data)
    } catch (err) {
      setAttributionError(err.message || '归因分析失败')
    } finally {
      setAttributionLoading(false)
    }
  }

  return (
    <div className="page" style={{ minHeight: '100vh', paddingBottom: 40 }}>
      <div className="top-nav">
        <button className="top-nav__back" onClick={() => navigate('/data/input')}>
          <BackIcon size={20} />
          <span>数据复盘</span>
        </button>
      </div>

      <div className="container" style={{ paddingTop: 80 }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>7 条视频对比看板</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            切换指标，查看趋势变化和栏目对比
          </p>
        </div>

        {loading && (
          <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
            <div className="spinner" style={{ margin: '0 auto 16px' }} />
            <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>正在加载看板...</p>
          </div>
        )}

        {error && !loading && (
          <div className="glass-card" style={{ padding: 20, background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.2)' }}>
            <p style={{ margin: '0 0 12px', fontSize: 14, color: '#b91c1c', lineHeight: 1.5 }}>{error}</p>
            <button className="btn btn-purple" onClick={() => navigate('/data/input')}>
              去录入视频数据
            </button>
          </div>
        )}

        {!loading && !error && dashboard && (
          <>
            {dashboard.isInsufficient && (
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
                  当前视频数据不足 3 条，趋势和对比结论仅供参考。
                </p>
              </div>
            )}

            <div className="glass-card" style={{ padding: 12, marginBottom: 16, overflowX: 'auto' }}>
              <div style={{ display: 'flex', gap: 8, minWidth: 'max-content' }}>
                {METRICS.map((metric) => (
                  <button
                    key={metric.key}
                    className={`btn btn-sm ${activeMetric === metric.key ? 'btn-purple' : 'btn-outline'}`}
                    onClick={() => {
                      setActiveMetric(metric.key)
                      setChartError(false)
                    }}
                  >
                    {metric.label}
                  </button>
                ))}
              </div>
            </div>

            {allZero && (
              <div className="glass-card" style={{ padding: 20, marginBottom: 16, textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>
                  该指标下所有数据均为 0，暂无有效对比信息
                </p>
              </div>
            )}

            {activeCharts && !chartError && !allZero && (
              <div style={{ display: 'flex', gap: 24, maxWidth: 920, margin: '0 auto 32px' }}>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'rgba(255,255,255,0.60)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(44,44,44,0.06)',
                    borderRadius: 16,
                    padding: 24
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 4, height: 22, background: '#8b5cf6', borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#2c2c2c' }}>{activeCharts.trendChart.label}趋势</span>
                  </div>
                  <div onError={() => setChartError(true)}>
                    <TrendChart data={activeCharts.trendChart} metricKey={activeMetric} />
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'rgba(255,255,255,0.60)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(44,44,44,0.06)',
                    borderRadius: 16,
                    padding: 24
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 4, height: 22, background: '#8b5cf6', borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#2c2c2c' }}>{activeCharts.comparisonChart.label}栏目对比</span>
                  </div>
                  <div onError={() => setChartError(true)}>
                    <ComparisonChart data={activeCharts.comparisonChart} metricKey={activeMetric} />
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: 'rgba(255,255,255,0.60)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(44,44,44,0.06)',
                    borderRadius: 16,
                    padding: 24
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 4, height: 22, background: '#8b5cf6', borderRadius: 2, flexShrink: 0 }} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#2c2c2c' }}>用户画像诊断</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                      <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>你的内容正在吸引谁</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                        {positioningCard?.tags?.length > 0 ? (
                          positioningCard.tags.map((tag) => (
                            <span key={tag} className="tag-purple" style={{ fontSize: 12 }}>{tag}</span>
                          ))
                        ) : (
                          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>暂无定位标签</span>
                        )}
                      </div>
                      <RadarChart values={[75, 45, 82, 60, 35]} labels={['年龄', '地域', '兴趣', '互动', '转粉']} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600 }}>有没有偏离你的定位？</h4>
                      <span
                        style={{
                          display: 'inline-block',
                          fontSize: 12,
                          fontWeight: 600,
                          color: '#d4920a',
                          background: 'rgba(234,179,8,0.12)',
                          padding: '4px 12px',
                          borderRadius: 999
                        }}
                      >
                        轻微偏移
                      </span>
                      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0' }}>
                        <li style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>年龄段与目标人群基本吻合</li>
                        <li style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 8, lineHeight: 1.5 }}>一线城市占比偏高，地域略有偏移</li>
                        <li style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>转粉率偏低，需强化关注动机</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(chartError || allZero) && activeCharts && (
              <div className="glass-card" style={{ padding: 16, marginBottom: 16 }}>
                <ChartFallback trendData={activeCharts.trendChart} comparisonData={activeCharts.comparisonChart} metricKey={activeMetric} />
              </div>
            )}

            {dashboard.isInsufficient ? (
              <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5, textAlign: 'center' }}>
                视频数据不足 3 条，暂无法进行归因诊断。建议至少录入 3 条后再试。
              </p>
            ) : (
              <>
                {!attribution && !attributionLoading && (
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                    <button className="btn btn-purple" onClick={handleAnalyzeAttribution}>
                      开始归因分析
                    </button>
                  </div>
                )}

                {attributionLoading && (
                  <div style={{ textAlign: 'center', padding: 20 }}>
                    <div className="spinner" style={{ margin: '0 auto 12px' }} />
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>正在分析数据...</p>
                  </div>
                )}

                {attributionError && (
                  <div style={{ padding: 12, borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.08)', marginBottom: 12 }}>
                    <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{attributionError}</p>
                  </div>
                )}

                {attribution && (
                  <>
                    {attribution.attributions?.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '16px 0' }}>
                        <p style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--color-text-secondary)' }}>
                          未发现明显低于行业均值的问题
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                        {attribution.attributions.map((item, index) => (
                          <div
                            key={index}
                            style={{
                              padding: 14,
                              borderRadius: 'var(--radius-md)',
                              background: 'rgba(139,92,246,0.06)',
                              border: '1px solid rgba(139,92,246,0.12)'
                            }}
                          >
                            <h4 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: '#7c3aed' }}>
                              {item.name}
                            </h4>
                            <p style={{ margin: '0 0 6px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                              <strong>数据依据：</strong>{item.dataEvidence}
                            </p>
                            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                              <strong>内容分析：</strong>{item.contentAnalysis}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                      <button className="btn btn-purple" onClick={() => navigate('/optimization')}>
                        生成优化建议
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            <button className="btn btn-outline btn-full" onClick={handleRegenerate} disabled={loading}>
              重新生成看板
            </button>
          </>
        )}
      </div>
    </div>
  )
}
