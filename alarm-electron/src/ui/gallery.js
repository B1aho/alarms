/**
 * Widget gallery (TZ §10, stage 6): every component of ALARM_SPEC §4.4 on one page, driven by the
 * same MVU runtime. Open with `npm run gallery` (ALARM_GALLERY=1 loads this page instead of the app).
 */

import { S } from '../domain/strings.js'
import { h } from './kernel/h.js'
import { run } from './kernel/runtime.js'
import { circleButton, filledButton, plusButton, textButton } from './widgets/button.js'
import * as Icons from './widgets/icons.js'
import { banner, pageHeader, row, section } from './widgets/row.js'
import { segmented } from './widgets/segmented.js'
import { sheet, sheetBody, sheetHeader } from './widgets/sheet.js'
import { volumeRow } from './widgets/slider.js'
import { stepper } from './widgets/stepper.js'
import { switchControl } from './widgets/switch.js'
import { wheel, wheelGroup } from './views/editor/time-wheels.js'
import './widgets/wheel-picker.js'

/** @typedef {{ seg: string, on: boolean, count: number, volume: number, hour: number, sheet: boolean, theme: 'dark' | 'light' }} G */

/** @type {G} */
const init = { seg: 'math', on: true, count: 2, volume: 0.9, hour: 7, sheet: false, theme: 'dark' }

/** @param {G} m @param {any} msg @returns {[G, any[]]} */
const update = (m, msg) => [{ ...m, ...msg.patch }, []]
/** @param {Partial<G>} patch */
const set = (patch) => ({ type: 'Set', patch })
const hours = Array.from({ length: 24 }, (_, i) => ({ value: i, label: String(i).padStart(2, '0') }))

/** @param {G} m */
function view(m) {
  return h(
    'div',
    { class: 'app' },
    h(
      'main',
      { class: 'content', key: 'main' },
      pageHeader({
        title: 'Widgets',
        leading: textButton(
          { onclick: () => set({ theme: m.theme === 'dark' ? 'light' : 'dark' }) },
          S.themes[m.theme === 'dark' ? 'light' : 'dark'],
        ),
        trailing: plusButton({ onclick: () => set({ sheet: true }), label: S.addAlarmAria }),
      }),
      banner({
        icon: Icons.BellIcon('tone-accent'),
        title: S.allowNotifications,
        text: S.allowNotificationsHint,
        action: filledButton({ class: 'pill' }, S.turnOn),
      }),
      section(
        { header: '4.4.1 · 4.4.2 · 4.4.3 · 4.4.4', key: 'controls' },
        h(
          'div',
          { class: 'segment-pad', 'data-widget': 'segmented' },
          segmented({
            label: S.taskTypeAria,
            value: m.seg,
            onChange: (seg) => set({ seg }),
            options: [
              { value: 'none', label: S.taskTypes.none },
              { value: 'math', label: S.taskTypes.math },
              { value: 'retype', label: S.taskTypes.retype },
            ],
          }),
        ),
        row({
          key: 'switch',
          label: S.snooze,
          accessory: switchControl({ checked: m.on, label: S.snooze, onChange: (on) => set({ on }) }),
        }),
        row({
          key: 'stepper',
          label: S.tasksInARow(m.count),
          accessory: stepper({ label: S.taskCountAria, value: m.count, min: 1, max: 5, onChange: (count) => set({ count }) }),
        }),
        volumeRow({
          label: S.alarmVolumeAria,
          min: 0.05,
          max: 1,
          step: 0.05,
          value: m.volume,
          onChange: (volume) => set({ volume }),
        }),
      ),
      section(
        { header: '4.4.5', key: 'buttons' },
        h(
          'div',
          { class: 'segment-pad', 'data-widget': 'buttons' },
          textButton({}, S.edit),
          ' ',
          textButton({ bold: true }, S.save),
          ' ',
          textButton({ tone: 'red' }, S.delete),
          ' ',
          filledButton({}, S.addAlarm),
          ' ',
          filledButton({ tone: 'gray' }, S.repeatTimer),
          ' ',
          filledButton({ tone: 'red' }, S.delete),
          ' ',
          filledButton({ tone: 'indigo' }, S.done),
          ' ',
          filledButton({ disabled: true }, S.done),
        ),
        h(
          'div',
          { class: 'round-buttons segment-pad' },
          circleButton({ tone: 'gray' }, S.lap),
          circleButton({ tone: 'green' }, S.start),
          circleButton({ tone: 'orange' }, S.pause),
          circleButton({ tone: 'red' }, S.stop),
          circleButton({ tone: 'gray', disabled: true }, S.reset),
        ),
      ),
      section(
        { header: '4.4.6', key: 'wheel' },
        h(
          'div',
          { class: 'segment-pad' },
          wheelGroup(
            wheel({ key: 'h', items: hours, value: m.hour, label: S.hourAria, width: 72, onChange: (hour) => set({ hour }) }),
          ),
        ),
      ),
      section(
        { header: '4.4.7', footer: S.volumeFooter, key: 'rows' },
        row({ key: 'chev', label: S.repeat, detail: S.weekdays, chevron: true, onclick: () => undefined }),
        row({ key: 'check', label: S.everyDay('Monday'), checked: true, onclick: () => undefined }),
        row(
          { key: 'input' },
          h('span', { class: 'row-text' }, S.label),
          h('input', { class: 'inline-input', placeholder: 'Alarm' }),
        ),
        row({ key: 'icon', label: S.chooseFile, tone: 'accent', icon: Icons.PlusIcon('add-icon'), onclick: () => undefined }),
        row({ key: 'red', label: S.deleteAlarm, tone: 'red', onclick: () => undefined }),
      ),
      section(
        { header: '4.4.9', key: 'icons' },
        h(
          'div',
          { class: 'segment-pad gallery-icons', 'data-widget': 'icons' },
          Object.values(Icons).map((I) => /** @type {(c?: string) => any} */ (I)('gallery-icon')),
        ),
      ),
    ),
    m.sheet
      ? sheet(
          { label: S.addAlarm, onClose: () => set({ sheet: false }) },
          sheetHeader({
            leading: textButton({ onclick: () => set({ sheet: false }) }, S.cancel),
            title: S.addAlarm,
            trailing: textButton({ bold: true, onclick: () => set({ sheet: false }) }, S.save),
          }),
          sheetBody({}, section({}, row({ label: S.repeat, detail: S.never, chevron: true }))),
        )
      : null,
  )
}

run({
  root: /** @type {Element} */ (document.getElementById('app')),
  init,
  update,
  view,
  subscriptions: () => [],
  startSub: () => () => {},
  runEffect: () => {},
  afterRender: (m) => {
    document.documentElement.dataset.theme = m.theme
    document.documentElement.setAttribute('data-ready', '')
  },
})
