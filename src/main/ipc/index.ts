import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { XMLParser } from 'fast-xml-parser'
import { getDb } from '../db/database'
import { deleteSetting, getSetting, setSetting } from '../settings/store'
import { IPC } from '../../shared/ipc-types'
import type {
  YtChannel,
  YtVideo,
  DigestPost,
  DigestWeekSummary,
  RedditDigestPostsRequest,
  RedditDigestBulkSetViewedRequest,
  RedditDigestViewedAnalyticsRequest,
  PruneDigestOptions,
  SavedPostSummary,
  SavedPost,
  SavedPostsBulkSetViewedRequest,
  SavedPostsViewedAnalyticsRequest,
  ViewedAnalytics,
  ViewedTrendPoint,
  NtfyStaleness,
  NtfyPollResult,
  ScriptWithLastRun,
  ScriptRunRecord,
  ScriptOutputChunk,
  ScriptNotification,
  ScriptNotificationsReadResult,
  WidgetLayout,
  WidgetInstance,
  ThemeInfo,
  IpcMutationResult,
  YouTubeCacheClearResult,
  YouTubeApiKeyStatus,
  YouTubeViewConfig,
  YouTubeVideosFilterOptions,
  YouTubeVideosFilterResult,
  ScriptScheduleInput,
  ScriptUpdateInput,
  ScriptRunCompleteEvent,
  MediaType,
  NotificationPreferences,
  DigestViewedChangedEvent
} from '../../shared/ipc-types'
import {
  applyYouTubePollInterval,
  triggerYouTubePollNow
} from '../sources/youtube/index'
import { applyNtfyPollInterval, triggerNtfyPoll } from '../sources/reddit/index'
import {
  activeRuns,
  ensureBundledRedditDigestScript,
  refreshScriptSchedule,
  runScriptById,
  setScriptEmitters,
  syncScriptsFromHomeDir
} from '../sources/scripts/index'
import {
  getNotificationPreferences,
  setNotificationPreferences
} from '../notifications/notification-service'

const YOUTUBE_API_KEY_SETTING = 'youtube_api_key_encrypted'
const YOUTUBE_VIEW_CONFIG_KEY_PREFIX = 'youtube_view_config:'
const REDDIT_DIGEST_SUBREDDITS_SETTING = 'reddit_digest_subreddits'
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

function emitRedditUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.REDDIT_UPDATED)
  }
}

function emitDigestViewedChanged(event: DigestViewedChangedEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.REDDIT_DIGEST_VIEWED_CHANGED, event)
  }
}

function buildDigestWhereClause(options?: {
  week_start_date?: string | null
  week_start_dates?: string[]
  subreddit_filter?: string[]
  search?: string
  hide_viewed?: boolean
}): { whereClause: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []

  if (options?.week_start_date) {
    conditions.push('week_start_date = ?')
    params.push(options.week_start_date)
  }

  if (options?.week_start_dates && options.week_start_dates.length > 0) {
    const placeholders = options.week_start_dates.map(() => '?').join(', ')
    conditions.push(`week_start_date IN (${placeholders})`)
    params.push(...options.week_start_dates)
  }

  if (options?.subreddit_filter && options.subreddit_filter.length > 0) {
    const placeholders = options.subreddit_filter.map(() => '?').join(', ')
    conditions.push(`subreddit IN (${placeholders})`)
    params.push(...options.subreddit_filter)
  }

  if (options?.search && options.search.trim().length > 0) {
    conditions.push('LOWER(title) LIKE ?')
    params.push(`%${options.search.trim().toLowerCase()}%`)
  }

  if (options?.hide_viewed) {
    conditions.push('viewed_at IS NULL')
  }

  return {
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  }
}

function buildSavedPostsQueryParts(options?: {
  search?: string
  subreddit_filter?: string[]
  tag_filter?: string[]
  source_filter?: string[]
  hide_viewed?: boolean
}): { fromClause: string; whereClause: string; params: unknown[] } {
  const conditions: string[] = []
  const params: unknown[] = []
  const joinFts = Boolean(options?.search)

  if (options?.search) {
    conditions.push('saved_posts_fts MATCH ?')
    params.push(options.search)
  }

  if (options?.subreddit_filter && options.subreddit_filter.length > 0) {
    const placeholders = options.subreddit_filter.map(() => '?').join(', ')
    conditions.push(`sp.subreddit IN (${placeholders})`)
    params.push(...options.subreddit_filter)
  }

  if (options?.source_filter && options.source_filter.length > 0) {
    const placeholders = options.source_filter.map(() => '?').join(', ')
    conditions.push(`sp.source IN (${placeholders})`)
    params.push(...options.source_filter)
  }

  if (options?.tag_filter && options.tag_filter.length > 0) {
    const tagConditions = options.tag_filter
      .map(() => 'EXISTS (SELECT 1 FROM json_each(sp.tags) WHERE value = ?)')
      .join(' OR ')
    conditions.push(`(${tagConditions})`)
    params.push(...options.tag_filter)
  }

  if (options?.hide_viewed) {
    conditions.push('sp.viewed_at IS NULL')
  }

  const fromClause = joinFts
    ? 'FROM saved_posts sp JOIN saved_posts_fts ON sp.rowid = saved_posts_fts.rowid'
    : 'FROM saved_posts sp'

  return {
    fromClause,
    whereClause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params
  }
}

