/** Stopwatch (ALARM_SPEC §3.11, §5.8). The display updates every animation frame while running. */

import { formatStopwatch } from '../../domain/format.js'
import { S } from '../../domain/strings.js'
import { cx, h } from '../kernel/h.js'
import { nowOf } from '../model.js'
import { circleButton } from '../widgets/button.js'
import { pageHeader } from '../widgets/row.js'

/** @typedef {import('../../contract/events.js').Stopwatch} Stopwatch */

/** @param {Stopwatch} s @param {number} now */
export const elapsedAt = (s, now) => s.accumulatedMs + (s.startedAt !== null ? Math.max(0, now - s.startedAt) : 0)

/**
 * Lap durations (newest first) with best/worst once there are 2+ completed laps; the current lap is never highlighted.
 * @param {Stopwatch} s
 * @param {number} now
 */
export function lapRows(s, now) {
  const splits = s.laps.map((t, i) => t - (i === 0 ? 0 : s.laps[i - 1]))
  const min = splits.length >= 2 ? Math.min(...splits) : null
  const max = splits.length >= 2 ? Math.max(...splits) : null
  const rows = splits.map((ms, i) => ({ n: i + 1, ms, best: ms === min, worst: ms === max }))
  const current = elapsedAt(s, now) - (s.laps.at(-1) ?? 0)
  return { current: { n: s.laps.length + 1, ms: current }, completed: rows.reverse() }
}

/** @param {import('../model.js').Model} m */
export function stopwatchPage(m) {
  const sw = m.app?.stopwatch ?? { startedAt: null, accumulatedMs: 0, laps: [] }
  const running = sw.startedAt !== null
  const now = nowOf(m)
  const elapsed = elapsedAt(sw, now)
  const { current, completed } = lapRows(sw, now)
  return h(
    'div',
    { class: 'page page-stopwatch', key: 'stopwatch' },
    pageHeader({ title: S.tabs.stopwatch }),
    h('div', { class: 'stopwatch-stage' }, h('p', { class: 'stopwatch-time tabular' }, formatStopwatch(elapsed))),
    h(
      'div',
      { class: 'round-buttons stopwatch-buttons' },
      running
        ? circleButton({ tone: 'gray', title: `${S.lap} (L)`, onclick: () => ({ type: 'SwLap' }) }, S.lap)
        : circleButton(
            { tone: 'gray', title: `${S.reset} (L)`, disabled: elapsed === 0, onclick: () => ({ type: 'SwReset' }) },
            S.reset,
          ),
      running
        ? circleButton({ tone: 'red', title: `${S.stop} (Space)`, onclick: () => ({ type: 'SwStop' }) }, S.stop)
        : circleButton({ tone: 'green', title: `${S.start} (Space)`, onclick: () => ({ type: 'SwStart' }) }, S.start),
    ),
    elapsed > 0 || completed.length > 0
      ? h(
          'ul',
          { class: 'laps' },
          lapRow(current.n, current.ms, undefined, 'current'),
          completed.map((l) => lapRow(l.n, l.ms, l.best ? 'best' : l.worst ? 'worst' : undefined, l.n)),
        )
      : null,
  )
}

/**
 * @param {number} n
 * @param {number} ms
 * @param {'best' | 'worst' | undefined} tone
 * @param {string | number} key
 */
const lapRow = (n, ms, tone, key) =>
  h(
    'li',
    { key, class: cx('lap', tone && `lap-${tone}`) },
    h('span', null, S.lapN(n)),
    h('span', { class: 'tabular' }, formatStopwatch(ms)),
  )
