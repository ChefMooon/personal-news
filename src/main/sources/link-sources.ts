import type {
  LinkSource,
  SavedPostInput,
  SavedPostMetadataPreview,
} from "../../shared/ipc-types";
import { isRedditPostUrl, parseRedditPostUrl } from "./reddit/validation";
import { createHash } from "node:crypto";
import { fetchGenericLinkMetadata } from "./generic-link-metadata";
import { parseXLink } from "./x-links";
import { fetchXPostText } from "./x-oembed";
import { fetchBlueskyPostText, parseBlueskyPostUrl } from "./bluesky";

// --- Source detection ---

interface SourceDefinition {
  id: LinkSource;
  label: string;
  urlPattern: RegExp;
  extractPostId: (url: string) => string;
  fetchMetadata: (url: string, note: string | null) => Promise<SavedPostInput>;
}

// The source definitions array — order matters (first match wins)
const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    id: "reddit",
    label: "Reddit",
    urlPattern: /^https?:\/\/((www|new|old|m)\.)?reddit\.com(?:\/|$)/i,
    extractPostId: (url) => {
      const match = url.match(/\/comments\/([a-z0-9]+)/i);
      return match ? match[1] : hashUrl(url);
    },
    fetchMetadata: async (url, note) => createRedditLinkOnlyPost(url, note),
  },
  {
    id: "x",
    label: "X",
    urlPattern:
      /^https?:\/\/(?:(?:www|mobile|m)\.)?(?:x\.com|twitter\.com)(?:\/|$)/i,
    extractPostId: extractXPostId,
    fetchMetadata: async (url, note) => {
      const link = parseXLink(url);
      const handle = link?.handle ?? null;
      const body = link?.postId ? await fetchXPostText(link.postId, link.handle) : null;
      const title =
        note ||
        (handle
          ? `Post by @${handle}`
          : link?.postId
            ? `X post ${link.postId}`
            : "X link");
      return {
        postId: extractXPostId(url),
        title,
        url,
        permalink: url,
        subreddit: null,
        author: handle,
        score: null,
        body,
        source: "x" as LinkSource,
        savedAt: Math.floor(Date.now() / 1000),
        note,
        tags: handle ? [normalizeAutoTag(handle)] : null,
      };
    },
  },
  {
    id: "bsky",
    label: "Bluesky",
    urlPattern: /^https?:\/\/(www\.)?bsky\.app\//i,
    extractPostId: (url) => { const post = parseBlueskyPostUrl(url); return post ? `bsky_${post.handle}_${post.rkey}` : hashUrl(url); },
    fetchMetadata: async (url, note) => {
      const post = parseBlueskyPostUrl(url);
      const handle = post?.handle ?? null;
      const body = post ? await fetchBlueskyPostText(post) : null;
      const title = note || (handle ? `Post by @${handle}` : "Bluesky link");
      return {
        postId: extractBskyPostId(url),
        title,
        url,
        permalink: url,
        subreddit: null,
        author: handle,
        score: null,
        body,
        source: "bsky" as LinkSource,
        savedAt: Math.floor(Date.now() / 1000),
        note,
        tags: handle ? [normalizeAutoTag(handle)] : null,
      };
    },
  },
  // New sources: add a SourceDefinition here
];

// --- Public API ---

export function detectSource(url: string): LinkSource {
  for (const def of SOURCE_DEFINITIONS) {
    if (def.id === "x" ? parseXLink(url) !== null : def.urlPattern.test(url))
      return def.id;
  }
  return "generic";
}

export function getSourceLabel(source: LinkSource): string {
  const def = SOURCE_DEFINITIONS.find((d) => d.id === source);
  return def?.label ?? "Link";
}

