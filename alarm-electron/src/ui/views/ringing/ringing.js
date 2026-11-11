/** Ringing screen (ALARM_SPEC §3.5, §5.7): always dark, above everything; Snooze / Stop / task card. */

import { formatClock, formatLongDate } from '../../../domain/format.js'
import { alarmLabel, S } from '../../../domain/strings.js'
import { cx, h } from '../../kernel/h.js'
import { hourCycleOf, nowOf, ringingAlarm } from '../../model.js'
import { filledButton, textButton } from '../../widgets/button.js'
import { AlarmIcon } from '../../widgets/icons.js'

/** @typedef {import('../../model.js').Model} Model */

/** @param {HTMLElement} el */
const focusNow = (el) => el.focus({ preventScroll: true })

/** @param {Model} m */
export function ringingScreen(m) {
  const a = ringingAlarm(m)
  if (!a || !m.app) return null
  const label = alarmLabel(a)
  const now = nowOf(m)
  const d = new Date(now)
  const { time, period } = formatClock(d.getHours(), d.getMinutes(), hourCycleOf(m))
  const task = m.app.tasks[a.id]
  // The card waits for the task of this Stop (its round), so a stale problem is never shown.
  const showTask = m.ringing.id === a.id && m.ringing.stage === 'task' && task && task.round >= m.ringing.round

  return h(
    'div',
    { key: `ringing-${a.id}`, role: 'alertdialog', 'aria-label': S.alarmAria(label), class: 'ringing', 'data-theme': 'dark' },
    h('div', { 'aria-hidden': 'true', class: 'ringing-glow' }),
    h(
      'div',
      { class: 'ringing-content' },
      h('div', { class: 'ringing-label' }, AlarmIcon('ringing-label-icon'), label),
      h(
        'div',
        { class: 'ringing-time' },
        h('span', { class: 'ringing-clock tabular' }, time),
        period ? h('span', { class: 'ringing-period' }, period) : null,
      ),
      h('p', { class: 'ringing-date' }, formatLongDate(now)),
      showTask
        ? taskCard(m, task, a.task.count)
        : h(
            'div',
            { class: 'ringing-buttons', key: 'buttons' },
            a.snooze
              ? filledButton(
                  {
                    class: 'ring-snooze ring-primary',
                    key: 'snooze',
                    mounted: focusNow,
                    onclick: () => ({ type: 'RingSnooze' }),
                  },
                  S.snoozeButton(m.app.settings.snoozeMinutes),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                key: 'stop',
                class: cx('ring-stop', !a.snooze && 'ring-primary'),
                mounted: a.snooze ? undefined : focusNow,
                onclick: () => ({ type: 'RingStop' }),
              },
              S.stop,
            ),
          ),
    ),
  )
}

/**
 * @param {Model} m
 * @param {import('../../../contract/transient.js').TaskView} task
 * @param {number} total
 */
function taskCard(m, task, total) {
  const math = task.kind === 'math'
  return h(
    'form',
    {
      key: 'task',
      class: 'task-card',
      onsubmit: (/** @type {Event} */ e) => {
        e.preventDefault()
        return { type: 'RingSubmit' }
      },
    },
    h(
      'div',
      { class: 'task-head' },
      h('span', null, math ? S.solveToTurnOff : S.typeCodeToTurnOff),
      h(
        'span',
        { class: 'task-dots', 'aria-label': S.solvedAria(task.solved, total) },
        Array.from({ length: total }, (_, i) => h('span', { key: i, class: cx('task-dot', i < task.solved && 'is-solved') })),
      ),
    ),
    h(
      'p',
      { key: `prompt-${m.ringing.shake}`, class: cx('task-prompt', 'tabular', m.ringing.shake > 0 && 'animate-shake') },
      task.prompt,
      math ? ' =' : '',
    ),
    h('input', {
      class: 'task-input tabular',
      '.value': m.ringing.input,
      inputmode: math ? 'numeric' : 'text',
      autocomplete: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'aria-label': S.answer,
      placeholder: math ? S.answer : S.code,
      mounted: focusNow,
      oninput: (/** @type {Event} */ e) => ({ type: 'RingInput', value: /** @type {HTMLInputElement} */ (e.target).value }),
    }),
    filledButton({ type: 'submit', class: 'task-done', disabled: !m.ringing.input.trim() }, S.done),
    textButton({ class: 'task-back', onclick: () => ({ type: 'RingBack' }) }, S.back),
  )
}
