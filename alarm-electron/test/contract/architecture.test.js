/**
 * The dependency rules really bite: a forbidden import makes dependency-cruiser fail.
 * Each case writes a throw-away module into src/, runs depcruise, and removes the module.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../..', import.meta.url))
const bin = path.join(root, 'node_modules', '.bin', 'depcruise')

/**
 * @param {string} file path under src/
 * @param {string} code
 * @param {string} importer file that imports the probe so it is not an orphan
 */
function cruiseWith(file, code, importer) {
  const abs = path.join(root, 'src', file)
  writeFileSync(abs, code)
  try {
    const res = spawnSync(bin, [importer, '--config', '.dependency-cruiser.cjs', '--output-type', 'err'], {
      cwd: root,
      encoding: 'utf8',
    })
    return { code: res.status, out: `${res.stdout}${res.stderr}` }
  } finally {
    rmSync(abs, { force: true })
  }
}

describe('dependency rules', { concurrency: false }, () => {
  it('the real tree is clean', () => {
    const res = spawnSync(bin, ['src', '--config', '.dependency-cruiser.cjs', '--output-type', 'err'], {
      cwd: root,
      encoding: 'utf8',
    })
    assert.equal(res.status, 0, res.stdout)
  })

  /** @type {Array<[string, string, string]>} */
  const cases = [
    ['shell/__probe.js', "import '../domain/schedule.js'\n", 'shell imports domain'],
    ['engine/__probe.js', "import 'electron'\n", 'engine imports electron'],
    ['engine/__probe.js', "import 'node:child_process'\n", 'engine imports a Node module outside fs/path/crypto'],
    ['ui/__probe.js', "import 'node:fs'\n", 'ui imports node'],
    ['ui/__probe.js', "import '../domain/decide.js'\n", 'ui imports domain/decide'],
    ['audio/__probe.js', "import '../domain/format.js'\n", 'audio imports domain beyond ramp'],
    ['domain/__probe.js', "import 'ajv'\n", 'domain imports an npm package'],
    ['domain/__probe.js', "import '../engine/clock.js'\n", 'domain imports engine'],
    ['contract/__probe.js', "import '../domain/strings.js'\n", 'contract imports domain'],
  ]
  for (const [file, code, name] of cases) {
    it(`fails when ${name}`, () => {
      const res = cruiseWith(file, code, `src/${file}`)
      assert.notEqual(res.code, 0, `expected a violation:\n${res.out}`)
    })
  }

  it('fails on a circular dependency', () => {
    const a = path.join(root, 'src/domain/__cycle_a.js')
    const b = path.join(root, 'src/domain/__cycle_b.js')
    writeFileSync(a, "import './__cycle_b.js'\n")
    writeFileSync(b, "import './__cycle_a.js'\n")
    try {
      const res = spawnSync(bin, ['src/domain', '--config', '.dependency-cruiser.cjs', '--output-type', 'err'], {
        cwd: root,
        encoding: 'utf8',
      })
      assert.notEqual(res.status, 0)
      assert.match(`${res.stdout}`, /no-circular/)
    } finally {
      rmSync(a, { force: true })
      rmSync(b, { force: true })
    }
  })

  it('fails on an orphan module', () => {
    const res = cruiseWith('domain/__orphan.js', 'export const x = 1\n', 'src')
    assert.notEqual(res.code, 0)
    assert.match(res.out, /no-orphans/)
  })
})
