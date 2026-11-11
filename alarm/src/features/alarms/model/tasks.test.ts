import { describe, expect, it } from 'vitest'
import { checkAnswer, generateProblem, mathProblem, retypeProblem } from './tasks'

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

const evalPrompt = (prompt: string) =>
  // Prompts only contain digits and + − × operators.
  Function(`return ${prompt.replace(/×/g, '*').replace(/−/g, '-')}`)() as number

describe('math tasks', () => {
  it.each(['easy', 'medium', 'hard'] as const)('%s answers match their prompt', (difficulty) => {
    const rand = seeded(42)
    for (let i = 0; i < 200; i++) {
      const p = mathProblem(difficulty, rand)
      expect(String(evalPrompt(p.prompt))).toBe(p.answer)
    }
  })

  it('accepts answers with whitespace and unicode minus', () => {
    expect(checkAnswer({ kind: 'math', prompt: '', answer: '-12' }, ' −12 ')).toBe(true)
    expect(checkAnswer({ kind: 'math', prompt: '', answer: '42' }, '41')).toBe(false)
  })
})

describe('retype tasks', () => {
  it('has the right length per difficulty and accepts lowercase/spaced input', () => {
    const p = retypeProblem('medium', seeded(1))
    expect(p.answer).toHaveLength(10)
    expect(p.answer).toMatch(/^[A-HJ-NP-Z2-9]+$/)
    expect(checkAnswer(p, p.prompt.toLowerCase())).toBe(true)
    expect(retypeProblem('hard', seeded(2)).answer).toHaveLength(14)
  })
})

it('none task produces no problem', () => {
  expect(generateProblem({ type: 'none', difficulty: 'easy', count: 1 })).toBeNull()
})
