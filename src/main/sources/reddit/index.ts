import type Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/ipc-types'
import type { DataSourceModule } from '../registry'
import { pollNtfy } from './ntfy'

let dbRef: Database.Database | null = null
let pollingInProgress = false

function emitNtfyIngestComplete(postsIngested: number, error?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.REDDIT_NTFY_INGEST_COMPLETE, { postsIngested, error })
  }
}

export async function triggerNtfyPoll(): Promise<{ postsIngested: number; messagesReceived: number }> {
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

    // Run startup poll
    pollNtfyStartup()
  },
  shutdown(): void {
    console.log('[Reddit] Module shutdown')
    dbRef = null
  }
}

async function pollNtfyStartup(): Promise<void> {
  if (!dbRef || pollingInProgress) {
    return
  }

  pollingInProgress = true
  try {
    const result = await pollNtfy(dbRef)
    emitNtfyIngestComplete(result.postsIngested)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[Reddit] ntfy startup poll failed:', msg)
    emitNtfyIngestComplete(0, msg)
  } finally {
    pollingInProgress = false
  }
}
