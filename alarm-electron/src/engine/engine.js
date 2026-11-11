/**
 * The engine: the single owner of state. For every command:
 *   decide(state, command, now, rng) → events → journal.append (write + fsync) → evolve → send projection
 *   and transient messages. Side effects happen only after the events are on disk.
 *
 * Transport-agnostic: subscribers are plain `send` functions, so tests drive it without Electron.
 */

import fs from 'node:fs'
import path from 'node:path'
import { ENGINE_ACCEPTS, mediaUrl, soundFileName, SUBSCRIPTIONS } from '../contract/channels.js'
import { checkMessage } from '../contract/schemas/validate.js'
import { decide, extensionOf, importError, soundNameFromFile } from '../domain/decide.js'
import { evolveAll } from '../domain/evolve.js'
import {
  alarmNotification,
  fadeFor,
  hourCycleOf,
  keepAwake,
  notificationsFor,
  project,
  resolveSound,
  ringingInfo,
  soundPlan,
  timerAlert,
} from '../domain/projections.js'
import { S } from '../domain/strings.js'
import { makeId } from '../domain/tasks.js'
import { openJournal } from './journal.js'

/** @typedef {import('../domain/defaults.js').State} State */
/** @typedef {import('../domain/projections.js').Runtime} Runtime */
/** @typedef {import('../contract/channels.js').Role} Role */
/** @typedef {import('./clock.js').Clock} Clock */
/** @typedef {(msg: Record<string, unknown> & { type: string }) => void} Send */

export const PROBE_TIMEOUT_MS = 30_000

/**
 * @param {object} opts
 * @param {string} opts.dataDir journal, snapshot and `sounds/` live here
 * @param {Clock} opts.clock
 * @param {() => number} opts.rng
 * @param {boolean} [opts.testMode] accept `TestSetClock`
 * @param {(msg: string) => void} [opts.log]
 */
