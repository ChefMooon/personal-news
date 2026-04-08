import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, readFileSync } from 'fs'

let db: Database.Database

export function resolveDatabasePath(): string {
  const overridePath = process.env.PERSONAL_NEWS_DB_PATH?.trim()
  if (overridePath) {
    return overridePath
  }

  return join(app.getPath('userData'), 'data.db')
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call openDatabase() first.')
  }
  return db
}

export function openDatabase(): Database.Database {
  const dbPath = resolveDatabasePath()
  const lastSeparatorIndex = Math.max(dbPath.lastIndexOf('/'), dbPath.lastIndexOf('\\'))
  if (lastSeparatorIndex > 0) {
    mkdirSync(dbPath.slice(0, lastSeparatorIndex), { recursive: true })
  }
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
    2: '002_weather.sql',
    3: '003_sports.sql',
    4: '004_sports_team_cache.sql',
    5: '005_youtube_livestream_lifecycle.sql'
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
      database
        .prepare(
          `
            INSERT INTO meta (key, value)
            VALUES ('schema_version', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `
        )
        .run(String(nextVersion))
    })
    runMigration()

    appliedAny = true
    console.log(`[DB] Migration ${String(nextVersion).padStart(3, '0')} applied`)
    nextVersion += 1
  }

  const compatibilityMigrations: Array<{
    name: string
    file: string
    shouldApply: (db: Database.Database) => boolean
  }> = [
    {
      name: 'weather-schema',
      file: '002_weather.sql',
      shouldApply: (db) => !tableExists(db, 'weather_locations') || !tableExists(db, 'weather_cache')
    },
    {
      name: 'sports-schema',
      file: '003_sports.sql',
      shouldApply: (db) => !tableExists(db, 'sports_leagues') || !tableExists(db, 'sports_events')
    },
    {
      name: 'sports-team-cache',
      file: '004_sports_team_cache.sql',
      shouldApply: (db) => !tableExists(db, 'sports_opponent_cache')
    },
    {
      name: 'youtube-livestream-lifecycle',
      file: '005_youtube_livestream_lifecycle.sql',
      shouldApply: (db) =>
        !columnExists(db, 'yt_videos', 'actual_start_time') ||
        !columnExists(db, 'yt_videos', 'actual_end_time') ||
        !columnExists(db, 'yt_videos', 'is_livestream')
    }
  ]

  for (const migration of compatibilityMigrations) {
    if (!migration.shouldApply(database)) {
      continue
    }

    const migrationPath = resolveMigrationPath(migration.file)
    const sql = readFileSync(migrationPath, 'utf-8')
    database.exec(sql)
    appliedAny = true
    console.log(`[DB] Compatibility migration applied: ${migration.name}`)
  }

  if (!appliedAny) {
    console.log(`[DB] Schema is up to date (version ${currentVersion})`)
  }
}

function resolveMigrationPath(migrationFile: string): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'migrations', migrationFile)
  }

  return join(__dirname, `../../src/main/db/migrations/${migrationFile}`)
}

function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | undefined

  return row != null
}

function columnExists(database: Database.Database, tableName: string, columnName: string): boolean {
  const columns = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return columns.some((column) => column.name === columnName)
}
