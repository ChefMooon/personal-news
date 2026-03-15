import type Database from 'better-sqlite3'
import type { DataSourceModule } from '../registry'

// TODO: implement ntfy polling in production
export const RedditModule: DataSourceModule = {
  id: 'reddit',
  displayName: 'Reddit',
  initialize(_db: Database.Database): void {
    console.log('[Reddit] Module initialized (stub — no ntfy polling in prototype)')
  },
  shutdown(): void {
    console.log('[Reddit] Module shutdown')
  }
}