function buildViewedAnalytics(
  total: number,
  viewed: number,
  trendRows: Array<{ day: string; viewed_count: number }>
): ViewedAnalytics {
  const unviewed = Math.max(0, total - viewed)
  const viewedRate = total > 0 ? viewed / total : 0
  return {
    total,
    viewed,
    unviewed,
    viewed_rate: viewedRate,
    trend: trendRows as ViewedTrendPoint[]
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
  hideWatched: false,
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

async function validateRedditDigestSubreddit(subreddit: string): Promise<IpcMutationResult> {
  const normalized = subreddit.trim().replace(/^r\//i, '').toLowerCase()
  if (!normalized) {
    return { ok: false, error: 'Subreddit name is required.' }
  }
  if (!/^[a-z0-9_]+$/i.test(normalized)) {
    return { ok: false, error: 'Subreddits may contain letters, numbers, and underscores only.' }
  }

  const params = new URLSearchParams({ t: 'week', limit: '1' })
  const response = await fetch(`https://www.reddit.com/r/${normalized}/top.json?${params.toString()}`, {
    headers: { 'User-Agent': 'personal-news-digest/1.0' }
  })

  if (!response.ok) {
    return {
      ok: false,
      error:
        response.status === 404
          ? `r/${normalized} was not found.`
          : `Reddit returned HTTP ${response.status} for r/${normalized}.`
    }
  }

  const payload = (await response.json()) as {
    data?: { children?: Array<unknown> }
  }
  const children = payload.data?.children
  if (!Array.isArray(children) || children.length === 0) {
    return {
      ok: false,
      error: `r/${normalized} currently returned no top posts for the default digest window.`
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
    sort_order: 0,
    notify_new_videos: 1,
    notify_live_start: 1
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
    sort_order: 0,
    notify_new_videos: 1,
    notify_live_start: 1
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
      sort_order: 0,
      notify_new_videos: 1,
      notify_live_start: 1
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
    sort_order: 0,
    notify_new_videos: 1,
    notify_live_start: 1
  }
}

interface ScheduleDef {
  type: 'on_app_start' | 'interval' | 'daily' | 'weekly' | 'monthly' | 'fixed_time'
  minutes?: number
  run_on_app_start?: boolean
  hour?: number
  minute?: number
  days_of_week?: number[]
  day_of_month?: number
}

function normalizeDaysOfWeek(input: number[] | undefined): number[] {
  const source = Array.isArray(input) ? input : []
  const unique = new Set<number>()
  for (const value of source) {
    const day = Math.floor(value)
    if (Number.isFinite(day) && day >= 0 && day <= 6) {
      unique.add(day)
    }
  }
  return [...unique].sort((a, b) => a - b)
}

function getNormalizedTime(input: ScriptScheduleInput):
  | { hour: number; minute: number; error: null }
  | { hour: null; minute: null; error: string } {
  const hour = Math.floor(input.hour ?? -1)
  const minute = Math.floor(input.minute ?? -1)
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) {
    return { hour: null, minute: null, error: 'Hour must be between 0 and 23.' }
  }
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) {
    return { hour: null, minute: null, error: 'Minute must be between 0 and 59.' }
  }
  return { hour, minute, error: null }
}

function normalizeScriptSchedule(input: ScriptScheduleInput): {
  scheduleJson: string | null
  isManual: boolean
  error: string | null
} {
  if (input.type === 'manual') {
    return { scheduleJson: null, isManual: true, error: null }
  }

  if (input.type === 'on_app_start') {
    return {
      scheduleJson: JSON.stringify({ type: 'on_app_start' satisfies ScheduleDef['type'] }),
      isManual: false,
      error: null
    }
  }

  if (input.type === 'interval') {
    const minutes = Math.floor(input.minutes ?? 0)
    const runOnAppStart = Boolean(input.runOnAppStart)
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
      return { scheduleJson: null, isManual: false, error: 'Interval minutes must be between 1 and 1440.' }
    }
    return {
      scheduleJson: JSON.stringify({
        type: 'interval' satisfies ScheduleDef['type'],
        minutes,
        run_on_app_start: runOnAppStart
      }),
      isManual: false,
      error: null
    }
  }

  if (input.type === 'fixed_time' || input.type === 'daily') {
    const time = getNormalizedTime(input)
    if (time.error) {
      return { scheduleJson: null, isManual: false, error: time.error }
    }
    return {
      scheduleJson: JSON.stringify({
        type: 'daily' satisfies ScheduleDef['type'],
        hour: time.hour,
        minute: time.minute
      }),
      isManual: false,
      error: null
    }
  }

  if (input.type === 'weekly') {
    const time = getNormalizedTime(input)
    if (time.error) {
      return { scheduleJson: null, isManual: false, error: time.error }
    }
    const days = normalizeDaysOfWeek(input.daysOfWeek)
    if (days.length === 0) {
      return { scheduleJson: null, isManual: false, error: 'Select at least one day of week.' }
    }
    return {
      scheduleJson: JSON.stringify({
        type: 'weekly' satisfies ScheduleDef['type'],
        hour: time.hour,
        minute: time.minute,
        days_of_week: days
      }),
      isManual: false,
      error: null
    }
  }

  if (input.type === 'monthly') {
    const time = getNormalizedTime(input)
    if (time.error) {
      return { scheduleJson: null, isManual: false, error: time.error }
    }
    const dayOfMonth = Math.floor(input.dayOfMonth ?? 1)
    if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return { scheduleJson: null, isManual: false, error: 'Day of month must be between 1 and 31.' }
    }
    return {
      scheduleJson: JSON.stringify({
        type: 'monthly' satisfies ScheduleDef['type'],
        hour: time.hour,
        minute: time.minute,
        day_of_month: dayOfMonth
      }),
      isManual: false,
      error: null
    }
  }

  return { scheduleJson: null, isManual: false, error: 'Unsupported schedule type.' }
}

