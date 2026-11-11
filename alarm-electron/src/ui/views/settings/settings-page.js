/** Settings (ALARM_SPEC §3.12 with TZ §3.3–3.6, §3.8, §3.15). Every change applies and is saved at once. */

import { formatDurationShort, formatGrace, formatSize } from '../../../domain/format.js'
import { GRACE_OPTIONS, RAMP_OPTIONS } from '../../../domain/schedule.js'
import { S, soundName } from '../../../domain/strings.js'
import { h } from '../../kernel/h.js'
import { importErrorFor, importing } from '../../model.js'
import { filledButton, textButton } from '../../widgets/button.js'
import { MusicIcon, PlusIcon, TrashIcon } from '../../widgets/icons.js'
import { pageHeader, row, section } from '../../widgets/row.js'
import { segmented } from '../../widgets/segmented.js'
import { sheet, sheetBody, sheetHeader } from '../../widgets/sheet.js'
import { volumeRow } from '../../widgets/slider.js'
import { stepper } from '../../widgets/stepper.js'
import { switchControl } from '../../widgets/switch.js'
import { soundPickerBody } from '../sound-picker.js'

/** @typedef {import('../../model.js').Model} Model */
/** @typedef {import('../../../contract/commands.js').SettingsPatch} SettingsPatch */

/** @param {SettingsPatch} patch */
const set = (patch) => ({ type: 'SetSetting', patch })

/**
 * Row with a native drop-down on the right.
 * @template {number} T
 * @param {string} key
 * @param {string} label
 * @param {T} value
 * @param {ReadonlyArray<{ value: T, label: string }>} options
 * @param {(v: T) => unknown} onChange
 */
function selectRow(key, label, value, options, onChange) {
  return row(
    { key },
    h('span', { class: 'row-text flex-1' }, label),
    h(
      'select',
      {
        class: 'row-select',
        'aria-label': label,
        '.value': String(value),
        onchange: (/** @type {Event} */ e) => {
          const v = /** @type {HTMLSelectElement} */ (e.target).value
          const picked = options.find((o) => String(o.value) === v)
          return picked ? onChange(picked.value) : undefined
        },
      },
      options.map((o) => h('option', { key: String(o.value), value: String(o.value) }, o.label)),
    ),
  )
}

