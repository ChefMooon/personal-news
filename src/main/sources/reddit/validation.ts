// Accepts www., new., old., m. subdomains as well as bare reddit.com
// Accepts both /comments/ID canonical URLs and /s/SHORTCODE share links
const REDDIT_POST_URL_PATTERN =
  /^https?:\/\/((www|new|old|m)\.)?reddit\.com\/r\/[^/]+\/(comments\/[a-z0-9]+|s\/[a-zA-Z0-9]+)/i

export function isRedditPostUrl(url: unknown): url is string {
  return typeof url === 'string' && REDDIT_POST_URL_PATTERN.test(url)
}

export function normalizeRedditUrl(url: string): string {
  const questionMark = url.indexOf('?')
  const hash = url.indexOf('#')
  let end = url.length
  if (questionMark !== -1 && questionMark < end) end = questionMark
  if (hash !== -1 && hash < end) end = hash
  let normalized = url.slice(0, end)
  if (!normalized.endsWith('/')) {
    normalized += '/'
  }
  // Normalize non-www subdomains (new., old., m.) to www. for the JSON API
  normalized = normalized.replace(
    /^(https?:\/\/)(?:new|old|m)\.reddit\.com/i,
    '$1www.reddit.com'
  )
  return normalized
}
