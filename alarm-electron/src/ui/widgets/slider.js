/** Volume slider (ALARM_SPEC §4.4.4) between a small and a large speaker icon. */

import { h } from '../kernel/h.js'
import { SpeakerIcon } from './icons.js'

/**
 * @param {{ value: number, min: number, max: number, step: number, onChange: (v: number) => unknown, label: string }} p
 */
export function slider({ value, min, max, step, onChange, label }) {
  const pct = ((value - min) / (max - min)) * 100
  return h('input', {
    type: 'range',
    'aria-label': label,
    class: 'slider',
    min,
    max,
    step,
    '.value': String(value),
    style: { '--pct': `${pct}%` },
    oninput: (/** @type {Event} */ e) => onChange(Number(/** @type {HTMLInputElement} */ (e.target).value)),
  })
}

/**
 * Row content: quiet speaker, slider, loud speaker.
 * @param {Parameters<typeof slider>[0]} p
 */
export const volumeRow = (p) =>
  h('div', { class: 'row volume-row' }, SpeakerIcon('speaker-small'), slider(p), SpeakerIcon('speaker-large'))