/** @param {Model} m */
export function settingsPage(m) {
  const app = m.app
  if (!app) return h('div', { class: 'page', key: 'settings' }, pageHeader({ title: S.tabs.settings }))
  const s = app.settings
  const task = s.defaultTask
  const perm = app.system.notifications
  const status = (/** @type {boolean} */ ok, /** @type {string} */ text) =>
    h('span', { class: ok ? 'tone-green' : 'tone-orange' }, text)

  return h(
    'div',
    { class: 'page page-settings', key: 'settings' },
    pageHeader({ title: S.tabs.settings }),
    section(
      { header: S.appearanceHeader, key: 'appearance' },
      row(
        { key: 'theme' },
        h('span', { class: 'row-text flex-1' }, S.theme),
        segmented({
          class: 'w-220',
          label: S.theme,
          value: s.theme,
          onChange: (theme) => set({ theme }),
          options: [
            { value: 'system', label: S.themes.system },
            { value: 'light', label: S.themes.light },
            { value: 'dark', label: S.themes.dark },
          ],
        }),
      ),
      row(
        { key: 'format' },
        h('span', { class: 'row-text flex-1' }, S.timeFormat),
        segmented({
          class: 'w-220',
          label: S.timeFormat,
          value: s.hourCycle,
          onChange: (hourCycle) => set({ hourCycle }),
          options: [
            { value: 'auto', label: S.hourCycles.auto },
            { value: '12h', label: S.hourCycles['12h'] },
            { value: '24h', label: S.hourCycles['24h'] },
          ],
        }),
      ),
    ),
    section(
      { header: S.newAlarmDefaultsHeader, footer: S.defaultsFooter, key: 'defaults' },
      row({
        key: 'sound',
        label: S.sound,
        detail: soundName(s.defaultSound, app.sounds),
        chevron: true,
        onclick: () => ({ type: 'OpenSheet', sheet: 'defaultSound' }),
      }),
      volumeRow({
        label: S.defaultVolumeAria,
        min: 0.05,
        max: 1,
        step: 0.05,
        value: s.volume,
        onChange: (volume) => set({ volume: Math.round(volume * 20) / 20 }),
      }),
      selectRow(
        'ramp',
        S.gradualVolume,
        s.rampSeconds,
        RAMP_OPTIONS.map((v) => ({ value: v, label: formatDurationShort(v) })),
        (rampSeconds) => set({ rampSeconds }),
      ),
      row(
        { key: 'task' },
        h('span', { class: 'row-text flex-1' }, S.turnOffWith),
        segmented({
          class: 'w-240',
          label: S.defaultTaskAria,
          value: task.type,
          onChange: (type) => set({ defaultTask: { ...task, type } }),
          options: [
            { value: 'none', label: S.taskTypesShort.none },
            { value: 'math', label: S.taskTypesShort.math },
            { value: 'retype', label: S.taskTypesShort.retype },
          ],
        }),
      ),
      task.type !== 'none'
        ? [
            row(
              { key: 'difficulty' },
              h('span', { class: 'row-text flex-1' }, S.difficulty),
              segmented({
                class: 'w-240',
                label: S.defaultDifficultyAria,
                value: task.difficulty,
                onChange: (difficulty) => set({ defaultTask: { ...task, difficulty } }),
                options: [
                  { value: 'easy', label: S.difficulties.easy },
                  { value: 'medium', label: S.difficulties.medium },
                  { value: 'hard', label: S.difficulties.hard },
                ],
              }),
            ),
            row({
              key: 'count',
              label: S.tasksInARow(task.count),
              accessory: stepper({
                label: S.defaultCountAria,
                value: task.count,
                min: 1,
                max: 5,
                onChange: (count) => set({ defaultTask: { ...task, count } }),
              }),
            }),
          ]
        : null,
    ),
    section(
      { header: S.snoozeHeader, key: 'snooze' },
      row({
        key: 'snooze',
        label: S.snoozeLength(s.snoozeMinutes),
        accessory: stepper({
          label: S.snoozeMinutesAria,
          value: s.snoozeMinutes,
          min: 1,
          max: 30,
          onChange: (snoozeMinutes) => set({ snoozeMinutes }),
        }),
      }),
    ),
    section(
      { header: S.reliabilityHeader, footer: S.reliabilityFooter, key: 'reliability' },
      row({
        key: 'notifications',
        label: S.notifications,
        detail: perm === 'granted' ? status(true, S.on) : perm === 'denied' ? status(false, S.blocked) : undefined,
        accessory:
          perm === 'default'
            ? filledButton({ class: 'pill', onclick: () => ({ type: 'RequestNotifications' }) }, S.turnOn)
            : undefined,
      }),
      row({
        key: 'login',
        label: S.openAtLogin,
        accessory: switchControl({
          checked: s.openAtLogin,
          label: S.openAtLogin,
          onChange: (openAtLogin) => set({ openAtLogin }),
        }),
      }),
      row({
        key: 'awake',
        label: S.keepAwake,
        accessory: switchControl({ checked: s.keepAwake, label: S.keepAwakeAria, onChange: (keepAwake) => set({ keepAwake }) }),
      }),
      selectRow(
        'grace',
        S.ringLateFor,
        s.missedGraceMinutes,
        GRACE_OPTIONS.map((v) => ({ value: v, label: formatGrace(v) })),
        (missedGraceMinutes) => set({ missedGraceMinutes }),
      ),
    ),
    section(
      { header: S.yourMusicHeader, footer: importErrorFor(m, 'library') ?? S.libraryFooter, key: 'music' },
      ...app.sounds.map((c) =>
        row({
          key: c.id,
          icon: MusicIcon('music-icon'),
          label: c.name,
          detail: formatSize(c.size),
          accessory: h(
            'button',
            {
              type: 'button',
              class: 'trash-button',
              'aria-label': S.deleteAria(c.name),
              onclick: () => ({ type: 'RemoveSound', id: c.id }),
            },
            TrashIcon(),
          ),
        }),
      ),
      row({
        key: 'add',
        tone: 'accent',
        icon: PlusIcon('add-icon'),
        label: importing(m, 'library') ? S.adding : S.addMusicFile,
        onclick: () => ({ type: 'ChooseFile', target: 'library' }),
      }),
    ),
    section(
      { header: S.aboutHeader, key: 'about' },
      row({ key: 'version', label: S.version, detail: app.system.version }),
      row({ key: 'storage', label: S.storage, detail: S.thisComputerOnly }),
    ),
  )
}

/** @param {Model} m */
export function defaultSoundSheet(m) {
  if (m.sheet !== 'defaultSound' || !m.app) return null
  return sheet(
    { label: S.defaultSound, onClose: () => ({ type: 'CloseSheet' }), key: 'default-sound' },
    sheetHeader({ title: S.defaultSound, trailing: textButton({ bold: true, onclick: () => ({ type: 'CloseSheet' }) }, S.done) }),
    sheetBody({}, soundPickerBody(m, m.app.settings.defaultSound, 'default')),
  )
}
