import { useEffect, useRef } from 'react'

const MOUSE_RADIUS = 180
const WIPE_FORCE = 0.9
const RECOVER_DELAY = 1800
const RESPAWN_DELAY = 2200

function createFogBlob(w, h) {
  return {
    x: Math.random() * w,
    y: Math.random() * h,
    baseX: Math.random() * w,
    baseY: Math.random() * h,
    r: 50 + Math.random() * 90,
    opacity: 0.015 + Math.random() * 0.025,
    baseOpacity: 0.015 + Math.random() * 0.025,
    recoverAt: 0,
    state: 'fog'
  }
}

function createDrop(w, h) {
  const x = Math.random() * w
  const y = Math.random() * h
  return {
    x,
    y,
    baseX: x,
    baseY: y,
    vx: 0,
    vy: 0,
    r: 2.2 + Math.random() * 3.2,
    opacity: 0.35 + Math.random() * 0.35,
    baseOpacity: 0.35 + Math.random() * 0.35,
    recoverAt: 0,
    state: 'drop'
  }
}

export default function FoggyGlassCanvas() {
  const canvasRef = useRef(null)
  const mouseRef = useRef({ x: -1000, y: -1000, active: false })
  const fogRef = useRef([])
  const dropsRef = useRef([])
  const rafRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = `${window.innerWidth}px`
      canvas.style.height = `${window.innerHeight}px`
      ctx.scale(dpr, dpr)
      initFog(window.innerWidth, window.innerHeight)
      initDrops(window.innerWidth, window.innerHeight)
    }

    const initFog = (w, h) => {
      const area = w * h
      const count = Math.max(30, Math.floor(area / 42000))
      fogRef.current = Array.from({ length: count }, () => createFogBlob(w, h))
    }

    const initDrops = (w, h) => {
      const area = w * h
      const count = Math.max(18, Math.floor(area / 38000))
      dropsRef.current = Array.from({ length: count }, () => createDrop(w, h))
    }

    const onMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true }
    }
    const onLeave = () => {
      mouseRef.current = { x: -1000, y: -1000, active: false }
    }

    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseleave', onLeave)
    resize()

    const animate = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      const mouse = mouseRef.current
      const now = performance.now()

      ctx.clearRect(0, 0, w, h)

      // 绘制水雾层：大半径柔和圆重叠，形成连续薄雾
      for (let p of fogRef.current) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const near = mouse.active && dist < MOUSE_RADIUS && dist > 0.001

        if (near) {
          const force = (1 - dist / MOUSE_RADIUS) * WIPE_FORCE
          const nx = dx / dist
          const ny = dy / dist
          p.opacity = Math.max(0.003, p.opacity - force * 0.045)
          p.x += nx * force * 2.5
          p.y += ny * force * 2.5
          p.recoverAt = now + RECOVER_DELAY
        } else if (now > p.recoverAt) {
          p.opacity += (p.baseOpacity - p.opacity) * 0.025
          p.x += (p.baseX - p.x) * 0.012
          p.y += (p.baseY - p.y) * 0.012
        }

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r)
        g.addColorStop(0, `rgba(255, 255, 255, ${p.opacity})`)
        g.addColorStop(1, 'rgba(255, 255, 255, 0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fill()
      }

      // 绘制水珠：静止吸附，仅被鼠标推开
      for (let p of dropsRef.current) {
        const dx = p.x - mouse.x
        const dy = p.y - mouse.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const near = mouse.active && dist < MOUSE_RADIUS * 0.75 && dist > 0.001

        if (near) {
          const force = (1 - dist / (MOUSE_RADIUS * 0.75)) * WIPE_FORCE
          const nx = dx / dist
          const ny = dy / dist
          p.vx += nx * force * 0.7
          p.vy += ny * force * 0.7
          p.recoverAt = now + RECOVER_DELAY
        }

        // 缓慢回到原位（吸附感）
        p.vx += (p.baseX - p.x) * 0.006
        p.vy += (p.baseY - p.y) * 0.006
        p.vx *= 0.92
        p.vy *= 0.92
        p.x += p.vx
        p.y += p.vy

        // 绘制水滴主体
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.scale(1, 0.9)

        ctx.beginPath()
        ctx.arc(0, 0, p.r, 0, Math.PI * 2)
        const grad = ctx.createRadialGradient(-p.r * 0.35, -p.r * 0.35, 0, 0, 0, p.r)
        grad.addColorStop(0, `rgba(255, 255, 255, ${p.opacity + 0.3})`)
        grad.addColorStop(0.55, `rgba(255, 255, 255, ${p.opacity * 0.7})`)
        grad.addColorStop(1, `rgba(255, 255, 255, ${p.opacity * 0.15})`)
        ctx.fillStyle = grad
        ctx.fill()

        // 高光
        ctx.beginPath()
        ctx.arc(-p.r * 0.32, -p.r * 0.32, p.r * 0.22, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity + 0.4})`
        ctx.fill()

        ctx.restore()
      }

      rafRef.current = requestAnimationFrame(animate)
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseleave', onLeave)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 0
      }}
      aria-hidden="true"
    />
  )
}
