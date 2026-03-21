import type Database from 'better-sqlite3'
import type { DataSourceModule } from '../registry'
import type { ScriptWithLastRun, ScriptOutputChunk } from '../../../shared/ipc-types'
import { runScript, type ActiveRun } from './executor'
import { ScriptScheduler } from './scheduler'

export const activeRuns = new Map<number, ActiveRun>()

let emitOutput: ((chunk: ScriptOutputChunk) => void) | null = null
let emitUpdated: (() => void) | null = null

export function setScriptEmitters(
  outputFn: (chunk: ScriptOutputChunk) => void,
  updatedFn: () => void
): void {
  emitOutput = outputFn
  emitUpdated = updatedFn
}

const scheduler = new ScriptScheduler()

export function runScriptById(db: Database.Database, script: ScriptWithLastRun): Promise<void> {
  return runScript(
    db,
    script,
    (chunk) => emitOutput?.(chunk),
    activeRuns
  ).then(() => {
    emitUpdated?.()
  })
}

export const ScriptManagerModule: DataSourceModule = {
  id: 'scripts',
  displayName: 'Script Manager',
  initialize(db: Database.Database): void {
    scheduler.initialize(db, (script) => runScriptById(db, script))
    console.log('[Scripts] Module initialized')
  },
  shutdown(): void {
    scheduler.shutdown()
    console.log('[Scripts] Module shutdown')
  }
}
