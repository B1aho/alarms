/** Alarm editor sheet (ALARM_SPEC §3.3, §5.5–5.6): main page and four push-in sub-pages. */

import { formatDurationShort } from '../../../domain/format.js'
import { DAY_LONG, RAMP_OPTIONS, repeatSummary, WEEK_ORDER } from '../../../domain/schedule.js'
import { DEFAULT_ALARM_LABEL, S, soundName } from '../../../domain/strings.js'
import { taskSummary } from '../../../domain/tasks.js'
import { cx, h } from '../../kernel/h.js'
import { hourCycleOf } from '../../model.js'
import { textButton } from '../../widgets/button.js'
import { row, section } from '../../widgets/row.js'
import { segmented } from '../../widgets/segmented.js'
import { backButton, sheet, sheetBody, sheetHeader } from '../../widgets/sheet.js'
import { volumeRow } from '../../widgets/slider.js'
import { stepper } from '../../widgets/stepper.js'
import { switchControl } from '../../widgets/switch.js'
import { soundPickerBody } from '../sound-picker.js'
import { timeWheels } from './time-wheels.js'

/** @typedef {import('../../model.js').Model} Model */
/** @typedef {import('../../model.js').Editor} Editor */
/** @typedef {import('../../../contract/commands.js').Task} Task */

/** @param {Model} m */
export function editorSheet(m) {
  const ed = m.editor
  if (!ed) return null
  const titles = {
    main: ed.isNew ? S.addAlarm : S.editAlarm,
    repeat: S.repeat,
    sound: S.sound,
    ramp: S.gradualVolume,
    task: S.turnOffWith,
  }
  const main = ed.page === 'main'
  return sheet(
    { label: titles.main, onClose: () => ({ type: 'EditorCancel' }), key: 'editor' },
    sheetHeader({
      leading: main
        ? textButton({ onclick: () => ({ type: 'EditorCancel' }) }, S.cancel)
        : backButton(() => ({ type: 'EditorPage', page: 'main' })),
      title: titles[ed.page],
      trailing: main ? textButton({ bold: true, onclick: () => ({ type: 'EditorSave' }) }, S.save) : null,
    }),
    sheetBody({ key: ed.page, class: main ? undefined : 'animate-push-in' }, pageContent(m, ed)),
  )
}

/**
 * @param {Model} m
 * @param {Editor} ed
 */
function pageContent(m, ed) {
  const d = ed.draft
  switch (ed.page) {
    case 'main':
      return [
        timeWheels(d.hour, d.minute, hourCycleOf(m)),
        section(
          { class: 'mt-6', key: 's1' },
          row({
            key: 'repeat',
            label: S.repeat,
            detail: repeatSummary(d.days),
            chevron: true,
            onclick: () => ({ type: 'EditorPage', page: 'repeat' }),
          }),
          row(
            { key: 'label' },
            h('span', { class: 'row-text' }, S.label),
            h('input', {
              class: 'inline-input',
              '.value': d.label,
              maxlength: '60',
              placeholder: DEFAULT_ALARM_LABEL,
              'aria-label': S.label,
              oninput: (/** @type {Event} */ e) => ({
                type: 'DraftLabel',
                label: /** @type {HTMLInputElement} */ (e.target).value,
              }),
            }),
          ),
          row({
            key: 'sound',
            label: S.sound,
            detail: soundName(d.sound, m.app?.sounds ?? []),
            chevron: true,
            onclick: () => ({ type: 'EditorPage', page: 'sound' }),
          }),
          row({
            key: 'snooze',
            label: S.snooze,
            accessory: switchControl({ checked: d.snooze, label: S.snooze, onChange: (on) => ({ type: 'DraftSnooze', on }) }),
          }),
        ),
        section(
          { header: S.volumeHeader, footer: S.volumeFooter, key: 's2' },
          volumeRow({
            label: S.alarmVolumeAria,
            min: 0.05,
            max: 1,
            step: 0.05,
            value: d.volume,
            onChange: (volume) => ({ type: 'DraftVolume', volume }),
          }),
          row({
            key: 'ramp',
            label: S.gradualVolume,
            detail: formatDurationShort(d.rampSeconds),
            chevron: true,
            onclick: () => ({ type: 'EditorPage', page: 'ramp' }),
          }),
          row({
            key: 'preview',
            label: ed.previewing ? S.stopPreview : S.previewWakeUp,
            tone: 'accent',
            onclick: () => ({ type: 'TogglePreview' }),
          }),
        ),
        section(
          { header: S.turnOffHeader, footer: S.turnOffFooter, key: 's3' },
          row({
            key: 'task',
            label: S.turnOffWith,
            detail: taskSummary(d.task),
            chevron: true,
            onclick: () => ({ type: 'EditorPage', page: 'task' }),
          }),
        ),
        ed.isNew
          ? null
          : section(
              { key: 's4' },
              row({ key: 'delete', label: S.deleteAlarm, tone: 'red', onclick: () => ({ type: 'EditorDelete' }) }),
            ),
      ]
    case 'repeat':
      return section(
        { key: 'repeat' },
        ...WEEK_ORDER.map((day) =>
          row({
            key: day,
            label: S.everyDay(DAY_LONG[day]),
            checked: d.days.includes(day),
            onclick: () => ({ type: 'DraftToggleDay', day }),
          }),
        ),
      )
    case 'sound':
      return soundPickerBody(m, d.sound, 'editor')
    case 'ramp':
      return section(
        { footer: S.rampFooter, key: 'ramp' },
        ...RAMP_OPTIONS.map((s) =>
          row({
            key: s,
            label: formatDurationShort(s),
            checked: d.rampSeconds === s,
            onclick: () => ({ type: 'DraftRamp', seconds: s }),
          }),
        ),
      )
    case 'task':
      return taskPage(d.task, ed.example)
  }
}

/**
 * @param {Task} task
 * @param {import('../../../contract/events.js').Problem | null} example
 */
function taskPage(task, example) {
  /** @param {Partial<Task>} patch */
  const set = (patch) => ({ type: 'DraftTask', task: { ...task, ...patch } })
  return [
    section(
      { key: 'type' },
      h(
        'div',
        { class: 'segment-pad' },
        segmented({
          label: S.taskTypeAria,
          value: task.type,
          onChange: (type) => set({ type }),
          options: [
            { value: 'none', label: S.taskTypes.none },
            { value: 'math', label: S.taskTypes.math },
            { value: 'retype', label: S.taskTypes.retype },
          ],
        }),
      ),
    ),
    task.type !== 'none'
      ? [
          section(
            { header: S.difficultyHeader, key: 'difficulty' },
            h(
              'div',
              { class: 'segment-pad' },
              segmented({
                label: S.difficulty,
                value: task.difficulty,
                onChange: (difficulty) => set({ difficulty }),
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
                label: S.taskCountAria,
                value: task.count,
                min: 1,
                max: 5,
                onChange: (count) => set({ count }),
              }),
            }),
          ),
          example
            ? section(
                { header: S.exampleHeader, key: 'example' },
                h(
                  'div',
                  { class: 'example' },
                  h('p', { class: cx('example-text', 'tabular') }, example.prompt, example.kind === 'math' ? ' = ?' : ''),
                ),
              )
            : null,
        ]
      : null,
  ]
}
