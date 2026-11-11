/**
 * Event journal: `journal.jsonl` (append + fsync) and `snapshot.json`.
 *
 * - Every append is written and fsync'ed before the caller applies the events.
 * - Every 500 events a snapshot `{ offset, state }` is written (tmp + fsync + rename);
 *   `offset` is the journal byte length it covers.
 * - At start, a journal larger than 5 MB is compacted: snapshot of the whole state, journal truncated.
 *   Events are idempotent, so a crash between the two steps only replays already-applied events.
 * - A broken line (bad JSON, unknown type, failed schema) is skipped and logged (§2.7).
 */

import fs from 'node:fs'
import path from 'node:path'
import { EVENT_TYPES } from '../contract/events.js'
import { checkMessage } from '../contract/schemas/validate.js'
import { initialState } from '../domain/defaults.js'
import { evolve } from '../domain/evolve.js'
import { repairSettings, upcast } from '../domain/upcast.js'

/** @typedef {import('../domain/defaults.js').State} State */
/** @typedef {import('../contract/events.js').JournalEvent} JournalEvent */

export const SNAPSHOT_EVERY = 500
export const COMPACT_ABOVE_BYTES = 5 * 1024 * 1024

/**
 * @param {string} dir
 * @param {{ log?: (msg: string) => void, snapshotEvery?: number, compactAboveBytes?: number }} [opts]
 */
export function openJournal(dir, opts = {}) {
  const log = opts.log ?? (() => {})
  const snapshotEvery = opts.snapshotEvery ?? SNAPSHOT_EVERY
  const compactAbove = opts.compactAboveBytes ?? COMPACT_ABOVE_BYTES
  fs.mkdirSync(dir, { recursive: true })
  const journalPath = path.join(dir, 'journal.jsonl')
  const snapshotPath = path.join(dir, 'snapshot.json')

  /** @returns {{ state: State, offset: number }} */
  function readSnapshot() {
    try {
      const raw = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
      if (typeof raw?.offset !== 'number' || typeof raw?.state !== 'object') throw new Error('bad snapshot')
      return { state: sanitizeState(raw.state, log), offset: raw.offset }
    } catch (err) {
      if (/** @type {NodeJS.ErrnoException} */ (err).code !== 'ENOENT') log(`[journal] snapshot ignored: ${String(err)}`)
      return { state: initialState(), offset: 0 }
    }
  }

  /**
   * @param {State} state
   * @param {number} offset
   */
  function writeSnapshot(state, offset) {
    const tmp = `${snapshotPath}.tmp`
    const fd = fs.openSync(tmp, 'w')
    try {
      fs.writeSync(fd, JSON.stringify({ offset, state }))
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(tmp, snapshotPath)
  }

  /** Loads state: snapshot, then journal lines after its offset. */
  function load() {
    let { state, offset } = readSnapshot()
    let buf = Buffer.alloc(0)
    try {
      buf = fs.readFileSync(journalPath)
    } catch {
      // no journal yet
    }
    if (offset > buf.length) {
      log('[journal] snapshot offset beyond journal; replaying the whole journal')
      offset = 0
    }
    let skipped = 0
    let applied = 0
    const text = buf.subarray(offset).toString('utf8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      const e = parseLine(line)
      if (!e) {
        skipped++
        continue
      }
      state = evolve(state, e)
      applied++
    }
    if (skipped) log(`[journal] skipped ${skipped} broken line(s)`)
    return { state, applied, skipped, bytes: buf.length }
  }

  /** @param {string} line @returns {JournalEvent | null} */
  function parseLine(line) {
    let raw
    try {
      raw = JSON.parse(line)
    } catch {
      return null
    }
    const e = upcast(raw)
    if (!e) return null
    const check = checkMessage(e, EVENT_TYPES)
    if (!check.ok) {
      log(`[journal] invalid event skipped: ${check.reason}`)
      return null
    }
    return e
  }

  const loaded = load()
  let state = loaded.state
  let size = loaded.bytes
  let sinceSnapshot = loaded.applied

  if (size > compactAbove) {
    writeSnapshot(state, 0)
    fs.truncateSync(journalPath, 0)
    size = 0
    sinceSnapshot = 0
    log('[journal] compacted')
  }

  const fd = fs.openSync(journalPath, 'a')

  return {
    /** State rebuilt from disk at open time. */
    initialState: state,
    stats: { applied: loaded.applied, skipped: loaded.skipped },
    /**
     * Durably appends events (write + fsync). Call before applying them.
     * @param {readonly JournalEvent[]} events
     * @param {State} nextState state after these events (for snapshots)
     */
    append(events, nextState) {
      if (events.length === 0) return
      const data = events.map((e) => JSON.stringify(e)).join('\n') + '\n'
      const bytes = Buffer.byteLength(data)
      fs.writeSync(fd, data)
      fs.fsyncSync(fd)
      size += bytes
      sinceSnapshot += events.length
      state = nextState
      if (sinceSnapshot >= snapshotEvery) {
        writeSnapshot(state, size)
        sinceSnapshot = 0
      }
    },
    close() {
      try {
        fs.closeSync(fd)
      } catch {
        // already closed
      }
    },
    paths: { journal: journalPath, snapshot: snapshotPath },
  }
}

/**
 * Snapshot contents are trusted less than events: broken parts fall back to defaults.
 * @param {any} raw
 * @param {(msg: string) => void} log
 * @returns {State}
 */
function sanitizeState(raw, log) {
  const base = initialState()
  const ok = (/** @type {string} */ type, /** @type {object} */ payload) =>
    checkMessage({ type, v: 1, at: 0, ...payload }, EVENT_TYPES).ok
  const alarms = Array.isArray(raw.alarms) ? raw.alarms.filter((/** @type {any} */ a) => ok('AlarmSaved', { alarm: a })) : []
  if (Array.isArray(raw.alarms) && alarms.length !== raw.alarms.length) log('[journal] skipped broken alarm(s) in snapshot')
  const sounds = Array.isArray(raw.sounds) ? raw.sounds.filter((/** @type {any} */ s) => ok('SoundImported', { sound: s })) : []
  return {
    alarms,
    settings: repairSettings(raw.settings),
    timer: ok('TimerChanged', { timer: raw.timer }) ? raw.timer : base.timer,
    stopwatch: ok('StopwatchChanged', { stopwatch: raw.stopwatch }) ? raw.stopwatch : base.stopwatch,
    sounds,
    tasks: {},
  }
}
