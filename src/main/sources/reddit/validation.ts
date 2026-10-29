// Accepts www., new., old., m. subdomains as well as bare reddit.com
// Accepts both /comments/ID canonical URLs and /s/SHORTCODE share links
const REDDIT_HOSTS = new Set(["reddit.com", "www.reddit.com", "new.reddit.com", "old.reddit.com", "m.reddit.com"]);

export interface ParsedRedditPostUrl {
  postId: string | null;
  subreddit: string;
  canonicalUrl: string;
}

export function parseRedditPostUrl(value: unknown): ParsedRedditPostUrl | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value.trim());
    if (!REDDIT_HOSTS.has(parsed.hostname.toLowerCase()) || (parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) return null;
    const match = parsed.pathname.match(/^\/r\/([A-Za-z0-9_]+)\/(?:comments\/([a-z0-9]+)(?:\/[^/]+(?:\/[a-z0-9]+)?)?|s\/([a-zA-Z0-9]+))\/?$/i);
    if (!match) return null;
    const subreddit = match[1];
    const postId = match[2]?.toLowerCase() ?? null;
    const canonicalUrl = `https://www.reddit.com${parsed.pathname.replace(/\/$/, "")}/`;
    return { postId, subreddit, canonicalUrl };
  } catch {
    return null;
  }
}

export function isRedditPostUrl(url: unknown): url is string {
  return parseRedditPostUrl(url) !== null;
}

export function normalizeRedditUrl(url: string): string {
  const questionMark = url.indexOf("?");
  const hash = url.indexOf("#");
  let end = url.length;
  if (questionMark !== -1 && questionMark < end) end = questionMark;
  if (hash !== -1 && hash < end) end = hash;
  let normalized = url.slice(0, end);
  if (!normalized.endsWith("/")) {
    normalized += "/";
  }
  // Normalize non-www subdomains (new., old., m.) to www. for the JSON API
  normalized = normalized.replace(
    /^(https?:\/\/)(?:new|old|m)\.reddit\.com/i,
    "$1www.reddit.com",
  );
  return normalized;
}