export function createEngine(opts) {
  const log = opts.log ?? (() => {})
  const { clock, rng } = opts
  const soundsDir = path.join(opts.dataDir, 'sounds')
  fs.mkdirSync(soundsDir, { recursive: true })
  const journal = openJournal(opts.dataDir, { log })
  /** @type {State} */
  let state = journal.initialState

  /** @type {Runtime} */
  const runtime = {
    system: { hourCycle: '24h', platform: '', version: '', notifications: 'default' },
    soundImport: null,
    previewing: false,
    clockOffsetMs: clock.offsetMs(),
  }

  /** @type {Map<number, { role: Role, send: Send }>} */
  const subscribers = new Map()
  let nextId = 1
  const last = {
    projection: '',
    /** @type {Map<string, string>} */
    sounds: new Map(),
    keepAwake: '',
    ringing: '',
    timerAlert: '',
  }
  /** @type {Map<string, (ok: boolean) => void>} */
  const probes = new Map()

  const cycle = () => hourCycleOf(state, runtime.system.hourCycle)

  /** @param {Record<string, unknown> & { type: string }} msg */
  function emit(msg) {
    for (const sub of subscribers.values()) {
      if (/** @type {readonly string[]} */ (SUBSCRIPTIONS[sub.role]).includes(msg.type)) safeSend(sub, msg)
    }
  }

  /** @param {{ role: Role, send: Send }} sub @param {Record<string, unknown> & { type: string }} msg */
  function safeSend(sub, msg) {
    try {
      sub.send(msg)
    } catch (err) {
      log(`[engine] send to ${sub.role} failed: ${String(err)}`)
    }
  }

  /** @param {Role} role */
  const hasRole = (role) => [...subscribers.values()].some((s) => s.role === role)

  /**
   * decide → append (fsync) → evolve → effects.
   * @param {Parameters<typeof decide>[1]} cmd
   */
  function apply(cmd) {
    const now = clock.now()
    let events
    try {
      events = decide(state, cmd, now, rng)
    } catch (err) {
      log(`[engine] decide failed for ${cmd.type}: ${String(err)}`)
      return []
    }
    if (events.length === 0) return events
    const before = state
    const after = evolveAll(state, events)
    journal.append(events, after)
    state = after
    // ── side effects, only after the events are durable ──
    for (const n of notificationsFor(events, before, after, cycle())) emit(n)
    for (const e of events) if (e.type === 'SoundRemoved') removeSoundFile(before, e.id)
    sync()
    return events
  }

  /** Sends whatever changed: projection, sounds, keep-awake, ringing, timer alert. */
  function sync() {
    runtime.clockOffsetMs = clock.offsetMs()
    const projection = project(state, runtime)
    const pj = JSON.stringify(projection)
    if (pj !== last.projection) {
      last.projection = pj
      emit({ type: 'StateProjected', state: projection })
    }

    const plan = soundPlan(state)
    for (const key of [...last.sounds.keys()]) {
      if (!plan.has(key)) {
        last.sounds.delete(key)
        emit({ type: 'StopSound', key, fadeMs: fadeFor(key) })
      }
    }
    for (const [key, p] of plan) {
      const j = JSON.stringify(p)
      if (last.sounds.get(key) !== j) {
        last.sounds.set(key, j)
        emit({ type: 'PlaySound', key, ...p })
      }
    }

    const ka = JSON.stringify({ on: keepAwake(state) })
    if (ka !== last.keepAwake) {
      last.keepAwake = ka
      emit({ type: 'KeepAwakeChanged', on: keepAwake(state) })
    }
    const ring = ringingInfo(state)
    const rj = JSON.stringify(ring)
    if (rj !== last.ringing) {
      last.ringing = rj
      emit({ type: 'RingingChanged', ...ring })
    }
    const ta = timerAlert(state)
    const tj = JSON.stringify(ta)
    if (tj !== last.timerAlert) {
      last.timerAlert = tj
      emit({ type: 'TimerAlertChanged', ...ta })
    }
  }

  /** @param {State} before @param {string} id */
  function removeSoundFile(before, id) {
    const s = before.sounds.find((x) => x.id === id)
    if (!s) return
    fs.rm(path.join(soundsDir, soundFileName(s.id, s.ext)), { force: true }, (err) => {
      if (err) log(`[engine] could not delete sound file: ${String(err)}`)
    })
  }

  /**
   * Music file import (§3.8): validate, copy into `sounds/`, probe-decode in the audio process, then record.
   * @param {{ requestId: string, path: string }} cmd
   */
  async function importSound(cmd) {
    const { requestId } = cmd
    /** @param {Runtime['soundImport']} v */
    const setImport = (v) => {
      runtime.soundImport = v
      sync()
    }
    const fileName = path.basename(cmd.path)
    let size
    try {
      const st = fs.statSync(cmd.path)
      if (!st.isFile()) throw new Error('not a file')
      size = st.size
    } catch {
      setImport({ requestId, status: 'error', error: S.notAudio, soundId: null })
      return
    }
    const err = importError(fileName, size)
    const ext = extensionOf(fileName)
    if (err || !ext) {
      setImport({ requestId, status: 'error', error: err ?? S.notAudio, soundId: null })
      return
    }
    setImport({ requestId, status: 'adding', error: null, soundId: null })
    const id = makeId(rng)
    const dest = path.join(soundsDir, soundFileName(id, ext))
    try {
      await fs.promises.copyFile(cmd.path, dest)
    } catch (e) {
      log(`[engine] copy failed: ${String(e)}`)
      setImport({ requestId, status: 'error', error: S.notAudio, soundId: null })
      return
    }
    const ok = await probe(id, mediaUrl(id, ext))
    if (!ok) {
      fs.rmSync(dest, { force: true })
      setImport({ requestId, status: 'error', error: S.cannotPlay, soundId: null })
      return
    }
    apply({ type: 'AddSound', sound: { id, name: soundNameFromFile(fileName), size, addedAt: clock.now(), ext } })
    setImport({ requestId, status: 'done', error: null, soundId: id })
  }

  /** @param {string} probeId @param {string} url @returns {Promise<boolean>} */
  function probe(probeId, url) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        probes.delete(probeId)
        resolve(false)
      }, PROBE_TIMEOUT_MS)
      probes.set(probeId, (ok) => {
        clearTimeout(timer)
        probes.delete(probeId)
        resolve(ok)
      })
      emit({ type: 'ProbeSound', probeId, url })
    })
  }

  /**
   * Entry point for every message from another process. Invalid or not-accepted messages are dropped.
   * @param {number} subId
   * @param {unknown} raw
   */
  function receive(subId, raw) {
    const sub = subscribers.get(subId)
    if (!sub) return
    const check = checkMessage(raw, ENGINE_ACCEPTS[sub.role])
    if (!check.ok) {
      log(`[engine] dropped message from ${sub.role}: ${check.reason}`)
      return
    }
    const msg = /** @type {any} */ (raw)
    switch (msg.type) {
      case 'Ping':
        safeSend(sub, { type: 'Pong', from: 'engine', seq: msg.seq })
        return
      case 'SystemInfo':
        runtime.system = { ...runtime.system, hourCycle: msg.hourCycle, platform: msg.platform, version: msg.version }
        tick()
        sync()
        return
      case 'NotificationPermission':
        runtime.system = { ...runtime.system, notifications: msg.state }
        sync()
        return
      case 'WindowFocused':
        tick()
        return
      case 'TestSetClock':
        if (!opts.testMode) {
          log('[engine] TestSetClock ignored outside test mode')
          return
        }
        clock.set(msg.now)
        tick()
        sync()
        return
      case 'PreviewPlay': {
        runtime.previewing = msg.loop
        emit({ ...msg, ...resolveSound(state, msg.sound) })
        sync()
        return
      }
      case 'PreviewStop':
        runtime.previewing = false
        emit({ type: 'PreviewStop' })
        sync()
        return
      case 'ProbeResult':
        probes.get(msg.probeId)?.(msg.ok)
        return
      case 'ImportSound':
        void importSound(msg)
        return
      default:
        apply(msg)
    }
  }

  function tick() {
    apply({ type: 'Tick' })
  }

  /**
   * @param {Role} role
   * @param {Send} send
   * @returns {number} subscriber id
   */
  function connect(role, send) {
    const id = nextId++
    const firstShell = role === 'shell' && !hasRole('shell')
    const sub = { role, send }
    subscribers.set(id, sub)
    const projection = project(state, runtime)
    if (role === 'ui' || role === 'shell') safeSend(sub, { type: 'StateProjected', state: projection })
    if (role === 'audio') {
      // A new audio process (or a restarted engine): replay every sound that must be playing.
      for (const [key, p] of soundPlan(state)) safeSend(sub, { type: 'PlaySound', key, ...p })
    }
    if (role === 'shell') {
      safeSend(sub, { type: 'KeepAwakeChanged', on: keepAwake(state) })
      safeSend(sub, { type: 'RingingChanged', ...ringingInfo(state) })
      safeSend(sub, { type: 'TimerAlertChanged', ...timerAlert(state) })
      if (firstShell) {
        // After a restart the alarm keeps ringing: re-post its notification.
        for (const a of state.alarms) if (a.ringingSince !== null) safeSend(sub, alarmNotification(state, a, cycle()))
      }
    }
    return id
  }

  /** @param {number} id */
  function disconnect(id) {
    subscribers.delete(id)
  }

  // Sounds that must play right after start (ringing survived a restart) are sent once audio connects.
  for (const [key, p] of soundPlan(state)) last.sounds.set(key, JSON.stringify(p))
  last.keepAwake = JSON.stringify({ on: keepAwake(state) })
  last.ringing = JSON.stringify(ringingInfo(state))
  last.timerAlert = JSON.stringify(timerAlert(state))
  last.projection = JSON.stringify(project(state, runtime))

  return {
    connect,
    disconnect,
    receive,
    tick,
    /** Current state (read-only use). */
    state: () => state,
    journalStats: journal.stats,
    close: () => journal.close(),
  }
}
