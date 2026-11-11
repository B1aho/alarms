/**
 * Boundary check used by every process on every incoming message:
 * the message must have a known `type`, be accepted by the receiver, and pass its JSON Schema
 * (ajv-compiled ahead of time into ./validators.js).
 */

import * as validators from './validators.js'

/** @type {Record<string, ((data: unknown) => boolean) | undefined>} */
const table = /** @type {any} */ (validators)

/**
 * @param {unknown} msg
 * @param {readonly string[]} [accepted] message types the receiver accepts (all known types when omitted)
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function checkMessage(msg, accepted) {
  if (typeof msg !== 'object' || msg === null || Array.isArray(msg)) return { ok: false, reason: 'not an object' }
  const type = /** @type {{ type?: unknown }} */ (msg).type
  if (typeof type !== 'string') return { ok: false, reason: 'missing type' }
  const validate = Object.hasOwn(table, type) ? table[type] : undefined
  if (!validate) return { ok: false, reason: `unknown type ${type}` }
  if (accepted && !accepted.includes(type)) return { ok: false, reason: `${type} not accepted here` }
  if (!validate(msg)) {
    const errors = /** @type {any} */ (validate).errors
    const first = errors?.[0]
    return { ok: false, reason: `${type} invalid: ${first ? `${first.instancePath} ${first.message}` : 'schema'}` }
  }
  return { ok: true }
}

/**
 * @param {unknown} msg
 * @param {readonly string[]} [accepted]
 */
export const isValidMessage = (msg, accepted) => checkMessage(msg, accepted).ok