function computeIsStale(
  schedule: string | null,
  lastSuccessFinishedAt: number | null,
  now: number
): boolean {
  if (!schedule) return false
  if (lastSuccessFinishedAt === null) return false
  let def: ScheduleDef
  try {
    def = JSON.parse(schedule) as ScheduleDef
  } catch {
    return false
  }
  if (def.type === 'interval' && def.minutes) {
    return now - lastSuccessFinishedAt > def.minutes * 60 * 2
  }
  if (def.type === 'fixed_time' || def.type === 'daily') {
    return now - lastSuccessFinishedAt > 25 * 3600
  }
  if (def.type === 'weekly') {
    return now - lastSuccessFinishedAt > 8 * 24 * 3600
  }
  if (def.type === 'monthly') {
    return now - lastSuccessFinishedAt > 40 * 24 * 3600
  }
  return false
}

function normalizeYouTubeVideosFilterOptions(
  options: YouTubeVideosFilterOptions | undefined
): Required<Pick<YouTubeVideosFilterOptions, 'sortDir' | 'limit' | 'offset'>> &
  Pick<YouTubeVideosFilterOptions, 'channelId' | 'search' | 'hideWatched'> & { mediaTypes: MediaType[] } {
  const validMediaTypes = new Set<MediaType>(['video', 'short', 'upcoming_stream', 'live'])
  const normalizedMediaTypes = Array.isArray(options?.mediaTypes)
    ? options.mediaTypes.filter((mediaType): mediaType is MediaType => validMediaTypes.has(mediaType))
    : []

  const rawSortDir = options?.sortDir === 'asc' ? 'asc' : 'desc'
  const rawLimit = Number.isFinite(options?.limit) ? Math.floor(options?.limit ?? 50) : 50
  const rawOffset = Number.isFinite(options?.offset) ? Math.floor(options?.offset ?? 0) : 0

  return {
    channelId: options?.channelId?.trim() || undefined,
    search: options?.search?.trim() || undefined,
    hideWatched: options?.hideWatched === true,
    mediaTypes: normalizedMediaTypes,
    sortDir: rawSortDir,
    limit: Math.min(Math.max(rawLimit, 1), 200),
    offset: Math.max(rawOffset, 0)
  }
}

