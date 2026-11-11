/**
 * <wheel-picker> — iOS-style picker wheel (ALARM_SPEC §4.4.6), ported from the reference
 * `alarm/src/shared/ui/WheelPicker.tsx`. The physics (drag, wheel/trackpad, keys, settle glide,
 * flick) is the component's internal state; outside it only emits `change` with the final value.
 *
 * Properties: items [{ value, label }], value, label (aria), width (px), align ('left' | 'center' | 'right').
 */

export const ITEM_H = 36
const VISIBLE = 5
const PAD = ((VISIBLE - 1) / 2) * ITEM_H
/** Idle time after the last wheel/trackpad scroll before the wheel settles. */
const SETTLE_MS = 90
/** Only pointer samples this recent count towards the release velocity. */
const VELOCITY_WINDOW_MS = 80
/** How far (in rows) a flick may carry the wheel past the release point. */
const MAX_FLICK_ROWS = 6

/** @param {number} t */
const easeOutCubic = (t) => 1 - (1 - t) ** 3

/** @typedef {{ value: string | number, label: string }} WheelItem */

export class WheelPicker extends HTMLElement {
  constructor() {
    super()
    /** @type {WheelItem[]} */
    this._items = []
    /** @type {string | number | undefined} */
    this._value = undefined
    this._label = ''
    this._width = 64
    this._align = 'center'
    this._center = 0
    this._busy = false
    /** @type {number | null} */
    this._anim = null
    this._glideTarget = 0
    /** @type {number | undefined} */
    this._settleTimer = undefined
    /** @type {{ pointerId: number, startY: number, startTop: number, moved: boolean, samples: Array<{ y: number, t: number }> } | null} */
    this._drag = null
    /** @type {HTMLElement[]} */
    this._options = []
    this._built = false
  }

  connectedCallback() {
    this.setAttribute('role', 'listbox')
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0
    this.addEventListener('scroll', () => this._onScroll())
    this.addEventListener('wheel', () => this._stopAnimation(), { passive: true })
    this.addEventListener('keydown', (e) => this._onKeyDown(e))
    this.addEventListener('pointerdown', (e) => this._onPointerDown(e))
    this.addEventListener('pointermove', (e) => this._onPointerMove(e))
    this.addEventListener('pointerup', (e) => this._endDrag(e))
    this.addEventListener('pointercancel', (e) => this._endDrag(e))
    this.addEventListener('lostpointercapture', (e) => this._endDrag(e))
    this.addEventListener('dragstart', (e) => e.preventDefault())
    this._build()
  }

  disconnectedCallback() {
    this._stopAnimation()
    clearTimeout(this._settleTimer)
  }

  /** @param {WheelItem[]} items */
  set items(items) {
    const same =
      items.length === this._items.length &&
      items.every((it, i) => it.value === this._items[i].value && it.label === this._items[i].label)
    this._items = items
    if (!same) this._build()
  }
  get items() {
    return this._items
  }

  /** @param {string | number} v */
  set value(v) {
    this._value = v
    if (this._built && !this._busy) this._syncToValue()
    this._markSelected()
  }
  get value() {
    return /** @type {string | number} */ (this._value)
  }

  /** @param {string} l */
  set label(l) {
    this._label = l
    this.setAttribute('aria-label', l)
  }

  /** @param {number} w */
  set width(w) {
    this._width = w
    this.style.width = `${w}px`
  }

  /** @param {'left' | 'center' | 'right'} a */
  set align(a) {
    this._align = a
    this.dataset.align = a
  }

  get _index() {
    return Math.max(
      0,
      this._items.findIndex((i) => i.value === this._value),
    )
  }

  _build() {
    if (!this.isConnected) return
    this.replaceChildren()
    const top = document.createElement('div')
    top.style.height = `${PAD}px`
    this.appendChild(top)
    this._options = this._items.map((item) => {
      const el = document.createElement('div')
      el.className = 'wheel-option'
      el.setAttribute('role', 'option')
      el.textContent = item.label
      this.appendChild(el)
      return el
    })
    const bottom = document.createElement('div')
    bottom.style.height = `${PAD}px`
    this.appendChild(bottom)
    this._built = true
    this._syncToValue()
    this._markSelected()
  }

  _syncToValue() {
    const top = this._index * ITEM_H
    if (Math.abs(this.scrollTop - top) > 0.5) this.scrollTop = top
    this._setCenter(this._index)
  }

  _markSelected() {
    const idx = this._index
    this._options.forEach((el, i) => el.setAttribute('aria-selected', String(i === idx)))
  }

  /** Row under the selection band; highlighted live while scrolling. @param {number} i */
  _setCenter(i) {
    if (this._options[this._center]) this._options[this._center].classList.remove('is-center')
    this._center = i
    this._options[i]?.classList.add('is-center')
  }

  /** @param {number} i */
  _clamp(i) {
    return Math.min(this._items.length - 1, Math.max(0, i))
  }

  _stopAnimation() {
    if (this._anim !== null) cancelAnimationFrame(this._anim)
    this._anim = null
  }

