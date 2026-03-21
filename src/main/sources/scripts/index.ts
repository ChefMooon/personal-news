import type Database from 'better-sqlite3'
import { existsSync, readdirSync, statSync } from 'fs'
import { basename, dirname, extname, join, resolve } from 'path'
import type { DataSourceModule } from '../registry'
import type {
  ScriptWithLastRun,
  ScriptOutputChunk,
  ScriptRunCompleteEvent,
  ScriptRunTrigger
} from '../../../shared/ipc-types'
import { runScript, type ActiveRun, type ScriptRunCompletion } from './executor'
import { ScriptScheduler, type ScriptScheduleRunContext, type ScriptStartupWarning } from './scheduler'
import { getSetting } from '../../settings/store'

export const activeRuns = new Map<number, ActiveRun>()
const SCRIPT_HOME_DIR_SETTING = 'script_home_dir'

let emitOutput: ((chunk: ScriptOutputChunk) => void) | null = null
let emitUpdated: (() => void) | null = null
let emitRunComplete: ((event: ScriptRunCompleteEvent) => void) | null = null

export function setScriptEmitters(
  outputFn: (chunk: ScriptOutputChunk) => void,
  updatedFn: () => void,
  runCompleteFn: (event: ScriptRunCompleteEvent) => void
): void {
  emitOutput = outputFn
  emitUpdated = updatedFn
  emitRunComplete = runCompleteFn
}

const scheduler = new ScriptScheduler()

function formatScriptName(fileName: string): string {
  const stem = basename(fileName, extname(fileName)).trim()
  if (!stem) {
    return fileName
  }

  return stem
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function toRunMessage(scriptName: string, exitCode: number): string {
  if (exitCode === 0) {
    return `${scriptName} completed successfully.`
  }
  if (exitCode === -1) {
    return `${scriptName} failed to start.`
  }
  return `${scriptName} exited with code ${exitCode}.`
}

function toRunSeverity(exitCode: number): 'info' | 'error' {
  return exitCode === 0 ? 'info' : 'error'
}

function persistRunNotification(
  db: Database.Database,
  event: ScriptRunCompleteEvent
): void {
  db.prepare(
    `INSERT INTO script_notifications (script_id, run_id, severity, message, is_read, created_at, read_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL)`
  ).run(event.scriptId, event.runId, event.severity, event.message, event.finishedAt)
}

function buildRunCompleteEvent(
  script: ScriptWithLastRun,
  completion: ScriptRunCompletion,
  trigger: ScriptRunTrigger
): ScriptRunCompleteEvent {
  const severity = toRunSeverity(completion.exitCode)
  const message = toRunMessage(script.name, completion.exitCode)

  return {
    kind: 'run_complete',
    scriptId: script.id,
    scriptName: script.name,
    runId: completion.runId,
    startedAt: completion.startedAt,
    finishedAt: completion.finishedAt,
    exitCode: completion.exitCode,
    trigger,
    severity,
    message,
    missedRuns: null,
    downtimeSeconds: null
  }
}

function buildStartupWarningEvent(warning: ScriptStartupWarning): ScriptRunCompleteEvent {
  const createdAt = Math.floor(Date.now() / 1000)
  const message = `${warning.scriptName} missed ${warning.missedRuns} scheduled runs while the app was closed.`

  return {
    kind: 'startup_warning',
    scriptId: warning.scriptId,
    scriptName: warning.scriptName,
    runId: null,
    startedAt: null,
    finishedAt: createdAt,
    exitCode: null,
    trigger: 'startup_warning',
    severity: 'warning',
    message,
    missedRuns: warning.missedRuns,
    downtimeSeconds: warning.downtimeSeconds
  }
}

function persistStartupWarningNotification(
  db: Database.Database,
  event: ScriptRunCompleteEvent
): void {
  db.prepare(
    `INSERT INTO script_notifications (script_id, run_id, severity, message, is_read, created_at, read_at)
     VALUES (?, NULL, 'warning', ?, 0, ?, NULL)`
  ).run(event.scriptId, event.message, event.finishedAt)
}

function mapSchedulerTrigger(trigger: ScriptScheduleRunContext['trigger']): ScriptRunTrigger {
  if (trigger === 'scheduled') return 'scheduled'
  if (trigger === 'on_app_start') return 'on_app_start'
  return 'catch_up'
}

export function syncScriptsFromHomeDir(db: Database.Database): void {
  db.prepare('UPDATE scripts SET enabled = 0 WHERE schedule IS NULL AND enabled != 0').run()

  const scriptHomeDir = getSetting(SCRIPT_HOME_DIR_SETTING)
  if (!scriptHomeDir) {
    return
  }

  if (!existsSync(scriptHomeDir)) {
    return
  }

  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(scriptHomeDir)
  } catch {
    return
  }

  if (!stats.isDirectory()) {
    return
  }

  const normalizedHomeDir = resolve(scriptHomeDir).toLowerCase()

  const existingScripts = db
    .prepare('SELECT id, file_path FROM scripts')
    .all() as Array<{ id: number; file_path: string }>
  const existingByPath = new Map(existingScripts.map((script) => [script.file_path, script]))

  const entries = readdirSync(scriptHomeDir, { withFileTypes: true })
  const insertScript = db.prepare(
    'INSERT INTO scripts (name, description, file_path, interpreter, args, schedule, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const deleteScript = db.prepare('DELETE FROM scripts WHERE id = ?')

  const discoveredPaths = new Set<string>()

  const now = Math.floor(Date.now() / 1000)
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.py') {
      continue
    }

    const filePath = resolve(join(scriptHomeDir, entry.name))
    discoveredPaths.add(filePath)
    if (existingByPath.has(filePath)) {
      continue
    }

    // Manual schedule implies auto-run is off until the user selects a schedule.
    insertScript.run(formatScriptName(entry.name), null, filePath, 'python3', null, null, 0, now)
  }

  for (const script of existingScripts) {
    const scriptPath = resolve(script.file_path)
    const scriptDir = resolve(dirname(scriptPath)).toLowerCase()
    if (scriptDir === normalizedHomeDir && !discoveredPaths.has(scriptPath)) {
      deleteScript.run(script.id)
    }
  }
}

