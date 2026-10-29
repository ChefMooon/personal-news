const OEMBED_ENDPOINT = "https://publish.x.com/oembed";
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const MAX_RESPONSE_BYTES = 64 * 1024;
const REQUEST_TIMEOUT_MS = 3_000;
const MAX_TEXT_LENGTH = 10_000;

type CacheEntry = { expiresAt: number; text: string | null };
const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<string | null>>();

/** Best-effort plain-text extraction for recognized public X posts. */
export async function fetchXPostText(postId: string, handle: string | null = null): Promise<string | null> {
  if (!/^\d+$/.test(postId)) return null;
  if (handle && !/^[a-zA-Z0-9_]{1,15}$/.test(handle)) return null;
  const key = `${postId}:${handle?.toLowerCase() ?? ""}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.text;
  if (cached) cache.delete(key);

  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = requestXPostText(postId, handle, key);
  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(key) === request) inFlight.delete(key);
  }
}

async function requestXPostText(postId: string, handle: string | null, key: string): Promise<string | null> {
  let text: string | null = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const endpoint = new URL(OEMBED_ENDPOINT);
    endpoint.searchParams.set("url", `https://x.com/${handle ?? "i/web"}/status/${postId}`);
    endpoint.searchParams.set("omit_script", "1");
    const response = await fetch(endpoint, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok || response.status >= 300) return cacheResult(key, null);
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) return cacheResult(key, null);
    const body = await readBounded(response, MAX_RESPONSE_BYTES);
    if (body === null) return cacheResult(key, null);
    const payload: unknown = JSON.parse(body);
    if (payload && typeof payload === "object" && "html" in payload && typeof payload.html === "string") {
      text = extractOEmbedText(payload.html);
    }
  } catch {
    // Public embeds are optional; network, parsing, and timeout failures fall back locally.
  } finally {
    clearTimeout(timer);
  }
  return cacheResult(key, text);
}

async function readBounded(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function extractOEmbedText(html: string): string | null {
  const blockquote = html.match(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote\s*>/i)?.[1];
  if (!blockquote) return null;
  const paragraphs = [...blockquote.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)];
  if (!paragraphs.length) return null;
  const plain = decodeEntities(paragraphs.map((item) => item[1]).join(" ")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ").trim().slice(0, MAX_TEXT_LENGTH);
  return plain || null;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) && point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "�";
    }
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[entity.toLowerCase()] ?? match;
  });
}

function cacheResult(postId: string, text: string | null): string | null {
  cache.delete(postId);
  cache.set(postId, { text, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  return text;
}

export function clearXPostTextCacheForTests(): void { cache.clear(); inFlight.clear(); }
