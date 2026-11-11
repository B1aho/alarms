/**
 * strings.js holds every text of ALARM_SPEC §6 (with the platform replacements of TZ §3),
 * and the UI/shell code spells out no English text of its own.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BUILTIN_SOUNDS, N, S } from '../../src/domain/strings.js'

/** All produced texts: plain values, and functions called with sample arguments. */
function allTexts() {
  /** @type {string[]} */
  const out = []
  /** @param {unknown} v */
  const walk = (v) => {
    if (typeof v === 'string') out.push(v)
    else if (typeof v === 'function') {
      for (const args of [
        ['N'],
        [9],
        [1],
        [2],
        ['darwin'],
        ['win32'],
        ['linux'],
        ['<label>'],
        ['<time>'],
        ['Monday'],
        ['Sunday'],
      ]) {
        try {
          out.push(String(v(...args)))
        } catch {
          // not applicable
        }
      }
    } else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(S)
  walk(N)
  walk(BUILTIN_SOUNDS.map((s) => s.name))
  return out.join('\n')
}

// ALARM_SPEC §6, verbatim (substitutions marked with N / <…> where they are generated).
const SECTION_6 = [
  'Alarm',
  'Alarms',
  'Stopwatch',
  'Timer',
  'Settings',
  'Edit',
  'Done',
  'Next alarm in',
  'No alarms on',
  'ALARMS',
  'No Alarms',
  'Add an alarm to wake up on time.',
  'Add Alarm',
  'Snoozed until',
  'Stop',
  'Delete',
  'Allow Notifications',
  'So alarms reach you even when the app is minimised or behind other windows.',
  'Turn On',
  'Notifications are blocked',
  'Alarms still ring while the app is open, but you will not see them when the window is hidden.',
  'Edit Alarm',
  'Cancel',
  'Save',
  'Back',
  'Repeat',
  'Label',
  'Sound',
  'Snooze',
  'Gradual Volume',
  'Preview Wake-up',
  'Stop Preview',
  'Turn Off With',
  'Delete Alarm',
  'VOLUME',
  'TURN OFF',
  'DIFFICULTY',
  'EXAMPLE',
  'Never',
  'Every day',
  'Weekdays',
  'Weekends',
  'Every Monday',
  'Every Sunday',
  'Off',
  'None',
  'Math',
  'Retype Code',
  'Easy',
  'Medium',
  'Hard',
  '1 task in a row',
  '2 tasks in a row',
  'Starts almost silent and rises smoothly to the set volume.',
  'How long it takes to reach full volume.',
  'The alarm keeps ringing until the task is solved. Snooze never needs a task.',
  'YOUR MUSIC',
  'Choose a File…',
  'Adding…',
  'BUILT-IN SOUNDS',
  'Sunrise',
  'Harp',
  'Chimes',
  'Beacon',
  'Pulse',
  'Classic Bell',
  'Missing file',
  'Music files stay on this computer. MP3, M4A, WAV, OGG and FLAC are supported.',
  'Snooze · 9 min',
  'Solve to turn off',
  'Type the code to turn off',
  'Answer',
  'Code',
  'Start',
  'Pause',
  'Resume',
  'When Timer Ends',
  'RECENTS',
  'Remove',
  'hours',
  'min',
  'sec',
  'N is up',
  'Lap',
  'Reset',
  'Lap 1',
  'APPEARANCE',
  'Theme',
  'Auto',
  'Light',
  'Dark',
  'Time Format',
  '12-hour',
  '24-hour',
  'NEW ALARM DEFAULTS',
  'Difficulty',
  'Applied to alarms you create from now on. Each alarm can still be changed individually.',
  'Default Sound',
  'SNOOZE',
  'Snooze Length · 9 min',
  'RELIABILITY',
  'Notifications',
  'On',
  'Keep Computer Awake',
  'Ring Late Alarms For',
  'Add Music File…',
  'Imported files are copied into the app’s local storage, so alarms keep working if the original is moved.',
  'ABOUT',
  'Version',
  'Storage',
  'This computer only',
  // notifications
  '⏰ <label>',
  '<time>\nOpen the app to turn it off.',
  'Snooze 9 min',
  'Missed alarm: <label>',
  'It was set for <time>, while the computer was asleep or the app was closed.',
  '⏱ <label>',
  'N timer is done.',
  '<label> ended',
  'Your N timer finished while the computer was asleep.',
  // sound import errors (§3.8 with TZ §3.10)
  'That file is not an audio file.',
  'That file is larger than 80 MB.',
  'This audio format cannot be played on this computer.',
  // TZ §3 platform texts
  'Open at Login',
  'Blocked',
  'Alarm keeps running in the menu bar / tray and rings even when its window is closed.',
  'Allow notifications in System Settings → Notifications.',
  'Allow notifications in Settings → System → Notifications.',
  'Allow notifications in your desktop settings.',
  'Open Alarm',
  'Quit',
]

describe('strings.js', () => {
  const texts = allTexts()
  for (const t of SECTION_6) it(`contains ${JSON.stringify(t)}`, () => assert.ok(texts.includes(t), t))

  it('no browser-only texts remain (TZ §3.2, §3.3, §3.10)', () => {
    assert.ok(!texts.includes('Click anywhere'))
    assert.ok(!texts.includes('by your browser'))
    assert.ok(!texts.includes('Alarm Sound'))
    assert.ok(!texts.includes('This is a web app'))
  })
})

describe('no hard-coded UI text outside strings.js', () => {
  const root = fileURLToPath(new URL('../../src', import.meta.url))
  /** @param {string} dir @returns {string[]} */
  const files = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f)
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : []
    })
  const sample = SECTION_6.filter((t) => t.length > 12 && !t.includes('<') && !/^N /.test(t))
  for (const dir of ['ui', 'shell', 'audio', 'engine']) {
    it(`src/${dir} spells out none of the §6 sentences`, () => {
      for (const f of files(path.join(root, dir))) {
        const code = readFileSync(f, 'utf8')
        for (const t of sample) assert.ok(!code.includes(`'${t}'`) && !code.includes(`\`${t}`), `${path.relative(root, f)}: ${t}`)
      }
    })
  }
})
