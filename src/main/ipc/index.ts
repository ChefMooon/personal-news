import { ipcMain, shell } from 'electron'
import { getDb } from '../db/database'
import { getSetting, setSetting } from '../settings/store'
import { IPC } from '../../shared/ipc-types'
import type {
  YtChannel,
  YtVideo,
  DigestPost,
  SavedPostSummary,
  ScriptWithLastRun,
  WidgetLayout,
  ThemeInfo
} from '../../shared/ipc-types'

export function registerIpcHandlers(): void {
  // youtube:getChannels
  ipcMain.handle(IPC.YOUTUBE_GET_CHANNELS, (): YtChannel[] => {
    const db = getDb()
    return db.prepare('SELECT * FROM yt_channels ORDER BY sort_order').all() as YtChannel[]
  })

  // youtube:getVideos
  ipcMain.handle(IPC.YOUTUBE_GET_VIDEOS, (_event, channelId: string): YtVideo[] => {
    const db = getDb()
    return db
      .prepare(
        'SELECT * FROM yt_videos WHERE channel_id = ? ORDER BY published_at DESC LIMIT 15'
      )
      .all(channelId) as YtVideo[]
  })

  // reddit:getDigestPosts
  ipcMain.handle(IPC.REDDIT_GET_DIGEST_POSTS, (): DigestPost[] => {
    const db = getDb()
    return db
      .prepare('SELECT * FROM reddit_digest_posts ORDER BY fetched_at DESC')
      .all() as DigestPost[]
  })

  // reddit:getSavedPostsSummary
  ipcMain.handle(IPC.REDDIT_GET_SAVED_POSTS_SUMMARY, (): SavedPostSummary[] => {
    const db = getDb()
    return db
      .prepare(
        'SELECT post_id, title, permalink, subreddit, saved_at FROM saved_posts ORDER BY saved_at DESC LIMIT 5'
      )
      .all() as SavedPostSummary[]
  })

  // scripts:getAll
  ipcMain.handle(IPC.SCRIPTS_GET_ALL, (): ScriptWithLastRun[] => {
    const db = getDb()
    return db
      .prepare(
        `SELECT s.*, r.started_at, r.finished_at, r.exit_code
         FROM scripts s
         LEFT JOIN script_runs r ON r.id = (
           SELECT id FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1
         )`
      )
      .all() as ScriptWithLastRun[]
  })

  // settings:getWidgetLayout
  ipcMain.handle(IPC.SETTINGS_GET_WIDGET_LAYOUT, (): WidgetLayout => {
    const orderRaw = getSetting('widget_order') ?? '["youtube","reddit_digest","saved_posts"]'
    const visibilityRaw =
      getSetting('widget_visibility') ??
      '{"youtube":true,"reddit_digest":true,"saved_posts":true}'
    return {
      widget_order: JSON.parse(orderRaw) as string[],
      widget_visibility: JSON.parse(visibilityRaw) as Record<string, boolean>
    }
  })

  // settings:setWidgetLayout
  ipcMain.handle(IPC.SETTINGS_SET_WIDGET_LAYOUT, (_event, layout: WidgetLayout): void => {
    setSetting('widget_order', JSON.stringify(layout.widget_order))
    setSetting('widget_visibility', JSON.stringify(layout.widget_visibility))
  })

  // settings:getTheme
  ipcMain.handle(IPC.SETTINGS_GET_THEME, (): ThemeInfo => {
    const id = getSetting('active_theme_id') ?? 'system'
    // Check if it's a custom theme
    if (id !== 'system' && id !== 'light' && id !== 'dark') {
      const db = getDb()
      const row = db.prepare('SELECT tokens FROM themes WHERE id = ?').get(id) as
        | { tokens: string }
        | undefined
      if (row) {
        return { id, tokens: JSON.parse(row.tokens) as Record<string, string> }
      }
    }
    // Built-in theme — tokens always null in prototype
    return { id, tokens: null }
  })

  // settings:setTheme
  ipcMain.handle(IPC.SETTINGS_SET_THEME, (_event, id: string): void => {
    setSetting('active_theme_id', id)
  })

  // settings:get (generic)
  ipcMain.handle(IPC.SETTINGS_GET, (_event, key: string): string | null => {
    return getSetting(key)
  })

  // settings:set (generic)
  ipcMain.handle(IPC.SETTINGS_SET, (_event, key: string, value: string): void => {
    setSetting(key, value)
  })

  // shell:openExternal
  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, (_event, url: string): void => {
    shell.openExternal(url)
  })
}
