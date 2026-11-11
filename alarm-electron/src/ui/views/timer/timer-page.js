/** Timer page and its sound sheet (ALARM_SPEC §3.10, §5.9). */

import { describeDuration, formatCountdown, formatTimestamp } from '../../../domain/format.js'
import { S, soundName, timerLabel, DEFAULT_TIMER_LABEL } from '../../../domain/strings.js'
import { cx, h } from '../../kernel/h.js'
import { hourCycleOf, nowOf, timerActive } from '../../model.js'
import { circleButton, textButton } from '../../widgets/button.js'
import { BellIcon, PlayIcon } from '../../widgets/icons.js'
import { pageHeader, row, section } from '../../widgets/row.js'
import { sheet, sheetBody, sheetHeader } from '../../widgets/sheet.js'
import { soundPickerBody } from '../sound-picker.js'
import { wheel, wheelGroup } from '../editor/time-wheels.js'

/** @typedef {import('../../model.js').Model} Model */
/** @typedef {import('../../../contract/events.js').Timer} Timer */

const range = (/** @type {number} */ a, /** @type {number} */ b) =>
  Array.from({ length: b - a + 1 }, (_, i) => ({ value: a + i, label: String(a + i) }))
const HOURS = range(0, 23)
const SIXTY = range(0, 59)

/** @param {Model} m */
export function timerPage(m) {
  const app = m.app
  if (!app) return h('div', { class: 'page', key: 'timer' }, pageHeader({ title: S.tabs.timer }))
  const t = app.timer
  const active = timerActive(m)
  return h(
    'div',
    { class: 'page page-timer', key: 'timer' },
    pageHeader({ title: S.tabs.timer }),
    h('div', { class: 'timer-stage' }, active ? countdown(m, t) : durationWheels(t.durationMs)),
    h(
      'div',
      { class: 'round-buttons timer-buttons' },
      circleButton({ tone: 'gray', disabled: !active, onclick: () => ({ type: 'TimerCancel' }) }, S.cancel),
      t.status === 'running'
        ? circleButton({ tone: 'orange', onclick: () => ({ type: 'TimerPause' }) }, S.pause)
        : t.status === 'paused'
          ? circleButton({ tone: 'green', onclick: () => ({ type: 'TimerResume' }) }, S.resume)
          : circleButton({ tone: 'green', onclick: () => ({ type: 'TimerStart' }) }, S.start),
    ),
    section(
      { key: 'opts' },
      row(
        { key: 'label' },
        h('span', { class: 'row-text' }, S.label),
        h('input', {
          class: 'inline-input',
          '.value': m.timerLabel ?? t.label,
          placeholder: DEFAULT_TIMER_LABEL,
          maxlength: '60',
          'aria-label': S.label,
          oninput: (/** @type {Event} */ e) => ({
            type: 'TimerLabelInput',
            label: /** @type {HTMLInputElement} */ (e.target).value,
          }),
          onblur: () => ({ type: 'TimerLabelBlur' }),
        }),
      ),
      row({
        key: 'sound',
        label: S.whenTimerEnds,
        detail: soundName(t.sound, app.sounds),
        chevron: true,
        onclick: () => ({ type: 'OpenSheet', sheet: 'timerSound' }),
      }),
    ),
    t.recents.length > 0
      ? section(
          { header: S.recentsHeader, key: 'recents' },
          ...t.recents.map((r) =>
            h(
              'div',
              { key: r.durationMs, class: 'row recent-row' },
              h(
                'div',
                { class: 'recent-main' },
                h('p', { class: 'recent-duration tabular' }, formatCountdown(r.durationMs)),
                h('p', { class: 'recent-label' }, r.label.trim() || describeDuration(r.durationMs)),
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'recent-remove',
                  'aria-label': S.removeRecentAria,
                  onclick: () => ({ type: 'RemoveRecent', durationMs: r.durationMs }),
                },
                S.remove,
              ),
              h(
                'button',
                {
                  type: 'button',
                  class: 'recent-play',
                  'aria-label': S.startTimerAria(describeDuration(r.durationMs)),
                  onclick: () => ({ type: 'StartRecent', durationMs: r.durationMs, label: r.label }),
                },
                PlayIcon('recent-play-icon'),
              ),
            ),
          ),
        )
      : null,
  )
}

