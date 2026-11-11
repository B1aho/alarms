/** Alarms page (ALARM_SPEC §3.2, §5.1–5.4). */

import { formatClock, formatRelative, formatTimestamp } from '../../../domain/format.js'
import { nextUpcoming, repeatSummary, isActive } from '../../../domain/schedule.js'
import { alarmLabel, S } from '../../../domain/strings.js'
import { cx, h } from '../../kernel/h.js'
import { hourCycleOf, nowOf } from '../../model.js'
import { filledButton, plusButton, textButton } from '../../widgets/button.js'
import { AlarmIcon, ChevronRightIcon, MinusCircleIcon } from '../../widgets/icons.js'
import { pageHeader, section } from '../../widgets/row.js'
import { switchControl } from '../../widgets/switch.js'
import { notificationBanner } from '../banners.js'

/** @typedef {import('../../model.js').Model} Model */
/** @typedef {import('../../../contract/events.js').Alarm} Alarm */

/** @param {Model} m */
export function alarmsPage(m) {
  const app = m.app
  const items = app?.alarms ?? []
  const next = nextUpcoming(items)
  // Refreshed at least every 15 s (§3.2): the value only changes at 15-second boundaries.
  const now = Math.floor(nowOf(m) / 15_000) * 15_000
  const subtitle = app ? (next ? S.nextAlarmIn(formatRelative(next.at - now)) : S.noAlarmsOn) : ' '
  const add = () => ({ type: 'OpenNewAlarm' })

  return h(
    'div',
    { class: 'page page-alarms', key: 'alarms' },
    pageHeader({
      title: S.tabs.alarms,
      leading:
        items.length > 0
          ? textButton({ onclick: () => ({ type: 'ToggleEditMode' }), bold: m.editMode }, m.editMode ? S.done : S.edit)
          : null,
      trailing: items.length > 0 ? plusButton({ onclick: add, label: S.addAlarmAria }) : null,
      subtitle,
    }),
    notificationBanner(m),
    app && items.length === 0
      ? h(
          'div',
          { class: 'empty-state' },
          AlarmIcon('empty-icon'),
          h('p', { class: 'empty-title' }, S.noAlarms),
          h('p', { class: 'empty-text' }, S.noAlarmsHint),
          filledButton({ onclick: add }, S.addAlarm),
        )
      : section({ header: S.alarmsHeader }, ...items.map((a) => alarmRow(m, a))),
  )
}

/**
 * @param {Model} m
 * @param {Alarm} a
 */
function alarmRow(m, a) {
  const cycle = hourCycleOf(m)
  const { time, period } = formatClock(a.hour, a.minute, cycle)
  const repeat = repeatSummary(a.days)
  const label = alarmLabel(a)
  const subtitle = [label, repeat === S.never ? null : repeat.toLowerCase()].filter(Boolean).join(', ')
  const confirming = m.editMode && m.confirmDelete === a.id

  return h(
    'div',
    {
      key: a.id,
      class: cx('row', 'alarm-row', m.editMode && 'is-editing'),
      'data-alarm-id': a.id,
      onclick: () => ({ type: 'OpenAlarm', id: a.id }),
    },
    m.editMode
      ? h(
          'button',
          {
            type: 'button',
            class: cx('delete-toggle', confirming && 'is-open'),
            'aria-label': S.deleteAria(label),
            onclick: (/** @type {Event} */ e) => {
              e.stopPropagation()
              return { type: 'AskDelete', id: a.id }
            },
          },
          MinusCircleIcon(),
        )
      : null,
    h(
      'div',
      { class: cx('alarm-main', !isActive(a) && 'is-inactive') },
      h(
        'div',
        { class: 'alarm-time' },
        h('span', { class: 'alarm-clock tabular' }, time),
        period ? h('span', { class: 'alarm-period' }, period) : null,
      ),
      h('div', { class: 'alarm-subtitle' }, h('span', { class: 'truncate' }, subtitle)),
      a.snoozeUntil !== null
        ? h(
            'div',
            { class: 'alarm-snoozed' },
            S.snoozedUntil(formatTimestamp(a.snoozeUntil, cycle)),
            h(
              'button',
              {
                type: 'button',
                class: 'snooze-stop',
                onclick: (/** @type {Event} */ e) => {
                  e.stopPropagation()
                  return { type: 'CancelSnooze', id: a.id }
                },
              },
              S.stop,
            ),
          )
        : null,
    ),
    m.editMode
      ? confirming
        ? h(
            'button',
            {
              type: 'button',
              class: 'delete-button',
              onclick: (/** @type {Event} */ e) => {
                e.stopPropagation()
                return { type: 'DeleteAlarm', id: a.id }
              },
            },
            S.delete,
          )
        : ChevronRightIcon('alarm-chevron')
      : switchControl({
          checked: a.enabled,
          label: `${label} ${time}${period ?? ''}`,
          onChange: (v) => ({ type: 'SetEnabled', id: a.id, enabled: v }),
        }),
  )
}
