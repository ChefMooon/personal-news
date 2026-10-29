export interface XLink {
  postId: string | null;
  handle: string | null;
  canonicalPostUrl: string | null;
}

const X_HOSTS = new Set([
  "x.com",
  "www.x.com",
  "mobile.x.com",
  "m.x.com",
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "m.twitter.com",
]);
const RESERVED_HANDLES = new Set([
  "i",
  "intent",
  "search",
  "hashtag",
  "settings",
  "home",
  "explore",
  "notifications",
  "messages",
  "compose",
  "login",
  "logout",
  "signup",
]);

// Parse only known post paths. Query strings, fragments and media views do not
// change a post's identity; profiles and product pages have no post author.
export function parseXLink(rawUrl: string): XLink | null {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  if (
    !X_HOSTS.has(url.hostname.toLowerCase()) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.port ||
    url.username ||
    url.password
  )
    return null;

  const match = url.pathname.match(
    /^\/(?:i\/(?:web\/)?status|([a-zA-Z0-9_]{1,15})\/status)\/([0-9]+)(?:\/(?:photo|video)\/[1-9][0-9]*)?\/?$/,
  );
  if (!match || (match[1] && RESERVED_HANDLES.has(match[1].toLowerCase()))) {
    return { postId: null, handle: null, canonicalPostUrl: null };
  }
  const postId = match[2];
  return {
    postId,
    handle: match[1] ?? null,
    canonicalPostUrl: `https://x.com/i/web/status/${postId}`,
  };
}
