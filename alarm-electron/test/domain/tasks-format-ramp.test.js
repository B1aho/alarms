import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkAnswer,
  generateProblem,
  mathProblem,
  retypeProblem,
  seededRng,
  taskSummary,
  CODE_ALPHABET,
} from '../../src/domain/tasks.js'
import {
  describeDuration,
  formatClock,
  formatClockString,
  formatCountdown,
  formatDurationShort,
  formatGrace,
  formatLongDate,
  formatRelative,
  formatSize,
  formatStopwatch,
  hourCycleFromIntl,
} from '../../src/domain/format.js'
import { gainAt, MIN_LEVEL, rampCurve } from '../../src/domain/ramp.js'
import { at } from './helpers.js'

/** Evaluates a prompt that only contains digits and + − × operators. @param {string} prompt */
function evalPrompt(prompt) {
  const tokens = prompt.replace(/×/g, '*').replace(/−/g, '-').split(' ')
  /** @type {number[]} */
  const terms = []
  let sign = 1
  let product = Number(tokens[0])
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i]
    const n = Number(tokens[i + 1])
    if (op === '*') product *= n
    else {
      terms.push(sign * product)
      sign = op === '+' ? 1 : -1
      product = n
    }
  }
  terms.push(sign * product)
  return terms.reduce((a, b) => a + b, 0)
}

describe('math tasks (§3.6)', () => {
  for (const difficulty of /** @type {const} */ (['easy', 'medium', 'hard'])) {
    it(`${difficulty}: answers match prompts and ranges`, () => {
      const rng = seededRng(42)
      for (let i = 0; i < 500; i++) {
        const p = mathProblem(difficulty, rng)
        assert.equal(String(evalPrompt(p.prompt)), p.answer)
        assert.match(p.prompt, /^[0-9]+( [+×−] [0-9]+)+$/)
        const nums = p.prompt
          .split(' ')
          .filter((_, j) => j % 2 === 0)
          .map(Number)
        if (difficulty === 'medium') {
          assert.ok(nums[0] >= 3 && nums[0] <= 9 && nums[1] >= 12 && nums[1] <= 29 && nums[2] >= 11 && nums[2] <= 89)
        }
        if (difficulty === 'hard') {
          assert.ok(
            nums[0] >= 6 &&
              nums[0] <= 19 &&
              nums[1] >= 13 &&
              nums[1] <= 49 &&
              nums[2] >= 3 &&
              nums[2] <= 9 &&
              nums[3] >= 11 &&
              nums[3] <= 29,
          )
        }
      }
    })
  }
  it('easy uses both forms (a + b and (a+b) − b)', () => {
    const rng = seededRng(7)
    const kinds = new Set(Array.from({ length: 50 }, () => (mathProblem('easy', rng).prompt.includes('+') ? '+' : '−')))
    assert.deepEqual([...kinds].sort(), ['+', '−'])
  })
  it('hard may be negative', () => {
    // a=6, b=13, c=9, d=29 → 78 − 261
    const p = mathProblem('hard', () => 0.0)
    assert.equal(p.answer, String(6 * 13 - 3 * 11))
    const q = mathProblem(
      'hard',
      (() => {
        const v = [0, 0, 0.99, 0.99]
        let i = 0
        return () => v[i++]
      })(),
    )
    assert.equal(q.answer, String(6 * 13 - 9 * 29))
    assert.ok(Number(q.answer) < 0)
  })
  it('accepts whitespace and unicode minus / en dash', () => {
    assert.equal(checkAnswer({ kind: 'math', prompt: '', answer: '-12' }, ' −12 '), true)
    assert.equal(checkAnswer({ kind: 'math', prompt: '', answer: '-12' }, '– 12'), true)
    assert.equal(checkAnswer({ kind: 'math', prompt: '', answer: '42' }, '41'), false)
  })
})

