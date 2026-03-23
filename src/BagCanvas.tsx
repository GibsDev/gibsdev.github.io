import { useCallback, useEffect, useRef, useState } from 'react'
import {
  bezierPoint,
  canvasToWorld,
  clampWorld,
  worldToCanvas,
} from './bagCoords'

export type FlightDisc = {
  id: string
  name: string
  color: string
  /** First control point (from tee); start of flight is always (0, 0). */
  startHandle: { x: number; y: number }
  /** Second control point before landing. */
  endHandle: { x: number; y: number }
  /** Landing position. */
  end: { x: number; y: number }
}

type DragKind = 'start' | 'end' | 'landing'

const HANDLE_RADIUS = 9
const DISC_RADIUS = 14
const HIT_PAD = 4
const DISC_LABEL_FONT_PX = 10
const DISC_LABEL_GAP = 5
const DISC_LABEL_MAX_WIDTH = 140

/** Neutral: all paths equally faded. Focused: one strong, others faded. */
const PATH_ALPHA_NEUTRAL = 0.4
const PATH_ALPHA_UNFOCUSED = 0.18
const PATH_ALPHA_FOCUSED = 0.95

const MARKER_FILL_UNFOCUSED = 0.32
const MARKER_TEXT_UNFOCUSED = 0.35

function distance(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx
  const dy = ay - by
  return Math.hypot(dx, dy)
}

