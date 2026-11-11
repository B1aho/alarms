/**
 * Minimal DOM patcher for the vnodes of h.js: keyed children, attributes, DOM properties,
 * style objects, delegated event handlers, SVG namespace and a `mounted` hook.
 */

/** @typedef {import('./h.js').VNode} VNode */
/** @typedef {(msg: unknown) => void} Dispatch */

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Event handlers are stored on the element and called through one listener per event type,
 * so re-rendering never adds or removes listeners.
 * @typedef {HTMLElement & { __on?: Record<string, (e: Event) => unknown> }} HandlerEl
 */

/** @type {Dispatch} */
let dispatch = () => {}
/** @type {Array<() => void>} */
let mountQueue = []

/** @param {Dispatch} fn */
export function setDispatch(fn) {
  dispatch = fn
}

/** @param {Event} e */
function handleEvent(e) {
  const el = /** @type {HandlerEl} */ (e.currentTarget)
  const fn = el.__on?.[e.type]
  if (!fn) return
  const msg = fn(e)
  if (msg) dispatch(msg)
}

/**
 * @param {Element} el
 * @param {string} name
 * @param {any} value
 * @param {any} old
 * @param {boolean} svg
 */
function setProp(el, name, value, old, svg) {
  if (name === 'key' || name === 'mounted') return
  if (name.startsWith('on')) {
    const type = name.slice(2).toLowerCase()
    const hel = /** @type {HandlerEl} */ (el)
    hel.__on ??= {}
    if (typeof value === 'function') {
      if (!hel.__on[type]) el.addEventListener(type, handleEvent)
      hel.__on[type] = value
    } else if (hel.__on[type]) {
      delete hel.__on[type]
      el.removeEventListener(type, handleEvent)
    }
    return
  }
  if (name.startsWith('.')) {
    const prop = name.slice(1)
    if (/** @type {any} */ (el)[prop] !== value) /** @type {any} */ (el)[prop] = value
    return
  }
  if (name === 'style') {
    const style = /** @type {HTMLElement} */ (el).style
    const prev = old && typeof old === 'object' ? old : {}
    const next = value && typeof value === 'object' ? value : {}
    for (const k of Object.keys(prev)) if (!(k in next)) style.removeProperty(k)
    for (const [k, v] of Object.entries(next))
      if (prev[k] !== v || style.getPropertyValue(k) !== String(v)) style.setProperty(k, String(v))
    return
  }
  if (name === 'class' && !svg) {
    ;/** @type {HTMLElement} */ (el).className = value ?? ''
    return
  }
  if (value === false || value === null || value === undefined) el.removeAttribute(name)
  else el.setAttribute(name, value === true ? '' : String(value))
}

/**
 * @param {VNode} vnode
 * @param {boolean} svg
 * @returns {Node}
 */
function create(vnode, svg) {
  if (vnode.tag === '#text') {
    const node = document.createTextNode(vnode.text ?? '')
    vnode.el = node
    return node
  }
  const isSvg = svg || vnode.tag === 'svg'
  const el = isSvg ? document.createElementNS(SVG_NS, vnode.tag) : document.createElement(vnode.tag)
  for (const [k, v] of Object.entries(vnode.props)) setProp(el, k, v, undefined, isSvg)
  for (const c of vnode.children) el.appendChild(create(c, isSvg && vnode.tag !== 'foreignObject'))
  vnode.el = el
  const mounted = vnode.props.mounted
  if (typeof mounted === 'function') mountQueue.push(() => mounted(el))
  return el
}

/**
 * @param {VNode} a
 * @param {VNode} b
 */
const same = (a, b) => a.tag === b.tag && a.key === b.key

/**
 * @param {VNode} old
 * @param {VNode} next
 * @param {boolean} svg
 */
function update(old, next, svg) {
  const el = /** @type {Element | Text} */ (old.el)
  next.el = el
  if (next.tag === '#text') {
    if (old.text !== next.text) el.textContent = next.text ?? ''
    return
  }
  const isSvg = svg || next.tag === 'svg'
  const element = /** @type {Element} */ (el)
  for (const k of Object.keys(old.props)) if (!(k in next.props)) setProp(element, k, undefined, old.props[k], isSvg)
  for (const [k, v] of Object.entries(next.props)) {
    if (k.startsWith('.') || k === 'style' || old.props[k] !== v) setProp(element, k, v, old.props[k], isSvg)
  }
  updateChildren(element, old.children, next.children, isSvg && next.tag !== 'foreignObject')
}

/**
 * @param {Element} parent
 * @param {VNode[]} oldCh
 * @param {VNode[]} newCh
 * @param {boolean} svg
 */
function updateChildren(parent, oldCh, newCh, svg) {
  const keyed = newCh.length > 0 && newCh.every((c) => c.key !== undefined)
  if (!keyed) {
    const n = Math.min(oldCh.length, newCh.length)
    for (let i = 0; i < n; i++) {
      if (same(oldCh[i], newCh[i])) update(oldCh[i], newCh[i], svg)
      else parent.replaceChild(create(newCh[i], svg), /** @type {Node} */ (oldCh[i].el))
    }
    for (let i = n; i < newCh.length; i++) parent.appendChild(create(newCh[i], svg))
    for (let i = oldCh.length - 1; i >= n; i--) {
      const el = oldCh[i].el
      el?.parentNode?.removeChild(el)
    }
    return
  }
  /** @type {Map<string | number, VNode>} */
  const byKey = new Map()
  for (const c of oldCh) if (c.key !== undefined) byKey.set(c.key, c)
  /** @type {Set<VNode>} */
  const reused = new Set()
  /** @type {Node[]} */
  const nodes = newCh.map((c) => {
    const prev = c.key !== undefined ? byKey.get(c.key) : undefined
    if (prev && prev.tag === c.tag && !reused.has(prev)) {
      reused.add(prev)
      update(prev, c, svg)
      return /** @type {Node} */ (c.el)
    }
    return create(c, svg)
  })
  for (const c of oldCh) {
    const el = c.el
    if (!reused.has(c) && el) el.parentNode?.removeChild(el)
  }
  for (let i = 0; i < nodes.length; i++) {
    const want = nodes[i]
    if (parent.childNodes[i] !== want) parent.insertBefore(want, parent.childNodes[i] ?? null)
  }
}

/**
 * Renders `next` into `container`, diffing against the previous render.
 * @param {Element} container
 * @param {VNode | null} prev
 * @param {VNode} next
 * @returns {VNode}
 */
export function patch(container, prev, next) {
  mountQueue = []
  if (!prev) {
    container.replaceChildren(create(next, false))
  } else if (same(prev, next)) {
    update(prev, next, false)
  } else {
    container.replaceChild(create(next, false), /** @type {Node} */ (prev.el))
  }
  for (const fn of mountQueue) fn()
  mountQueue = []
  return next
}
