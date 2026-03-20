import type { SavedPostInput } from '../../../shared/ipc-types'
import { normalizeRedditUrl } from './validation'

// /s/SHORTCODE share links — require redirect resolution before the JSON API call
const SHORT_LINK_PATTERN = /\/r\/[^/]+\/s\/[a-zA-Z0-9]+\/?$/i

async function resolveShortLink(url: string): Promise<string> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    // HEAD with redirect:follow gives response.url = final canonical URL
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'personal-news/1.0 (Electron)' },
      signal: controller.signal,
      redirect: 'follow'
    })
    clearTimeout(timeout)
    const resolved = res.url
    if (resolved && resolved !== url) {
      console.log(`[Reddit/metadata] Short link resolved: ${url} → ${resolved}`)
      return normalizeRedditUrl(resolved)
    }
    return url
  } catch (e) {
    clearTimeout(timeout)
    console.warn(`[Reddit/metadata] Could not resolve short link ${url}:`, e)
    return url
  }
}

export async function fetchRedditPost(url: string): Promise<SavedPostInput> {
  let normalized = normalizeRedditUrl(url)

  if (SHORT_LINK_PATTERN.test(normalized)) {
    normalized = await resolveShortLink(normalized)
  }

  const apiUrl = `${normalized}.json`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  console.log(`[Reddit/metadata] GET ${apiUrl}`)

  let response: Response
  try {
    response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'personal-news/1.0 (Electron)' },
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeout)
  }

  console.log(`[Reddit/metadata] Response: HTTP ${response.status} for ${apiUrl}`)

  if (response.status === 404) {
    throw new Error(`Reddit post not found: ${url}`)
  }
  if (!response.ok) {
    throw new Error(`Reddit API error: HTTP ${response.status}`)
  }

  const json = (await response.json()) as unknown
  if (!Array.isArray(json) || !json[0]?.data?.children?.[0]?.data) {
    throw new Error(`Unexpected Reddit API response shape for: ${url}`)
  }

  const data = json[0].data.children[0].data as Record<string, unknown>

  const author = data.author as string | undefined
  return {
    postId: data.id as string,
    title: data.title as string,
    url: data.url as string,
    permalink: data.permalink as string,
    subreddit: data.subreddit as string | null,
    author: author === '[deleted]' ? null : (author ?? null),
    score: typeof data.score === 'number' ? data.score : null,
    body: (data.selftext as string) || null,
    source: 'reddit',
    savedAt: Math.floor(Date.now() / 1000),
    note: null,
    tags: null
  }
}