describe('retype tasks (§3.6)', () => {
  it('length per difficulty, alphabet, grouped by 4, case/space-insensitive', () => {
    for (const [d, n] of /** @type {const} */ ([
      ['easy', 6],
      ['medium', 10],
      ['hard', 14],
    ])) {
      const p = retypeProblem(d, seededRng(n))
      assert.equal(p.answer.length, n)
      for (const ch of p.answer) assert.ok(CODE_ALPHABET.includes(ch))
      assert.equal(p.prompt, p.answer.match(/.{1,4}/g)?.join(' '))
      assert.equal(checkAnswer(p, p.prompt.toLowerCase()), true)
    }
    assert.ok(!/[IO01]/.test(CODE_ALPHABET))
  })
  it('none task produces no problem', () => {
    assert.equal(generateProblem({ type: 'none', difficulty: 'easy', count: 1 }, seededRng(1)), null)
  })
  it('summary', () => {
    assert.equal(taskSummary({ type: 'none', difficulty: 'easy', count: 1 }), 'None')
    assert.equal(taskSummary({ type: 'math', difficulty: 'medium', count: 2 }), 'Math · Medium · 2×')
    assert.equal(taskSummary({ type: 'retype', difficulty: 'hard', count: 1 }), 'Retype Code · Hard · 1×')
  })
})

describe('formats (§3.13)', () => {
  it('24h with leading zero', () => assert.deepEqual(formatClock(6, 30, '24h'), { time: '06:30', period: null }))
  it('12h', () => {
    assert.deepEqual(formatClock(0, 5, '12h'), { time: '12:05', period: 'AM' })
    assert.deepEqual(formatClock(12, 0, '12h'), { time: '12:00', period: 'PM' })
    assert.deepEqual(formatClock(18, 45, '12h'), { time: '6:45', period: 'PM' })
    assert.equal(formatClockString(7, 15, '12h'), '7:15 AM')
  })
  it('relative', () => {
    assert.equal(formatRelative(30_000), 'less than a minute')
    assert.equal(formatRelative(45 * 60_000), '45 min')
    assert.equal(formatRelative((7 * 60 + 12) * 60_000), '7 hr 12 min')
    assert.equal(formatRelative((27 * 60 + 10) * 60_000), '1 day 3 hr')
    assert.equal(formatRelative(48 * 3600_000), '2 days')
    assert.equal(formatRelative(6 * 60_000 - 20_000), '6 min')
  })
  it('countdown rounds up', () => {
    assert.equal(formatCountdown(299_001), '05:00')
    assert.equal(formatCountdown(3_600_000 + 61_000), '1:01:01')
    assert.equal(formatCountdown(0), '00:00')
  })
  it('stopwatch', () => {
    assert.equal(formatStopwatch(61_234), '01:01.23')
    assert.equal(formatStopwatch(3_600_000 + 5_670), '1:00:05.67')
  })
  it('durations', () => {
    assert.equal(formatDurationShort(0), 'Off')
    assert.equal(formatDurationShort(15), '15 sec')
    assert.equal(formatDurationShort(60), '1 min')
    assert.equal(formatDurationShort(90), '1 min 30 sec')
    assert.equal(describeDuration(300_000), '5 min')
    assert.equal(describeDuration(630_000), '10 min 30 sec')
    assert.equal(describeDuration(3_720_000), '1 hr 2 min')
    assert.equal(formatGrace(60), '1 hr')
    assert.equal(formatGrace(15), '15 min')
    assert.equal(formatSize(3.46 * 1024 * 1024), '3.5 MB')
  })
  it('long date', () => assert.equal(formatLongDate(at(2026, 11, 10, 8)), 'Tuesday, November 10'))
  it('Intl hour cycle', () => {
    assert.equal(hourCycleFromIntl('h12'), '12h')
    assert.equal(hourCycleFromIntl('h23'), '24h')
  })
})

describe('ramp (§3.9)', () => {
  it('quadratic from 1.5 % to the volume', () => {
    assert.equal(gainAt(0.8, 60, 0), 0.8 * MIN_LEVEL)
    assert.equal(gainAt(0.8, 60, 60), 0.8)
    assert.equal(gainAt(0.8, 60, 120), 0.8)
    assert.ok(Math.abs(gainAt(1, 60, 30) - (0.015 + 0.985 * 0.25)) < 1e-12)
  })
  it('ramp 0 = full volume at once', () => assert.equal(gainAt(0.5, 0, 0), 0.5))
  it('curve samples', () => {
    const c = rampCurve(1, 5)
    assert.equal(c.length, 5)
    assert.ok(Math.abs(c[0] - 0.015) < 1e-6)
    assert.ok(Math.abs(c[4] - 1) < 1e-6)
    for (let i = 1; i < c.length; i++) assert.ok(c[i] > c[i - 1])
  })
})
