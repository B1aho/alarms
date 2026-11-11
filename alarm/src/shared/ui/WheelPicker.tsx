import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn'

const ITEM_H = 36
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM_H

/** Idle time after the last wheel/trackpad scroll before the wheel settles. */
const SETTLE_MS = 90
/** Only pointer samples this recent count towards the release velocity. */
const VELOCITY_WINDOW_MS = 80
/** How far (in rows) a flick may carry the wheel past the release point. */
const MAX_FLICK_ROWS = 6

export interface WheelItem<T> {
  value: T
  label: string
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3

/**
 * iOS-style picker wheel. Scrolling (mouse drag, wheel, trackpad, keys) moves a
 * native scroll container; snapping to the nearest row is animated in JS, so
 * the wheel always glides to a value and never jumps.
 */
export function WheelPicker<T extends string | number>({
  items,
  value,
  onChange,
  label,
  width = 64,
  align = 'center',
}: {
  items: ReadonlyArray<WheelItem<T>>
  value: T
  onChange: (v: T) => void
  label: string
  width?: number
  align?: 'left' | 'center' | 'right'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const index = Math.max(
    0,
    items.findIndex((i) => i.value === value),
  )
  /** Row currently under the selection band (updates live while scrolling). */
  const [center, setCenter] = useState(index)

  const busy = useRef(false) // dragging, settling or animating: ignore external value sync
  const animation = useRef<number | null>(null)
  const glideTarget = useRef(index) // row the running glide is heading to
  const settleTimer = useRef<number | undefined>(undefined)
  const suppressClick = useRef(false)
  const drag = useRef<{
    pointerId: number
    startY: number
    startTop: number
    moved: boolean
    samples: Array<{ y: number; t: number }>
  } | null>(null)

  // Latest props for callbacks that outlive a render (animation frames, timers).
  const latest = useRef({ items, value, onChange })
  useLayoutEffect(() => {
    latest.current = { items, value, onChange }
  })

  const clampIndex = (i: number) => Math.min(latest.current.items.length - 1, Math.max(0, i))

  // Keep the wheel on the value when it changes from outside.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || busy.current) return
    if (Math.abs(el.scrollTop - index * ITEM_H) > 0.5) el.scrollTop = index * ITEM_H
    setCenter(index)
  }, [index])

  const stopAnimation = () => {
    if (animation.current !== null) cancelAnimationFrame(animation.current)
    animation.current = null
  }

  useEffect(
    () => () => {
      stopAnimation()
      window.clearTimeout(settleTimer.current)
    },
    [],
  )

  const commit = (i: number) => {
    const { items: list, value: current, onChange: change } = latest.current
    const item = list[i]
    busy.current = false
    if (item && item.value !== current) change(item.value)
  }

  /** Glide to row `i` and commit it. */
  const animateTo = (i: number) => {
    const el = ref.current
    if (!el) return
    const target = clampIndex(i)
    glideTarget.current = target
    const from = el.scrollTop
    const to = target * ITEM_H
    const distance = to - from
    stopAnimation()
    window.clearTimeout(settleTimer.current)
    busy.current = true
    if (Math.abs(distance) < 0.5) {
      el.scrollTop = to
      commit(target)
      return
    }
    const duration = Math.min(520, 160 + Math.sqrt(Math.abs(distance)) * 22)
    let start: number | null = null
    const step = (now: number) => {
      start ??= now
      const t = Math.min(1, (now - start) / duration)
      el.scrollTop = from + distance * easeOutCubic(t)
      if (t < 1) animation.current = requestAnimationFrame(step)
      else {
        animation.current = null
        commit(target)
      }
    }
    animation.current = requestAnimationFrame(step)
  }

