import { BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { XMLParser } from 'fast-xml-parser'
import { getDb } from '../db/database'
import { deleteSetting, getSetting, setSetting } from '../settings/store'
import { IPC } from '../../shared/ipc-types'
import type {
  YtChannel,
  YtVideo,
  DigestPost,
  SavedPostSummary,
  SavedPost,
  NtfyStaleness,
  NtfyPollResult,
  ScriptWithLastRun,
  WidgetLayout,
  WidgetInstance,
  ThemeInfo,
  IpcMutationResult,
  YouTubeCacheClearResult,
  YouTubeApiKeyStatus,
  YouTubeViewConfig
} from '../../shared/ipc-types'
import {
  applyYouTubePollInterval,
  triggerYouTubePollNow
} from '../sources/youtube/index'
import { applyNtfyPollInterval, triggerNtfyPoll } from '../sources/reddit/index'

const YOUTUBE_API_KEY_SETTING = 'youtube_api_key_encrypted'
const YOUTUBE_VIEW_CONFIG_KEY_PREFIX = 'youtube_view_config:'
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ''
})

function logYouTubeResolveDebug(_message: string, _payload?: Record<string, unknown>): void {
}

function hashString(input: string): number {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash
}

function getChannelInitials(channelName: string, channelId: string): string {
  const words = channelName
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0)

  const fromName = words
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  if (fromName.length > 0) {
    return fromName
  }

  const fallback = channelId.replace(/^UC/, '').slice(0, 2).toUpperCase()
  return fallback.length > 0 ? fallback : 'YT'
}

function buildTemporaryChannelThumbnail(channelId: string, channelName: string): string {
  const palettes: Array<{ bg: string; fg: string; ring: string }> = [
    { bg: '#0f766e', fg: '#ecfeff', ring: '#5eead4' },
    { bg: '#1d4ed8', fg: '#eff6ff', ring: '#93c5fd' },
    { bg: '#be123c', fg: '#fff1f2', ring: '#fda4af' },
    { bg: '#7c2d12', fg: '#fff7ed', ring: '#fdba74' },
    { bg: '#14532d', fg: '#f0fdf4', ring: '#86efac' },
    { bg: '#581c87', fg: '#faf5ff', ring: '#d8b4fe' }
  ]

  const palette = palettes[hashString(channelId) % palettes.length]
  const initials = getChannelInitials(channelName, channelId)
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96' viewBox='0 0 96 96'><desc>pn-temp-channel-avatar</desc><rect width='96' height='96' rx='48' fill='${palette.bg}'/><circle cx='48' cy='48' r='43' fill='none' stroke='${palette.ring}' stroke-width='2'/><text x='48' y='56' text-anchor='middle' fill='${palette.fg}' font-size='30' font-family='Segoe UI, Arial, sans-serif' font-weight='700'>${initials}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function emitYoutubeUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.YOUTUBE_UPDATED)
  }
}

const DEFAULT_YOUTUBE_VIEW_CONFIG: YouTubeViewConfig = {
  showVideos: true,
  showShorts: true,
  showUpcomingStreams: true,
  showLiveNow: true,
  showPastLivestreams: true,
  channelMode: 'all',
  selectedChannelIds: [],
  channelOrder: [],
  pinnedChannelIds: [],
  showUpcomingPanel: true,
  maxVideosPerChannel: 15,
  videoSortDirection: 'newest',
  cardDensity: 'detailed',
  showChannelHeaders: true,
  collapseChannelsByDefault: false,
  perChannelMediaOverrides: {}
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

  if (/^@[\w.-]+$/.test(trimmed)) {
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
    if (pathSegments.length >= 1 && /^@[\w.-]+$/.test(pathSegments[0])) {
      return { channelId: null, query: pathSegments[0] }
    }

    // Accept YouTube URLs even when they are not direct /channel/<id> or /@handle forms.
    if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
      return { channelId: null, query: trimmed }
    }
  } catch {
    // Non-URL inputs continue to strict format validation below.
  }

  return { channelId: null, query: null }
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

