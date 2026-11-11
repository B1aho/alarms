/**
 * MVU runtime. The window state is one `model`. Only `update(model, msg) → [model, effects]`
 * changes it; `view(model) → vnode` is rendered with `patch`. Effects and subscriptions are
 * plain descriptions; the runtime executes them through the given interpreters.
 */

import { patch, setDispatch } from './patch.js'

/** @typedef {import('./h.js').VNode} VNode */
/** @typedef {{ type: string, [k: string]: any }} Msg */
/** @typedef {{ type: string, [k: string]: any }} Effect */
/** @typedef {{ id: string, [k: string]: any }} Sub */

/**
 * @template M
 * @param {object} app
 * @param {Element} app.root
 * @param {M} app.init
 * @param {(model: M, msg: Msg) => [M, Effect[]]} app.update
 * @param {(model: M) => VNode} app.view
 * @param {(model: M) => Sub[]} app.subscriptions
 * @param {(sub: Sub, dispatch: (msg: Msg) => void) => () => void} app.startSub
 * @param {(effect: Effect, dispatch: (msg: Msg) => void) => void} app.runEffect
 * @param {(model: M) => void} [app.afterRender] document-level attributes (theme, …)
 */
export function run(app) {
  let model = app.init
  /** @type {VNode | null} */
  let vnode = null
  let scheduled = false
  /** @type {Map<string, { key: string, stop: () => void }>} */
  const subs = new Map()

  /** @param {Msg} msg */
  function dispatch(msg) {
    const [next, effects] = app.update(model, msg)
    model = next
    for (const fx of effects) {
      try {
        app.runEffect(fx, dispatch)
      } catch (err) {
        console.error('[ui] effect failed', fx.type, err)
      }
    }
    schedule()
  }

  function schedule() {
    if (scheduled) return
    scheduled = true
    queueMicrotask(render)
  }

  function render() {
    scheduled = false
    vnode = patch(app.root, vnode, app.view(model))
    app.afterRender?.(model)
    syncSubs()
  }

  function syncSubs() {
    const wanted = app.subscriptions(model)
    const ids = new Set()
    for (const s of wanted) {
      ids.add(s.id)
      const key = JSON.stringify(s)
      const cur = subs.get(s.id)
      if (cur && cur.key === key) continue
      cur?.stop()
      subs.set(s.id, { key, stop: app.startSub(s, dispatch) })
    }
    for (const [id, s] of subs) {
      if (!ids.has(id)) {
        s.stop()
        subs.delete(id)
      }
    }
  }

  setDispatch(/** @type {(msg: unknown) => void} */ (dispatch))
  render()
  return { dispatch, model: () => model }
}
