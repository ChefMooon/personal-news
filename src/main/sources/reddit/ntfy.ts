import type Database from 'better-sqlite3'
import { getSetting, setSetting } from '../../settings/store'
import { fetchMetadataForUrl } from '../link-sources'

interface NtfyMessage {
  id: string
  event: string
  message: string
}

function parseNtfyMessage(msg: string): { url: string; note: string | null } {
  const trimmed = msg.trim()

  // Some ntfy share-sheet clients send JSON like {"":"https://..."} or {"url":"https://..."}
  if (trimmed.startsWith('{')) {
    try {
      const json = JSON.parse(trimmed) as Record<string, unknown>
      for (const value of Object.values(json)) {
        if (typeof value === 'string' && /^https?:\/\//i.test(value)) {
          return { url: value.trim(), note: null }
        }
      }
    } catch {
      // Not JSON — fall through to plain-text parsing
    }
  }

  const newlineIdx = trimmed.indexOf('\n')
  if (newlineIdx === -1) {
    return { url: trimmed, note: null }
  }
  const url = trimmed.slice(0, newlineIdx).trim()
  const rest = trimmed.slice(newlineIdx + 1).trim()
  return { url, note: rest || null }
}

export async function pollNtfy(db: Database.Database): Promise<{ postsIngested: number; messagesReceived: number }> {
  const topic = getSetting('ntfy_topic')
  if (!topic) {
    return { postsIngested: 0, messagesReceived: 0 }
  }

  const serverUrl = getSetting('ntfy_server_url') || 'https://ntfy.sh'
  const lastMessageId = getSetting('ntfy_last_message_id')
  const since = lastMessageId ?? 'all'

  const fetchUrl = `${serverUrl}/${encodeURIComponent(topic)}/json?poll=1&since=${encodeURIComponent(since)}`
  console.log(`[ntfy] Polling: ${fetchUrl}`)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  let response: Response
  try {
    response = await fetch(fetchUrl, { signal: controller.signal })
  } catch (error) {
    clearTimeout(timeout)
    // Rethrow so callers can distinguish network failures from 0-ingest
    throw new Error(`ntfy unreachable: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`ntfy returned HTTP ${response.status}`)
  }

  const text = await response.text()
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  console.log(`[ntfy] Response OK — ${lines.length} line(s) received`)

  let postsIngested = 0
  let messagesReceived = 0
  let lastProcessedId: string | null = null

  const upsert = db.prepare(`
    INSERT INTO saved_posts (post_id, title, url, permalink, subreddit, author, score, body, saved_at, tags, note, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET
      title = excluded.title,
      url = excluded.url,
      score = excluded.score,
      note = COALESCE(excluded.note, saved_posts.note),
      source = excluded.source
  `)

  for (const line of lines) {
    let msg: NtfyMessage
    try {
      msg = JSON.parse(line) as NtfyMessage
    } catch {
      continue
    }

    if (msg.event !== 'message') {
      continue
    }

    lastProcessedId = msg.id
    messagesReceived++

    const { url, note } = parseNtfyMessage(msg.message)
    console.log(`[ntfy] Message ${messagesReceived}: url="${url}", note=${note !== null ? `"${note}"` : 'null'}`)

    if (!/^https?:\/\//i.test(url)) {
      console.warn(`[ntfy] Skipping — not a valid HTTP URL: "${url}"`)
      continue
    }

    try {
      console.log(`[ntfy] Fetching metadata for: ${url}`)
      const post = await fetchMetadataForUrl(url, note)
      console.log(`[ntfy] Fetched post: id=${post.postId}, source=${post.source}, title="${post.title}"`)
      upsert.run(
        post.postId,
        post.title,
        post.url,
        post.permalink,
        post.subreddit,
        post.author,
        post.score,
        post.body,
        post.savedAt,
        null,
        post.note,
        post.source
      )
      postsIngested++
      console.log(`[ntfy] Post ingested: ${post.postId}`)
    } catch (error) {
      console.warn(`[ntfy] Failed to fetch metadata for ${url}:`, error)
    }
  }

  if (lastProcessedId) {
    setSetting('ntfy_last_message_id', lastProcessedId)
  }
  setSetting('ntfy_last_polled_at', String(Math.floor(Date.now() / 1000)))

  console.log(`[ntfy] Poll complete: ${messagesReceived} messages, ${postsIngested} posts ingested`)
  return { postsIngested, messagesReceived }
}
