import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { IpcMutationResult, UpdateStatusEvent } from '../../shared/ipc-types'
import { getSetting } from '../settings/store'

const AUTO_UPDATE_CHECK_ENABLED_KEY = 'app_auto_update_check_enabled'

function normalizeUpdaterErrorMessage(message: string): string {
  const normalized = message.toLowerCase()

  if (
    (normalized.includes('404') && normalized.includes('latest.yml')) ||
    (normalized.includes('404') && normalized.includes('/releases/latest')) ||
    normalized.includes('no published versions on github')
  ) {
    return 'Unable to check for updates. No published release metadata was found (latest.yml). Publish a tagged GitHub Release to enable auto-updates.'
  }

  if (
    (normalized.includes('404') && normalized.includes('releases.atom')) ||
    (normalized.includes('authentication token') && normalized.includes('404')) ||
    normalized.includes('private github')
  ) {
    return 'Unable to check for updates. The GitHub release feed is private or unavailable.'
  }

  if (
    normalized.includes('enotfound') ||
    normalized.includes('econnrefused') ||
    normalized.includes('timed out') ||
    normalized.includes('etimedout') ||
    normalized.includes('network')
  ) {
    return 'Unable to check for updates because the network request failed. Please try again.'
  }

  return 'Unable to check for updates right now. Please try again later.'
}

let initialized = false
let latestStatus: UpdateStatusEvent = {
  state: 'idle',
  message: 'Updater not initialized yet.',
  currentVersion: app.getVersion(),
  supported: process.platform === 'win32'
}

let statusListener: ((status: UpdateStatusEvent) => void) | null = null

function normalizeReleaseNotes(input: unknown): string | null {
  if (typeof input === 'string') {
    const trimmed = input.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (Array.isArray(input)) {
    const joined = input
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return ''
        }
        const note = (entry as { note?: unknown }).note
        return typeof note === 'string' ? note.trim() : ''
      })
      .filter(Boolean)
      .join('\n\n')
      .trim()

    return joined.length > 0 ? joined : null
  }

  return null
}

function emitStatus(partial: Omit<UpdateStatusEvent, 'currentVersion' | 'supported'>): void {
  latestStatus = {
    ...partial,
    currentVersion: app.getVersion(),
    supported: process.platform === 'win32'
  }

  if (statusListener) {
    statusListener(latestStatus)
  }
}

function isWindowsAutoUpdateSupported(): boolean {
  return process.platform === 'win32'
}

function hasPackagedUpdateContext(): boolean {
  return app.isPackaged
}

function isAutoUpdateCheckEnabled(): boolean {
  const raw = getSetting(AUTO_UPDATE_CHECK_ENABLED_KEY)
  if (raw === null) {
    return true
  }
  return raw === '1' || raw === 'true'
}

export function setUpdateStatusListener(listener: ((status: UpdateStatusEvent) => void) | null): void {
  statusListener = listener
  if (listener) {
    listener(latestStatus)
  }
}

export function getCurrentUpdateStatus(): UpdateStatusEvent {
  return latestStatus
}

export async function initializeAutoUpdates(): Promise<void> {
  if (initialized) {
    return
  }

  initialized = true

  if (!isWindowsAutoUpdateSupported()) {
    emitStatus({
      state: 'disabled',
      message: 'Auto-update is currently enabled for Windows only.'
    })
    return
  }

  if (!hasPackagedUpdateContext()) {
    emitStatus({
      state: 'disabled',
      message: 'Auto-update checks are disabled in development builds.'
    })
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    emitStatus({ state: 'checking', message: 'Checking for updates...' })
  })

  autoUpdater.on('update-available', (info) => {
    emitStatus({
      state: 'available',
      message: `Update ${info.version} is available. Downloading in the background.`,
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    })
  })

  autoUpdater.on('update-not-available', () => {
    emitStatus({ state: 'not-available', message: 'You are on the latest version.' })
  })

  autoUpdater.on('download-progress', (progress) => {
    emitStatus({
      state: 'downloading',
      message: `Downloading update: ${Math.round(progress.percent)}%`,
      downloadPercent: progress.percent
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    emitStatus({
      state: 'downloaded',
      message: `Update ${info.version} has been downloaded and is ready to install.`,
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    })
  })

  autoUpdater.on('error', (error) => {
    const message = error?.message ?? 'An unknown auto-update error occurred.'
    emitStatus({
      state: 'error',
      message,
      friendlyMessage: normalizeUpdaterErrorMessage(message)
    })
  })

  if (!isAutoUpdateCheckEnabled()) {
    emitStatus({
      state: 'disabled',
      message: 'Automatic update checks are turned off in Settings.'
    })
    return
  }

  await checkForAppUpdates()
}

export async function checkForAppUpdates(options?: { manual?: boolean }): Promise<IpcMutationResult> {
  if (!isWindowsAutoUpdateSupported()) {
    emitStatus({
      state: 'disabled',
      message: 'Auto-update checks are currently enabled for Windows only.'
    })
    return { ok: false, error: 'Auto-update currently supports Windows builds only.' }
  }

  if (!hasPackagedUpdateContext()) {
    emitStatus({
      state: 'disabled',
      message: 'Auto-update checks are disabled in development builds.'
    })
    return { ok: false, error: 'Auto-update checks are only available in packaged builds.' }
  }

  if (!options?.manual && !isAutoUpdateCheckEnabled()) {
    emitStatus({
      state: 'disabled',
      message: 'Automatic update checks are turned off in Settings.'
    })
    return { ok: true, error: null }
  }

  try {
    await autoUpdater.checkForUpdates()
    return { ok: true, error: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check for updates.'
    const friendlyMessage = normalizeUpdaterErrorMessage(message)
    emitStatus({ state: 'error', message, friendlyMessage })
    return { ok: false, error: friendlyMessage }
  }
}

export function installDownloadedUpdate(): IpcMutationResult {
  if (!isWindowsAutoUpdateSupported()) {
    return { ok: false, error: 'Install is only available on Windows right now.' }
  }

  if (latestStatus.state !== 'downloaded') {
    return { ok: false, error: 'No downloaded update is ready to install.' }
  }

  setTimeout(() => {
    autoUpdater.quitAndInstall()
  }, 150)

  return { ok: true, error: null }
}
