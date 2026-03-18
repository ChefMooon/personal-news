import type Database from 'better-sqlite3'
import type { DataSourceModule } from '../registry'

let activePollIntervalMinutes = 15

export function applyYouTubePollInterval(minutes: number): void {
  activePollIntervalMinutes = minutes
  // Polling scheduler wiring lands in a later TODO item.
  console.log(`[YouTube] Poll interval updated to ${activePollIntervalMinutes} minutes`) // eslint-disable-line no-console
}

// TODO: implement RSS polling in production
export const YouTubeModule: DataSourceModule = {
  id: 'youtube',
  displayName: 'YouTube',
  initialize(_db: Database.Database): void {
    console.log(
      `[YouTube] Module initialized (stub — no polling in prototype, interval=${activePollIntervalMinutes}m)`
    )
  },
  shutdown(): void {
    console.log('[YouTube] Module shutdown')
  }
}
