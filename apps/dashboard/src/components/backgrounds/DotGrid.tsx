"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { gsap } from "gsap"
import { InertiaPlugin } from "gsap/InertiaPlugin"

gsap.registerPlugin(InertiaPlugin)

type ThrottledCallback<TArgs extends unknown[]> = (...args: TArgs) => void

function throttle<TArgs extends unknown[]>(
  callback: ThrottledCallback<TArgs>,
  limit: number
): ThrottledCallback<TArgs> {
  let lastCall = 0

  return (...args: TArgs) => {
    const now = performance.now()

    if (now - lastCall >= limit) {
      lastCall = now
      callback(...args)
    }
  }
}

type Dot = {
  cx: number
  cy: number
  xOffset: number
  yOffset: number
  inertiaApplied: boolean
}

export type DotGridProps = {
  activeColor?: string
  baseColor?: string
  className?: string
  dotSize?: number
  gap?: number
  idleAnimation?: boolean
  idleColor?: string
  idlePulseInterval?: number
  idlePulseRadius?: number
  idleStrength?: number
  maxSpeed?: number
  proximity?: number
  resistance?: number
  returnDuration?: number
  shockRadius?: number
  shockStrength?: number
  speedTrigger?: number
  style?: CSSProperties
}

type Rgb = { b: number; g: number; r: number }

function hexToRgb(hex: string): Rgb {
  const match = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i)

  if (!match) {
    return { r: 0, g: 0, b: 0 }
  }

  return {
    r: Number.parseInt(match[1] ?? "0", 16),
    g: Number.parseInt(match[2] ?? "0", 16),
    b: Number.parseInt(match[3] ?? "0", 16),
  }
}

const IDLE_ACCENT_RGB = hexToRgb("#818cf8")

function mixRgb(from: Rgb, to: Rgb, amount: number): string {
  const red = Math.round(from.r + (to.r - from.r) * amount)
  const green = Math.round(from.g + (to.g - from.g) * amount)
  const blue = Math.round(from.b + (to.b - from.b) * amount)

  return `rgb(${red},${green},${blue})`
}

