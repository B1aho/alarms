/**
 * Windows only (TZ §3.17): a per-user Task Scheduler task with "Wake the computer to run this task"
 * one minute before the next alarm. Needs no administrator rights. macOS and Linux: not used.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TASK_NAME = 'Alarm Wake'

/** Local ISO time without zone, as Task Scheduler expects. @param {number} ts */
function localIso(ts) {
  const d = new Date(ts)
  const p = (/** @type {number} */ n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/**
 * @param {string} exe
 * @param {number} at
 */
export function taskXml(exe, at) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers><TimeTrigger><StartBoundary>${localIso(at)}</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <WakeToRun>true</WakeToRun>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <ExecutionTimeLimit>PT1M</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author"><Exec><Command>"${exe}"</Command><Arguments>--hidden</Arguments></Exec></Actions>
</Task>`
}

/** @param {(msg: string) => void} log */
export function createWakeTimer(log) {
  /** @type {number | null} */
  let scheduled = null
  return {
    /** @param {number | null} nextRingAt */
    schedule(nextRingAt) {
      if (process.platform !== 'win32' || nextRingAt === scheduled) return
      scheduled = nextRingAt
      if (nextRingAt === null) {
        execFile('schtasks', ['/Delete', '/TN', TASK_NAME, '/F'], () => {})
        return
      }
      const file = path.join(os.tmpdir(), 'alarm-wake.xml')
      const xml = taskXml(process.execPath, Math.max(Date.now() + 5_000, nextRingAt - 60_000))
      fs.writeFileSync(file, '﻿' + xml, 'utf16le')
      execFile('schtasks', ['/Create', '/TN', TASK_NAME, '/XML', file, '/F'], (err) => {
        if (err) log(`[shell] wake timer not set: ${String(err)}`)
      })
    },
  }
}
