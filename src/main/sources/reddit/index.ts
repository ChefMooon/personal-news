import type Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import cron, { type ScheduledTask } from 'node-cron'
import { IPC } from '../../../shared/ipc-types'
import type { DataSourceModule } from '../registry'
import { getSetting } from '../../settings/store'
import { pollNtfy } from './ntfy'

const DEFAULT_NTFY_POLL_INTERVAL_MINUTES = 60

let dbRef: Database.Database | null = null
let pollingInProgress = false
let activePollIntervalMinutes = DEFAULT_NTFY_POLL_INTERVAL_MINUTES
let pollTask: ScheduledTask | null = null

function emitNtfyIngestComplete(postsIngested: number, error?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.REDDIT_NTFY_INGEST_COMPLETE, { postsIngested, error })
  }
}

export async function triggerNtfyPoll(): Promise<{ postsIngested: number; messagesReceived: number }> {
  return runNtfyPoll({ throwOnError: true })
}

function getCronExpression(minutes: number): string {
  return `*/${minutes} * * * *`
}

function stopPollScheduler(): void {
  if (!pollTask) {
    return
  }

  pollTask.stop()
  const taskWithDestroy = pollTask as ScheduledTask & { destroy?: () => void }
  if (typeof taskWithDestroy.destroy === 'function') {
    taskWithDestroy.destroy()
  }
  pollTask = null
}

function startPollScheduler(): void {
  if (!dbRef) {
    return
  }

  stopPollScheduler()
  pollTask = cron.schedule(getCronExpression(activePollIntervalMinutes), () => {
    void runNtfyPoll({ throwOnError: false })
  })
}

export function applyNtfyPollInterval(minutes: number): void {
  activePollIntervalMinutes = minutes
  startPollScheduler()
}

async function runNtfyPoll(options: {
  throwOnError: boolean
}): Promise<{ postsIngested: number; messagesReceived: number }> {
  if (!dbRef) {
    throw new Error('Reddit module not initialized')
  }
  if (pollingInProgress) {
    return { postsIngested: 0, messagesReceived: 0 }
  }

  pollingInProgress = true
  try {
    const result = await pollNtfy(dbRef)
    emitNtfyIngestComplete(result.postsIngested)
    return result
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[Reddit] ntfy poll failed:', msg)
    emitNtfyIngestComplete(0, msg)
    if (options.throwOnError) {
      throw error
    }
    return { postsIngested: 0, messagesReceived: 0 }
  } finally {
    pollingInProgress = false
  }
}

export const RedditModule: DataSourceModule = {
  id: 'reddit',
  displayName: 'Reddit',
  initialize(db: Database.Database): void {
    dbRef = db
    console.log('[Reddit] Module initialized')

    // Check if Saved Posts feature is enabled
    const savedPostsEnabled = getSetting('saved_posts_enabled') !== 'false'
    
    if (!savedPostsEnabled) {
      console.log('[Reddit] Saved Posts feature is disabled, skipping ntfy polling')
      return
    }

    const configuredInterval = getSetting('ntfy_poll_interval_minutes')
    const parsedInterval = configuredInterval ? parseInt(configuredInterval, 10) : NaN
    if (Number.isInteger(parsedInterval) && parsedInterval >= 1 && parsedInterval <= 1440) {
      activePollIntervalMinutes = parsedInterval
    } else {
      activePollIntervalMinutes = DEFAULT_NTFY_POLL_INTERVAL_MINUTES
    }

    startPollScheduler()

    // Run startup poll
    void pollNtfyStartup()
  },
  shutdown(): void {
    console.log('[Reddit] Module shutdown')
    stopPollScheduler()
    dbRef = null
  }
}

async function pollNtfyStartup(): Promise<void> {
  try {
    await runNtfyPoll({ throwOnError: false })
  } catch {
    // runNtfyPoll only throws when throwOnError is true.
  }
}
