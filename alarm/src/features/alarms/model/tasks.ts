import type { Difficulty, DismissTask } from '@/shared/settings'

export interface Problem {
  kind: 'math' | 'retype'
  prompt: string
  answer: string
}

type Rand = () => number

const int = (rand: Rand, min: number, max: number) => min + Math.floor(rand() * (max - min + 1))

export function mathProblem(difficulty: Difficulty, rand: Rand = Math.random): Problem {
  switch (difficulty) {
    case 'easy': {
      const a = int(rand, 12, 59)
      const b = int(rand, 11, 39)
      return rand() < 0.5
        ? { kind: 'math', prompt: `${a} + ${b}`, answer: String(a + b) }
        : { kind: 'math', prompt: `${a + b} − ${b}`, answer: String(a) }
    }
    case 'medium': {
      const a = int(rand, 3, 9)
      const b = int(rand, 12, 29)
      const c = int(rand, 11, 89)
      return { kind: 'math', prompt: `${a} × ${b} + ${c}`, answer: String(a * b + c) }
    }
    case 'hard': {
      const a = int(rand, 6, 19)
      const b = int(rand, 13, 49)
      const c = int(rand, 3, 9)
      const d = int(rand, 11, 29)
      return { kind: 'math', prompt: `${a} × ${b} − ${c} × ${d}`, answer: String(a * b - c * d) }
    }
  }
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH: Record<Difficulty, number> = { easy: 6, medium: 10, hard: 14 }

export function retypeProblem(difficulty: Difficulty, rand: Rand = Math.random): Problem {
  let code = ''
  for (let i = 0; i < CODE_LENGTH[difficulty]; i++) code += CODE_ALPHABET[int(rand, 0, CODE_ALPHABET.length - 1)]
  const grouped = code.match(/.{1,4}/g)?.join(' ') ?? code
  return { kind: 'retype', prompt: grouped, answer: code }
}

export function generateProblem(task: DismissTask, rand: Rand = Math.random): Problem | null {
  if (task.type === 'math') return mathProblem(task.difficulty, rand)
  if (task.type === 'retype') return retypeProblem(task.difficulty, rand)
  return null
}

export function checkAnswer(problem: Problem, input: string): boolean {
  const normalized =
    problem.kind === 'math'
      ? input.trim().replace(/[−–]/g, '-').replace(/\s+/g, '')
      : input.toUpperCase().replace(/\s+/g, '')
  return normalized === problem.answer
}

export function taskSummary(task: DismissTask): string {
  if (task.type === 'none') return 'None'
  const kind = task.type === 'math' ? 'Math' : 'Retype Code'
  const diff = task.difficulty[0]!.toUpperCase() + task.difficulty.slice(1)
  return `${kind} · ${diff} · ${task.count}×`
}
