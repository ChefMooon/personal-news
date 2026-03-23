import type Database from 'better-sqlite3'
import cron, { type ScheduledTask } from 'node-cron'
import { XMLParser } from 'fast-xml-parser'
import { BrowserWindow, safeStorage } from 'electron'
import {
  IPC,
  type NormalizedFeedEntry,
  type ParsedFeed,
  type MediaType
} from '../../../shared/ipc-types'
import type { DataSourceModule } from '../registry'
import { getSetting, setSetting } from '../../settings/store'
import {
  notifyYoutubeNewVideos,
  notifyYoutubeLiveStart
} from '../../notifications/notification-service'

let activePollIntervalMinutes = 15
let dbRef: Database.Database | null = null
let pollTask: ScheduledTask | null = null

const YOUTUBE_API_KEY_SETTING = 'youtube_api_key_encrypted'
const YOUTUBE_SYNC_MANUAL_CONFIRMATION_SETTING = 'youtube_sync_manual_confirmation'
const YOUTUBE_SYNC_MANUAL_ACTION_SETTING = 'youtube_sync_manual_action'
const MAX_BATCH_SIZE = 50
const DB_IN_LIMIT = 700
const TEMP_CHANNEL_THUMBNAIL_MARKER = 'pn-temp-channel-avatar'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ''
})

interface RssCandidate {
  videoId: string
  sourceChannelId: string
  rssUrl: string
  rssMediaHint: string | null
  rssPublishedAt: string | null
}

const pollDebugByCycle = new Map<string, Record<string, unknown>>()

type ManualBatchDecision = 'send' | 'skip_once' | 'skip_remaining'

interface RawLink {
  href?: string
  rel?: string
}

interface RawEntry {
  'yt:videoId'?: string
  title?: string
  link?: RawLink | RawLink[]
  published?: string
}

interface RawFeed {
  entry?: RawEntry | RawEntry[]
}

interface ApiVideoItem {
  id?: string
  snippet?: {
    title?: string
    description?: string
    channelId?: string
    publishedAt?: string
    liveBroadcastContent?: string
    thumbnails?: {
      maxres?: { url?: string }
      high?: { url?: string }
      medium?: { url?: string }
      default?: { url?: string }
    }
  }
  contentDetails?: {
    duration?: string
  }
  statistics?: {
    viewCount?: string
    likeCount?: string
  }
  liveStreamingDetails?: {
    actualStartTime?: string
    actualEndTime?: string
    scheduledStartTime?: string
  }
}

interface ApiChannelItem {
  id?: string
  snippet?: {
    thumbnails?: {
      high?: { url?: string }
      medium?: { url?: string }
      default?: { url?: string }
    }
  }
}

interface ChannelThumbnailRefreshStats {
  candidateCount: number
  apiRequested: number
  updatedCount: number
  failedBatches: number
  skippedReason: string | null
}

function emitYoutubeUpdated(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.YOUTUBE_UPDATED)
  }
}

function getCronExpression(minutes: number): string {
  return `*/${minutes} * * * *`
}

async function writeDebugArtifact(
  _pollCycleId: string,
  _fileName: string,
  _payload: unknown
): Promise<string | null> {
  return null
}

function generatePollCycleId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const randomSuffix = Math.random().toString(36).slice(2, 8)
  return `poll-${timestamp}-${randomSuffix}`
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

function parseDurationToSeconds(rawDuration: string | undefined): number | null {
  if (!rawDuration) {
    return null
  }

  const match = rawDuration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/)
  if (!match) {
    return null
  }

  const days = parseInt(match[1] ?? '0', 10)
  const hours = parseInt(match[2] ?? '0', 10)
  const minutes = parseInt(match[3] ?? '0', 10)
  const seconds = parseInt(match[4] ?? '0', 10)
  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}

function classifyMediaType(item: ApiVideoItem, durationSeconds: number | null): {
  mediaType: MediaType
  confidence: 'high' | 'low'
} {
  const liveBroadcastContent = item.snippet?.liveBroadcastContent
  const liveDetails = item.liveStreamingDetails

  if (
    liveBroadcastContent === 'live' ||
    (liveDetails?.actualStartTime != null && liveDetails.actualEndTime == null)
  ) {
    return { mediaType: 'live', confidence: 'high' }
  }

  if (
    liveBroadcastContent === 'upcoming' ||
    (liveDetails?.scheduledStartTime != null && liveDetails.actualStartTime == null)
  ) {
    return { mediaType: 'upcoming_stream', confidence: 'high' }
  }

  if (durationSeconds != null) {
    if (durationSeconds <= 60) {
      return { mediaType: 'short', confidence: 'high' }
    }
    return { mediaType: 'video', confidence: 'high' }
  }

  return { mediaType: 'video', confidence: 'low' }
}

