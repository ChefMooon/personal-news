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

  if (currentVersion < 1) {
    // Read and run migration 001
    // In dev, migrations are in src/main/db/migrations/
    // In production, they'd be in resources/
    let migrationPath: string
    if (app.isPackaged) {
      migrationPath = join(process.resourcesPath, 'migrations', '001_initial.sql')
    } else {
      // In dev, __dirname = out/main/, project root is 2 levels up
      migrationPath = join(__dirname, '../../src/main/db/migrations/001_initial.sql')
    }

    const sql = readFileSync(migrationPath, 'utf-8')

    const runMigration = database.transaction(() => {
      database.exec(sql)
    })
    runMigration()

    console.log('[DB] Migration 001 applied')
  } else {
    console.log(`[DB] Schema is up to date (version ${currentVersion})`)
  }
}
