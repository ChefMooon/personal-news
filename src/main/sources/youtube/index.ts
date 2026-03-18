import type Database from 'better-sqlite3'
import cron, { type ScheduledTask } from 'node-cron'
import { XMLParser } from 'fast-xml-parser'
import { BrowserWindow } from 'electron'
import { IPC, type YouTubePollDebugItem, type NormalizedFeedEntry, type ParsedFeed, type MediaType } from '../../../shared/ipc-types'
import type { DataSourceModule } from '../registry'

let activePollIntervalMinutes = 15
let dbRef: Database.Database | null = null
let pollTask: ScheduledTask | null = null

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ''
})

interface ParsedFeedEntry {
  videoId: string
  title: string
  publishedAt: number
  thumbnailUrl: string | null
}

const pollDebugByChannel = new Map<string, YouTubePollDebugItem>()

function emitYoutubeUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.YOUTUBE_UPDATED)
  }
}

function getCronExpression(minutes: number): string {
  return `*/${minutes} * * * *`
}

interface RawLink {
  href?: string
  rel?: string
}

interface RawEntry {
  'yt:videoId'?: string
  title?: string
  link?: RawLink | RawLink[]
  published?: string
  updated?: string
  'media:group'?: {
    'media:thumbnail'?: { url?: string; width?: string | number; height?: string | number } | Array<{ url?: string; width?: string | number; height?: string | number }>
    'media:description'?: string
    'media:community'?: {
      'media:starRating'?: { count?: string | number; average?: string | number }
      'media:statistics'?: { views?: string | number }
    }
  }
}

interface RawFeed {
  'yt:channelId'?: string
  title?: string
  link?: RawLink | RawLink[]
  author?: { name?: string; uri?: string } | Array<{ name?: string; uri?: string }>
  published?: string
  entry?: RawEntry | RawEntry[]
}

function extractLinkHref(link: RawLink | RawLink[] | undefined, preferRel?: string): string | null {
  if (!link) return null
  if (Array.isArray(link)) {
    if (preferRel) {
      const found = link.find((l) => l.rel === preferRel)
      if (found?.href) return found.href
    }
    return link[0]?.href ?? null
  }
  return link.href ?? null
}

function classifyMediaType(url: string | null): MediaType {
  if (!url) return 'video'
  if (url.includes('/shorts/')) return 'short'
  return 'video'
}