function parseRssCandidates(
  feedXml: string,
  sourceChannelId: string,
  rssUrl: string
): RssCandidate[] {
  const raw = parser.parse(feedXml) as { feed?: RawFeed }
  const entriesRaw = raw.feed?.entry
  if (!entriesRaw) {
    return []
  }

  const entries = Array.isArray(entriesRaw) ? entriesRaw : [entriesRaw]
  const candidates: RssCandidate[] = []

  for (const entry of entries) {
    const directVideoId = entry['yt:videoId']?.trim() ?? null
    const linkVideoId = (() => {
      const href = extractLinkHref(entry.link, 'alternate')
      if (!href) {
        return null
      }
      try {
        const parsed = new URL(href)
        return parsed.searchParams.get('v')
      } catch {
        return null
      }
    })()
    const videoId = directVideoId ?? linkVideoId
    if (!videoId) {
      continue
    }

    const url = extractLinkHref(entry.link, 'alternate')
    candidates.push({
      videoId,
      sourceChannelId,
      rssUrl,
      rssMediaHint: url != null && url.includes('/shorts/') ? 'short' : null,
      rssPublishedAt: typeof entry.published === 'string' ? entry.published : null
    })
  }

  return candidates
}

function getDecryptedYouTubeApiKey(): string | null {
  const encrypted = getSetting(YOUTUBE_API_KEY_SETTING)
  if (!encrypted) {
    return null
  }
  if (!safeStorage.isEncryptionAvailable()) {
    return null
  }

  try {
    const raw = Buffer.from(encrypted, 'base64')
    const decrypted = safeStorage.decryptString(raw).trim()
    return decrypted.length > 0 ? decrypted : null
  } catch {
    return null
  }
}

function getManualConfirmationEnabled(): boolean {
  const raw = getSetting(YOUTUBE_SYNC_MANUAL_CONFIRMATION_SETTING)
  if (raw == null) {
    return true
  }
  return !(raw === '0' || raw.toLowerCase() === 'false')
}

function getManualBatchDecision(): ManualBatchDecision {
  const raw = getSetting(YOUTUBE_SYNC_MANUAL_ACTION_SETTING)
  if (raw === 'skip_once' || raw === 'skip_remaining' || raw === 'send') {
    return raw
  }
  return 'send'
}

function resetManualBatchDecisionIfNeeded(decision: ManualBatchDecision): void {
  if (decision === 'skip_once') {
    setSetting(YOUTUBE_SYNC_MANUAL_ACTION_SETTING, 'send')
  }
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize))
  }
  return chunks
}

function getExistingVideoIds(database: Database.Database, ids: string[]): Set<string> {
  const existingIds = new Set<string>()
  const idChunks = chunkArray(ids, DB_IN_LIMIT)

  for (const chunk of idChunks) {
    if (chunk.length === 0) {
      continue
    }
    const placeholders = chunk.map(() => '?').join(', ')
    const rows = database
      .prepare(`SELECT video_id FROM yt_videos WHERE video_id IN (${placeholders})`)
      .all(...chunk) as Array<{ video_id: string }>
    for (const row of rows) {
      existingIds.add(row.video_id)
    }
  }

  return existingIds
}

function needsChannelThumbnailRefresh(thumbnailUrl: string | null | undefined): boolean {
  if (thumbnailUrl == null) {
    return true
  }
  const trimmed = thumbnailUrl.trim()
  if (trimmed.length === 0) {
    return true
  }
  if (trimmed.includes(TEMP_CHANNEL_THUMBNAIL_MARKER)) {
    return true
  }

  // Repair persisted values that are not guaranteed to render in the renderer.
  if (trimmed.startsWith('//')) {
    return true
  }

  const isHttpUrl = /^https?:\/\//i.test(trimmed)
  const isDataImage = /^data:image\//i.test(trimmed)
  return !(isHttpUrl || isDataImage)
}

function normalizeChannelThumbnailUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null
  }

  const trimmed = rawUrl.trim()
  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return null
}

async function refreshChannelThumbnailsFromApi(
  database: Database.Database,
  apiKey: string,
  channels: Array<{ channel_id: string; thumbnail_url: string | null }>
): Promise<ChannelThumbnailRefreshStats> {
  const candidateIds = channels
    .filter((channel) => needsChannelThumbnailRefresh(channel.thumbnail_url))
    .map((channel) => channel.channel_id)

  const stats: ChannelThumbnailRefreshStats = {
    candidateCount: candidateIds.length,
    apiRequested: 0,
    updatedCount: 0,
    failedBatches: 0,
    skippedReason: null
  }

  if (candidateIds.length === 0) {
    return stats
  }

  const channelIdBatches = chunkArray(candidateIds, MAX_BATCH_SIZE)
  const updateThumbnailStmt = database.prepare(
    'UPDATE yt_channels SET thumbnail_url = ? WHERE channel_id = ?'
  )

  for (const ids of channelIdBatches) {
    stats.apiRequested += ids.length

    let response: Response
    try {
      const params = new URLSearchParams({
        part: 'snippet',
        id: ids.join(','),
        key: apiKey
      })
      response = await fetch(`https://www.googleapis.com/youtube/v3/channels?${params.toString()}`)
    } catch {
      stats.failedBatches += 1
      continue
    }

    if (!response.ok) {
      stats.failedBatches += 1
      continue
    }

    let parsedBody: unknown
    try {
      parsedBody = (await response.json()) as unknown
    } catch {
      stats.failedBatches += 1
      continue
    }

    const payload = parsedBody as { items?: ApiChannelItem[] }
    const items = Array.isArray(payload.items) ? payload.items : []

    const applyBatchUpdates = database.transaction((batchItems: ApiChannelItem[]) => {
      let changedRows = 0
      for (const item of batchItems) {
        const channelId = item.id?.trim()
        if (!channelId) {
          continue
        }

        const thumbnailUrl = normalizeChannelThumbnailUrl(
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null
        )

        if (!thumbnailUrl) {
          continue
        }

        const result = updateThumbnailStmt.run(thumbnailUrl, channelId)
        changedRows += result.changes
      }
      return changedRows
    })

    stats.updatedCount += applyBatchUpdates(items)
  }

  return stats
}

function normalizeVideoItem(item: ApiVideoItem): NormalizedFeedEntry | null {
  const id = item.id?.trim()
  if (!id) {
    return null
  }

  const title = item.snippet?.title?.trim() ?? ''
  if (!title) {
    return null
  }

  const durationSeconds = parseDurationToSeconds(item.contentDetails?.duration)
  const media = classifyMediaType(item, durationSeconds)
  const thumbnailUrl =
    item.snippet?.thumbnails?.maxres?.url ??
    item.snippet?.thumbnails?.high?.url ??
    item.snippet?.thumbnails?.medium?.url ??
    item.snippet?.thumbnails?.default?.url ??
    null

  const normalized: NormalizedFeedEntry = {
    id,
    title,
    url: `https://www.youtube.com/watch?v=${id}`,
    publishedAt: item.snippet?.publishedAt ?? null,
    updatedAt: null,
    thumbnailUrl,
    thumbnailWidth: null,
    thumbnailHeight: null,
    description: item.snippet?.description ?? null,
    viewCount: parseInt(item.statistics?.viewCount ?? '0', 10) || 0,
    ratingCount: parseInt(item.statistics?.likeCount ?? '0', 10) || 0,
    ratingAverage: 0,
    mediaType: media.mediaType,
    mediaTypeConfidence: media.confidence,
    durationSeconds,
    channelId: item.snippet?.channelId
  }

  return normalized
}

function parseUnixSeconds(rawIsoDate: string | null | undefined): number | null {
  if (!rawIsoDate) {
    return null
  }
  const ms = Date.parse(rawIsoDate)
  if (Number.isNaN(ms)) {
    return null
  }
  return Math.floor(ms / 1000)
}

function toBroadcastStatus(mediaType: MediaType): 'none' | 'upcoming' | 'live' {
  if (mediaType === 'live') {
    return 'live'
  }
  if (mediaType === 'upcoming_stream') {
    return 'upcoming'
  }
  return 'none'
}

