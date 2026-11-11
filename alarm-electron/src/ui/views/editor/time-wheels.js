/** Time wheels of the editor: HH : MM, or H : MM AM/PM in 12-hour format (ALARM_SPEC §3.3). */

import { pad2 } from '../../../domain/format.js'
import { S } from '../../../domain/strings.js'
import { h } from '../../kernel/h.js'

const range = (/** @type {number} */ a, /** @type {number} */ b) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
const MINUTES = range(0, 59).map((v) => ({ value: v, label: pad2(v) }))
const HOURS_24 = range(0, 23).map((v) => ({ value: v, label: pad2(v) }))
const HOURS_12 = range(1, 12).map((v) => ({ value: v, label: String(v) }))
const PERIODS = [
  { value: 'AM', label: 'AM' },
  { value: 'PM', label: 'PM' },
]

/**
 * @param {{ key: string, items: Array<{ value: string | number, label: string }>, value: string | number, label: string, width: number, align?: 'left' | 'center' | 'right', onChange: (v: any) => unknown }} p
 */
export const wheel = ({ key, items, value, label, width, align = 'center', onChange }) =>
  h('wheel-picker', {
    key,
    class: 'wheel',
    '.items': items,
    '.value': value,
    '.label': label,
    '.width': width,
    '.align': align,
    onchange: (/** @type {CustomEvent} */ e) => onChange(e.detail.value),
  })

/** @param {...import('../../kernel/h.js').Child} children */
export const wheelGroup = (...children) =>
  h('div', { class: 'wheel-group' }, h('div', { class: 'wheel-band', 'aria-hidden': 'true' }), ...children)

/**
 * @param {number} hour
 * @param {number} minute
 * @param {'12h' | '24h'} cycle
 */
export function timeWheels(hour, minute, cycle) {
  const colon = h('span', { class: 'wheel-colon' }, ':')
  if (cycle === '24h') {
    return h(
      'div',
      { key: 'wheels-24' },
      wheelGroup(
        wheel({
          key: 'h',
          items: HOURS_24,
          value: hour,
          label: S.hourAria,
          width: 72,
          align: 'right',
          onChange: (v) => ({ type: 'DraftTime', hour: v, minute }),
        }),
        colon,
        wheel({
          key: 'm',
          items: MINUTES,
          value: minute,
          label: S.minuteAria,
          width: 72,
          align: 'left',
          onChange: (v) => ({ type: 'DraftTime', hour, minute: v }),
        }),
      ),
    )
  }
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const period = hour < 12 ? 'AM' : 'PM'
  const to24 = (/** @type {number} */ x, /** @type {string} */ p) => (x % 12) + (p === 'PM' ? 12 : 0)
  return h(
    'div',
    { key: 'wheels-12' },
    wheelGroup(
      wheel({
        key: 'h',
        items: HOURS_12,
        value: h12,
        label: S.hourAria,
        width: 64,
        align: 'right',
        onChange: (v) => ({ type: 'DraftTime', hour: to24(v, period), minute }),
      }),
      colon,
      wheel({
        key: 'm',
        items: MINUTES,
        value: minute,
        label: S.minuteAria,
        width: 64,
        align: 'left',
        onChange: (v) => ({ type: 'DraftTime', hour, minute: v }),
      }),
      wheel({
        key: 'p',
        items: PERIODS,
        value: period,
        label: S.periodAria,
        width: 64,
        onChange: (v) => ({ type: 'DraftTime', hour: to24(h12, v), minute }),
      }),
    ),
  )
}
