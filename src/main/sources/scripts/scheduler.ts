import cron, { type ScheduledTask } from 'node-cron'
import type Database from 'better-sqlite3'
import type { ScriptWithLastRun } from '../../../shared/ipc-types'

type RunFn = (script: ScriptWithLastRun) => Promise<void>

interface ScheduleDef {
  type: 'on_app_start' | 'interval' | 'fixed_time'
  minutes?: number
  hour?: number
  minute?: number
}

function toCronExpression(def: ScheduleDef): string | null {
  if (def.type === 'interval' && def.minutes) {
    return `*/${def.minutes} * * * *`
  }
  if (def.type === 'fixed_time') {
    const h = def.hour ?? 0
    const m = def.minute ?? 0
    return `${m} ${h} * * *`
  }
  return null
}

export class ScriptScheduler {
  private tasks = new Map<number, ScheduledTask>()
  private runFn: RunFn | null = null

  initialize(db: Database.Database, runFn: RunFn): void {
    this.runFn = runFn

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

    for (const script of scripts) {
      this.registerScript(script)
    }
  }

  registerScript(script: ScriptWithLastRun): void {
    if (!script.schedule || !this.runFn) return

    let def: ScheduleDef
    try {
      def = JSON.parse(script.schedule) as ScheduleDef
    } catch {
      console.warn(`[Scheduler] Invalid schedule JSON for script ${script.id}: ${script.schedule}`)
      return
    }

    if (def.type === 'on_app_start') {
      // Run immediately on app start (fire and forget)
      console.log(`[Scheduler] Running on_app_start script: ${script.name}`)
      this.runFn(script).catch((err: Error) => {
        console.error(`[Scheduler] on_app_start script ${script.name} failed:`, err)
      })
      return
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

    const task = cron.schedule(expr, () => {
      if (!this.runFn) return
      this.runFn(script).catch((err: Error) => {
        console.error(`[Scheduler] Scheduled script ${script.name} failed:`, err)
      })
    })

    this.tasks.set(script.id, task)
    console.log(`[Scheduler] Registered script "${script.name}" with cron: ${expr}`)
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
  }
}