/** Full name above the disc; fixed font size, ellipsis if wider than max width. */
function drawDiscNameLabel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  name: string,
  opacity: number,
) {
  const family = 'ui-sans-serif, system-ui, sans-serif'
  ctx.font = `600 ${DISC_LABEL_FONT_PX}px ${family}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'

  let text = name
  while (text.length > 1 && ctx.measureText(`${text}…`).width > DISC_LABEL_MAX_WIDTH) {
    text = text.slice(0, -1)
  }
  if (text.length < name.length) text += '…'

  const y = cy - DISC_RADIUS - DISC_LABEL_GAP
  ctx.fillStyle = `rgba(255,255,255,${opacity})`
  ctx.fillText(text, cx, y)
}

type BagCanvasProps = {
  discs: FlightDisc[]
  selectedId: string | null
  /** Focus a disc from the canvas (landing hit). */
  onSelectDisc: (id: string) => void
  /** Empty canvas click → view-all / neutral (same as sidebar dead click). */
  onClearFocus: () => void
  onUpdateDisc: (id: string, patch: Partial<FlightDisc>) => void
}

type HoverCursor = 'default' | 'grab' | 'pointer'

export function BagCanvas({
  discs,
  selectedId,
  onSelectDisc,
  onClearFocus,
  onUpdateDisc,
}: BagCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 400, h: 1200 })
  const [hoverCursor, setHoverCursor] = useState<HoverCursor>('default')
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ id: string; kind: DragKind } | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const w = Math.max(200, Math.floor(r.width))
      const h = Math.max(600, Math.floor(r.height))
      setSize({ w, h })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w: width, h: height } = size
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const wrap = canvas.parentElement
    ctx.fillStyle =
      (wrap && getComputedStyle(wrap).getPropertyValue('--canvas-bg').trim()) ||
      '#1a1d24'
    ctx.fillRect(0, 0, width, height)

    const discBorder =
      (wrap &&
        getComputedStyle(wrap).getPropertyValue('--bag-disc-border').trim()) ||
      'rgba(0, 0, 0, 0.18)'

    // Grid: vertical lines (x = -3 .. 3)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    for (let gx = -3; gx <= 3; gx++) {
      const { x } = worldToCanvas(gx, 0, width, height)
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    for (let fy = 0; fy <= 600; fy += 50) {
      const { y } = worldToCanvas(0, fy, width, height)
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(width, y)
      ctx.stroke()
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    const tee = worldToCanvas(0, 0, width, height)
    ctx.beginPath()
    ctx.arc(tee.x, tee.y, 5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fill()

    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    for (let gx = -3; gx <= 3; gx++) {
      const { x } = worldToCanvas(gx, 0, width, height)
      ctx.fillText(`${gx > 0 ? '+' : ''}${gx}`, x, height - 6)
    }
    ctx.textAlign = 'right'
    for (let fy = 0; fy <= 600; fy += 100) {
      const { x, y } = worldToCanvas(-3, fy, width, height)
      ctx.fillText(`${fy}′`, x - 6, y + 4)
    }

    const neutral = selectedId === null

    // Flight paths
    for (const d of discs) {
      const { x: p1x, y: p1y } = worldToCanvas(
        d.startHandle.x,
        d.startHandle.y,
        width,
        height,
      )
      const { x: p2x, y: p2y } = worldToCanvas(
        d.endHandle.x,
        d.endHandle.y,
        width,
        height,
      )
      const { x: p3x, y: p3y } = worldToCanvas(d.end.x, d.end.y, width, height)
      const { x: p0x, y: p0y } = worldToCanvas(0, 0, width, height)

      let pathAlpha: number
      let lineWidth: number
      if (neutral) {
        pathAlpha = PATH_ALPHA_NEUTRAL
        lineWidth = 2
      } else if (d.id === selectedId) {
        pathAlpha = PATH_ALPHA_FOCUSED
        lineWidth = 3
      } else {
        pathAlpha = PATH_ALPHA_UNFOCUSED
        lineWidth = 2
      }

      ctx.strokeStyle = d.color
      ctx.globalAlpha = pathAlpha
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(p0x, p0y)
      ctx.bezierCurveTo(p1x, p1y, p2x, p2y, p3x, p3y)
      ctx.stroke()
      ctx.globalAlpha = 1

      if (!neutral && d.id === selectedId) {
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 4])
        ctx.beginPath()
        ctx.moveTo(p0x, p0y)
        ctx.lineTo(p1x, p1y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(p3x, p3y)
        ctx.lineTo(p2x, p2y)
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    const drawLandingMarker = (
      d: FlightDisc,
      fillMul: number,
      textMul: number,
    ) => {
      const end = worldToCanvas(d.end.x, d.end.y, width, height)
      ctx.beginPath()
      ctx.arc(end.x, end.y, DISC_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = d.color
      ctx.globalAlpha = fillMul
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = discBorder
      ctx.lineWidth = 2
      ctx.stroke()
      const labelOpacity = fillMul >= 1 ? 1 : 0.55 + 0.45 * textMul
      drawDiscNameLabel(ctx, end.x, end.y, d.name, labelOpacity)
    }

    if (neutral) {
      for (const d of discs) {
        drawLandingMarker(d, 1, 1)
      }
    } else {
      for (const d of discs) {
        if (d.id === selectedId) continue
        drawLandingMarker(
          d,
          MARKER_FILL_UNFOCUSED,
          MARKER_TEXT_UNFOCUSED,
        )
      }
    }

    const selected = discs.find((x) => x.id === selectedId)
    if (selected) {
      const h1 = worldToCanvas(
        selected.startHandle.x,
        selected.startHandle.y,
        width,
        height,
      )
      const h2 = worldToCanvas(
        selected.endHandle.x,
        selected.endHandle.y,
        width,
        height,
      )
      const end = worldToCanvas(selected.end.x, selected.end.y, width, height)

      ctx.strokeStyle = 'rgba(255,255,255,0.15)'
      ctx.beginPath()
      for (let i = 0; i <= 32; i++) {
        const t = i / 32
        const p = bezierPoint(
          t,
          selected.startHandle.x,
          selected.startHandle.y,
          selected.endHandle.x,
          selected.endHandle.y,
          selected.end.x,
          selected.end.y,
        )
        const c = worldToCanvas(p.x, p.y, width, height)
        if (i === 0) ctx.moveTo(c.x, c.y)
        else ctx.lineTo(c.x, c.y)
      }
      ctx.stroke()

      const drawHandle = (cx: number, cy: number, fill: string) => {
        ctx.beginPath()
        ctx.arc(cx, cy, HANDLE_RADIUS, 0, Math.PI * 2)
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      drawHandle(h1.x, h1.y, 'rgba(255,255,255,0.25)')
      drawHandle(h2.x, h2.y, 'rgba(255,255,255,0.25)')

      ctx.beginPath()
      ctx.arc(end.x, end.y, DISC_RADIUS, 0, Math.PI * 2)
      ctx.fillStyle = selected.color
      ctx.fill()
      ctx.strokeStyle = discBorder
      ctx.lineWidth = 2
      ctx.stroke()
      drawDiscNameLabel(ctx, end.x, end.y, selected.name, 1)
    }
  }, [discs, selectedId, size])

  useEffect(() => {
    draw()
  }, [draw])

  const pickGrabTarget = useCallback(
    (cx: number, cy: number): { id: string; kind: DragKind } | null => {
      if (selectedId === null) return null
      const d = discs.find((x) => x.id === selectedId)
      if (!d) return null

      const { w: width, h: height } = size
      const end = worldToCanvas(d.end.x, d.end.y, width, height)
      const h1 = worldToCanvas(d.startHandle.x, d.startHandle.y, width, height)
      const h2 = worldToCanvas(d.endHandle.x, d.endHandle.y, width, height)

      const candidates: { kind: DragKind; dist: number }[] = [
        { kind: 'landing', dist: distance(cx, cy, end.x, end.y) },
        { kind: 'start', dist: distance(cx, cy, h1.x, h1.y) },
        { kind: 'end', dist: distance(cx, cy, h2.x, h2.y) },
      ]
      candidates.sort((a, b) => a.dist - b.dist)
      const best = candidates[0]
      const threshold =
        best.kind === 'landing' ? DISC_RADIUS + HIT_PAD : HANDLE_RADIUS + HIT_PAD
      if (best.dist <= threshold) return { id: selectedId, kind: best.kind }
      return null
    },
    [discs, selectedId, size],
  )

  const pickClosestLandingDiscId = useCallback(
    (cx: number, cy: number): string | null => {
      const { w: width, h: height } = size
      const threshold = DISC_RADIUS + HIT_PAD
      let bestId: string | null = null
      let bestDist = Infinity
      for (const d of discs) {
        const end = worldToCanvas(d.end.x, d.end.y, width, height)
        const dist = distance(cx, cy, end.x, end.y)
        if (dist <= threshold && dist < bestDist) {
          bestDist = dist
          bestId = d.id
        }
      }
      return bestId
    },
    [discs, size],
  )

  const classifyHover = useCallback(
    (cx: number, cy: number): HoverCursor => {
      if (pickGrabTarget(cx, cy)) return 'grab'
      const landId = pickClosestLandingDiscId(cx, cy)
      if (landId !== null && (selectedId === null || landId !== selectedId)) {
        return 'pointer'
      }
      return 'default'
    },
    [pickGrabTarget, pickClosestLandingDiscId, selectedId],
  )

  const updateHoverFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const cx = clientX - rect.left
      const cy = clientY - rect.top
      setHoverCursor(classifyHover(cx, cy))
    },
    [classifyHover],
  )

  const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragging) return
    updateHoverFromClient(e.clientX, e.clientY)
  }

  const onCanvasMouseLeave = () => {
    if (!dragging) setHoverCursor('default')
  }

  const canvasCursorStyle = dragging
    ? 'grabbing'
    : hoverCursor === 'grab'
      ? 'grab'
      : hoverCursor === 'pointer'
        ? 'pointer'
        : 'default'

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top

    const grab = pickGrabTarget(cx, cy)
    if (grab) {
      dragRef.current = grab
      setDragging(true)
      canvas.setPointerCapture(e.pointerId)
      return
    }

    const landId = pickClosestLandingDiscId(cx, cy)
    if (landId !== null && landId !== selectedId) {
      onSelectDisc(landId)
      dragRef.current = { id: landId, kind: 'landing' }
      setDragging(true)
      canvas.setPointerCapture(e.pointerId)
      return
    }

    onClearFocus()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current
    if (!d) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const { w: width, h: height } = size
    const raw = canvasToWorld(cx, cy, width, height)
    const { x: wx, y: wy } = clampWorld(raw.x, raw.y)

    const disc = discs.find((x) => x.id === d.id)
    if (!disc) return

    if (d.kind === 'start') {
      onUpdateDisc(d.id, { startHandle: { x: wx, y: wy } })
    } else if (d.kind === 'end') {
      onUpdateDisc(d.id, { endHandle: { x: wx, y: wy } })
    } else {
      onUpdateDisc(d.id, { end: { x: wx, y: wy } })
    }
  }

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (canvas && dragRef.current) {
      try {
        canvas.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
    dragRef.current = null
    setDragging(false)
    if (e.pointerType === 'mouse') {
      updateHoverFromClient(e.clientX, e.clientY)
    } else {
      setHoverCursor('default')
    }
  }

  return (
    <div ref={wrapRef} className="bag-canvas-wrap">
      <canvas
        ref={canvasRef}
        className="bag-canvas"
        style={{ touchAction: 'none', cursor: canvasCursorStyle }}
        onMouseMove={onCanvasMouseMove}
        onMouseLeave={onCanvasMouseLeave}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  )
}
