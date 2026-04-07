import { BrowserWindow, Notification } from 'electron'
import { getSetting, setSetting } from '../settings/store'
import type { NotificationPreferences, ScriptRunTrigger, WeatherAlert } from '../../shared/ipc-types'

const NOTIFICATION_PREFS_KEY = 'desktop_notification_prefs'

let windowFocused = false

// ---------------------------------------------------------------------------
// Window focus tracking
// ---------------------------------------------------------------------------

export function attachWindowListeners(mainWindow: BrowserWindow): void {
  mainWindow.on('focus', () => {
    windowFocused = true
  })
  mainWindow.on('blur', () => {
    windowFocused = false
  })
  mainWindow.on('ready-to-show', () => {
    windowFocused = mainWindow.isFocused()
  })
}

// ---------------------------------------------------------------------------
// Notification preference helpers
// ---------------------------------------------------------------------------

const DEFAULT_PREFS: NotificationPreferences = {
  desktopNotificationsEnabled: true,
  weather: { badWeather: true },
  youtube: { newVideo: true, liveStart: true },
  savedPosts: { syncSuccess: true },
  redditDigest: { runSuccess: true, runFailure: true },
  scriptManager: { autoRunSuccess: true, autoRunFailure: true, startupWarning: true }
}

export function getNotificationPreferences(): NotificationPreferences {
  const raw = getSetting(NOTIFICATION_PREFS_KEY)
  if (!raw) {
    return { ...DEFAULT_PREFS }
  }
  try {
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>
    return {
      desktopNotificationsEnabled:
        parsed.desktopNotificationsEnabled ??
        DEFAULT_PREFS.desktopNotificationsEnabled,
      weather: { ...DEFAULT_PREFS.weather, ...parsed.weather },
      youtube: { ...DEFAULT_PREFS.youtube, ...parsed.youtube },
      savedPosts: { ...DEFAULT_PREFS.savedPosts, ...parsed.savedPosts },
      redditDigest: { ...DEFAULT_PREFS.redditDigest, ...parsed.redditDigest },
      scriptManager: { ...DEFAULT_PREFS.scriptManager, ...parsed.scriptManager }
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function setNotificationPreferences(prefs: NotificationPreferences): void {
  setSetting(NOTIFICATION_PREFS_KEY, JSON.stringify(prefs))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function canNotify(): boolean {
  if (windowFocused) return false
  if (!Notification.isSupported()) return false
  return getNotificationPreferences().desktopNotificationsEnabled
}

function show(title: string, body: string): void {
  new Notification({ title, body }).show()
}

// ---------------------------------------------------------------------------
// Public notification functions
// ---------------------------------------------------------------------------

export interface YoutubeVideoEntry {
  title: string
  channelId: string
  channelName: string
  notifyNewVideos: boolean
  notifyLiveStart: boolean
}

/**
 * Emit a desktop notification for newly detected YouTube videos.
 * Groups multiple new videos into a single compact notification.
 */
export function notifyYoutubeNewVideos(entries: YoutubeVideoEntry[]): void {
  if (!canNotify()) return
  const prefs = getNotificationPreferences()
  if (!prefs.youtube.newVideo) return

  const eligible = entries.filter((e) => e.notifyNewVideos)
  if (eligible.length === 0) return

  if (eligible.length === 1) {
    show('New YouTube Video', `${eligible[0].channelName}: ${eligible[0].title}`)
    return
  }

  // Group by channel for a compact multi-video notification.
  const byChannel = new Map<string, { name: string; count: number }>()
  for (const e of eligible) {
    const existing = byChannel.get(e.channelId)
    if (existing) {
      existing.count += 1
    } else {
      byChannel.set(e.channelId, { name: e.channelName, count: 1 })
    }
  }
  const channelSummaries = Array.from(byChannel.values())
    .map((c) => (c.count === 1 ? c.name : `${c.name} (${c.count})`))
    .join(', ')
  show(`${eligible.length} New YouTube Videos`, channelSummaries)
}

/**
 * Emit a desktop notification for each live-stream transition (upcoming → live).
 * Fires one notification per live start so they are individually actionable.
 */
export function notifyYoutubeLiveStart(entries: YoutubeVideoEntry[]): void {
  if (!canNotify()) return
  const prefs = getNotificationPreferences()
  if (!prefs.youtube.liveStart) return

  const eligible = entries.filter((e) => e.notifyLiveStart)
  for (const entry of eligible) {
    show(`${entry.channelName} is live`, entry.title)
  }
}

/**
 * Emit a desktop notification when an ntfy.sh poll ingests at least one new saved post.
 */
export function notifySavedPostsSync(postsIngested: number): void {
  if (!canNotify()) return
  const prefs = getNotificationPreferences()
  if (!prefs.savedPosts.syncSuccess) return
  if (postsIngested <= 0) return

  const label = postsIngested === 1 ? '1 new saved post' : `${postsIngested} new saved posts`
  show('Saved Posts Synced', `Ingested ${label} from ntfy.sh.`)
}

export function notifyWeatherAlerts(locationName: string, alerts: WeatherAlert[]): void {
  if (!canNotify()) return
  const prefs = getNotificationPreferences()
  if (!prefs.weather.badWeather) return
  if (alerts.length === 0) return

  if (alerts.length === 1) {
    show(alerts[0].title, `${locationName}: ${alerts[0].message}`)
    return
  }

  show('Weather Alert Summary', `${locationName}: ${alerts.length} active weather alerts.`)
}

/**
 * Emit a desktop notification for a Reddit Digest script run result.
 */
export function notifyRedditDigest(
  severity: 'info' | 'error' | 'warning',
  message: string
): void {
  if (!canNotify()) return
  const prefs = getNotificationPreferences()
  if (severity === 'info' && !prefs.redditDigest.runSuccess) return
  if (severity === 'error' && !prefs.redditDigest.runFailure) return
  // 'warning' severity is for startup_warning events only — not used by digest directly.
  if (severity === 'warning') return

  const title = severity === 'info' ? 'Reddit Digest Complete' : 'Reddit Digest Failed'
  show(title, message)
}

/**
 * Emit a desktop notification for a Script Manager auto-run result.
 * Manual runs are intentionally excluded (trigger === 'manual').
 */
export function notifyScriptAutoRun(
  scriptName: string,
  trigger: ScriptRunTrigger,
  severity: 'info' | 'error' | 'warning',
  message: string
): void {
  if (!canNotify()) return
  const prefs = getNotificationPreferences()

  if (severity === 'warning' && trigger === 'startup_warning') {
    if (!prefs.scriptManager.startupWarning) return
    show(`${scriptName}: Missed Scheduled Runs`, message)
    return
  }

  // Only notify for auto-triggered runs.
  if (trigger === 'manual') return

  if (severity === 'info' && !prefs.scriptManager.autoRunSuccess) return
  if (severity === 'error' && !prefs.scriptManager.autoRunFailure) return

  const triggerLabel =
    trigger === 'on_app_start'
      ? 'on app start'
      : trigger === 'catch_up'
        ? 'catch-up'
        : 'scheduled'
  const title =
    severity === 'info'
      ? `Script Completed (${triggerLabel})`
      : `Script Failed (${triggerLabel})`
  show(title, `${scriptName}: ${message}`)
}