/** @param {Model} m */
export function timerSoundSheet(m) {
  if (m.sheet !== 'timerSound' || !m.app) return null
  return sheet(
    { label: S.whenTimerEnds, onClose: () => ({ type: 'CloseSheet' }), key: 'timer-sound' },
    sheetHeader({
      title: S.whenTimerEnds,
      trailing: textButton({ bold: true, onclick: () => ({ type: 'CloseSheet' }) }, S.done),
    }),
    sheetBody({}, soundPickerBody(m, m.app.timer.sound, 'timer')),
  )
}

/** @param {number} durationMs */
function durationWheels(durationMs) {
  const total = Math.round(durationMs / 1000)
  const hh = Math.floor(total / 3600)
  const mm = Math.floor((total % 3600) / 60)
  const ss = total % 60
  const unit = (/** @type {string} */ text) => h('span', { class: 'wheel-unit' }, text)
  return h(
    'div',
    { class: 'timer-wheels', key: 'wheels' },
    wheelGroup(
      wheel({
        key: 'h',
        items: HOURS,
        value: hh,
        label: S.hoursAria,
        width: 56,
        align: 'right',
        onChange: (v) => ({ type: 'TimerWheel', h: v, m: mm, s: ss }),
      }),
      unit(S.hoursUnit),
      wheel({
        key: 'm',
        items: SIXTY,
        value: mm,
        label: S.minutesAria,
        width: 56,
        align: 'right',
        onChange: (v) => ({ type: 'TimerWheel', h: hh, m: v, s: ss }),
      }),
      unit(S.minUnit),
      wheel({
        key: 's',
        items: SIXTY,
        value: ss,
        label: S.secondsAria,
        width: 56,
        align: 'right',
        onChange: (v) => ({ type: 'TimerWheel', h: hh, m: mm, s: v }),
      }),
      unit(S.secUnit),
    ),
  )
}

/**
 * Progress ring (diameter 280, stroke 8), countdown and end time (§3.10).
 * @param {Model} m
 * @param {Timer} t
 */
function countdown(m, t) {
  const now = nowOf(m)
  const remaining = t.status === 'running' && t.endsAt !== null ? Math.max(0, t.endsAt - now) : t.remainingMs
  const progress = t.durationMs > 0 ? remaining / t.durationMs : 0
  const R = 120
  const C = 2 * Math.PI * R
  const endsAt = t.status === 'running' && t.endsAt !== null ? t.endsAt : now + remaining
  return h(
    'div',
    { class: 'countdown', key: 'countdown' },
    h(
      'svg',
      { viewBox: '0 0 280 280', class: 'countdown-ring' },
      h('circle', { cx: '140', cy: '140', r: String(R), fill: 'none', stroke: 'var(--fill-2)', 'stroke-width': '8' }),
      h('circle', {
        class: 'countdown-arc',
        cx: '140',
        cy: '140',
        r: String(R),
        fill: 'none',
        stroke: 'var(--orange)',
        'stroke-width': '8',
        'stroke-linecap': 'round',
        'stroke-dasharray': String(C),
        'stroke-dashoffset': String(C * (1 - progress)),
      }),
    ),
    h(
      'div',
      { class: 'countdown-inner' },
      h('p', { class: 'countdown-label' }, timerLabel(t)),
      h('p', { class: 'countdown-time tabular' }, formatCountdown(remaining)),
      h(
        'p',
        { class: cx('countdown-end', t.status === 'paused' && 'is-paused') },
        BellIcon('countdown-bell'),
        formatTimestamp(endsAt, hourCycleOf(m)),
      ),
    ),
  )
}
