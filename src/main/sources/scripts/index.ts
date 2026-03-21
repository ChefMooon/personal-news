import type Database from 'better-sqlite3'
import { existsSync, readdirSync, statSync } from 'fs'
import { basename, dirname, extname, join, resolve } from 'path'
import type { DataSourceModule } from '../registry'
import type { ScriptWithLastRun, ScriptOutputChunk } from '../../../shared/ipc-types'
import { runScript, type ActiveRun } from './executor'
import { ScriptScheduler } from './scheduler'
import { getSetting } from '../../settings/store'

export const activeRuns = new Map<number, ActiveRun>()
const SCRIPT_HOME_DIR_SETTING = 'script_home_dir'

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

export function syncScriptsFromHomeDir(db: Database.Database): void {
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
    'INSERT INTO scripts (name, file_path, interpreter, args, schedule, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
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

    insertScript.run(formatScriptName(entry.name), filePath, 'python3', null, null, 1, now)
  }

  for (const script of existingScripts) {
    const scriptPath = resolve(script.file_path)
    const scriptDir = resolve(dirname(scriptPath)).toLowerCase()
    if (scriptDir === normalizedHomeDir && !discoveredPaths.has(scriptPath)) {
      deleteScript.run(script.id)
    }
  }
}

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
    syncScriptsFromHomeDir(db)
    scheduler.initialize(db, (script) => runScriptById(db, script))
    console.log('[Scripts] Module initialized')
  },
  shutdown(): void {
    scheduler.shutdown()
    console.log('[Scripts] Module shutdown')
  }
}