function enqueueRetryBatch(
  database: Database.Database,
  payload: {
    pollCycleId: string
    batchIndex: number
    batchSize: number
    videoIds: string[]
    sourceChannelIds: string[]
    requestPath: string | null
    responsePath: string | null
    normalizedPreviewPath: string | null
    reason: string
    lastError: string | null
  }
): void {
  const now = Math.floor(Date.now() / 1000)
  database
    .prepare(
      `INSERT INTO yt_sync_retry_batches (
        poll_cycle_id,
        batch_index,
        batch_size,
        video_ids_json,
        source_channel_ids_json,
        request_path,
        response_path,
        normalized_preview_path,
        reason,
        attempt_count,
        status,
        last_error,
        next_retry_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'pending', ?, NULL, ?, ?)`
    )
    .run(
      payload.pollCycleId,
      payload.batchIndex,
      payload.batchSize,
      JSON.stringify(payload.videoIds),
      JSON.stringify(payload.sourceChannelIds),
      payload.requestPath,
      payload.responsePath,
      payload.normalizedPreviewPath,
      payload.reason,
      payload.lastError,
      now,
      now
    )
}

function saveDebugSnapshot(item: Record<string, unknown>): void {
  pollDebugByCycle.set(String(item.channelId), item)
}

async function fetchRssCandidatesForChannel(channel: {
  channel_id: string
  name: string
}): Promise<{ candidates: RssCandidate[]; error: string | null }> {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel.channel_id)}`
  try {
    const response = await fetch(feedUrl)
    if (!response.ok) {
      throw new Error(`Feed request failed with status ${response.status}`)
    }
    const xml = await response.text()
    const candidates = parseRssCandidates(xml, channel.channel_id, feedUrl)
    return { candidates, error: null }
  } catch (error) {
    return {
      candidates: [],
      error: error instanceof Error ? error.message : 'RSS fetch failed.'
    }
  }
}

async function pollAllEnabledChannels(): Promise<void> {
  if (!dbRef) {
    return
  }

  const pollCycleId = generatePollCycleId()
  const startedAt = Math.floor(Date.now() / 1000)
  const channels = dbRef
    .prepare('SELECT channel_id, name, thumbnail_url, notify_new_videos, notify_live_start FROM yt_channels WHERE enabled = 1 ORDER BY sort_order')
    .all() as Array<{ channel_id: string; name: string; thumbnail_url: string | null; notify_new_videos: number; notify_live_start: number }>

  if (channels.length === 0) {
    saveDebugSnapshot({
      channelId: pollCycleId,
      channelName: 'YouTube Sync Cycle (0 channels)',
      feedUrl: 'multi-channel',
      rawFeedXml: null,
      startedAt,
      finishedAt: Math.floor(Date.now() / 1000),
      status: 'ok',
      fetchedEntries: 0,
      insertedCount: 0,
      updatedCount: 0,
      error: null,
      sampleEntries: [],
      normalizedFeed: null,
      pollCycleId,
      totalChannelsPolled: 0,
      failedChannelIds: []
    })
    return
  }

  const allCandidates: RssCandidate[] = []
  const failedChannelIds: string[] = []
  const channelErrors: Array<{ channelId: string; error: string }> = []

  for (const channel of channels) {
    const rssResult = await fetchRssCandidatesForChannel(channel)
    if (rssResult.error) {
      failedChannelIds.push(channel.channel_id)
      channelErrors.push({ channelId: channel.channel_id, error: rssResult.error })
      continue
    }
    allCandidates.push(...rssResult.candidates)
  }

  const byVideoId = new Map<string, RssCandidate[]>()
  for (const candidate of allCandidates) {
    const list = byVideoId.get(candidate.videoId)
    if (list) {
      list.push(candidate)
    } else {
      byVideoId.set(candidate.videoId, [candidate])
    }
  }

  const incomingIds = Array.from(byVideoId.keys())

  let existingIds: Set<string>
  try {
    existingIds = getExistingVideoIds(dbRef, incomingIds)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'DB diff failed.'
    saveDebugSnapshot({
      channelId: pollCycleId,
      channelName: `YouTube Sync Cycle (${channels.length} channels)`,
      feedUrl: 'multi-channel',
      rawFeedXml: null,
      startedAt,
      finishedAt: Math.floor(Date.now() / 1000),
      status: 'error',
      fetchedEntries: allCandidates.length,
      insertedCount: 0,
      updatedCount: 0,
      error: `DB diff failed: ${message}`,
      sampleEntries: [],
      normalizedFeed: null,
      pollCycleId,
      totalChannelsPolled: channels.length,
      failedChannelIds,
      candidateVideoCount: allCandidates.length,
      uniqueIncomingIdCount: incomingIds.length,
      existingIdCount: 0,
      newVideoIds: []
    })
    return
  }

  const newVideoIds = incomingIds.filter((id) => !existingIds.has(id))
  const batches = chunkArray(newVideoIds, MAX_BATCH_SIZE)
  const apiKey = getDecryptedYouTubeApiKey()
  const manualConfirmationEnabled = getManualConfirmationEnabled()
  const channelThumbCandidates = channels.filter((channel) =>
    needsChannelThumbnailRefresh(channel.thumbnail_url)
  ).length
  let channelThumbApiRequested = 0
  let channelThumbUpdated = 0
  let channelThumbFailedBatches = 0
  let channelThumbSkippedReason: string | null = null

  if (!apiKey) {
    if (channelThumbCandidates > 0) {
      channelThumbSkippedReason = 'No YouTube API key configured. Skipped channels.list thumbnail refresh.'
    }
  } else {
    const refreshStats = await refreshChannelThumbnailsFromApi(dbRef, apiKey, channels)
    channelThumbApiRequested = refreshStats.apiRequested
    channelThumbUpdated = refreshStats.updatedCount
    channelThumbFailedBatches = refreshStats.failedBatches
    channelThumbSkippedReason = refreshStats.skippedReason
  }

  await writeDebugArtifact(pollCycleId, 'new-video-worklist.json', {
    pollCycleId,
    totalChannelsPolled: channels.length,
    failedChannelIds,
    candidateVideoCount: allCandidates.length,
    uniqueIncomingIdCount: incomingIds.length,
    existingIdCount: existingIds.size,
    newVideoIds
  })

  if (!apiKey && newVideoIds.length > 0) {
    saveDebugSnapshot({
      channelId: pollCycleId,
      channelName: `YouTube Sync Cycle (${channels.length} channels)`,
      feedUrl: 'multi-channel',
      rawFeedXml: null,
      startedAt,
      finishedAt: Math.floor(Date.now() / 1000),
      status: 'error',
      fetchedEntries: allCandidates.length,
      insertedCount: 0,
      updatedCount: 0,
      error: 'No YouTube API key configured. Skipped videos.list API enrichment.',
      sampleEntries: [],
      normalizedFeed: {
        channel: {
          id: 'multi',
          title: 'YouTube Sync (API key missing)',
          url: 'https://www.youtube.com',
          publishedAt: null
        },
        entries: [],
        parsedAt: new Date().toISOString()
      },
      pollCycleId,
      totalChannelsPolled: channels.length,
      failedChannelIds,
      candidateVideoCount: allCandidates.length,
      uniqueIncomingIdCount: incomingIds.length,
      existingIdCount: existingIds.size,
      newVideoIds,
      channelThumbCandidates,
      channelThumbApiRequested,
      channelThumbUpdated,
      channelThumbFailedBatches,
      channelThumbSkippedReason
    })
    return
  }

  const knownChannelIds = new Set(
    channels.map((channel) => channel.channel_id)
  )
  const batchDebug: Array<Record<string, unknown>> = []
  const normalizedPreviewEntries: NormalizedFeedEntry[] = []
  const unresolvedIds = new Set<string>()
  let insertedCount = 0
  let updatedCount = 0
  let skippedRemainingBatches = false
  const allNewVideoEntries: Array<{ videoId: string; channelId: string; title: string }> = []
  const allLiveStartEntries: Array<{ videoId: string; channelId: string; title: string }> = []

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
    const ids = batches[batchIndex]
    const sourceChannelIds = Array.from(
      new Set(
        ids.flatMap((id) => (byVideoId.get(id) ?? []).map((candidate) => candidate.sourceChannelId))
      )
    )

    const requestPayload = {
      pollCycleId,
      batchIndex,
      batchSize: ids.length,
      videoIds: ids,
      params: {
        part: 'snippet,contentDetails,statistics,liveStreamingDetails',
        id: ids.join(',')
      },
      sourceChannelIds
    }

    const requestPath = await writeDebugArtifact(
      pollCycleId,
      `batch-${String(batchIndex).padStart(3, '0')}-request.json`,
      requestPayload
    )

    const manualDecision: ManualBatchDecision = manualConfirmationEnabled
      ? getManualBatchDecision()
      : 'send'
    resetManualBatchDecisionIfNeeded(manualDecision)

    if (manualDecision === 'skip_remaining') {
      skippedRemainingBatches = true
      batchDebug.push({
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath: null,
        normalizedPreviewPath: null,
        status: 'skipped',
        decision: manualDecision,
        error: 'Manual confirmation decision requested skipping all remaining batches.'
      })
      unresolvedIds.clear()
      for (const remaining of batches.slice(batchIndex).flat()) {
        unresolvedIds.add(remaining)
      }
      break
    }

    if (manualDecision === 'skip_once') {
      batchDebug.push({
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath: null,
        normalizedPreviewPath: null,
        status: 'skipped',
        decision: manualDecision,
        error: 'Manual confirmation decision skipped this batch.'
      })
      for (const id of ids) {
        unresolvedIds.add(id)
      }
      continue
    }

    let response: Response
    try {
      const params = new URLSearchParams({
        part: 'snippet,contentDetails,statistics,liveStreamingDetails',
        id: ids.join(','),
        key: apiKey as string
      })
      response = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params.toString()}`)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Network error during YouTube API call.'
      enqueueRetryBatch(dbRef!, {
        pollCycleId,
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath: null,
        normalizedPreviewPath: null,
        reason: 'api_transport_error',
        lastError: errorMessage
      })

      batchDebug.push({
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath: null,
        normalizedPreviewPath: null,
        status: 'failed',
        decision: manualDecision,
        error: errorMessage
      })
      for (const id of ids) {
        unresolvedIds.add(id)
      }
      continue
    }

    const rawBody = await response.text()
    let parsedBody: unknown = rawBody
    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = { rawBody }
    }

    const responsePath = await writeDebugArtifact(
      pollCycleId,
      `batch-${String(batchIndex).padStart(3, '0')}-response.raw.json`,
      parsedBody
    )

    if (!response.ok) {
      const errorMessage = `YouTube API call failed with status ${response.status}`
      enqueueRetryBatch(dbRef!, {
        pollCycleId,
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath,
        normalizedPreviewPath: null,
        reason: response.status === 403 ? 'quota_or_forbidden' : 'api_http_error',
        lastError: errorMessage
      })

      batchDebug.push({
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath,
        normalizedPreviewPath: null,
        status: 'failed',
        decision: manualDecision,
        httpStatus: response.status,
        error: errorMessage
      })

      for (const id of ids) {
        unresolvedIds.add(id)
      }

      if (response.status === 403) {
        skippedRemainingBatches = true
        for (const remaining of batches.slice(batchIndex + 1).flat()) {
          unresolvedIds.add(remaining)
        }
        break
      }

      continue
    }

    const payload = parsedBody as { items?: ApiVideoItem[] }
    const apiItems = Array.isArray(payload.items) ? payload.items : []
    const returnedIds = new Set(
      apiItems.map((item) => item.id?.trim()).filter((value): value is string => Boolean(value))
    )

    for (const id of ids) {
      if (!returnedIds.has(id)) {
        unresolvedIds.add(id)
      }
    }

    const normalizedBatch: NormalizedFeedEntry[] = []
    const normalizationErrors: string[] = []

    for (const item of apiItems) {
      try {
        const normalized = normalizeVideoItem(item)
        if (!normalized) {
          normalizationErrors.push(`Skipped item with missing id/title.`)
          continue
        }
        normalizedBatch.push(normalized)
      } catch (error) {
        normalizationErrors.push(error instanceof Error ? error.message : 'Normalization failed.')
      }
    }

    const normalizedPreviewPath = await writeDebugArtifact(
      pollCycleId,
      `batch-${String(batchIndex).padStart(3, '0')}-normalized.preview.json`,
      normalizedBatch
    )

    if (normalizationErrors.length > 0) {
      enqueueRetryBatch(dbRef!, {
        pollCycleId,
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath,
        normalizedPreviewPath,
        reason: 'normalization_failed',
        lastError: normalizationErrors.join(' | ')
      })

      batchDebug.push({
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath,
        normalizedPreviewPath,
        status: 'normalization_failed',
        decision: manualDecision,
        httpStatus: response.status,
        error: normalizationErrors.join(' | ')
      })
    } else {
      batchDebug.push({
        batchIndex,
        batchSize: ids.length,
        videoIds: ids,
        sourceChannelIds,
        requestPath,
        responsePath,
        normalizedPreviewPath,
        status: 'sent',
        decision: manualDecision,
        httpStatus: response.status,
        error: null
      })
    }

    if (normalizedBatch.length === 0) {
      continue
    }

    normalizedPreviewEntries.push(...normalizedBatch)

    const ingestTx = dbRef.transaction(() => {
      const existsStmt = dbRef!.prepare('SELECT video_id, broadcast_status FROM yt_videos WHERE video_id = ?')
      const upsertStmt = dbRef!.prepare(
        `INSERT INTO yt_videos (
          video_id,
          channel_id,
          title,
          published_at,
          thumbnail_url,
          duration_sec,
          media_type,
          broadcast_status,
          scheduled_start,
          fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(video_id) DO UPDATE SET
          channel_id = excluded.channel_id,
          title = excluded.title,
          published_at = excluded.published_at,
          thumbnail_url = excluded.thumbnail_url,
          duration_sec = excluded.duration_sec,
          media_type = excluded.media_type,
          broadcast_status = excluded.broadcast_status,
          scheduled_start = excluded.scheduled_start,
          fetched_at = excluded.fetched_at`
      )

      const now = Math.floor(Date.now() / 1000)
      let batchInserted = 0
      let batchUpdated = 0
      const newVideoEntries: Array<{ videoId: string; channelId: string; title: string }> = []
      const liveStartEntries: Array<{ videoId: string; channelId: string; title: string }> = []

      for (const entry of normalizedBatch) {
        const primaryChannelId = entry.channelId?.trim() ?? ''
        const fallbackChannelId = (byVideoId.get(entry.id) ?? [])[0]?.sourceChannelId ?? ''
        const channelId = knownChannelIds.has(primaryChannelId)
          ? primaryChannelId
          : knownChannelIds.has(fallbackChannelId)
            ? fallbackChannelId
            : null

        if (!channelId) {
          unresolvedIds.add(entry.id)
          continue
        }

        const publishedAtUnix = parseUnixSeconds(entry.publishedAt)
        if (publishedAtUnix == null) {
          unresolvedIds.add(entry.id)
          continue
        }

        const alreadyExists = existsStmt.get(entry.id) as { video_id: string; broadcast_status: string | null } | undefined
        const scheduledStartUnix = parseUnixSeconds(
          apiItems.find((item) => item.id === entry.id)?.liveStreamingDetails?.scheduledStartTime
        )

        upsertStmt.run(
          entry.id,
          channelId,
          entry.title,
          publishedAtUnix,
          entry.thumbnailUrl,
          entry.durationSeconds ?? null,
          entry.mediaType,
          toBroadcastStatus(entry.mediaType),
          scheduledStartUnix,
          now
        )

        if (alreadyExists) {
          batchUpdated += 1
          // Detect live-start transition: was not 'live', now is 'live'.
          if (alreadyExists.broadcast_status !== 'live' && toBroadcastStatus(entry.mediaType) === 'live') {
            liveStartEntries.push({ videoId: entry.id, channelId, title: entry.title })
          }
        } else {
          batchInserted += 1
          newVideoEntries.push({ videoId: entry.id, channelId, title: entry.title })
        }
      }

      return { batchInserted, batchUpdated, newVideoEntries, liveStartEntries }
    })

    const ingestResult = ingestTx()
    insertedCount += ingestResult.batchInserted
    updatedCount += ingestResult.batchUpdated
    allNewVideoEntries.push(...ingestResult.newVideoEntries)
    allLiveStartEntries.push(...ingestResult.liveStartEntries)
  }

  const finishedAt = Math.floor(Date.now() / 1000)
  const batchFailures = batchDebug.filter((item) => item.status === 'failed' || item.status === 'normalization_failed')
  const hasApiFailures = batchFailures.length > 0
  const hasOnlySkipped = batchDebug.length > 0 && batchDebug.every((item) => item.status === 'skipped')
  const errorMessageParts: string[] = []

  if (channelErrors.length > 0) {
    errorMessageParts.push(`RSS channel failures: ${channelErrors.map((x) => x.channelId).join(', ')}`)
  }
  if (hasApiFailures) {
    errorMessageParts.push(`API batch failures: ${batchFailures.length}`)
  }
  if (hasOnlySkipped) {
    errorMessageParts.push('All API batches were skipped by manual confirmation mode.')
  }

  const parsedAt = new Date().toISOString()
  const normalizedFeed: ParsedFeed = {
    channel: {
      id: 'multi',
      title: `YouTube Sync Cycle (${channels.length} channels)`,
      url: 'https://www.youtube.com',
      publishedAt: null
    },
    entries: normalizedPreviewEntries.slice(0, 100),
    parsedAt
  }

  saveDebugSnapshot({
    channelId: pollCycleId,
    channelName: `YouTube Sync Cycle (${channels.length} channels)`,
    feedUrl: 'multi-channel',
    rawFeedXml: null,
    startedAt,
    finishedAt,
    status: errorMessageParts.length > 0 ? 'error' : 'ok',
    fetchedEntries: allCandidates.length,
    insertedCount,
    updatedCount,
    error: errorMessageParts.length > 0 ? errorMessageParts.join(' | ') : null,
    sampleEntries: normalizedPreviewEntries.slice(0, 10),
    normalizedFeed,
    pollCycleId,
    totalChannelsPolled: channels.length,
    failedChannelIds,
    candidateVideoCount: allCandidates.length,
    uniqueIncomingIdCount: incomingIds.length,
    existingIdCount: existingIds.size,
    newVideoIds,
    channelThumbCandidates,
    channelThumbApiRequested,
    channelThumbUpdated,
    channelThumbFailedBatches,
    channelThumbSkippedReason,
    skippedRemainingBatches,
    unresolvedIds: Array.from(unresolvedIds),
    batchDebug
  })

  if (insertedCount > 0 || updatedCount > 0 || channelThumbUpdated > 0) {
    emitYoutubeUpdated()
  }

  // Fire desktop notifications for new videos and live-start transitions.
  if (allNewVideoEntries.length > 0 || allLiveStartEntries.length > 0) {
    const channelByIdMap = new Map(channels.map((c) => [c.channel_id, c]))
    if (allNewVideoEntries.length > 0) {
      notifyYoutubeNewVideos(
        allNewVideoEntries.map((v) => {
          const ch = channelByIdMap.get(v.channelId)
          return {
            title: v.title,
            channelId: v.channelId,
            channelName: ch?.name ?? v.channelId,
            notifyNewVideos: (ch?.notify_new_videos ?? 1) !== 0,
            notifyLiveStart: (ch?.notify_live_start ?? 1) !== 0
          }
        })
      )
    }
    if (allLiveStartEntries.length > 0) {
      notifyYoutubeLiveStart(
        allLiveStartEntries.map((v) => {
          const ch = channelByIdMap.get(v.channelId)
          return {
            title: v.title,
            channelId: v.channelId,
            channelName: ch?.name ?? v.channelId,
            notifyNewVideos: (ch?.notify_new_videos ?? 1) !== 0,
            notifyLiveStart: (ch?.notify_live_start ?? 1) !== 0
          }
        })
      )
    }
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
}

export async function triggerYouTubePollNow(): Promise<void> {
  await pollAllEnabledChannels()
}

export function getYouTubePollDebug(): Array<Record<string, unknown>> {
  return Array.from(pollDebugByCycle.values()).sort(
    (a, b) => Number(b.startedAt ?? 0) - Number(a.startedAt ?? 0)
  )
}

export const YouTubeModule: DataSourceModule = {
  id: 'youtube',
  displayName: 'YouTube',
  initialize(db: Database.Database): void {
    dbRef = db

    const configuredInterval = getSetting('rss_poll_interval_minutes')
    const parsedInterval = configuredInterval ? parseInt(configuredInterval, 10) : NaN
    if (Number.isInteger(parsedInterval) && parsedInterval >= 1 && parsedInterval <= 1440) {
      activePollIntervalMinutes = parsedInterval
    }

    startPollScheduler()
    // Run one immediate poll on startup so users can quickly verify channel setup.
    void pollAllEnabledChannels()
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
  }
}