export function runScriptById(
  db: Database.Database,
  script: ScriptWithLastRun,
  trigger: ScriptRunTrigger = 'manual'
): Promise<void> {
  return runScript(
    db,
    script,
    (chunk) => emitOutput?.(chunk),
    activeRuns
  ).then((completion) => {
    const event = buildRunCompleteEvent(script, completion, trigger)
    try {
      persistRunNotification(db, event)
    } catch (err) {
      console.error(`[Scripts] Failed to persist run notification for script ${script.id}:`, err)
    } finally {
      emitRunComplete?.(event)
      emitUpdated?.()
    }
  })
}

export function refreshScriptSchedule(
  db: Database.Database,
  scriptId: number,
  options?: { runOnAppStart?: boolean }
): void {
  const script = db
    .prepare(
      `SELECT s.*, r.started_at, r.finished_at, r.exit_code, 0 AS is_stale
       FROM scripts s
       LEFT JOIN script_runs r ON r.id = (
         SELECT id FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1
       )
       WHERE s.id = ?`
    )
    .get(scriptId) as ScriptWithLastRun | undefined

  if (!script) {
    scheduler.unregisterScript(scriptId)
    return
  }

  scheduler.registerScript(script, options)
}

export const ScriptManagerModule: DataSourceModule = {
  id: 'scripts',
  displayName: 'Script Manager',
  initialize(db: Database.Database): void {
    syncScriptsFromHomeDir(db)
    scheduler.initialize(
      db,
      (script, context) => runScriptById(db, script, mapSchedulerTrigger(context.trigger)),
      (warning) => {
        const event = buildStartupWarningEvent(warning)
        try {
          persistStartupWarningNotification(db, event)
        } catch (err) {
          console.error(
            `[Scripts] Failed to persist startup warning for script ${warning.scriptId}:`,
            err
          )
        } finally {
          emitRunComplete?.(event)
          emitUpdated?.()
        }
      }
    )
    console.log('[Scripts] Module initialized')
  },
  shutdown(): void {
    scheduler.shutdown()
    console.log('[Scripts] Module shutdown')
  }
}