function parseFeedXml(
  feedXml: string,
  fallbackChannelId: string,
  fallbackChannelName: string
): { dbEntries: ParsedFeedEntry[]; normalizedFeed: ParsedFeed } {
  const raw = parser.parse(feedXml) as { feed?: RawFeed }
  const feed = raw.feed

  const channelId = feed?.['yt:channelId']?.trim() || fallbackChannelId
  const channelTitle =
    (typeof feed?.title === 'string' ? feed.title.trim() : undefined) || fallbackChannelName
  const channelUrl =
    extractLinkHref(feed?.link, 'alternate') ??
    `https://www.youtube.com/channel/${channelId}`
  const channelPublishedAt = typeof feed?.published === 'string' ? feed.published : null

  const channel = { id: channelId, title: channelTitle, url: channelUrl, publishedAt: channelPublishedAt }

  const rawEntries = feed?.entry
  const dbEntries: ParsedFeedEntry[] = []
  const normalizedEntries: NormalizedFeedEntry[] = []

  if (rawEntries) {
    const entryList = Array.isArray(rawEntries) ? rawEntries : [rawEntries]
    for (const entry of entryList) {
      const videoId = entry['yt:videoId']?.trim()
      const title = typeof entry.title === 'string' ? entry.title.trim() : String(entry.title ?? '').trim()
      const publishedStr = typeof entry.published === 'string' ? entry.published : null
      const updatedStr = typeof entry.updated === 'string' ? entry.updated : null
      const publishedMs = publishedStr ? Date.parse(publishedStr) : NaN
      const publishedAtUnix = !Number.isNaN(publishedMs) ? Math.floor(publishedMs / 1000) : null

      if (!videoId || !title || publishedAtUnix === null) {
        continue
      }

      const entryUrl = extractLinkHref(entry.link, 'alternate')
      const thumbnailRaw = entry['media:group']?.['media:thumbnail']
      const thumbnail = Array.isArray(thumbnailRaw) ? thumbnailRaw[0] : thumbnailRaw
      const thumbnailUrl = thumbnail?.url ?? null
      const thumbnailWidth =
        thumbnail?.width != null ? parseInt(String(thumbnail.width), 10) || null : null
      const thumbnailHeight =
        thumbnail?.height != null ? parseInt(String(thumbnail.height), 10) || null : null
      const descRaw = entry['media:group']?.['media:description']
      const description = typeof descRaw === 'string' ? descRaw : null
      const community = entry['media:group']?.['media:community']
      const starRating = community?.['media:starRating']
      const statistics = community?.['media:statistics']
      const viewCount =
        statistics?.views != null ? parseInt(String(statistics.views), 10) || 0 : 0
      const ratingCount =
        starRating?.count != null ? parseInt(String(starRating.count), 10) || 0 : 0
      const ratingAverage =
        starRating?.average != null ? parseFloat(String(starRating.average)) || 0 : 0

      dbEntries.push({ videoId, title, publishedAt: publishedAtUnix, thumbnailUrl })

      const mediaType = classifyMediaType(entryUrl)
      normalizedEntries.push({
        id: videoId,
        title,
        url: entryUrl ?? `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: publishedStr,
        updatedAt: updatedStr,
        thumbnailUrl,
        thumbnailWidth,
        thumbnailHeight,
        description,
        viewCount,
        ratingCount,
        ratingAverage,
        mediaType
      })
    }
  }

  const normalizedFeed: ParsedFeed = {
    channel,
    entries: normalizedEntries,
    parsedAt: new Date().toISOString()
  }

  return { dbEntries, normalizedFeed }
}

function saveDebugSnapshot(item: YouTubePollDebugItem): void {
  pollDebugByChannel.set(item.channelId, item)
}

async function pollChannel(channel: { channel_id: string; name: string }): Promise<boolean> {
  if (!dbRef) {
    return false
  }

  const startedAt = Math.floor(Date.now() / 1000)
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.channel_id)}`
  const baseSnapshot: YouTubePollDebugItem = {
    channelId: channel.channel_id,
    channelName: channel.name,
    feedUrl,
    rawFeedXml: null,
    startedAt,
    finishedAt: null,
    status: 'ok',
    fetchedEntries: 0,
    insertedCount: 0,
    updatedCount: 0,
    error: null,
    sampleEntries: [],
    normalizedFeed: null
  }

  try {
    const response = await fetch(feedUrl)
    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}`)
    }
    const xml = await response.text()
    const { dbEntries, normalizedFeed } = parseFeedXml(xml, channel.channel_id, channel.name)

    const now = Math.floor(Date.now() / 1000)
    const tx = dbRef.transaction(() => {
      let insertedCount = 0
      let updatedCount = 0

      const existsStmt = dbRef!.prepare('SELECT video_id FROM yt_videos WHERE video_id = ?')
      const upsertStmt = dbRef!.prepare(
        `INSERT INTO yt_videos (
          video_id,
          channel_id,
          title,
          published_at,
          thumbnail_url,
          duration_sec,
          broadcast_status,
          scheduled_start,
          fetched_at
        ) VALUES (?, ?, ?, ?, ?, NULL, 'none', NULL, ?)
        ON CONFLICT(video_id) DO UPDATE SET
          title = excluded.title,
          published_at = excluded.published_at,
          thumbnail_url = excluded.thumbnail_url,
          fetched_at = excluded.fetched_at`
      )

      for (const entry of dbEntries) {
        const alreadyExists = existsStmt.get(entry.videoId) as { video_id: string } | undefined
        upsertStmt.run(
          entry.videoId,
          channel.channel_id,
          entry.title,
          entry.publishedAt,
          entry.thumbnailUrl,
          now
        )

        if (alreadyExists) {
          updatedCount += 1
        } else {
          insertedCount += 1
        }
      }

      return { insertedCount, updatedCount }
    })

    const result = tx()
    saveDebugSnapshot({
      ...baseSnapshot,
      rawFeedXml: xml,
      finishedAt: Math.floor(Date.now() / 1000),
      fetchedEntries: dbEntries.length,
      insertedCount: result.insertedCount,
      updatedCount: result.updatedCount,
      sampleEntries: normalizedFeed.entries.slice(0, 5),
      normalizedFeed
    })
    return result.insertedCount > 0 || result.updatedCount > 0
  } catch (error) {
    saveDebugSnapshot({
      ...baseSnapshot,
      finishedAt: Math.floor(Date.now() / 1000),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unexpected RSS polling failure.'
    })
    return false
  }
}

async function pollAllEnabledChannels(): Promise<void> {
  if (!dbRef) {
    return
  }

  const channels = dbRef
    .prepare('SELECT channel_id, name FROM yt_channels WHERE enabled = 1 ORDER BY sort_order')
    .all() as Array<{ channel_id: string; name: string }>

  let hasUpdates = false
  for (const channel of channels) {
    const channelUpdated = await pollChannel(channel)
    hasUpdates = hasUpdates || channelUpdated
  }

  if (hasUpdates) {
    emitYoutubeUpdated()
  }
}

function startPollScheduler(): void {
  if (!dbRef) {
    return
  }

  if (pollTask) {
    pollTask.stop()
    const taskWithDestroy = pollTask as ScheduledTask & { destroy?: () => void }
    if (typeof taskWithDestroy.destroy === 'function') {
      taskWithDestroy.destroy()
    }
  }

  pollTask = cron.schedule(getCronExpression(activePollIntervalMinutes), () => {
    void pollAllEnabledChannels()
  })
}

export function applyYouTubePollInterval(minutes: number): void {
  activePollIntervalMinutes = minutes
  startPollScheduler()
  console.log(`[YouTube] Poll interval updated to ${activePollIntervalMinutes} minutes`) // eslint-disable-line no-console
}

export async function triggerYouTubePollNow(): Promise<void> {
  await pollAllEnabledChannels()
}

export function getYouTubePollDebug(): YouTubePollDebugItem[] {
  return Array.from(pollDebugByChannel.values()).sort((a, b) => b.startedAt - a.startedAt)
}

export const YouTubeModule: DataSourceModule = {
  id: 'youtube',
  displayName: 'YouTube',
  initialize(db: Database.Database): void {
    dbRef = db
    startPollScheduler()
    // Run one immediate poll on startup so users can quickly verify channel setup.
    void pollAllEnabledChannels()
    console.log(`[YouTube] Module initialized (RSS polling active, interval=${activePollIntervalMinutes}m)`)
  },
  shutdown(): void {
    if (pollTask) {
      pollTask.stop()
      const taskWithDestroy = pollTask as ScheduledTask & { destroy?: () => void }
      if (typeof taskWithDestroy.destroy === 'function') {
        taskWithDestroy.destroy()
      }
      pollTask = null
    }
    dbRef = null
    console.log('[YouTube] Module shutdown')
  }
}
