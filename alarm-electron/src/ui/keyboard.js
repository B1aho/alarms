/**
 * Keyboard → messages (ALARM_SPEC §3.1, §3.11, §4.6):
 *  ⌘ (macOS) / Ctrl (Windows, Linux) + 1…4 switch sections; Esc closes a sheet;
 *  Space and L drive the stopwatch, but never while typing in a field.
 */

/** @type {ReadonlyArray<import('./model.js').Route>} */
export const ROUTES = ['alarms', 'stopwatch', 'timer', 'settings']

/**
 * @typedef {{ key: string, code: string, metaKey: boolean, ctrlKey: boolean, altKey: boolean, inField: boolean, onButton: boolean }} KeyInfo
 * @typedef {{ route: import('./model.js').Route, modal: boolean, ringing: boolean, platform: string }} KeyContext
 */

/**
 * Pure mapping, unit-tested. Returns the message and whether the default action must be prevented.
 * @param {KeyInfo} k
 * @param {KeyContext} ctx
 * @returns {{ msg: { type: string, [x: string]: unknown }, prevent: boolean } | null}
 */
export function keyToMsg(k, ctx) {
  const mod = ctx.platform === 'darwin' ? k.metaKey && !k.ctrlKey : k.ctrlKey && !k.metaKey
  if (mod && !k.altKey && /^[1-4]$/.test(k.key)) {
    if (ctx.ringing) return null
    return { msg: { type: 'Navigate', route: ROUTES[Number(k.key) - 1] }, prevent: true }
  }
  if (k.key === 'Escape') return ctx.modal ? { msg: { type: 'Escape' }, prevent: true } : null
  if (k.inField || k.metaKey || k.ctrlKey || k.altKey || ctx.modal || ctx.ringing || ctx.route !== 'stopwatch') return null
  if (k.code === 'Space') return { msg: { type: 'SwToggle' }, prevent: true }
  if (k.key.toLowerCase() === 'l') return { msg: { type: 'SwLapReset' }, prevent: false }
  return null
}

/** @param {KeyboardEvent} e @returns {KeyInfo} */
export function keyInfo(e) {
  const t = /** @type {HTMLElement | null} */ (e.target)
  return {
    key: e.key,
    code: e.code,
    metaKey: e.metaKey,
    ctrlKey: e.ctrlKey,
    altKey: e.altKey,
    inField: Boolean(t?.closest?.('input, textarea, select, [contenteditable]')),
    onButton: Boolean(t?.closest?.('button')),
  }
}