  /** @param {number} i */
  _commit(i) {
    const item = this._items[i]
    this._busy = false
    if (item && item.value !== this._value) {
      this._value = item.value
      this._markSelected()
      this.dispatchEvent(new CustomEvent('change', { detail: { value: item.value } }))
    }
  }

  /** Glide to row `i` (160–520 ms, ease-out-cubic) and commit it. @param {number} i */
  _animateTo(i) {
    const target = this._clamp(i)
    this._glideTarget = target
    const from = this.scrollTop
    const to = target * ITEM_H
    const distance = to - from
    this._stopAnimation()
    clearTimeout(this._settleTimer)
    this._busy = true
    if (Math.abs(distance) < 0.5) {
      this.scrollTop = to
      this._commit(target)
      return
    }
    const duration = Math.min(520, 160 + Math.sqrt(Math.abs(distance)) * 22)
    /** @type {number | null} */
    let start = null
    /** @param {number} now */
    const step = (now) => {
      start ??= now
      const t = Math.min(1, (now - start) / duration)
      this.scrollTop = from + distance * easeOutCubic(t)
      if (t < 1) this._anim = requestAnimationFrame(step)
      else {
        this._anim = null
        this._commit(target)
      }
    }
    this._anim = requestAnimationFrame(step)
  }

  _onScroll() {
    this._setCenter(this._clamp(Math.round(this.scrollTop / ITEM_H)))
    // Our own drag/animation drive the position; only native scrolling (wheel, trackpad) needs settling.
    if (this._drag?.moved || this._anim !== null) return
    if (!this._busy && Math.abs(this.scrollTop - this._index * ITEM_H) < 0.5) return
    this._busy = true
    clearTimeout(this._settleTimer)
    this._settleTimer = window.setTimeout(() => this._animateTo(Math.round(this.scrollTop / ITEM_H)), SETTLE_MS)
  }

  /** @param {PointerEvent} e */
  _onPointerDown(e) {
    if (e.pointerType !== 'mouse' || e.button !== 0) return
    this._drag = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startTop: this.scrollTop,
      moved: false,
      samples: [{ y: e.clientY, t: e.timeStamp }],
    }
    // Capture at once: the grip holds even if the pointer leaves the wheel or the window.
    try {
      this.setPointerCapture(e.pointerId)
    } catch {
      // pointer already gone
    }
  }

  /** @param {PointerEvent} e */
  _onPointerMove(e) {
    const d = this._drag
    if (!d || e.pointerId !== d.pointerId) return
    const dy = e.clientY - d.startY
    if (!d.moved) {
      if (Math.abs(dy) < 4) return
      d.moved = true
      this._busy = true
      this._stopAnimation()
      clearTimeout(this._settleTimer)
      d.startTop = this.scrollTop - dy // grab the wheel exactly where it is now
      this.focus({ preventScroll: true })
      this.classList.add('is-grabbing')
    }
    e.preventDefault()
    this.scrollTop = d.startTop - dy
    d.samples.push({ y: e.clientY, t: e.timeStamp })
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > VELOCITY_WINDOW_MS) d.samples.shift()
  }

  /** @param {PointerEvent} e */
  _endDrag(e) {
    const d = this._drag
    if (!d || e.pointerId !== d.pointerId) return
    this._drag = null
    this.classList.remove('is-grabbing')
    if (this.hasPointerCapture(e.pointerId)) this.releasePointerCapture(e.pointerId)
    if (!d.moved) {
      // A click on a row selects it.
      if (e.type === 'pointerup') {
        const y = e.clientY - this.getBoundingClientRect().top + this.scrollTop - PAD
        this._animateTo(Math.floor(y / ITEM_H))
      }
      return
    }
    // Velocity over the last 80 ms only: a pause or a change of direction before release means no flick.
    const recent = d.samples.filter((s) => e.timeStamp - s.t <= VELOCITY_WINDOW_MS)
    let rows = 0
    if (recent.length >= 2) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      const v = (last.y - first.y) / Math.max(16, last.t - first.t) // px/ms, + = downwards
      if (Math.abs(v) > 0.3) rows = Math.max(-MAX_FLICK_ROWS, Math.min(MAX_FLICK_ROWS, (-v * 110) / ITEM_H))
    }
    this._animateTo(Math.round(this.scrollTop / ITEM_H + rows))
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    // Repeated presses during a glide continue from the row the wheel is heading to.
    const base = this._anim !== null ? this._glideTarget : this._busy ? this._center : this._index
    if (e.key === 'ArrowDown') this._animateTo(base + 1)
    else if (e.key === 'ArrowUp') this._animateTo(base - 1)
    else if (e.key === 'PageDown') this._animateTo(base + 5)
    else if (e.key === 'PageUp') this._animateTo(base - 5)
    else if (e.key === 'Home') this._animateTo(0)
    else if (e.key === 'End') this._animateTo(this._items.length - 1)
    else return
    e.preventDefault()
    e.stopPropagation()
  }
}

if (!customElements.get('wheel-picker')) customElements.define('wheel-picker', WheelPicker)