export function DotGrid({
  activeColor = "#22d3ee",
  baseColor = "#164e63",
  className = "",
  dotSize = 5,
  gap = 24,
  idleAnimation = true,
  idleColor = "#22d3ee",
  idlePulseInterval = 5.5,
  idlePulseRadius = 72,
  idleStrength = 0.48,
  maxSpeed = 2200,
  proximity = 130,
  resistance = 900,
  returnDuration = 1.8,
  shockRadius = 180,
  shockStrength = 2.5,
  speedTrigger = 180,
  style,
}: DotGridProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dotsRef = useRef<Dot[]>([])
  const pointerRef = useRef({
    x: Number.NEGATIVE_INFINITY,
    y: Number.NEGATIVE_INFINITY,
    vx: 0,
    vy: 0,
    speed: 0,
    lastTime: 0,
    lastX: 0,
    lastY: 0,
    lastActivity: Number.NEGATIVE_INFINITY,
  })
  const [reducedMotion, setReducedMotion] = useState(false)
  const [gridVersion, setGridVersion] = useState(0)
  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor])
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor])
  const idleRgb = useMemo(() => hexToRgb(idleColor), [idleColor])
  const circlePath = useMemo(() => {
    if (typeof window === "undefined" || !window.Path2D) {
      return null
    }

    const path = new Path2D()
    path.arc(0, 0, dotSize / 2, 0, Math.PI * 2)
    return path
  }, [dotSize])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    const updatePreference = () => setReducedMotion(mediaQuery.matches)

    updatePreference()
    mediaQuery.addEventListener("change", updatePreference)

    return () => mediaQuery.removeEventListener("change", updatePreference)
  }, [])

  const buildGrid = useCallback(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current

    if (!wrapper || !canvas) {
      return
    }

    const { height, width } = wrapper.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const context = canvas.getContext("2d")
    context?.setTransform(dpr, 0, 0, dpr, 0, 0)

    const columns = Math.floor((width + gap) / (dotSize + gap))
    const rows = Math.floor((height + gap) / (dotSize + gap))
    const cell = dotSize + gap
    const gridWidth = cell * columns - gap
    const gridHeight = cell * rows - gap
    const startX = (width - gridWidth) / 2 + dotSize / 2
    const startY = (height - gridHeight) / 2 + dotSize / 2
    const dots: Dot[] = []

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        dots.push({
          cx: startX + column * cell,
          cy: startY + row * cell,
          xOffset: 0,
          yOffset: 0,
          inertiaApplied: false,
        })
      }
    }

    dotsRef.current = dots
    setGridVersion((version) => version + 1)
  }, [dotSize, gap])

  useEffect(() => {
    buildGrid()
    const wrapper = wrapperRef.current

    if (!wrapper) {
      return
    }

    const resizeObserver = new ResizeObserver(buildGrid)
    resizeObserver.observe(wrapper)

    return () => resizeObserver.disconnect()
  }, [buildGrid])

  useEffect(() => {
    if (!circlePath) {
      return
    }

    let animationFrame = 0
    let documentVisible = !document.hidden
    let panelVisible = true
    const proximitySquared = proximity * proximity
    const pulseIntervalMs = idlePulseInterval * 1000

    const scheduleFrame = () => {
      if (
        !reducedMotion &&
        documentVisible &&
        panelVisible &&
        animationFrame === 0
      ) {
        animationFrame = requestAnimationFrame(draw)
      }
    }

    const draw = (time = performance.now()) => {
      animationFrame = 0
      const canvas = canvasRef.current
      const context = canvas?.getContext("2d")

      if (!canvas || !context) {
        return
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const width = canvas.width / dpr
      const height = canvas.height / dpr
      context.clearRect(0, 0, width, height)
      const { x: pointerX, y: pointerY } = pointerRef.current
      const pointerAge = time - pointerRef.current.lastActivity
      const pointerInfluence = reducedMotion
        ? 0
        : Math.max(0, Math.min(1, 1 - pointerAge / 1800))
      const pulsePhase = (time % pulseIntervalMs) / pulseIntervalMs
      const pulseIndex = Math.floor(time / pulseIntervalMs)
      const pulseEnvelope = Math.sin(Math.PI * pulsePhase) ** 2
      const driftX = Math.sin(time * 0.000083) * width * 0.16
      const driftY = Math.cos(time * 0.000061) * height * 0.14
      const pulseOriginX = width * 0.5 + driftX
      const pulseOriginY = height * 0.5 + driftY
      const maximumWaveDistance = Math.hypot(width, height) * 0.62
      const waveDistance = pulsePhase * maximumWaveDistance
      const pulseTargetRgb = pulseIndex % 3 === 2 ? IDLE_ACCENT_RGB : idleRgb
      const idleInfluence =
        idleAnimation && !reducedMotion
          ? idleStrength * (1 - pointerInfluence * 0.78)
          : 0

      for (const dot of dotsRef.current) {
        const deltaX = dot.cx - pointerX
        const deltaY = dot.cy - pointerY
        const distanceSquared = deltaX * deltaX + deltaY * deltaY
        let idleAmount = 0

        if (reducedMotion) {
          const staticDistance = Math.hypot(
            dot.cx - width * 0.5,
            dot.cy - height * 0.46
          )
          idleAmount =
            Math.max(0, 1 - staticDistance / Math.max(width, height)) * 0.16
        } else if (idleInfluence > 0) {
          const distanceFromPulse = Math.hypot(
            dot.cx - pulseOriginX,
            dot.cy - pulseOriginY
          )
          const distanceFromWave = Math.abs(distanceFromPulse - waveDistance)
          const waveAmount = Math.max(0, 1 - distanceFromWave / idlePulseRadius)
          idleAmount = waveAmount * waveAmount * pulseEnvelope * idleInfluence
        }

        let fillStyle =
          idleAmount > 0
            ? mixRgb(baseRgb, pulseTargetRgb, idleAmount)
            : baseColor
        let scale = 1 + idleAmount * 0.42

        if (
          !reducedMotion &&
          pointerInfluence > 0 &&
          distanceSquared <= proximitySquared
        ) {
          const amount = 1 - Math.sqrt(distanceSquared) / proximity
          const pointerAmount = amount * pointerInfluence
          fillStyle = mixRgb(baseRgb, activeRgb, pointerAmount)
          scale = Math.max(scale, 1 + pointerAmount * 0.22)
        }

        context.save()
        context.translate(dot.cx + dot.xOffset, dot.cy + dot.yOffset)
        context.scale(scale, scale)
        context.fillStyle = fillStyle
        context.fill(circlePath)
        context.restore()
      }

      scheduleFrame()
    }

    const onVisibilityChange = () => {
      documentVisible = !document.hidden

      if (!documentVisible) {
        cancelAnimationFrame(animationFrame)
        animationFrame = 0
        return
      }

      scheduleFrame()
    }
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      panelVisible = entry?.isIntersecting ?? false

      if (!panelVisible) {
        cancelAnimationFrame(animationFrame)
        animationFrame = 0
        return
      }

      scheduleFrame()
    })
    const wrapper = wrapperRef.current

    if (wrapper) {
      intersectionObserver.observe(wrapper)
    }
    document.addEventListener("visibilitychange", onVisibilityChange)
    draw()

    return () => {
      cancelAnimationFrame(animationFrame)
      intersectionObserver.disconnect()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [
    activeRgb,
    baseColor,
    baseRgb,
    circlePath,
    gridVersion,
    idleAnimation,
    idlePulseInterval,
    idlePulseRadius,
    idleRgb,
    idleStrength,
    proximity,
    reducedMotion,
  ])

  useEffect(() => {
    const wrapper = wrapperRef.current

    if (!wrapper || reducedMotion) {
      return
    }

    const onMove = (event: PointerEvent) => {
      const now = performance.now()
      const pointer = pointerRef.current
      const elapsed = pointer.lastTime ? now - pointer.lastTime : 16
      const deltaX = event.clientX - pointer.lastX
      const deltaY = event.clientY - pointer.lastY
      let velocityX = (deltaX / elapsed) * 1000
      let velocityY = (deltaY / elapsed) * 1000
      let speed = Math.hypot(velocityX, velocityY)

      if (speed > maxSpeed) {
        const scale = maxSpeed / speed
        velocityX *= scale
        velocityY *= scale
        speed = maxSpeed
      }

      pointer.lastTime = now
      pointer.lastX = event.clientX
      pointer.lastY = event.clientY
      pointer.vx = velocityX
      pointer.vy = velocityY
      pointer.speed = speed
      pointer.lastActivity = now

      const rect = wrapper.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top

      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - pointer.x, dot.cy - pointer.y)

        if (
          speed > speedTrigger &&
          distance < proximity &&
          !dot.inertiaApplied
        ) {
          dot.inertiaApplied = true
          gsap.killTweensOf(dot)
          const pushX = dot.cx - pointer.x + velocityX * 0.003
          const pushY = dot.cy - pointer.y + velocityY * 0.003

          gsap.to(dot, {
            inertia: { xOffset: pushX, yOffset: pushY, resistance },
            onComplete: () => {
              gsap.to(dot, {
                xOffset: 0,
                yOffset: 0,
                duration: returnDuration,
                ease: "power3.out",
              })
              dot.inertiaApplied = false
            },
          })
        }
      }
    }

    const onClick = (event: MouseEvent) => {
      pointerRef.current.lastActivity = performance.now()
      const rect = wrapper.getBoundingClientRect()
      const clickX = event.clientX - rect.left
      const clickY = event.clientY - rect.top

      for (const dot of dotsRef.current) {
        const distance = Math.hypot(dot.cx - clickX, dot.cy - clickY)

        if (distance < shockRadius && !dot.inertiaApplied) {
          dot.inertiaApplied = true
          gsap.killTweensOf(dot)
          const falloff = Math.max(0, 1 - distance / shockRadius)

          gsap.to(dot, {
            inertia: {
              xOffset: (dot.cx - clickX) * shockStrength * falloff,
              yOffset: (dot.cy - clickY) * shockStrength * falloff,
              resistance,
            },
            onComplete: () => {
              gsap.to(dot, {
                xOffset: 0,
                yOffset: 0,
                duration: returnDuration,
                ease: "power3.out",
              })
              dot.inertiaApplied = false
            },
          })
        }
      }
    }

    const onLeave = () => {
      pointerRef.current.x = Number.NEGATIVE_INFINITY
      pointerRef.current.y = Number.NEGATIVE_INFINITY
    }
    const throttledMove = throttle(onMove, 40)

    wrapper.addEventListener("pointermove", throttledMove, { passive: true })
    wrapper.addEventListener("pointerleave", onLeave, { passive: true })
    wrapper.addEventListener("click", onClick)

    return () => {
      wrapper.removeEventListener("pointermove", throttledMove)
      wrapper.removeEventListener("pointerleave", onLeave)
      wrapper.removeEventListener("click", onClick)
      gsap.killTweensOf(dotsRef.current)
    }
  }, [
    maxSpeed,
    proximity,
    reducedMotion,
    resistance,
    returnDuration,
    shockRadius,
    shockStrength,
    speedTrigger,
  ])

  return (
    <div
      aria-hidden="true"
      className={`relative size-full overflow-hidden ${className}`}
      style={style}
    >
      <div className="relative size-full" ref={wrapperRef}>
        <canvas
          className="pointer-events-none absolute inset-0 size-full"
          ref={canvasRef}
        />
      </div>
    </div>
  )
}