async function fetchChannelFromRss(channelId: string): Promise<YtChannel | null> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`
  const response = await fetch(feedUrl)
  if (!response.ok) {
    return null
  }

  const xml = await response.text()
  const parsed = xmlParser.parse(xml) as {
    feed?: {
      author?: { name?: string } | Array<{ name?: string }>
      entry?:
        | {
            'media:group'?: {
              'media:thumbnail'?: { url?: string } | Array<{ url?: string }>
            }
          }
        | Array<{
            'media:group'?: {
              'media:thumbnail'?: { url?: string } | Array<{ url?: string }>
            }
          }>
    }
  }

  const authorRaw = parsed.feed?.author
  const author = Array.isArray(authorRaw) ? authorRaw[0]?.name : authorRaw?.name
  const entriesRaw = parsed.feed?.entry
  const firstEntry = Array.isArray(entriesRaw) ? entriesRaw[0] : entriesRaw
  const thumbnailRaw = firstEntry?.['media:group']?.['media:thumbnail']
  const thumbnailUrl = Array.isArray(thumbnailRaw)
    ? thumbnailRaw[0]?.url ?? null
    : thumbnailRaw?.url ?? null

  return {
    channel_id: channelId,
    name: author?.trim() || channelId,
    thumbnail_url: thumbnailUrl,
    added_at: Math.floor(Date.now() / 1000),
    enabled: 1,
    sort_order: 0
  }
}

function extractMetaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i'
  )
  const match = html.match(regex)
  return match?.[1]?.trim() ?? null
}

function extractChannelIdFromHtml(html: string): { channelId: string | null; matchedBy: string | null } {
  // Priority 1: og:url is always the canonical URL for the page-owner's channel.
  // This is the most reliable signal because it reflects what YouTube set for THIS page,
  // whereas JSON channelId fields can belong to any embedded/recommended channel.
  const ogUrl = extractMetaContent(html, 'og:url')
  if (ogUrl) {
    const ogUrlMatch = ogUrl.match(/\/channel\/(UC[\w-]{22})/)
    if (ogUrlMatch?.[1]) {
      return { channelId: ogUrlMatch[1], matchedBy: 'og-url' }
    }
  }

  // Priority 2: canonical link href also uniquely identifies the page owner.
  const canonicalMatch = html.match(
    /<link[^>]+rel=["']canonical["'][^>]+href=["']https?:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})["']/i
  )
  if (canonicalMatch?.[1]) {
    return { channelId: canonicalMatch[1], matchedBy: 'canonical-link-channel' }
  }

  // Priority 3: JSON patterns — less precise because these can match channels
  // referenced anywhere on the page (sidebar, recommendations, embeds, etc.).
  const fallbackPatterns: Array<{ key: string; regex: RegExp }> = [
    { key: 'channelId-json', regex: /"channelId"\s*:\s*"(UC[\w-]{22})"/ },
    { key: 'channelId-escaped-json', regex: /channelId\\":\\"(UC[\w-]{22})\\"/ },
    { key: 'channel-url-fragment', regex: /\/channel\/(UC[\w-]{22})/ }
  ]

  for (const pattern of fallbackPatterns) {
    const match = html.match(pattern.regex)
    if (match?.[1]) {
      return { channelId: match[1], matchedBy: pattern.key }
    }
  }

  return { channelId: null, matchedBy: null }
}

async function resolveChannelIdFromPage(url: string): Promise<{
  channelId: string | null
  title: string | null
  thumbnailUrl: string | null
}> {
  logYouTubeResolveDebug('resolveChannelIdFromPage:start', { url })
  const response = await fetch(url)
  logYouTubeResolveDebug('resolveChannelIdFromPage:response', {
    url,
    ok: response.ok,
    status: response.status
  })
  if (!response.ok) {
    return { channelId: null, title: null, thumbnailUrl: null }
  }
  const html = await response.text()

  const extracted = extractChannelIdFromHtml(html)
  const channelId = extracted.channelId
  const title = extractMetaContent(html, 'og:title')
  const thumbnailUrl = extractMetaContent(html, 'og:image')

  logYouTubeResolveDebug('resolveChannelIdFromPage:parsed', {
    url,
    hasChannelId: Boolean(channelId),
    channelId,
    matchedBy: extracted.matchedBy,
    title,
    hasThumbnailUrl: Boolean(thumbnailUrl)
  })

  return { channelId, title, thumbnailUrl }
}

async function resolveChannelWithoutApiKey(
  input: string,
  parsed: { channelId: string | null; query: string | null }
): Promise<YtChannel> {
  logYouTubeResolveDebug('resolveWithoutApiKey:start', {
    input,
    parsedChannelId: parsed.channelId,
    parsedQuery: parsed.query
  })
  if (parsed.channelId) {
    const found = await fetchChannelFromRss(parsed.channelId)
    logYouTubeResolveDebug('resolveWithoutApiKey:channelIdPath', {
      parsedChannelId: parsed.channelId,
      rssFound: Boolean(found)
    })
    if (!found) {
      throw new Error('Could not load channel feed. Verify the channel ID and try again.')
    }
    return found
  }

  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error('Enter a channel ID, @handle, or full YouTube channel URL.')
  }

  let candidateUrl: string | null = null
  if (trimmed.startsWith('@')) {
    candidateUrl = `https://www.youtube.com/${trimmed}`
  } else {
    try {
      const parsedUrl = new URL(trimmed)
      if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be')) {
        candidateUrl = parsedUrl.toString()
      }
    } catch {
      candidateUrl = null
    }
  }

  if (!candidateUrl) {
    logYouTubeResolveDebug('resolveWithoutApiKey:noCandidateUrl', { input })
    throw new Error('Enter a channel ID, @handle, or full YouTube channel URL.')
  }

  logYouTubeResolveDebug('resolveWithoutApiKey:candidateUrl', { candidateUrl })

  const pageResolved = await resolveChannelIdFromPage(candidateUrl)
  logYouTubeResolveDebug('resolveWithoutApiKey:pageResolved', {
    candidateUrl,
    channelId: pageResolved.channelId,
    title: pageResolved.title
  })
  if (!pageResolved.channelId) {
    throw new Error('Could not resolve a channel from that URL. Use a channel ID, @handle, or channel URL.')
  }

  const fromRss = await fetchChannelFromRss(pageResolved.channelId)
  logYouTubeResolveDebug('resolveWithoutApiKey:rssFromPage', {
    channelId: pageResolved.channelId,
    rssFound: Boolean(fromRss)
  })
  if (!fromRss) {
    return {
      channel_id: pageResolved.channelId,
      name: pageResolved.title || pageResolved.channelId,
      thumbnail_url: pageResolved.thumbnailUrl,
      added_at: Math.floor(Date.now() / 1000),
      enabled: 1,
      sort_order: 0
    }
  }

  return {
    ...fromRss,
    name: fromRss.name === fromRss.channel_id ? pageResolved.title || fromRss.name : fromRss.name,
    thumbnail_url: fromRss.thumbnail_url || pageResolved.thumbnailUrl
  }
}

