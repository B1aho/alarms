import path from 'node:path'
import { RuleTester } from 'eslint'
import { describe, expect, it } from 'vitest'
import plugin, { checkImport, locate } from './architecture.js'

const src = path.resolve('src')
const at = (p) => locate(path.join(src, p), src)

describe('architecture/layers', () => {
  it('classifies files into layers', () => {
    expect(at('main.tsx').layer).toBe('app')
    expect(at('sw.ts').layer).toBe('app')
    expect(at('app/router.tsx').layer).toBe('app')
    expect(at('features/alarms/ui/AlarmRow.tsx')).toMatchObject({ layer: 'features', feature: 'alarms', deep: true })
    expect(at('features/alarms/index.ts')).toMatchObject({ layer: 'features', feature: 'alarms', deep: false })
    expect(at('features/alarms')).toMatchObject({ layer: 'features', feature: 'alarms', deep: false })
    expect(at('shared/ui/Sheet.tsx').layer).toBe('shared')
  })

  it('allows the documented directions', () => {
    expect(checkImport(at('app/router.tsx'), at('features/alarms'))).toBeNull()
    expect(checkImport(at('app/router.tsx'), at('shared/ui'))).toBeNull()
    expect(checkImport(at('features/alarms/ui/X.tsx'), at('shared/lib'))).toBeNull()
    expect(checkImport(at('features/alarms/ui/X.tsx'), at('features/alarms/model/store.ts'))).toBeNull()
    expect(checkImport(at('shared/ui/X.tsx'), at('shared/lib/cn.ts'))).toBeNull()
  })

  it('rejects forbidden directions', () => {
    expect(checkImport(at('shared/ui/X.tsx'), at('features/alarms'))).toMatch(/shared/)
    expect(checkImport(at('shared/ui/X.tsx'), at('app/router.tsx'))).toMatch(/shared/)
    expect(checkImport(at('features/alarms/x.ts'), at('features/timer'))).toMatch(/must not import feature/)
    expect(checkImport(at('features/alarms/x.ts'), at('app/App.tsx'))).toMatch(/must not import from "app"/)
    expect(checkImport(at('app/router.tsx'), at('features/alarms/model/store.ts'))).toMatch(/public API/)
  })

  it('reports violations through ESLint', () => {
    const tester = new RuleTester({ languageOptions: { ecmaVersion: 2022, sourceType: 'module' } })
    tester.run('layers', plugin.rules.layers, {
      valid: [
        { filename: path.join(src, 'features/alarms/ui/A.tsx'), code: "import { x } from '@/shared/lib'" },
        { filename: path.join(src, 'features/alarms/ui/A.tsx'), code: "import { x } from '../model/store'" },
        { filename: path.join(src, 'app/router.tsx'), code: "import { AlarmsPage } from '@/features/alarms'" },
        { filename: path.join(src, 'shared/ui/A.tsx'), code: "import React from 'react'" },
      ],
      invalid: [
        {
          filename: path.join(src, 'features/alarms/ui/A.tsx'),
          code: "import { TimerPage } from '@/features/timer'",
          errors: 1,
        },
        {
          filename: path.join(src, 'features/alarms/ui/A.tsx'),
          code: "import { x } from '../../timer/model/timer'",
          errors: 1,
        },
        {
          filename: path.join(src, 'shared/lib/A.ts'),
          code: "export { x } from '../../features/alarms'",
          errors: 1,
        },
        {
          filename: path.join(src, 'app/router.tsx'),
          code: "const m = import('@/features/alarms/model/store')",
          errors: 1,
        },
      ],
    })
  })
})