export function normalizeManualSavedPostInput(input: {
  url: string;
  note?: string | null;
  tags?: string[] | null;
}): { url: string; note: string | null; tags: string[] } {
  const trimmedUrl = input.url?.trim() ?? "";
  const note = input.note?.trim() ? input.note.trim() : null;
  const seen = new Set<string>();
  const tags = Array.isArray(input.tags)
    ? input.tags.reduce<string[]>((acc, tag) => {
        const trimmed = tag.trim();
        if (!trimmed) return acc;
        const key = trimmed.toLowerCase();
        if (seen.has(key)) return acc;
        seen.add(key);
        acc.push(trimmed);
        return acc;
      }, [])
    : [];

  return { url: trimmedUrl, note, tags };
}

export async function fetchMetadataForUrl(
  url: string,
  note: string | null,
): Promise<SavedPostInput> {
  const normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    throw new Error(`Unsupported URL: ${url}`);
  }

  const source = detectSource(normalizedUrl);
  const def = SOURCE_DEFINITIONS.find((d) => d.id === source);

  if (source === "reddit" && !isRedditPostUrl(normalizedUrl)) {
    return fetchGenericFallback(normalizedUrl, note);
  }

  if (def) {
    return def.fetchMetadata(normalizedUrl, note);
  }

  if (isRedditPostUrl(normalizedUrl)) return createRedditLinkOnlyPost(normalizedUrl, note);
  const parsed = new URL(normalizedUrl);
  if (!parsed.hostname || parsed.username || parsed.password)
    throw new Error(`Unsupported URL: ${url}`);
  return fetchGenericFallback(normalizedUrl, note, parsed);
}

async function fetchGenericFallback(url: string, note: string | null, parsed = new URL(url)): Promise<SavedPostInput> {
  if (!parsed.hostname || parsed.username || parsed.password) throw new Error(`Unsupported URL: ${url}`);
  const post = await fetchGenericLinkMetadata(parsed);
  return {
    postId: `link_${createHash("sha256").update(normalizeDedupeUrl(parsed)).digest("hex")}`,
    title: post.title || note || parsed.hostname,
    url,
    permalink: url,
    subreddit: null,
    author: null,
    score: null,
    body: post.description,
    source: "generic",
    savedAt: Math.floor(Date.now() / 1000),
    note,
    tags: null,
  };
}

export function createRedditLinkOnlyPost(url: string, note: string | null): SavedPostInput {
  const parsed = parseRedditPostUrl(url);
  if (!parsed) throw new Error(`Unsupported Reddit post URL: ${url}`);
  const postId = parsed.postId ?? `reddit_link_${createHash("sha256").update(parsed.canonicalUrl).digest("hex")}`;
  return {
    postId,
    title: "Reddit post (link only)",
    url,
    permalink: parsed.canonicalUrl,
    subreddit: parsed.subreddit,
    author: null,
    score: null,
    body: null,
    source: "reddit",
    savedAt: Math.floor(Date.now() / 1000),
    note,
    tags: [normalizeAutoTag(parsed.subreddit)],
    metadataStatus: "link_only",
  };
}

function normalizeDedupeUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.hash = "";
  copy.hostname = copy.hostname.toLowerCase();
  if (
    (copy.protocol === "https:" && copy.port === "443") ||
    (copy.protocol === "http:" && copy.port === "80")
  )
    copy.port = "";
  return copy.href;
}

export async function previewSavedPostMetadata(
  url: string,
  note: string | null,
): Promise<SavedPostMetadataPreview> {
  const metadata = await fetchMetadataForUrl(url, note);
  return {
    title: metadata.title,
    source: metadata.source,
    author: metadata.author,
    subreddit: metadata.subreddit,
    description: metadata.body,
    tags: metadata.tags ?? [],
    note,
    metadataStatus: metadata.metadataStatus ?? null,
  };
}

// --- Helpers ---

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) >>> 0;
  }
  return `link_${hash.toString(36)}`;
}

function normalizeAutoTag(value: string): string {
  return value.trim().toLowerCase();
}

function extractXPostId(url: string): string {
  const postId = parseXLink(url)?.postId;
  return postId ? `x_${postId}` : hashUrl(url);
}

function extractBskyPostId(url: string): string {
  const post = parseBlueskyPostUrl(url);
  return post ? `bsky_${post.handle}_${post.rkey}` : hashUrl(url);
}
