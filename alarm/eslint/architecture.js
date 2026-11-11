// @ts-check
/**
 * Enforces the layered architecture from the project plan:
 *
 *   app       (src/app/**, src/main.tsx, src/sw.ts, src/*.d.ts) → may import features, shared
 *   features  (src/features/<name>/**)                          → may import shared and ONLY its own feature
 *   shared    (src/shared/**)                                   → may import shared only
 *
 * Extra rule: code outside a feature may only use the feature's public API
 * (`@/features/<name>`), never reach into its internals.
 */
import path from 'node:path'

/** @typedef {{ layer: 'app' | 'features' | 'shared' | 'outside', feature?: string, deep?: boolean }} Location */

/**
 * @param {string} absPath
 * @param {string} srcDir
 * @returns {Location}
 */
export function locate(absPath, srcDir) {
  const rel = path.relative(srcDir, absPath)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return { layer: 'outside' }
  const parts = rel.split(path.sep)
  const [top, second] = parts
  if (top === 'features') {
    return { layer: 'features', feature: second?.replace(/\.(t|j)sx?$/, ''), deep: parts.length > 2 && !/^index\.(t|j)sx?$/.test(parts[2] ?? '') }
  }
  if (top === 'shared') return { layer: 'shared' }
  return { layer: 'app' }
}

/**
 * @param {string} specifier
 * @param {string} fromFile
 * @param {string} srcDir
 * @returns {string | null} absolute path, or null for packages
 */
export function resolveSpecifier(specifier, fromFile, srcDir) {
  if (specifier.startsWith('@/')) return path.join(srcDir, specifier.slice(2))
  if (specifier.startsWith('.')) return path.resolve(path.dirname(fromFile), specifier)
  return null
}

/**
 * @param {Location} from
 * @param {Location} to
 * @returns {string | null} violation message
 */
export function checkImport(from, to) {
  if (from.layer === 'outside' || to.layer === 'outside') return null
  if (from.layer === 'shared' && to.layer !== 'shared') {
    return `Layer "shared" may only import from "shared" (tried to import from "${to.layer}").`
  }
  if (from.layer === 'features') {
    if (to.layer === 'app') return 'Layer "features" must not import from "app".'
    if (to.layer === 'features' && to.feature !== from.feature) {
      return `Feature "${from.feature}" must not import feature "${to.feature}". Move shared logic to "shared".`
    }
  }
  if (to.layer === 'features' && from.feature !== to.feature && to.deep) {
    return `Import feature "${to.feature}" through its public API ("@/features/${to.feature}"), not its internals.`
  }
  return null
}

/** @type {import('eslint').Rule.RuleModule} */
const layersRule = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce app → features → shared layering' },
    schema: [],
  },
  create(context) {
    const srcDir = path.join(context.cwd, 'src')
    const from = locate(context.filename, srcDir)
    if (from.layer === 'outside') return {}

    /** @param {import('estree').Node & { source?: import('estree').Node | null }} node */
    const check = (node) => {
      const source = node.source
      if (!source || source.type !== 'Literal' || typeof source.value !== 'string') return
      const target = resolveSpecifier(source.value, context.filename, srcDir)
      if (!target) return
      const message = checkImport(from, locate(target, srcDir))
      if (message) context.report({ node: source, message })
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
      ImportExpression: check,
    }
  },
}

export default {
  meta: { name: 'architecture' },
  rules: { layers: layersRule },
}
