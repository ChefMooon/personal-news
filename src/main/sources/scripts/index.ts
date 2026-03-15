import type Database from 'better-sqlite3'
import type { DataSourceModule } from '../registry'

// TODO: implement node-cron scheduling and script execution in production
export const ScriptManagerModule: DataSourceModule = {
  id: 'scripts',
  displayName: 'Script Manager',
  initialize(_db: Database.Database): void {
    console.log('[Scripts] Module initialized (stub — no cron in prototype)')
  },
  shutdown(): void {
    console.log('[Scripts] Module shutdown')
  }
}
