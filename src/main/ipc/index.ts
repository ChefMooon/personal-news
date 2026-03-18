import { BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { getDb } from '../db/database'
import { deleteSetting, getSetting, setSetting } from '../settings/store'
import { IPC } from '../../shared/ipc-types'
import type {
  YtChannel,
  YtVideo,
  DigestPost,
  SavedPostSummary,
  ScriptWithLastRun,
  WidgetLayout,
  WidgetInstance,
  ThemeInfo,
  IpcMutationResult,
  YouTubeApiKeyStatus
} from '../../shared/ipc-types'
import { applyYouTubePollInterval } from '../sources/youtube/index'

const YOUTUBE_API_KEY_SETTING = 'youtube_api_key_encrypted'

function emitYoutubeUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.YOUTUBE_UPDATED)
  }
}

function getDecryptedYouTubeApiKey(): string | null {
  const encrypted = getSetting(YOUTUBE_API_KEY_SETTING)
  if (!encrypted) {
    return null
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Secure credential storage is unavailable on this machine.')
  }
  const raw = Buffer.from(encrypted, 'base64')
  return safeStorage.decryptString(raw)
}

async function validateYouTubeApiKey(apiKey: string): Promise<IpcMutationResult> {
  const params = new URLSearchParams({
    part: 'id',
    id: 'dQw4w9WgXcQ',
    key: apiKey
  })
  const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`)
  const payload = (await response.json()) as { error?: { message?: string } }
  if (!response.ok || payload.error) {
    return {
      ok: false,
      error: payload.error?.message ?? 'YouTube API key validation failed.'
    }
  }
  return { ok: true, error: null }
}

function parseChannelInput(input: string): { channelId: string | null; query: string | null } {
  const trimmed = input.trim()
  if (!trimmed) {
    return { channelId: null, query: null }
  }

  if (/^UC[\w-]{22}$/.test(trimmed)) {
    return { channelId: trimmed, query: null }
  }

  if (trimmed.startsWith('@')) {
    return { channelId: null, query: trimmed }
  }

  try {
    const url = new URL(trimmed)
    const pathSegments = url.pathname.split('/').filter(Boolean)
    if (pathSegments.length >= 2 && pathSegments[0] === 'channel') {
      const id = pathSegments[1]
      if (/^UC[\w-]{22}$/.test(id)) {
        return { channelId: id, query: null }
      }
    }
    if (pathSegments.length >= 1 && pathSegments[0].startsWith('@')) {
      return { channelId: null, query: pathSegments[0] }
    }
    if (pathSegments.length >= 2 && (pathSegments[0] === 'c' || pathSegments[0] === 'user')) {
      return { channelId: null, query: pathSegments[1] }
    }
  } catch {
    // Fall back to search query path below.
  }

  return { channelId: null, query: trimmed }
}

async function fetchChannelById(apiKey: string, channelId: string): Promise<YtChannel | null> {
  const params = new URLSearchParams({
    part: 'snippet',
    id: channelId,
    key: apiKey
  })
  const response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`)
  const payload = (await response.json()) as {
    items?: Array<{
      id: string
      snippet: {
        title: string
        thumbnails?: { default?: { url?: string }; medium?: { url?: string }; high?: { url?: string } }
      }
    }>
    error?: { message?: string }
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message ?? 'Failed to fetch channel details from YouTube API.')
  }
  const item = payload.items?.[0]
  if (!item) {
    return null
  }
  const thumb =
    item.snippet.thumbnails?.high?.url ??
    item.snippet.thumbnails?.medium?.url ??
    item.snippet.thumbnails?.default?.url ??
    null

  return {
    channel_id: item.id,
    name: item.snippet.title,
    thumbnail_url: thumb,
    added_at: Math.floor(Date.now() / 1000),
    enabled: 1,
    sort_order: 0
  }
}

