import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call openDatabase() first.')
  }
  return db
}

export function openDatabase(): Database.Database {
  const dbPath = join(app.getPath('userData'), 'data.db')
  db = new Database(dbPath)

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  runMigrations(db)

  return db
}

function runMigrations(database: Database.Database): void {
  const migrationFiles: Record<number, string> = {
    1: '001_initial.sql',
    2: '002_remove_youtube_seed.sql',
    3: '003_youtube_retry_queue.sql',
    4: '004_add_yt_video_media_type.sql',
    5: '005_add_saved_post_note.sql',
    6: '006_add_ntfy_poll_interval_setting.sql',
    7: '007_add_saved_post_source.sql',
    8: '008_remove_script_seed.sql',
    9: '009_add_script_description.sql',
    10: '010_add_script_notifications.sql'
  }

  // Ensure meta table exists first
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  const versionRow = database.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as
    | { value: string }
    | undefined
  const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0

  let nextVersion = currentVersion + 1
  let appliedAny = false

  const latestVersion = Math.max(...Object.keys(migrationFiles).map((k) => parseInt(k, 10)))

  while (nextVersion <= latestVersion) {
    let migrationPath: string
    const migrationFile = migrationFiles[nextVersion]
    if (!migrationFile) {
      throw new Error(`Missing migration file mapping for schema version ${nextVersion}`)
    }

    if (app.isPackaged) {
      migrationPath = join(process.resourcesPath, 'migrations', migrationFile)
    } else {
      migrationPath = join(__dirname, `../../src/main/db/migrations/${migrationFile}`)
    }

    const sql = readFileSync(migrationPath, 'utf-8')
    const runMigration = database.transaction(() => {
      database.exec(sql)
    })
    runMigration()

    appliedAny = true
    console.log(`[DB] Migration ${String(nextVersion).padStart(3, '0')} applied`)
    nextVersion += 1
  }

  if (!appliedAny) {
    console.log(`[DB] Schema is up to date (version ${currentVersion})`)
  }
}
