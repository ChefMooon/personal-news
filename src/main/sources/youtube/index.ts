import type Database from 'better-sqlite3'
import type { DataSourceModule } from '../registry'

// TODO: implement RSS polling in production
export const YouTubeModule: DataSourceModule = {
  id: 'youtube',
  displayName: 'YouTube',
  initialize(_db: Database.Database): void {
    console.log('[YouTube] Module initialized (stub — no polling in prototype)')
  },
  shutdown(): void {
    console.log('[YouTube] Module shutdown')
  }
}
