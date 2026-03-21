import cron, { type ScheduledTask } from 'node-cron'
import type Database from 'better-sqlite3'
import type { ScriptWithLastRun } from '../../../shared/ipc-types'

export type SchedulerRunTrigger = 'scheduled' | 'on_app_start' | 'catch_up'

export interface ScriptScheduleRunContext {
  trigger: SchedulerRunTrigger
}

export interface ScriptStartupWarning {
  scriptId: number
  scriptName: string
  scheduleType: 'interval' | 'daily' | 'weekly' | 'monthly' | 'fixed_time'
  missedRuns: number
  downtimeSeconds: number
}

type RunFn = (script: ScriptWithLastRun, context: ScriptScheduleRunContext) => Promise<void>
type StartupWarningFn = (warning: ScriptStartupWarning) => void

interface ScheduleDef {
  type: 'on_app_start' | 'interval' | 'daily' | 'weekly' | 'monthly' | 'fixed_time'
  minutes?: number
  run_on_app_start?: boolean
  hour?: number
  minute?: number
  days_of_week?: number[]
  day_of_month?: number
}

export interface StartupDecision {
  action: 'none' | 'catch_up' | 'warning'
  missedRuns: number
  downtimeSeconds: number
}

const MAX_INTERVAL_CATCH_UP_MISSED_RUNS = 6
const MAX_DAILY_CATCH_UP_MISSED_RUNS = 2
const MAX_WEEKLY_CATCH_UP_MISSED_RUNS = 1
const MAX_MONTHLY_CATCH_UP_MISSED_RUNS = 1

function normalizeDaysOfWeek(input: number[] | undefined): number[] {
  const source = Array.isArray(input) ? input : []
  const unique = new Set<number>()
  for (const value of source) {
    const day = Math.floor(value)
    if (Number.isFinite(day) && day >= 0 && day <= 6) {
      unique.add(day)
    }
  }
  const normalized = [...unique].sort((a, b) => a - b)
  return normalized.length > 0 ? normalized : [1]
}

function normalizeDayOfMonth(input: number | undefined): number {
  const day = Math.floor(input ?? 1)
  if (!Number.isFinite(day) || day < 1 || day > 31) {
    return 1
  }
  return day
}

function countFixedTimeWindows(lastRunAt: number, now: number, hour: number, minute: number): number {
  if (now <= lastRunAt) return 0

  const nextWindow = new Date(lastRunAt * 1000)
  nextWindow.setHours(hour, minute, 0, 0)
  if (Math.floor(nextWindow.getTime() / 1000) <= lastRunAt) {
    nextWindow.setDate(nextWindow.getDate() + 1)
  }

  let count = 0
  while (Math.floor(nextWindow.getTime() / 1000) <= now && count <= 3660) {
    count += 1
    nextWindow.setDate(nextWindow.getDate() + 1)
  }
  return count
}

function countWeeklyWindows(lastRunAt: number, now: number, hour: number, minute: number, days: number[]): number {
  if (now <= lastRunAt) return 0

  const daySet = new Set(days)
  const nextWindow = new Date(lastRunAt * 1000)
  nextWindow.setHours(hour, minute, 0, 0)

  while (Math.floor(nextWindow.getTime() / 1000) <= lastRunAt || !daySet.has(nextWindow.getDay())) {
    nextWindow.setDate(nextWindow.getDate() + 1)
  }

  let count = 0
  while (Math.floor(nextWindow.getTime() / 1000) <= now && count <= 5300) {
    count += 1
    do {
      nextWindow.setDate(nextWindow.getDate() + 1)
    } while (!daySet.has(nextWindow.getDay()))
  }

  return count
}

function getMonthlyWindowTimestamp(year: number, month: number, day: number, hour: number, minute: number): number | null {
  const lastDay = new Date(year, month + 1, 0).getDate()
  if (day > lastDay) {
    return null
  }
  const window = new Date(year, month, day, hour, minute, 0, 0)
  return Math.floor(window.getTime() / 1000)
}

