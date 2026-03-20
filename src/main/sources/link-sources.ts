import type { LinkSource, SavedPostInput } from '../../shared/ipc-types'
import { fetchRedditPost } from './reddit/metadata'

// --- Source detection ---

interface SourceDefinition {
  id: LinkSource
  label: string
  urlPattern: RegExp
  extractPostId: (url: string) => string
  fetchMetadata: (url: string, note: string | null) => Promise<SavedPostInput>
}

// The source definitions array — order matters (first match wins)
const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    id: 'reddit',
    label: 'Reddit',
    urlPattern: /^https?:\/\/((www|new|old|m)\.)?reddit\.com\//i,
    extractPostId: (url) => {
      const match = url.match(/\/comments\/([a-z0-9]+)/i)
      return match ? match[1] : hashUrl(url)
    },
    fetchMetadata: async (url, note) => {
      const post = await fetchRedditPost(url)
      return { ...post, note, source: 'reddit' }
    }
  },
  {
    id: 'x',
    label: 'X',
    urlPattern: /^https?:\/\/(www\.)?(x\.com|twitter\.com)\//i,
    extractPostId: (url) => {
      const match = url.match(/\/status\/(\d+)/i)
      return match ? `x_${match[1]}` : hashUrl(url)
    },
    fetchMetadata: async (url, note) => {
      const handle = extractXHandle(url)
      return {
        postId: extractXPostId(url),
        title: note || url,
        url,
        permalink: url,
        subreddit: null,
        author: handle,
        score: null,
        body: null,
        source: 'x' as LinkSource,
        savedAt: Math.floor(Date.now() / 1000),
        note,
        tags: null
      }
    }
  },
  {
    id: 'bsky',
    label: 'Bluesky',
    urlPattern: /^https?:\/\/(www\.)?bsky\.app\//i,
    extractPostId: (url) => {
      const match = url.match(/\/post\/([a-zA-Z0-9]+)/i)
      return match ? `bsky_${match[1]}` : hashUrl(url)
    },
    fetchMetadata: async (url, note) => {
      const handle = extractBskyHandle(url)
      const postId = extractBskyPostId(url)
      return {
        postId,
        title: note || url,
        url,
        permalink: url,
        subreddit: null,
        author: handle,
        score: null,
        body: null,
        source: 'bsky' as LinkSource,
        savedAt: Math.floor(Date.now() / 1000),
        note,
        tags: null
      }
    }
  }
  // New sources: add a SourceDefinition here
]

// --- Public API ---

export function detectSource(url: string): LinkSource {
  for (const def of SOURCE_DEFINITIONS) {
    if (def.urlPattern.test(url)) return def.id
  }
  return 'generic'
}

export function getSourceLabel(source: LinkSource): string {
  const def = SOURCE_DEFINITIONS.find((d) => d.id === source)
  return def?.label ?? 'Link'
}

export async function fetchMetadataForUrl(
  url: string,
  note: string | null
): Promise<SavedPostInput> {
  const source = detectSource(url)
  const def = SOURCE_DEFINITIONS.find((d) => d.id === source)

  if (def) {
    return def.fetchMetadata(url, note)
  }

  // Generic fallback
  return {
    postId: hashUrl(url),
    title: note || url,
    url,
    permalink: url,
    subreddit: null,
    author: null,
    score: null,
    body: null,
    source: 'generic',
    savedAt: Math.floor(Date.now() / 1000),
    note,
    tags: null
  }
}

// --- Helpers ---

function hashUrl(url: string): string {
  let hash = 0
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0
  }
  return `link_${hash.toString(36)}`
}

function extractXHandle(url: string): string | null {
  const match = url.match(/(?:x\.com|twitter\.com)\/([^/?#]+)/i)
  if (
    match &&
    !['i', 'intent', 'search', 'hashtag', 'settings'].includes(match[1].toLowerCase())
  ) {
    return match[1]
  }
  return null
}

function extractXPostId(url: string): string {
  const match = url.match(/\/status\/(\d+)/i)
  return match ? `x_${match[1]}` : hashUrl(url)
}

function extractBskyHandle(url: string): string | null {
  const match = url.match(/bsky\.app\/profile\/([^/?#]+)/i)
  return match ? match[1] : null
}

function extractBskyPostId(url: string): string {
  const match = url.match(/\/post\/([a-zA-Z0-9]+)/i)
  return match ? `bsky_${match[1]}` : hashUrl(url)
}
