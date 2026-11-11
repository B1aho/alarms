/** Dismissal tasks (ALARM_SPEC.md §3.6). Randomness is always injected. */

import { S } from './strings.js'

/** @typedef {import('../contract/events.js').Problem} Problem */
/** @typedef {import('../contract/commands.js').Task} Task */
/** @typedef {import('../contract/commands.js').Difficulty} Difficulty */
/** @typedef {() => number} Rng uniform in [0, 1) */

/**
 * Deterministic generator (mulberry32) for engine/UI use with an explicit seed.
 * @param {number} seed
 * @returns {Rng}
 */
export function seededRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** rand(a, b): uniform integer, both ends included. @param {Rng} rng @param {number} min @param {number} max */
export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1))

/**
 * @param {Difficulty} difficulty
 * @param {Rng} rng
 * @returns {Problem}
 */
export function mathProblem(difficulty, rng) {
  switch (difficulty) {
    case 'easy': {
      const a = randInt(rng, 12, 59)
      const b = randInt(rng, 11, 39)
      return rng() < 0.5
        ? { kind: 'math', prompt: `${a} + ${b}`, answer: String(a + b) }
        : { kind: 'math', prompt: `${a + b} − ${b}`, answer: String(a) }
    }
    case 'medium': {
      const a = randInt(rng, 3, 9)
      const b = randInt(rng, 12, 29)
      const c = randInt(rng, 11, 89)
      return { kind: 'math', prompt: `${a} × ${b} + ${c}`, answer: String(a * b + c) }
    }
    case 'hard': {
      const a = randInt(rng, 6, 19)
      const b = randInt(rng, 13, 49)
      const c = randInt(rng, 3, 9)
      const d = randInt(rng, 11, 29)
      return { kind: 'math', prompt: `${a} × ${b} − ${c} × ${d}`, answer: String(a * b - c * d) }
    }
  }
}

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
/** @type {Record<Difficulty, number>} */
export const CODE_LENGTH = { easy: 6, medium: 10, hard: 14 }

/**
 * @param {Difficulty} difficulty
 * @param {Rng} rng
 * @returns {Problem}
 */
export function retypeProblem(difficulty, rng) {
  let code = ''
  for (let i = 0; i < CODE_LENGTH[difficulty]; i++) code += CODE_ALPHABET[randInt(rng, 0, CODE_ALPHABET.length - 1)]
  const grouped = code.match(/.{1,4}/g)?.join(' ') ?? code
  return { kind: 'retype', prompt: grouped, answer: code }
}

/**
 * @param {Task} task
 * @param {Rng} rng
 * @returns {Problem | null}
 */
export function generateProblem(task, rng) {
  if (task.type === 'math') return mathProblem(task.difficulty, rng)
  if (task.type === 'retype') return retypeProblem(task.difficulty, rng)
  return null
}

/**
 * Math: spaces ignored, − and – count as minus. Code: case and spaces ignored.
 * @param {Problem} problem
 * @param {string} input
 */
export function checkAnswer(problem, input) {
  const normalized =
    problem.kind === 'math' ? input.trim().replace(/[−–]/g, '-').replace(/\s+/g, '') : input.toUpperCase().replace(/\s+/g, '')
  return normalized === problem.answer
}

/** "None", "Math · Medium · 2×", "Retype Code · Hard · 1×" @param {Task} task */
export function taskSummary(task) {
  if (task.type === 'none') return S.taskTypes.none
  return `${S.taskTypes[task.type]} · ${S.difficulties[task.difficulty]} · ${task.count}×`
}

/**
 * Random id from an injected generator.
 * @param {Rng} rng
 */
export function makeId(rng) {
  let s = ''
  for (let i = 0; i < 16; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'[randInt(rng, 0, 35)]
  return s
}