function countMonthlyWindows(lastRunAt: number, now: number, hour: number, minute: number, dayOfMonth: number): number {
  if (now <= lastRunAt) return 0

  const lastRunDate = new Date(lastRunAt * 1000)
  let year = lastRunDate.getFullYear()
  let month = lastRunDate.getMonth()
  let nextWindow: number | null = null

  while (nextWindow === null) {
    const ts = getMonthlyWindowTimestamp(year, month, dayOfMonth, hour, minute)
    if (ts !== null && ts > lastRunAt) {
      nextWindow = ts
      break
    }
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
  }

  let count = 0
  while (nextWindow !== null && nextWindow <= now && count <= 500) {
    count += 1
    do {
      month += 1
      if (month > 11) {
        month = 0
        year += 1
      }
      nextWindow = getMonthlyWindowTimestamp(year, month, dayOfMonth, hour, minute)
    } while (nextWindow === null)
  }

  return count
}

const LOCAL_TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

function toCronExpression(def: ScheduleDef): string | null {
  if (def.type === 'interval' && def.minutes) {
    return `*/${def.minutes} * * * *`
  }
  if (def.type === 'fixed_time' || def.type === 'daily') {
    const h = def.hour ?? 0
    const m = def.minute ?? 0
    return `${m} ${h} * * *`
  }
  if (def.type === 'weekly') {
    const h = def.hour ?? 0
    const m = def.minute ?? 0
    const days = normalizeDaysOfWeek(def.days_of_week)
    return `${m} ${h} * * ${days.join(',')}`
  }
  if (def.type === 'monthly') {
    const h = def.hour ?? 0
    const m = def.minute ?? 0
    const day = normalizeDayOfMonth(def.day_of_month)
    return `${m} ${h} ${day} * *`
  }
  return null
}

export function decideStartupAction(
  def: ScheduleDef,
  lastRunAt: number | null,
  now: number
): StartupDecision {
  if (lastRunAt === null || now <= lastRunAt) {
    return { action: 'none', missedRuns: 0, downtimeSeconds: 0 }
  }

  if (def.type === 'interval' && def.minutes) {
    const periodSeconds = def.minutes * 60
    const downtimeSeconds = now - lastRunAt
    if (downtimeSeconds < periodSeconds) {
      return { action: 'none', missedRuns: 0, downtimeSeconds }
    }

    const missedRuns = Math.floor(downtimeSeconds / periodSeconds)
    if (missedRuns <= MAX_INTERVAL_CATCH_UP_MISSED_RUNS) {
      return { action: 'catch_up', missedRuns, downtimeSeconds }
    }
    return { action: 'warning', missedRuns, downtimeSeconds }
  }

  if (def.type === 'fixed_time' || def.type === 'daily') {
    const downtimeSeconds = now - lastRunAt
    const hour = def.hour ?? 0
    const minute = def.minute ?? 0
    const missedRuns = countFixedTimeWindows(lastRunAt, now, hour, minute)

    if (missedRuns === 0) {
      return { action: 'none', missedRuns: 0, downtimeSeconds }
    }

    if (missedRuns <= MAX_DAILY_CATCH_UP_MISSED_RUNS) {
      return { action: 'catch_up', missedRuns, downtimeSeconds }
    }
    return { action: 'warning', missedRuns, downtimeSeconds }
  }

  if (def.type === 'weekly') {
    const downtimeSeconds = now - lastRunAt
    const hour = def.hour ?? 0
    const minute = def.minute ?? 0
    const days = normalizeDaysOfWeek(def.days_of_week)
    const missedRuns = countWeeklyWindows(lastRunAt, now, hour, minute, days)

    if (missedRuns === 0) {
      return { action: 'none', missedRuns: 0, downtimeSeconds }
    }

    if (missedRuns <= MAX_WEEKLY_CATCH_UP_MISSED_RUNS) {
      return { action: 'catch_up', missedRuns, downtimeSeconds }
    }
    return { action: 'warning', missedRuns, downtimeSeconds }
  }

  if (def.type === 'monthly') {
    const downtimeSeconds = now - lastRunAt
    const hour = def.hour ?? 0
    const minute = def.minute ?? 0
    const dayOfMonth = normalizeDayOfMonth(def.day_of_month)
    const missedRuns = countMonthlyWindows(lastRunAt, now, hour, minute, dayOfMonth)

    if (missedRuns === 0) {
      return { action: 'none', missedRuns: 0, downtimeSeconds }
    }

    if (missedRuns <= MAX_MONTHLY_CATCH_UP_MISSED_RUNS) {
      return { action: 'catch_up', missedRuns, downtimeSeconds }
    }
    return { action: 'warning', missedRuns, downtimeSeconds }
  }

  return { action: 'none', missedRuns: 0, downtimeSeconds: 0 }
}