async function resolveChannelFromInput(input: string): Promise<YtChannel> {
  const apiKey = getDecryptedYouTubeApiKey()
  if (!apiKey) {
    throw new Error('Set and validate your YouTube API key before adding channels.')
  }

  const parsed = parseChannelInput(input)
  if (!parsed.channelId && !parsed.query) {
    throw new Error('Enter a channel URL, @handle, or channel ID.')
  }

  if (parsed.channelId) {
    const found = await fetchChannelById(apiKey, parsed.channelId)
    if (!found) {
      throw new Error('No channel found for that channel ID.')
    }
    return found
  }

  const searchParams = new URLSearchParams({
    part: 'snippet',
    type: 'channel',
    maxResults: '1',
    q: parsed.query ?? '',
    key: apiKey
  })
  const searchResponse = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`
  )
  const searchPayload = (await searchResponse.json()) as {
    items?: Array<{ id?: { channelId?: string } }>
    error?: { message?: string }
  }
  if (!searchResponse.ok || searchPayload.error) {
    throw new Error(searchPayload.error?.message ?? 'Failed to resolve channel from YouTube API.')
  }
  const resolvedChannelId = searchPayload.items?.[0]?.id?.channelId
  if (!resolvedChannelId) {
    throw new Error('No channel found for that input.')
  }

  const found = await fetchChannelById(apiKey, resolvedChannelId)
  if (!found) {
    throw new Error('No channel found for that input.')
  }
  return found
}

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

  // youtube:setChannelEnabled
  ipcMain.handle(
    IPC.YOUTUBE_SET_CHANNEL_ENABLED,
    (_event, channelId: string, enabled: boolean): IpcMutationResult => {
      const db = getDb()
      const result = db
        .prepare('UPDATE yt_channels SET enabled = ? WHERE channel_id = ?')
        .run(enabled ? 1 : 0, channelId)
      if (result.changes === 0) {
        return { ok: false, error: 'Channel not found.' }
      }
      emitYoutubeUpdated()
      return { ok: true, error: null }
    }
  )

  // youtube:addChannel
  ipcMain.handle(IPC.YOUTUBE_ADD_CHANNEL, async (_event, input: string): Promise<IpcMutationResult> => {
    try {
      const channel = await resolveChannelFromInput(input)
      const db = getDb()
      const existing = db
        .prepare('SELECT channel_id FROM yt_channels WHERE channel_id = ?')
        .get(channel.channel_id) as { channel_id: string } | undefined

      if (existing) {
        db.prepare(
          'UPDATE yt_channels SET name = ?, thumbnail_url = ? WHERE channel_id = ?'
        ).run(channel.name, channel.thumbnail_url, channel.channel_id)
      } else {
        const row = db.prepare('SELECT COALESCE(MAX(sort_order), -1) AS max_sort FROM yt_channels').get() as {
          max_sort: number
        }
        db.prepare(
          `INSERT INTO yt_channels (channel_id, name, thumbnail_url, added_at, enabled, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          channel.channel_id,
          channel.name,
          channel.thumbnail_url,
          channel.added_at,
          channel.enabled,
          row.max_sort + 1
        )
      }

      emitYoutubeUpdated()
      return { ok: true, error: null }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to add YouTube channel.'
      }
    }
  })

  // youtube:removeChannel
  ipcMain.handle(IPC.YOUTUBE_REMOVE_CHANNEL, (_event, channelId: string): IpcMutationResult => {
    const db = getDb()
    const result = db.prepare('DELETE FROM yt_channels WHERE channel_id = ?').run(channelId)
    if (result.changes === 0) {
      return { ok: false, error: 'Channel not found.' }
    }
    emitYoutubeUpdated()
    return { ok: true, error: null }
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
    const instancesRaw = getSetting('widget_instances') ?? '{}'
    return {
      widget_order: JSON.parse(orderRaw) as string[],
      widget_visibility: JSON.parse(visibilityRaw) as Record<string, boolean>,
      widget_instances: JSON.parse(instancesRaw) as Record<string, WidgetInstance>
    }
  })

  // settings:setWidgetLayout
  ipcMain.handle(IPC.SETTINGS_SET_WIDGET_LAYOUT, (_event, layout: WidgetLayout): void => {
    setSetting('widget_order', JSON.stringify(layout.widget_order))
    setSetting('widget_visibility', JSON.stringify(layout.widget_visibility))
    setSetting('widget_instances', JSON.stringify(layout.widget_instances))
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

  // settings:getYouTubeApiKeyStatus
  ipcMain.handle(IPC.SETTINGS_GET_YOUTUBE_API_KEY_STATUS, (): YouTubeApiKeyStatus => {
    try {
      const key = getDecryptedYouTubeApiKey()
      if (!key) {
        return { isSet: false, suffix: null }
      }
      return {
        isSet: true,
        suffix: key.length >= 4 ? key.slice(-4) : key
      }
    } catch {
      return { isSet: false, suffix: null }
    }
  })

  // settings:setYouTubeApiKey
  ipcMain.handle(
    IPC.SETTINGS_SET_YOUTUBE_API_KEY,
    async (_event, key: string): Promise<IpcMutationResult> => {
      const trimmed = key.trim()
      if (!trimmed) {
        return { ok: false, error: 'API key cannot be empty.' }
      }
      if (!safeStorage.isEncryptionAvailable()) {
        return {
          ok: false,
          error: 'Secure credential storage is unavailable on this machine.'
        }
      }

      const validation = await validateYouTubeApiKey(trimmed)
      if (!validation.ok) {
        return validation
      }

      const encrypted = safeStorage.encryptString(trimmed)
      setSetting(YOUTUBE_API_KEY_SETTING, encrypted.toString('base64'))
      return { ok: true, error: null }
    }
  )

  // settings:clearYouTubeApiKey
  ipcMain.handle(IPC.SETTINGS_CLEAR_YOUTUBE_API_KEY, (): void => {
    deleteSetting(YOUTUBE_API_KEY_SETTING)
  })

  // settings:setRssPollInterval
  ipcMain.handle(
    IPC.SETTINGS_SET_RSS_POLL_INTERVAL,
    (_event, minutes: number): IpcMutationResult => {
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        return {
          ok: false,
          error: 'RSS poll interval must be a whole number between 1 and 1440 minutes.'
        }
      }
      setSetting('rss_poll_interval_minutes', String(minutes))
      applyYouTubePollInterval(minutes)
      return { ok: true, error: null }
    }
  )

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