async function resolveChannelFromInput(input: string): Promise<YtChannel> {
  const parsed = parseChannelInput(input)
  logYouTubeResolveDebug('resolveFromInput:start', {
    input,
    parsedChannelId: parsed.channelId,
    parsedQuery: parsed.query
  })
  if (!parsed.channelId && !parsed.query) {
    logYouTubeResolveDebug('resolveFromInput:rejectedInputFormat', { input })
    throw new Error('Enter a channel ID, @handle, or full YouTube channel URL.')
  }

  let apiKey: string | null = null
  try {
    apiKey = getDecryptedYouTubeApiKey()
  } catch {
    apiKey = null
  }

  logYouTubeResolveDebug('resolveFromInput:apiKeyStatus', {
    hasApiKey: Boolean(apiKey)
  })

  if (!apiKey) {
    return resolveChannelWithoutApiKey(input, parsed)
  }

  if (parsed.channelId) {
    const found = await fetchChannelById(apiKey, parsed.channelId)
    logYouTubeResolveDebug('resolveFromInput:channelIdPath', {
      channelId: parsed.channelId,
      apiFound: Boolean(found)
    })
    if (!found) {
      const rssFound = await fetchChannelFromRss(parsed.channelId)
      logYouTubeResolveDebug('resolveFromInput:channelIdPathRssFallback', {
        channelId: parsed.channelId,
        rssFound: Boolean(rssFound)
      })
      if (!rssFound) {
        throw new Error('No channel found for that channel ID.')
      }
      return rssFound
    }
    return found
  }

  const trimmed = input.trim()
  let candidateUrl: string | null = null
  if (parsed.query?.startsWith('@')) {
    candidateUrl = `https://www.youtube.com/${parsed.query}`
  } else {
    try {
      const parsedUrl = new URL(trimmed)
      if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be')) {
        candidateUrl = parsedUrl.toString()
      }
    } catch {
      candidateUrl = null
    }
  }

  if (!candidateUrl) {
    logYouTubeResolveDebug('resolveFromInput:noCandidateUrl', { input, parsedQuery: parsed.query })
    throw new Error('Enter a channel ID, @handle, or full YouTube channel URL.')
  }

  logYouTubeResolveDebug('resolveFromInput:candidateUrl', { candidateUrl })

  const pageResolved = await resolveChannelIdFromPage(candidateUrl)
  logYouTubeResolveDebug('resolveFromInput:pageResolved', {
    candidateUrl,
    channelId: pageResolved.channelId,
    title: pageResolved.title
  })
  if (!pageResolved.channelId) {
    throw new Error('Could not resolve a channel from that URL. Use a channel ID, @handle, or channel URL.')
  }

  const found = await fetchChannelById(apiKey, pageResolved.channelId)
  logYouTubeResolveDebug('resolveFromInput:apiFetchByResolvedId', {
    channelId: pageResolved.channelId,
    apiFound: Boolean(found)
  })
  if (found) {
    return found
  }

  const fromRss = await fetchChannelFromRss(pageResolved.channelId)
  logYouTubeResolveDebug('resolveFromInput:rssFallbackByResolvedId', {
    channelId: pageResolved.channelId,
    rssFound: Boolean(fromRss)
  })
  if (fromRss) {
    return {
      ...fromRss,
      name: fromRss.name === fromRss.channel_id ? pageResolved.title || fromRss.name : fromRss.name,
      thumbnail_url: fromRss.thumbnail_url || pageResolved.thumbnailUrl
    }
  }

  return {
    channel_id: pageResolved.channelId,
    name: pageResolved.title || pageResolved.channelId,
    thumbnail_url: pageResolved.thumbnailUrl,
    added_at: Math.floor(Date.now() / 1000),
    enabled: 1,
    sort_order: 0
  }
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
    logYouTubeResolveDebug('ipc:addChannel:start', { input })
    try {
      const channel = await resolveChannelFromInput(input)
      logYouTubeResolveDebug('ipc:addChannel:resolved', {
        input,
        channelId: channel.channel_id,
        channelName: channel.name
      })
      const db = getDb()
      const existing = db
        .prepare('SELECT channel_id FROM yt_channels WHERE channel_id = ?')
        .get(channel.channel_id) as { channel_id: string } | undefined
      const temporaryThumbnail = buildTemporaryChannelThumbnail(channel.channel_id, channel.name)

      if (existing) {
        db.prepare(
          'UPDATE yt_channels SET name = ?, thumbnail_url = ? WHERE channel_id = ?'
        ).run(channel.name, temporaryThumbnail, channel.channel_id)
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
          temporaryThumbnail,
          channel.added_at,
          channel.enabled,
          row.max_sort + 1
        )
      }

      emitYoutubeUpdated()
      logYouTubeResolveDebug('ipc:addChannel:success', {
        channelId: channel.channel_id,
        existed: Boolean(existing)
      })
      return { ok: true, error: null }
    } catch (error) {
      logYouTubeResolveDebug('ipc:addChannel:error', {
        input,
        error: error instanceof Error ? error.message : String(error)
      })
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

  // youtube:pollNow
  ipcMain.handle(IPC.YOUTUBE_POLL_NOW, async (): Promise<IpcMutationResult> => {
    try {
      await triggerYouTubePollNow()
      return { ok: true, error: null }
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to poll YouTube RSS feeds.'
      }
    }
  })

  // youtube:clearVideosCache
  ipcMain.handle(IPC.YOUTUBE_CLEAR_VIDEOS_CACHE, (): YouTubeCacheClearResult => {
    const db = getDb()
    const result = db.prepare('DELETE FROM yt_videos').run()
    emitYoutubeUpdated()
    return { ok: true, error: null, deletedCount: result.changes }
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

  // reddit:getSavedPosts
  ipcMain.handle(
    IPC.REDDIT_GET_SAVED_POSTS,
    (
      _event,
      options?: {
        search?: string
        subreddit?: string
        subreddit_filter?: string[]
        tag?: string
        tag_filter?: string[]
        sort_by?: 'saved_at' | 'score'
        sort_dir?: 'asc' | 'desc'
        limit?: number
        offset?: number
      }
    ): { posts: SavedPost[]; total: number } => {
      const db = getDb()
      const conditions: string[] = []
      const params: unknown[] = []
      let joinFts = false

      // Search (FTS)
      if (options?.search) {
        joinFts = true
        conditions.push('saved_posts_fts MATCH ?')
        params.push(options.search)
      }

      // Subreddit filter (support both old single and new multi format)
      if (options?.subreddit_filter && options.subreddit_filter.length > 0) {
        const placeholders = options.subreddit_filter.map(() => '?').join(', ')
        conditions.push(`sp.subreddit IN (${placeholders})`)
        params.push(...options.subreddit_filter)
      } else if (options?.subreddit) {
        // Backward compatibility with old single-subreddit format
        conditions.push('sp.subreddit = ?')
        params.push(options.subreddit)
      }

      // Tag filter (support both old single and new multi format)
      if (options?.tag_filter && options.tag_filter.length > 0) {
        // Filter to posts that have at least one of the requested tags
        const tagConditions = options.tag_filter
          .map(() => 'EXISTS (SELECT 1 FROM json_each(sp.tags) WHERE value = ?)')
          .join(' OR ')
        conditions.push(`(${tagConditions})`)
        params.push(...options.tag_filter)
      } else if (options?.tag) {
        // Backward compatibility with old single-tag format
        conditions.push('EXISTS (SELECT 1 FROM json_each(sp.tags) WHERE value = ?)')
        params.push(options.tag)
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const limit = Math.min(options?.limit ?? 50, 500) // Cap at 500
      const offset = options?.offset ?? 0

      const fromClause = joinFts
        ? 'FROM saved_posts sp JOIN saved_posts_fts ON sp.rowid = saved_posts_fts.rowid'
        : 'FROM saved_posts sp'

      // Build ORDER BY clause
      const sortBy = options?.sort_by ?? 'saved_at'
      const sortDir = options?.sort_dir ?? 'desc'
      const orderClause = `ORDER BY sp.${sortBy} ${sortDir.toUpperCase()}`

      const countRow = db
        .prepare(`SELECT COUNT(*) as cnt ${fromClause} ${whereClause}`)
        .get(...params) as { cnt: number }

      const rows = db
        .prepare(
          `SELECT sp.* ${fromClause} ${whereClause} ${orderClause} LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset) as Array<{
        post_id: string
        title: string
        url: string
        permalink: string
        subreddit: string | null
        author: string | null
        score: number | null
        body: string | null
        saved_at: number
        note: string | null
        tags: string | null
      }>

      const posts: SavedPost[] = rows.map((row) => ({
        ...row,
        tags: row.tags ? (JSON.parse(row.tags) as string[]) : []
      }))

      return { posts, total: countRow.cnt }
    }
  )

  // reddit:updatePostTags
  ipcMain.handle(
    IPC.REDDIT_UPDATE_POST_TAGS,
    (_event, postId: string, tags: string[]): { ok: true } => {
      const db = getDb()
      db.prepare('UPDATE saved_posts SET tags = ? WHERE post_id = ?').run(
        JSON.stringify(tags),
        postId
      )
      return { ok: true }
    }
  )

  // reddit:getAllTags
  ipcMain.handle(IPC.REDDIT_GET_ALL_TAGS, (): string[] => {
    const db = getDb()
    const rows = db
      .prepare(
        `SELECT DISTINCT je.value as tag
         FROM saved_posts, json_each(saved_posts.tags) je
         WHERE saved_posts.tags IS NOT NULL
         ORDER BY je.value`
      )
      .all() as Array<{ tag: string }>
    return rows.map((r) => r.tag)
  })

  // reddit:renameTag
  ipcMain.handle(
    IPC.REDDIT_RENAME_TAG,
    (_event, oldTag: string, newTag: string): { affectedPosts: number } => {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT post_id, tags FROM saved_posts
           WHERE tags IS NOT NULL
             AND EXISTS (SELECT 1 FROM json_each(saved_posts.tags) WHERE value = ?)`
        )
        .all(oldTag) as Array<{ post_id: string; tags: string }>

      const update = db.prepare('UPDATE saved_posts SET tags = ? WHERE post_id = ?')
      const rename = db.transaction(() => {
        for (const row of rows) {
          const parsed = JSON.parse(row.tags) as string[]
          const updated = parsed.map((t) => (t === oldTag ? newTag : t))
          update.run(JSON.stringify(updated), row.post_id)
        }
      })
      rename()

      return { affectedPosts: rows.length }
    }
  )

  // reddit:deleteTag
  ipcMain.handle(
    IPC.REDDIT_DELETE_TAG,
    (_event, tag: string): { affectedPosts: number } => {
      const db = getDb()
      const rows = db
        .prepare(
          `SELECT post_id, tags FROM saved_posts
           WHERE tags IS NOT NULL
             AND EXISTS (SELECT 1 FROM json_each(saved_posts.tags) WHERE value = ?)`
        )
        .all(tag) as Array<{ post_id: string; tags: string }>

      const update = db.prepare('UPDATE saved_posts SET tags = ? WHERE post_id = ?')
      const remove = db.transaction(() => {
        for (const row of rows) {
          const parsed = JSON.parse(row.tags) as string[]
          const updated = parsed.filter((t) => t !== tag)
          update.run(updated.length > 0 ? JSON.stringify(updated) : null, row.post_id)
        }
      })
      remove()

      return { affectedPosts: rows.length }
    }
  )

  // reddit:pollNtfy
  ipcMain.handle(IPC.REDDIT_POLL_NTFY, async (): Promise<NtfyPollResult> => {
    const topic = getSetting('ntfy_topic')
    if (!topic) {
      throw new Error('NO_TOPIC_CONFIGURED')
    }
    const result = await triggerNtfyPoll()
    const lastPolledAt = parseInt(getSetting('ntfy_last_polled_at') ?? '0', 10) || 0
    return { postsIngested: result.postsIngested, messagesReceived: result.messagesReceived, lastPolledAt }
  })

  // reddit:clearSavedPosts
  ipcMain.handle(IPC.REDDIT_CLEAR_SAVED_POSTS, (): { deletedCount: number } => {
    const db = getDb()
    const result = db.prepare('DELETE FROM saved_posts').run()
    return { deletedCount: result.changes }
  })

  // reddit:getNtfyStaleness
  ipcMain.handle(IPC.REDDIT_GET_NTFY_STALENESS, (): NtfyStaleness => {
    const topicConfigured = Boolean(getSetting('ntfy_topic'))
    const raw = getSetting('ntfy_last_polled_at')
    const lastPolledAt = raw ? parseInt(raw, 10) || null : null
    const STALE_THRESHOLD_SEC = 86400
    const now = Math.floor(Date.now() / 1000)
    const isStale =
      topicConfigured && (lastPolledAt === null || now - lastPolledAt > STALE_THRESHOLD_SEC)
    return { lastPolledAt, isStale, topicConfigured }
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

  // settings:setNtfyPollInterval
  ipcMain.handle(
    IPC.SETTINGS_SET_NTFY_POLL_INTERVAL,
    (_event, minutes: number): IpcMutationResult => {
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
        return {
          ok: false,
          error: 'ntfy poll interval must be a whole number between 1 and 1440 minutes.'
        }
      }
      setSetting('ntfy_poll_interval_minutes', String(minutes))
      applyNtfyPollInterval(minutes)
      return { ok: true, error: null }
    }
  )

  // settings:getYouTubeViewConfig
  ipcMain.handle(IPC.SETTINGS_GET_YOUTUBE_VIEW_CONFIG, (_event, instanceId: string): YouTubeViewConfig => {
    const scopedKey = `${YOUTUBE_VIEW_CONFIG_KEY_PREFIX}${instanceId}`
    const scopedRaw = getSetting(scopedKey)
    const legacyRaw = getSetting('youtube_view_config')
    const raw = scopedRaw ?? legacyRaw

    if (!raw) {
      return DEFAULT_YOUTUBE_VIEW_CONFIG
    }

    try {
      const parsed = JSON.parse(raw) as Partial<YouTubeViewConfig>
      return { ...DEFAULT_YOUTUBE_VIEW_CONFIG, ...parsed }
    } catch {
      return DEFAULT_YOUTUBE_VIEW_CONFIG
    }
  })

  // settings:setYouTubeViewConfig
  ipcMain.handle(
    IPC.SETTINGS_SET_YOUTUBE_VIEW_CONFIG,
    (_event, instanceId: string, config: YouTubeViewConfig): IpcMutationResult => {
      if (!instanceId || instanceId.trim().length === 0) {
        return { ok: false, error: 'Instance ID is required.' }
      }

      setSetting(`${YOUTUBE_VIEW_CONFIG_KEY_PREFIX}${instanceId}`, JSON.stringify(config))
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
