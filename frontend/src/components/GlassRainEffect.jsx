import React, { useEffect, useRef } from 'react'

/**
 * 玻璃水雾水珠特效组件
 *
 * 分层结构（从底层到顶层）：
 * 1. 自定义全屏背景图（props.bgImage）
 * 2. 半透明磨砂雾化玻璃蒙版
 * 3. 动态水珠层（带折射高光、融合、滑落物理效果）
 *
 * 交互：
 * - 鼠标划过擦除雾气、推开水珠
 * - 水珠碰撞融合，达到阈值后垂直滑落
 * - 擦除区域 3 秒后缓慢恢复雾气和水珠
 *
 * 使用方式：
 * <GlassRainEffect bgImage="/bg-glass-butterfly.png" zIndex={0} />
 *
 * 注意：组件本身 pointer-events: none，不会遮挡页面交互。
 */
export default function GlassRainEffect({
  bgImage = '/bg-glass-butterfly.webp',
  zIndex = 0,
  fogOpacity = 0.32,
  dropCount = 90,
  wipeRadius = 90,
  recoveryDelay = 3000
}) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    let rafId = null
    let width = 0
    let height = 0
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    // 鼠标位置（使用 lastMove 做线性插值，让擦除更顺滑）
    const mouse = { x: -1000, y: -1000, active: false }
    const lastMove = { x: -1000, y: -1000 }

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect()
      mouse.x = e.clientX - rect.left
      mouse.y = e.clientY - rect.top
      mouse.active = true
      lastMove.x = mouse.x
      lastMove.y = mouse.y
    }
    const handleMouseLeave = () => {
      mouse.active = false
      mouse.x = -1000
      mouse.y = -1000
    }
    const handleTouchMove = (e) => {
      if (e.touches && e.touches[0]) {
        const rect = canvas.getBoundingClientRect()
        mouse.x = e.touches[0].clientX - rect.left
        mouse.y = e.touches[0].clientY - rect.top
        mouse.active = true
        lastMove.x = mouse.x
        lastMove.y = mouse.y
      }
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mouseleave', handleMouseLeave, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.floor(width * dpr)
      canvas.height = Math.floor(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize, { passive: true })

    // ---------------- 雾气层 ----------------
    // 雾气由大量柔和圆斑组成，均匀分布
    const fogCount = Math.min(160, Math.floor((width * height) / 12000))
    const fogs = []
    for (let i = 0; i < fogCount; i++) {
      fogs.push({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 60 + Math.random() * 120,
        baseA: 0.18 + Math.random() * 0.22,
        a: 0.18 + Math.random() * 0.22,
        wipedAt: -Infinity,
        phase: Math.random() * Math.PI * 2
      })
    }

    // ---------------- 水珠层 ----------------
    class Drop {
      constructor(initial = false) {
        this.reset(initial)
      }

      reset(initial = false) {
        this.r = 2 + Math.random() * 4.5 // 基础小水珠半径
        this.x = Math.random() * width
        this.y = initial ? Math.random() * height : -this.r - Math.random() * 80
        this.baseX = this.x
        this.baseY = this.y
        this.vx = 0
        this.vy = 0
        this.mass = this.r * this.r // 质量与面积成正比
        this.sliding = false
        this.trail = [] // 下滑水痕轨迹点
        this.maxTrailLength = 6
        this.spawnDelay = initial ? 0 : Math.random() * 2000
        this.spawnedAt = performance.now()
      }

      update(dt, now) {
        if (now - this.spawnedAt < this.spawnDelay) return

        // 1. 鼠标排斥：鼠标划过时才推开范围内的水珠
        const dx = this.x - mouse.x
        const dy = this.y - mouse.y
        const dist = Math.hypot(dx, dy)
        const repelR = wipeRadius + this.r
        const isMouseNear = dist < repelR && dist > 0.1

        if (isMouseNear) {
          const force = (1 - dist / repelR) * 1400 * dt
          this.vx += (dx / dist) * force
          this.vy += (dy / dist) * force
        }

        // 2. 重力与滑落：融合后变重才开始下滑
        const slideThreshold = 22
        if (this.mass > slideThreshold && !this.sliding) {
          this.sliding = true
        }

        if (this.sliding) {
          const gravity = 30 + this.mass * 1.5
          this.vy += gravity * dt
          this.vx *= 0.96

          this.trail.push({ x: this.x, y: this.y })
          if (this.trail.length > this.maxTrailLength) this.trail.shift()
        } else if (isMouseNear) {
          // 仅在鼠标交互时运动，离开后快速静止
          this.vx *= 0.82
          this.vy *= 0.82
        } else {
          // 无鼠标交互时完全静止吸附在玻璃上
          this.vx = 0
          this.vy = 0
          this.baseX = this.x
          this.baseY = this.y
        }

        // 3. 速度更新位置
        this.x += this.vx * dt
        this.y += this.vy * dt

        // 4. 边界处理
        if (this.y > height + this.r + 20) {
          this.reset(false)
        }
        if (this.x < -this.r) this.x = width + this.r
        if (this.x > width + this.r) this.x = -this.r
      }

      drawLens(ctx) {
        if (performance.now() - this.spawnedAt < this.spawnDelay) return

        const r = this.r

        // 用 destination-out 擦除 Canvas 上的雾气，露出底层背景，模拟水滴的透明折射
        ctx.save()
        ctx.globalCompositeOperation = 'destination-out'

        const clearGrad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, r)
        const centerA = Math.min(0.95, 0.78 + this.mass * 0.0015)
        const midA = Math.min(0.75, 0.42 + this.mass * 0.0008)
        clearGrad.addColorStop(0, `rgba(255,255,255,${centerA})`)
        clearGrad.addColorStop(0.65, `rgba(255,255,255,${midA})`)
        clearGrad.addColorStop(1, 'rgba(255,255,255,0)')

        ctx.beginPath()
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2)
        ctx.fillStyle = clearGrad
        ctx.fill()
        ctx.restore()
      }

      drawBody(ctx) {
        if (performance.now() - this.spawnedAt < this.spawnDelay) return

        const r = this.r

        // 绘制水痕
        if (this.sliding && this.trail.length > 1) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(this.trail[0].x, this.trail[0].y)
          for (let i = 1; i < this.trail.length; i++) {
            ctx.lineTo(this.trail[i].x, this.trail[i].y)
          }
          ctx.lineCap = 'round'
          ctx.lineWidth = Math.max(1, r * 0.35)
          ctx.strokeStyle = 'rgba(255,255,255,0.24)'
          ctx.stroke()
          ctx.restore()
        }

        // 极细水膜边缘
        ctx.beginPath()
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2)
        ctx.lineWidth = Math.max(0.35, r * 0.055)
        ctx.strokeStyle = 'rgba(255,255,255,0.34)'
        ctx.stroke()

        // 主高光
        ctx.beginPath()
        ctx.arc(this.x - r * 0.35, this.y - r * 0.35, Math.max(0.8, r * 0.22), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.92)'
        ctx.fill()

        // 次高光
        ctx.beginPath()
        ctx.arc(this.x + r * 0.28, this.y + r * 0.32, Math.max(0.5, r * 0.11), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.48)'
        ctx.fill()

        // 底部淡蓝折射阴影，增加通透感
        ctx.beginPath()
        ctx.arc(this.x + r * 0.18, this.y + r * 0.22, Math.max(0.5, r * 0.13), 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(170,200,225,0.18)'
        ctx.fill()
      }
    }

    const drops = []
    for (let i = 0; i < dropCount; i++) drops.push(new Drop(true))

    // 检测并融合相邻水珠
    const mergeDrops = () => {
      for (let i = 0; i < drops.length; i++) {
        const a = drops[i]
        if (!a || a.mass <= 0) continue
        for (let j = i + 1; j < drops.length; j++) {
          const b = drops[j]
          if (!b || b.mass <= 0) continue
          const dx = a.x - b.x
          const dy = a.y - b.y
          const dist = Math.hypot(dx, dy)
          if (dist < a.r + b.r && dist > 0.1) {
            // 融合：面积相加
            const newMass = a.mass + b.mass
            const newR = Math.sqrt(newMass)
            // 动量守恒
            a.vx = (a.vx * a.mass + b.vx * b.mass) / newMass
            a.vy = (a.vy * a.mass + b.vy * b.mass) / newMass
            a.mass = newMass
            a.r = newR
            a.x = (a.x * a.mass + b.x * b.mass) / (a.mass + b.mass)
            a.y = (a.y * a.mass + b.y * b.mass) / (a.mass + b.mass)
            a.baseX = a.x
            a.baseY = a.y
            // 标记 b 为死亡，稍后重生为顶部小水珠
            b.reset(false)
            break // 每帧每个水珠只融合一次，避免过度合并
          }
        }
      }
    }

    // 雾气擦除与恢复
    const updateFog = (now) => {
      const wipeR = wipeRadius
      const wipeR2 = wipeR * wipeR
      fogs.forEach((f) => {
        const dx = f.x - mouse.x
        const dy = f.y - mouse.y
        const d2 = dx * dx + dy * dy
        if (d2 < wipeR2) {
          f.wipedAt = now
          f.a = Math.max(0, f.a - 0.18)
        }

        // 3 秒后开始恢复
        const elapsed = now - f.wipedAt
        if (elapsed > recoveryDelay) {
          // 缓慢恢复，带一点呼吸波动
          const breathe = Math.sin(now * 0.001 + f.phase) * 0.03
          const target = Math.max(0, f.baseA + breathe)
          f.a += (target - f.a) * 0.015
        }
      })
    }

    // 在鼠标擦除区域延迟生成新的小水珠
    const maybeSpawnFromWipe = (now) => {
      if (!mouse.active) return
      // 每帧有较小概率在被擦除区域附近生成新水珠
      if (Math.random() < 0.08) {
        const angle = Math.random() * Math.PI * 2
        const dist = Math.random() * wipeRadius
        const sx = mouse.x + Math.cos(angle) * dist
        const sy = mouse.y + Math.sin(angle) * dist
        // 找到已滑出屏幕或刚重生的水珠，重新定位
        const dead = drops.find((d) => d.y < -20 && performance.now() - d.spawnedAt > d.spawnDelay + 500)
        if (dead) {
          dead.r = 1.5 + Math.random() * 2.5
          dead.mass = dead.r * dead.r
          dead.x = sx
          dead.y = sy
          dead.baseX = sx
          dead.baseY = sy
          dead.vx = 0
          dead.vy = 0
          dead.sliding = false
          dead.trail = []
          dead.spawnDelay = 0
          dead.spawnedAt = now - recoveryDelay - 100 // 已经可以被绘制
        }
      }
    }

    let lastTime = performance.now()
    const loop = (now) => {
      const dt = Math.min((now - lastTime) / 1000, 0.033)
      lastTime = now

      ctx.clearRect(0, 0, width, height)

      // 1. 绘制雾气层
      updateFog(now)
      ctx.save()
      for (const f of fogs) {
        if (f.a <= 0.005) continue
        ctx.beginPath()
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2)
        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r)
        grad.addColorStop(0, `rgba(255,255,255,${f.a * fogOpacity})`)
        grad.addColorStop(1, 'rgba(255,255,255,0)')
        ctx.fillStyle = grad
        ctx.fill()
      }
      ctx.restore()

      // 2. 更新水珠
      for (const d of drops) d.update(dt, now)
      mergeDrops()
      maybeSpawnFromWipe(now)

      // 3. 先用水珠形状擦除雾气（露出底层背景），再绘制水膜边缘与高光
      for (const d of drops) d.drawLens(ctx)
      for (const d of drops) d.drawBody(ctx)

      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseleave', handleMouseLeave)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('resize', resize)
    }
  }, [bgImage, dropCount, fogOpacity, recoveryDelay, wipeRadius])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        pointerEvents: 'none',
        overflow: 'hidden'
      }}
    >
      {/* 底层背景图 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(${bgImage})`,
          backgroundPosition: 'center center',
          backgroundSize: 'cover',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed'
        }}
      />

      {/* 中间磨砂雾化玻璃蒙版：极淡，让底层背景图清晰可见 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backdropFilter: 'blur(6px) saturate(104%)',
          WebkitBackdropFilter: 'blur(6px) saturate(104%)',
          background: 'rgba(248, 249, 250, 0.02)',
          boxShadow: 'inset 0 0 80px rgba(255,255,255,0.06)'
        }}
      />

      {/* 顶层动态水珠 Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  )
}