export class ScriptScheduler {
  private tasks = new Map<number, ScheduledTask>()
  private runFn: RunFn | null = null
  private startupWarningFn: StartupWarningFn | null = null

  initialize(db: Database.Database, runFn: RunFn, startupWarningFn: StartupWarningFn): void {
    this.runFn = runFn
    this.startupWarningFn = startupWarningFn

    const scripts = db
      .prepare(
        `SELECT s.*, r.started_at, r.finished_at, r.exit_code, 0 as is_stale
         FROM scripts s
         LEFT JOIN script_runs r ON r.id = (
           SELECT id FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1
         )
         WHERE s.enabled = 1`
      )
      .all() as ScriptWithLastRun[]

    const now = Math.floor(Date.now() / 1000)
    for (const script of scripts) {
      this.registerScript(script, { runOnAppStart: true, now })
    }
  }

  registerScript(script: ScriptWithLastRun, options?: { runOnAppStart?: boolean; now?: number }): void {
    this.unregisterScript(script.id)
    if (!script.schedule || !this.runFn || script.enabled !== 1) return

    let def: ScheduleDef
    try {
      def = JSON.parse(script.schedule) as ScheduleDef
    } catch {
      console.warn(`[Scheduler] Invalid schedule JSON for script ${script.id}: ${script.schedule}`)
      return
    }

    if (def.type === 'on_app_start') {
      if (options?.runOnAppStart) {
        // Run on initialization only; hot updates should not auto-trigger an execution.
        console.log(`[Scheduler] Running on_app_start script: ${script.name}`)
        this.runFn(script, { trigger: 'on_app_start' }).catch((err: Error) => {
          console.error(`[Scheduler] on_app_start script ${script.name} failed:`, err)
        })
      }
      return
    }

    let startupHandled = false

    if (options?.runOnAppStart) {
      const now = options.now ?? Math.floor(Date.now() / 1000)
      const lastRunAt = script.finished_at ?? script.started_at
      const decision = decideStartupAction(def, lastRunAt, now)

      if (decision.action === 'catch_up') {
        startupHandled = true
        console.log(`[Scheduler] Running catch-up for script: ${script.name}`)
        this.runFn(script, { trigger: 'catch_up' }).catch((err: Error) => {
          console.error(`[Scheduler] catch-up script ${script.name} failed:`, err)
        })
      } else if (decision.action === 'warning') {
        startupHandled = true
        this.startupWarningFn?.({
          scriptId: script.id,
          scriptName: script.name,
          scheduleType: def.type,
          missedRuns: decision.missedRuns,
          downtimeSeconds: decision.downtimeSeconds
        })
      }
    }

    if (def.type === 'interval' && options?.runOnAppStart && def.run_on_app_start && !startupHandled) {
      console.log(`[Scheduler] Running interval script on app start: ${script.name}`)
      this.runFn(script, { trigger: 'on_app_start' }).catch((err: Error) => {
        console.error(`[Scheduler] interval start-run script ${script.name} failed:`, err)
      })
    }

    const expr = toCronExpression(def)
    if (!expr) {
      console.warn(`[Scheduler] Cannot build cron expression for script ${script.id}`)
      return
    }

    if (!cron.validate(expr)) {
      console.warn(`[Scheduler] Invalid cron expression "${expr}" for script ${script.id}`)
      return
    }

    const task = cron.schedule(
      expr,
      () => {
        if (!this.runFn) return
        this.runFn(script, { trigger: 'scheduled' }).catch((err: Error) => {
          console.error(`[Scheduler] Scheduled script ${script.name} failed:`, err)
        })
      },
      { timezone: LOCAL_TIMEZONE || undefined }
    )

    this.tasks.set(script.id, task)
    console.log(
      `[Scheduler] Registered script "${script.name}" with cron: ${expr} (timezone: ${LOCAL_TIMEZONE || 'system'})`
    )
  }

  unregisterScript(scriptId: number): void {
    const task = this.tasks.get(scriptId)
    if (task) {
      task.stop()
      this.tasks.delete(scriptId)
    }
  }

  shutdown(): void {
    for (const [, task] of this.tasks) {
      task.stop()
    }
    this.tasks.clear()
    this.runFn = null
    this.startupWarningFn = null
  }
}