  const onScroll = () => {
    const el = ref.current
    if (!el) return
    setCenter(clampIndex(Math.round(el.scrollTop / ITEM_H)))
    // Our own drag/animation drive the position; only native scrolling (wheel, trackpad) needs settling.
    if (drag.current?.moved || animation.current !== null) return
    busy.current = true
    window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => animateTo(Math.round(el.scrollTop / ITEM_H)), SETTLE_MS)
  }

  // ------------------------------------------------------------ mouse drag --

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !ref.current) return
    suppressClick.current = false
    drag.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTop: ref.current.scrollTop,
      moved: false,
      samples: [{ y: e.clientY, t: e.timeStamp }],
    }
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = ref.current
    if (!d || !el || e.pointerId !== d.pointerId) return
    const dy = e.clientY - d.startY
    if (!d.moved) {
      if (Math.abs(dy) < 4) return
      d.moved = true
      busy.current = true
      stopAnimation()
      window.clearTimeout(settleTimer.current)
      d.startTop = el.scrollTop - dy // grab the wheel exactly where it is now
      try {
        el.setPointerCapture(e.pointerId) // keep following the mouse outside the wheel
      } catch {
        // Pointer already released.
      }
      el.focus({ preventScroll: true })
    }
    e.preventDefault()
    el.scrollTop = d.startTop - dy
    d.samples.push({ y: e.clientY, t: e.timeStamp })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0]!.t > VELOCITY_WINDOW_MS) d.samples.shift()
  }

  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    const el = ref.current
    if (!d || e.pointerId !== d.pointerId) return
    drag.current = null
    if (!d.moved || !el) return
    suppressClick.current = true
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)

    // Velocity over the last few dozen ms only: a pause or a change of
    // direction before letting go means no flick.
    const recent = d.samples.filter((s) => e.timeStamp - s.t <= VELOCITY_WINDOW_MS)
    let rows = 0
    if (recent.length >= 2) {
      const first = recent[0]!
      const last = recent[recent.length - 1]!
      const v = (last.y - first.y) / Math.max(16, last.t - first.t) // px per ms, + = downwards
      if (Math.abs(v) > 0.3) rows = Math.max(-MAX_FLICK_ROWS, Math.min(MAX_FLICK_ROWS, (-v * 110) / ITEM_H))
    }
    animateTo(Math.round(el.scrollTop / ITEM_H + rows))
  }

  // ---------------------------------------------------- clicks & keyboard --

  const select = (i: number) => animateTo(i)

  const onKeyDown = (e: KeyboardEvent) => {
    // Repeated presses during a glide continue from where the wheel is heading.
    const base = animation.current !== null ? glideTarget.current : busy.current ? center : index
    if (e.key === 'ArrowDown') select(base + 1)
    else if (e.key === 'ArrowUp') select(base - 1)
    else if (e.key === 'PageDown') select(base + 5)
    else if (e.key === 'PageUp') select(base - 5)
    else if (e.key === 'Home') select(0)
    else if (e.key === 'End') select(items.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onScroll={onScroll}
      onWheel={stopAnimation /* new wheel/trackpad input takes over from a running glide */}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onDragStart={(e) => e.preventDefault()}
      className="wheel-mask no-scrollbar relative z-10 cursor-grab touch-pan-y overflow-y-scroll overscroll-contain rounded-lg select-none active:cursor-grabbing"
      style={{ height: VISIBLE * ITEM_H, width }}
    >
      <div style={{ height: PAD }} />
      {items.map((item, i) => (
        <div
          key={String(item.value)}
          role="option"
          aria-selected={i === index}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false
              return
            }
            select(i)
          }}
          className={cn(
            'tabular flex items-center px-2 text-[23px] transition-colors duration-150 select-none',
            align === 'center' && 'justify-center',
            align === 'right' && 'justify-end',
            align === 'left' && 'justify-start',
            i === center ? 'text-label' : 'text-label-2',
          )}
          style={{ height: ITEM_H }}
        >
          {item.label}
        </div>
      ))}
      <div style={{ height: PAD }} />
    </div>
  )
}

/** Groups wheels over a shared selection band. */
export function WheelGroup({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute right-2 left-2 rounded-lg bg-fill-2"
        style={{ top: PAD, height: ITEM_H }}
      />
      {children}
    </div>
  )
}

/** Static unit label inside a WheelGroup, e.g. "hours". */
export function WheelUnit({ children }: { children: ReactNode }) {
  return <span className="relative z-10 -ml-1 mr-2 w-10 text-[17px] font-semibold">{children}</span>
}