export function registerIpcHandlers(): void {
  // Wire script output emitter
  function emitScriptsOutput(chunk: ScriptOutputChunk): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.SCRIPTS_OUTPUT, chunk)
    }
  }
  function emitScriptsUpdated(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.SCRIPTS_UPDATED)
    }
  }
  function emitScriptsRunComplete(event: ScriptRunCompleteEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.SCRIPTS_RUN_COMPLETE, event)
    }
  }
  setScriptEmitters(emitScriptsOutput, emitScriptsUpdated, emitScriptsRunComplete, emitRedditUpdated)

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

  // youtube:getVideosFiltered
  ipcMain.handle(
    IPC.YOUTUBE_GET_VIDEOS_FILTERED,
    (_event, options?: YouTubeVideosFilterOptions): YouTubeVideosFilterResult => {
      const db = getDb()
      const normalized = normalizeYouTubeVideosFilterOptions(options)
      const whereClauses: string[] = []
      const whereParams: Array<string> = []

      if (normalized.channelId) {
        whereClauses.push('channel_id = ?')
        whereParams.push(normalized.channelId)
      }

      if (normalized.mediaTypes.length > 0) {
        const placeholders = normalized.mediaTypes.map(() => '?').join(', ')
        whereClauses.push(`media_type IN (${placeholders})`)
        whereParams.push(...normalized.mediaTypes)
      }

      if (normalized.search) {
        whereClauses.push('LOWER(title) LIKE ?')
        whereParams.push(`%${normalized.search.toLowerCase()}%`)
      }

      if (normalized.hideWatched) {
        whereClauses.push('watched_at IS NULL')
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : ''
      const orderSql = normalized.sortDir === 'asc' ? 'ASC' : 'DESC'

      const totalRow = db
        .prepare(`SELECT COUNT(*) AS total FROM yt_videos ${whereSql}`)
        .get(...whereParams) as { total: number }

      const videos = db
        .prepare(
          `SELECT * FROM yt_videos ${whereSql} ORDER BY published_at ${orderSql} LIMIT ? OFFSET ?`
        )
        .all(...whereParams, normalized.limit, normalized.offset) as YtVideo[]

      return {
        videos,
        total: totalRow.total
      }
    }
  )

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

  // youtube:setVideoWatched
  ipcMain.handle(
    IPC.YOUTUBE_SET_VIDEO_WATCHED,
    (_event, videoId: string, watched: boolean): IpcMutationResult => {
      const db = getDb()
      const watchedAt = watched ? Math.floor(Date.now() / 1000) : null
      const result = db
        .prepare('UPDATE yt_videos SET watched_at = ? WHERE video_id = ?')
        .run(watchedAt, videoId)
      if (result.changes === 0) {
        return { ok: false, error: 'Video not found.' }
      }
      return { ok: true, error: null }
    }
  )

  // youtube:markChannelWatched
  ipcMain.handle(
    IPC.YOUTUBE_MARK_CHANNEL_WATCHED,
    (_event, channelId: string): IpcMutationResult => {
      const db = getDb()
      const watchedAt = Math.floor(Date.now() / 1000)
      db.prepare('UPDATE yt_videos SET watched_at = ? WHERE channel_id = ? AND watched_at IS NULL').run(
        watchedAt,
        channelId
      )
      emitYoutubeUpdated()
      return { ok: true, error: null }
    }
  )

  // reddit:getDigestPosts
  ipcMain.handle(IPC.REDDIT_GET_DIGEST_POSTS, (_event, options?: RedditDigestPostsRequest): DigestPost[] => {
    const db = getDb()
    const { whereClause, params } = buildDigestWhereClause(options)
    return db
      .prepare(`SELECT * FROM reddit_digest_posts ${whereClause} ORDER BY week_start_date DESC, fetched_at DESC`)
      .all(...params) as DigestPost[]
  })

  // reddit:setDigestPostViewed
  ipcMain.handle(
    IPC.REDDIT_SET_DIGEST_POST_VIEWED,
    (_event, postId: string, weekStartDate: string, viewed: boolean): IpcMutationResult => {
      const db = getDb()
      const viewedAt = viewed ? Math.floor(Date.now() / 1000) : null
      const result = db
        .prepare('UPDATE reddit_digest_posts SET viewed_at = ? WHERE post_id = ? AND week_start_date = ?')
        .run(viewedAt, postId, weekStartDate)
      if (result.changes === 0) {
        return { ok: false, error: 'Post not found.' }
      }
      emitDigestViewedChanged({
        post_id: postId,
        week_start_date: weekStartDate,
        viewed_at: viewedAt
      })
      return { ok: true, error: null }
    }
  )

  // reddit:bulkSetDigestViewed
  ipcMain.handle(
    IPC.REDDIT_BULK_SET_DIGEST_VIEWED,
    (
      _event,
      options: RedditDigestBulkSetViewedRequest
    ): { ok: boolean; error: string | null; updatedCount: number } => {
      const db = getDb()
      const viewedAt = options.viewed ? Math.floor(Date.now() / 1000) : null
      const { whereClause, params } = buildDigestWhereClause(options)
      const stateClause = options.viewed ? 'viewed_at IS NULL' : 'viewed_at IS NOT NULL'
      const mergeWhere = whereClause ? `${whereClause} AND ${stateClause}` : `WHERE ${stateClause}`
      const result = db
        .prepare(`UPDATE reddit_digest_posts SET viewed_at = ? ${mergeWhere}`)
        .run(viewedAt, ...params)
      emitRedditUpdated()
      return { ok: true, error: null, updatedCount: result.changes }
    }
  )

  // reddit:getDigestViewedAnalytics
  ipcMain.handle(
    IPC.REDDIT_GET_DIGEST_VIEWED_ANALYTICS,
    (_event, options?: RedditDigestViewedAnalyticsRequest): ViewedAnalytics => {
      const db = getDb()
      const { whereClause, params } = buildDigestWhereClause(options)

      const totals = db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN viewed_at IS NOT NULL THEN 1 ELSE 0 END) AS viewed
           FROM reddit_digest_posts ${whereClause}`
        )
        .get(...params) as { total: number; viewed: number | null }

      const trend = db
        .prepare(
          `SELECT date(viewed_at, 'unixepoch') AS day, COUNT(*) AS viewed_count
           FROM reddit_digest_posts
           ${whereClause ? `${whereClause} AND viewed_at IS NOT NULL` : 'WHERE viewed_at IS NOT NULL'}
           AND viewed_at >= strftime('%s', 'now', '-6 days')
           GROUP BY day
           ORDER BY day ASC`
        )
        .all(...params) as Array<{ day: string; viewed_count: number }>

      return buildViewedAnalytics(totals.total ?? 0, totals.viewed ?? 0, trend)
    }
  )

  // reddit:getDigestWeeks
  ipcMain.handle(IPC.REDDIT_GET_DIGEST_WEEKS, (): DigestWeekSummary[] => {
    const db = getDb()
    return db
      .prepare(
        `SELECT week_start_date, COUNT(*) AS post_count
         FROM reddit_digest_posts
         GROUP BY week_start_date
         ORDER BY week_start_date DESC`
      )
      .all() as DigestWeekSummary[]
  })

  // reddit:pruneDigestPosts
  ipcMain.handle(
    IPC.REDDIT_PRUNE_DIGEST_POSTS,
    (_event, options?: PruneDigestOptions): { ok: boolean; error: string | null; deletedCount: number } => {
      const db = getDb()

      if (options?.delete_week) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(options.delete_week)) {
          return { ok: false, error: 'Invalid week_start_date.', deletedCount: 0 }
        }
        const result = db.prepare('DELETE FROM reddit_digest_posts WHERE week_start_date = ?').run(options.delete_week)
        emitRedditUpdated()
        return { ok: true, error: null, deletedCount: result.changes }
      }

      if (typeof options?.keep_weeks === 'number') {
        const keepWeeks = Math.floor(options.keep_weeks)
        if (!Number.isFinite(keepWeeks) || keepWeeks < 1) {
          return { ok: false, error: 'keep_weeks must be at least 1.', deletedCount: 0 }
        }

        const weeks = db
          .prepare(
            `SELECT DISTINCT week_start_date
             FROM reddit_digest_posts
             ORDER BY week_start_date DESC`
          )
          .all() as Array<{ week_start_date: string }>

        if (weeks.length <= keepWeeks) {
          return { ok: true, error: null, deletedCount: 0 }
        }

        const weeksToKeep = weeks.slice(0, keepWeeks).map((row) => row.week_start_date)
        const placeholders = weeksToKeep.map(() => '?').join(', ')
        const result = db
          .prepare(`DELETE FROM reddit_digest_posts WHERE week_start_date NOT IN (${placeholders})`)
          .run(...weeksToKeep)
        emitRedditUpdated()
        return { ok: true, error: null, deletedCount: result.changes }
      }

      return { ok: false, error: 'No prune operation was specified.', deletedCount: 0 }
    }
  )

  // reddit:getSavedPostsSummary
  ipcMain.handle(IPC.REDDIT_GET_SAVED_POSTS_SUMMARY, (): SavedPostSummary[] => {
    const db = getDb()
    return db
      .prepare(
        'SELECT post_id, title, permalink, subreddit, source, saved_at FROM saved_posts ORDER BY saved_at DESC LIMIT 5'
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
        source_filter?: string[]
        hide_viewed?: boolean
        sort_by?: 'saved_at' | 'score'
        sort_dir?: 'asc' | 'desc'
        limit?: number
        offset?: number
      }
    ): { posts: SavedPost[]; total: number } => {
      const db = getDb()
      const subredditFilter = options?.subreddit_filter ?? (options?.subreddit ? [options.subreddit] : undefined)
      const tagFilter = options?.tag_filter ?? (options?.tag ? [options.tag] : undefined)
      const { fromClause, whereClause, params } = buildSavedPostsQueryParts({
        search: options?.search,
        subreddit_filter: subredditFilter,
        tag_filter: tagFilter,
        source_filter: options?.source_filter,
        hide_viewed: options?.hide_viewed
      })
      const limit = Math.min(options?.limit ?? 50, 500) // Cap at 500
      const offset = options?.offset ?? 0

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
        source: string
        saved_at: number
        viewed_at: number | null
        note: string | null
        tags: string | null
      }>

      const posts: SavedPost[] = rows.map((row) => ({
        ...row,
        source: row.source as SavedPost['source'],
        tags: row.tags ? (JSON.parse(row.tags) as string[]) : []
      }))

      return { posts, total: countRow.cnt }
    }
  )

  // reddit:setSavedPostViewed
  ipcMain.handle(
    IPC.REDDIT_SET_SAVED_POST_VIEWED,
    (_event, postId: string, viewed: boolean): IpcMutationResult => {
      const db = getDb()
      const viewedAt = viewed ? Math.floor(Date.now() / 1000) : null
      const result = db.prepare('UPDATE saved_posts SET viewed_at = ? WHERE post_id = ?').run(viewedAt, postId)
      if (result.changes === 0) {
        return { ok: false, error: 'Saved post not found.' }
      }
      emitRedditUpdated()
      return { ok: true, error: null }
    }
  )

  // reddit:bulkSetSavedViewed
  ipcMain.handle(
    IPC.REDDIT_BULK_SET_SAVED_VIEWED,
    (
      _event,
      options: SavedPostsBulkSetViewedRequest
    ): { ok: boolean; error: string | null; updatedCount: number } => {
      const db = getDb()
      const viewedAt = options.viewed ? Math.floor(Date.now() / 1000) : null
      const { fromClause, whereClause, params } = buildSavedPostsQueryParts(options)
      const stateClause = options.viewed ? 'sp.viewed_at IS NULL' : 'sp.viewed_at IS NOT NULL'
      const mergeWhere = whereClause ? `${whereClause} AND ${stateClause}` : `WHERE ${stateClause}`
      const ids = db
        .prepare(`SELECT sp.post_id ${fromClause} ${mergeWhere}`)
        .all(...params) as Array<{ post_id: string }>

      if (ids.length === 0) {
        return { ok: true, error: null, updatedCount: 0 }
      }

      const update = db.prepare('UPDATE saved_posts SET viewed_at = ? WHERE post_id = ?')
      const tx = db.transaction(() => {
        let updatedCount = 0
        for (const row of ids) {
          const result = update.run(viewedAt, row.post_id)
          updatedCount += result.changes
        }
        return updatedCount
      })

      const updatedCount = tx()
      emitRedditUpdated()
      return { ok: true, error: null, updatedCount }
    }
  )

  // reddit:getSavedViewedAnalytics
  ipcMain.handle(
    IPC.REDDIT_GET_SAVED_VIEWED_ANALYTICS,
    (_event, options?: SavedPostsViewedAnalyticsRequest): ViewedAnalytics => {
      const db = getDb()
      const { fromClause, whereClause, params } = buildSavedPostsQueryParts(options)

      const totals = db
        .prepare(
          `SELECT
             COUNT(*) AS total,
             SUM(CASE WHEN sp.viewed_at IS NOT NULL THEN 1 ELSE 0 END) AS viewed
           ${fromClause} ${whereClause}`
        )
        .get(...params) as { total: number; viewed: number | null }

      const trend = db
        .prepare(
          `SELECT date(sp.viewed_at, 'unixepoch') AS day, COUNT(*) AS viewed_count
           ${fromClause}
           ${whereClause ? `${whereClause} AND sp.viewed_at IS NOT NULL` : 'WHERE sp.viewed_at IS NOT NULL'}
           AND sp.viewed_at >= strftime('%s', 'now', '-6 days')
           GROUP BY day
           ORDER BY day ASC`
        )
        .all(...params) as Array<{ day: string; viewed_count: number }>

      return buildViewedAnalytics(totals.total ?? 0, totals.viewed ?? 0, trend)
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

  // scripts:getAll — includes is_stale computed from last successful run
  ipcMain.handle(IPC.SCRIPTS_GET_ALL, (): ScriptWithLastRun[] => {
    const db = getDb()
    syncScriptsFromHomeDir(db)
    const rows = db
      .prepare(
        `SELECT s.*,
                r.started_at,
                r.finished_at,
                r.exit_code,
                rs.finished_at AS last_success_finished_at
         FROM scripts s
         LEFT JOIN script_runs r ON r.id = (
           SELECT id FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1
         )
         LEFT JOIN script_runs rs ON rs.id = (
           SELECT id FROM script_runs WHERE script_id = s.id AND exit_code = 0
           ORDER BY started_at DESC LIMIT 1
         )`
      )
      .all() as Array<ScriptWithLastRun & { last_success_finished_at: number | null }>

    const now = Math.floor(Date.now() / 1000)
    return rows.map(({ last_success_finished_at, ...row }) => ({
      ...row,
      is_stale: computeIsStale(row.schedule, last_success_finished_at, now)
    }))
  })

  // scripts:update
  ipcMain.handle(IPC.SCRIPTS_UPDATE, (_event, input: ScriptUpdateInput): IpcMutationResult => {
    if (!Number.isInteger(input.id) || input.id <= 0) {
      return { ok: false, error: 'Invalid script ID.' }
    }

    const normalizedName = input.name.trim()
    const normalizedPath = input.file_path.trim()
    const normalizedInterpreter = input.interpreter.trim()
    const normalizedDescription = input.description?.trim() || null
    const normalizedArgs = input.args?.trim() || null

    if (!normalizedName) {
      return { ok: false, error: 'Name is required.' }
    }
    if (!normalizedPath) {
      return { ok: false, error: 'File path is required.' }
    }
    if (!normalizedInterpreter) {
      return { ok: false, error: 'Interpreter is required.' }
    }

    const schedule = normalizeScriptSchedule(input.schedule)
    if (schedule.error) {
      return { ok: false, error: schedule.error }
    }

    if (schedule.isManual && input.enabled) {
      return { ok: false, error: 'Manual schedule cannot have auto-run enabled.' }
    }

    const db = getDb()
    const result = db
      .prepare(
        `UPDATE scripts
         SET name = ?, description = ?, file_path = ?, interpreter = ?, args = ?, schedule = ?, enabled = ?
         WHERE id = ?`
      )
      .run(
        normalizedName,
        normalizedDescription,
        normalizedPath,
        normalizedInterpreter,
        normalizedArgs,
        schedule.scheduleJson,
        input.enabled ? 1 : 0,
        input.id
      )

    if (result.changes === 0) {
      return { ok: false, error: 'Script not found.' }
    }

    refreshScriptSchedule(db, input.id, { runOnAppStart: false })
    emitScriptsUpdated()
    return { ok: true, error: null }
  })

  // scripts:setSchedule
  ipcMain.handle(
    IPC.SCRIPTS_SET_SCHEDULE,
    (_event, scriptId: number, scheduleInput: ScriptScheduleInput): IpcMutationResult => {
      if (!Number.isInteger(scriptId) || scriptId <= 0) {
        return { ok: false, error: 'Invalid script ID.' }
      }

      const schedule = normalizeScriptSchedule(scheduleInput)
      if (schedule.error) {
        return { ok: false, error: schedule.error }
      }

      const db = getDb()
      const existing = db.prepare('SELECT enabled FROM scripts WHERE id = ?').get(scriptId) as
        | { enabled: number }
        | undefined

      if (!existing) {
        return { ok: false, error: 'Script not found.' }
      }

      if (schedule.isManual && existing.enabled === 1) {
        return { ok: false, error: 'Manual schedule cannot have auto-run enabled.' }
      }

      const result = db
        .prepare('UPDATE scripts SET schedule = ? WHERE id = ?')
        .run(schedule.scheduleJson, scriptId)

      if (result.changes === 0) {
        return { ok: false, error: 'Script not found.' }
      }

      refreshScriptSchedule(db, scriptId, { runOnAppStart: false })
      emitScriptsUpdated()
      return { ok: true, error: null }
    }
  )

  // scripts:setEnabled
  ipcMain.handle(IPC.SCRIPTS_SET_ENABLED, (_event, scriptId: number, enabled: boolean): IpcMutationResult => {
    if (!Number.isInteger(scriptId) || scriptId <= 0) {
      return { ok: false, error: 'Invalid script ID.' }
    }

    const db = getDb()
    const existing = db.prepare('SELECT schedule FROM scripts WHERE id = ?').get(scriptId) as
      | { schedule: string | null }
      | undefined

    if (!existing) {
      return { ok: false, error: 'Script not found.' }
    }

    if (!existing.schedule && enabled) {
      return { ok: false, error: 'Cannot enable auto-run when schedule is manual.' }
    }

    const result = db
      .prepare('UPDATE scripts SET enabled = ? WHERE id = ?')
      .run(enabled ? 1 : 0, scriptId)

    if (result.changes === 0) {
      return { ok: false, error: 'Script not found.' }
    }

    refreshScriptSchedule(db, scriptId, { runOnAppStart: false })
    emitScriptsUpdated()
    return { ok: true, error: null }
  })

  // scripts:run
  ipcMain.handle(IPC.SCRIPTS_RUN, async (_event, scriptId: number): Promise<{ ok: boolean; error: string | null }> => {
    if (!Number.isInteger(scriptId) || scriptId <= 0) {
      return { ok: false, error: 'Invalid script ID.' }
    }
    if (activeRuns.has(scriptId)) {
      return { ok: false, error: 'Script is already running.' }
    }
    const db = getDb()
    syncScriptsFromHomeDir(db)
    const script = db
      .prepare(
        `SELECT s.*, r.started_at, r.finished_at, r.exit_code, 0 AS is_stale
         FROM scripts s
         LEFT JOIN script_runs r ON r.id = (
           SELECT id FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1
         )
         WHERE s.id = ?`
      )
      .get(scriptId) as ScriptWithLastRun | undefined
    if (!script) {
      return { ok: false, error: `Script ${scriptId} not found.` }
    }
    runScriptById(db, script).catch((err: Error) => {
      console.error(`[IPC] scripts:run error for script ${scriptId}:`, err)
    })
    return { ok: true, error: null }
  })

  // scripts:cancel
  ipcMain.handle(IPC.SCRIPTS_CANCEL, (_event, scriptId: number): { ok: boolean; error: string | null } => {
    if (!Number.isInteger(scriptId) || scriptId <= 0) {
      return { ok: false, error: 'Invalid script ID.' }
    }
    const run = activeRuns.get(scriptId)
    if (!run) {
      return { ok: false, error: 'Script is not running.' }
    }
    try {
      run.child.kill()
    } catch (err) {
      return { ok: false, error: `Failed to kill process: ${(err as Error).message}` }
    }
    return { ok: true, error: null }
  })

  // scripts:getRunHistory
  ipcMain.handle(IPC.SCRIPTS_GET_RUN_HISTORY, (_event, scriptId: number): ScriptRunRecord[] => {
    if (!Number.isInteger(scriptId) || scriptId <= 0) {
      return []
    }
    const db = getDb()
    return db
      .prepare(
        `SELECT id, script_id, started_at, finished_at, exit_code, stdout, stderr
         FROM script_runs
         WHERE script_id = ?
         ORDER BY started_at DESC
         LIMIT 50`
      )
      .all(scriptId) as ScriptRunRecord[]
  })

  // scripts:getNotifications
  ipcMain.handle(IPC.SCRIPTS_GET_NOTIFICATIONS, (_event, limit?: number): ScriptNotification[] => {
    const db = getDb()
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit as number, 1), 200) : 100
    return db
      .prepare(
        `SELECT id, script_id, run_id, severity, message, is_read, created_at, read_at
         FROM script_notifications
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(safeLimit) as ScriptNotification[]
  })

  // scripts:markNotificationsRead
  ipcMain.handle(
    IPC.SCRIPTS_MARK_NOTIFICATIONS_READ,
    (_event, ids?: number[]): ScriptNotificationsReadResult => {
      const db = getDb()
      const now = Math.floor(Date.now() / 1000)

      if (typeof ids === 'undefined') {
        const result = db
          .prepare(
            `UPDATE script_notifications
             SET is_read = 1, read_at = ?
             WHERE is_read = 0`
          )
          .run(now)
        return { ok: true, error: null, updatedCount: result.changes }
      }

      if (ids.length === 0) {
        return { ok: true, error: null, updatedCount: 0 }
      }

      const validIds = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))]
      if (validIds.length === 0) {
        return { ok: false, error: 'No valid notification IDs provided.', updatedCount: 0 }
      }

      const placeholders = validIds.map(() => '?').join(', ')
      const result = db
        .prepare(
          `UPDATE script_notifications
           SET is_read = 1, read_at = ?
           WHERE is_read = 0 AND id IN (${placeholders})`
        )
        .run(now, ...validIds)

      return { ok: true, error: null, updatedCount: result.changes }
    }
  )

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

  // reddit:validateDigestSubreddit
  ipcMain.handle(
    IPC.REDDIT_VALIDATE_DIGEST_SUBREDDIT,
    async (_event, subreddit: string): Promise<IpcMutationResult> => {
      try {
        return await validateRedditDigestSubreddit(subreddit)
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Failed to validate subreddit.'
        }
      }
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

  // settings:getNotificationPrefs
  ipcMain.handle(IPC.SETTINGS_GET_NOTIFICATION_PREFS, (): NotificationPreferences => {
    return getNotificationPreferences()
  })

  // settings:setNotificationPrefs
  ipcMain.handle(
    IPC.SETTINGS_SET_NOTIFICATION_PREFS,
    (_event, prefs: NotificationPreferences): IpcMutationResult => {
      try {
        setNotificationPreferences(prefs)
        return { ok: true, error: null }
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to save notification preferences.'
        }
      }
    }
  )

  // youtube:setChannelNotify
  ipcMain.handle(
    IPC.YOUTUBE_SET_CHANNEL_NOTIFY,
    (
      _event,
      channelId: string,
      notifyNewVideos: boolean,
      notifyLiveStart: boolean
    ): IpcMutationResult => {
      const db = getDb()
      const result = db
        .prepare(
          'UPDATE yt_channels SET notify_new_videos = ?, notify_live_start = ? WHERE channel_id = ?'
        )
        .run(notifyNewVideos ? 1 : 0, notifyLiveStart ? 1 : 0, channelId)
      if ((result.changes as number) === 0) {
        return { ok: false, error: 'Channel not found.' }
      }
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
    const previousValue =
      key === 'script_home_dir' || key === REDDIT_DIGEST_SUBREDDITS_SETTING ? getSetting(key) : null
    setSetting(key, value)
    if (key === 'script_home_dir' && previousValue !== value) {
      const db = getDb()
      db.prepare('DELETE FROM scripts').run()
      ensureBundledRedditDigestScript(db)
      syncScriptsFromHomeDir(db)
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC.SCRIPTS_UPDATED)
      }
    }
    if (key === REDDIT_DIGEST_SUBREDDITS_SETTING && previousValue !== value) {
      const db = getDb()
      const scriptId = ensureBundledRedditDigestScript(db)
      if (scriptId !== null) {
        refreshScriptSchedule(db, scriptId, { runOnAppStart: false })
      }
      emitScriptsUpdated()
    }

    if (key === 'app_launch_at_login') {
      app.setLoginItemSettings({
        openAtLogin: value === '1' || value === 'true'
      })
    }
  })

  // shell:openExternal
  ipcMain.handle(IPC.SHELL_OPEN_EXTERNAL, (_event, url: string): void => {
    shell.openExternal(url)
  })

  // shell:openPath
  ipcMain.handle(IPC.SHELL_OPEN_PATH, (_event, folderPath: string): Promise<string> => {
    return shell.openPath(folderPath)
  })

  // dialog:showOpenFolder
  ipcMain.handle(IPC.DIALOG_SHOW_OPEN_FOLDER, async (): Promise<string | null> => {
    const win = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win ?? new BrowserWindow({ show: false }), {
      properties: ['openDirectory']
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
}
