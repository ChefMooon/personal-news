import { fetchBoundedText } from "../security/network";

export interface ParsedBlueskyPost {
  handle: string;
  rkey: string;
}

/** Parse share links without trusting their query, fragment, or display host. */
export function parseBlueskyPostUrl(raw: string): ParsedBlueskyPost | null {
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || !["bsky.app", "www.bsky.app"].includes(url.hostname.toLowerCase()) || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/profile\/([^/]+)\/post\/([a-zA-Z0-9._~:-]{1,512})\/?$/);
    if (!match) return null;
    const handle = decodeURIComponent(match[1]).toLowerCase();
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(handle) && !/^did:plc:[a-z2-7]{20,}$/.test(handle)) return null;
    return { handle, rkey: match[2] };
  } catch { return null; }
}

const API = "https://public.api.bsky.app/xrpc/";
const CACHE_TTL = 10 * 60_000;
const CACHE_LIMIT = 256;
const HANDLE_TTL = 60 * 60_000;
const REQUESTS_PER_MINUTE_LIMIT = 28;
const handleCache = new Map<string, { did: string | null; until: number }>();
const postCache = new Map<string, { text: string | null; until: number }>();
const inFlight = new Map<string, Promise<string | null>>();
let requestStarts: number[] = [];
let lastStart = 0;
let cooldownUntil = 0;
let failures = 0;
let active = false;
let reservedRequests = 0;
const now = () => Date.now();

function cacheSet<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key); cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
}

interface RequestReservation { remaining: number }
interface ApiResult { value: unknown | null; cacheable: boolean }

function reserveRequests(count: number): RequestReservation | null {
  const current = now();
  requestStarts = requestStarts.filter((time) => current - time < 60_000);
  if (current < cooldownUntil || requestStarts.length + reservedRequests + count > REQUESTS_PER_MINUTE_LIMIT) return null;
  reservedRequests += count;
  return { remaining: count };
}

function releaseReservation(reservation: RequestReservation): void {
  reservedRequests -= reservation.remaining;
  reservation.remaining = 0;
}

async function beginRequest(reservation: RequestReservation): Promise<boolean> {
  // Concurrent distinct lookups are skipped immediately rather than queued in
  // an unbounded waiter list. Identical lookups share the in-flight promise.
  if (active || now() < cooldownUntil || reservation.remaining <= 0) return false;
  const current = now();
  requestStarts = requestStarts.filter((time) => current - time < 60_000);
  if (requestStarts.length >= REQUESTS_PER_MINUTE_LIMIT) return false;
  active = true;
  reservation.remaining -= 1;
  reservedRequests -= 1;
  const delay = Math.max(0, 1_000 - (current - lastStart));
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
  requestStarts.push(now());
  lastStart = now();
  return true;
}

function endRequest(): void { active = false; }

function parseRetryAfter(value: string | null, current: number): number {
  if (!value) return 60_000;
  const seconds = Number(value);
  const requested = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1000
    : Date.parse(value) - current;
  return Math.max(60_000, Number.isFinite(requested) ? requested : 60_000);
}

async function apiJson(path: string, reservation: RequestReservation): Promise<ApiResult> {
  if (!(await beginRequest(reservation))) return { value: null, cacheable: false };
  try {
    const { response, text } = await fetchBoundedText(`${API}${path}`, {
      timeoutMs: 5_000, maxBytes: 128_000, maxRedirects: 0,
      headers: { Accept: "application/json" },
    });
    if (response.status === 429) {
      cooldownUntil = Math.max(cooldownUntil, now() + parseRetryAfter(response.headers.get("retry-after"), now()));
      return { value: null, cacheable: false };
    }
    if (response.status >= 500) {
      failures += 1; cooldownUntil = Math.max(cooldownUntil, now() + Math.min(15 * 60_000, 30_000 * 2 ** Math.min(failures - 1, 5)));
      return { value: null, cacheable: false };
    }
    if (!response.ok) return { value: null, cacheable: true };
    failures = 0;
    return { value: JSON.parse(text) as unknown, cacheable: true };
  } catch {
    failures += 1; cooldownUntil = Math.max(cooldownUntil, now() + Math.min(15 * 60_000, 30_000 * 2 ** Math.min(failures - 1, 5)));
    return { value: null, cacheable: false };
  } finally { endRequest(); }
}

export async function fetchBlueskyPostText(post: ParsedBlueskyPost): Promise<string | null> {
  const key = `${post.handle}/${post.rkey}`;
  const cached = postCache.get(key);
  if (cached && cached.until > now()) return cached.text;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const lookup = lookupBlueskyPostText(post, key);
  inFlight.set(key, lookup);
  try { return await lookup; } finally { inFlight.delete(key); }
}

async function lookupBlueskyPostText(post: ParsedBlueskyPost, key: string): Promise<string | null> {
  let did = post.handle;
  let reservation: RequestReservation | null = null;
  try {
    if (!did.startsWith("did:")) {
      const cachedDid = handleCache.get(post.handle);
      if (cachedDid && cachedDid.until > now()) {
        if (!cachedDid.did) { cacheSet(postCache, key, { text: null, until: now() + CACHE_TTL }); return null; }
        did = cachedDid.did;
        reservation = reserveRequests(1);
      } else {
        // Reserve both calls together so resolution cannot consume the final
        // slot and strand the corresponding post lookup.
        reservation = reserveRequests(2);
        if (!reservation) return null;
        const resolved = await apiJson(`com.atproto.identity.resolveHandle?handle=${encodeURIComponent(post.handle)}`, reservation);
        if (typeof (resolved.value as { did?: unknown } | null)?.did !== "string" || !/^did:(?:plc:[a-z2-7]{20,}|web:[a-z0-9.-]+)$/.test((resolved.value as { did: string }).did)) {
          if (resolved.cacheable) {
            cacheSet(handleCache, post.handle, { did: null, until: now() + CACHE_TTL });
            cacheSet(postCache, key, { text: null, until: now() + CACHE_TTL });
          }
          return null;
        }
        did = (resolved.value as { did: string }).did;
        cacheSet(handleCache, post.handle, { did, until: now() + HANDLE_TTL });
      }
    } else {
      reservation = reserveRequests(1);
    }
    if (!reservation) return null;
    const uri = `at://${did}/app.bsky.feed.post/${post.rkey}`;
    const result = await apiJson(`app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`, reservation);
    const data = result.value as { thread?: { post?: { record?: { text?: unknown } } } } | null;
    const text = typeof data?.thread?.post?.record?.text === "string" ? data.thread.post.record.text.slice(0, 20_000) : null;
    if (result.cacheable) cacheSet(postCache, key, { text, until: now() + CACHE_TTL });
    return text;
  } finally {
    if (reservation) releaseReservation(reservation);
  }
}
