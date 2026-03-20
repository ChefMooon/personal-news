# ntfy Module — Architecture & Data Flow

ntfy is used as a zero-infrastructure push channel. The user sends any link (Reddit, X/Twitter, Bluesky, or generic URL) to a private ntfy topic from their phone, and the app polls that topic to ingest the link into the local `saved_posts` database with automatic source detection.

---

## High-Level Flow

```
Phone (share sheet)
  └─ POST message to ntfy topic
       └─ [ntfy.sh server holds message]

App startup / scheduled poll / manual poll
  └─ GET {server}/{topic}/json?poll=1&since={lastId}
       └─ Parse NDJSON response
            └─ For each URL:
                 ├─ detectSource(url) → reddit | x | bsky | generic
                 ├─ fetchMetadataForUrl(url, note) → source-specific metadata
                 │    ├─ Reddit: resolve short links, fetch JSON API
                 │    ├─ X / Bluesky: extract handle + post ID from URL
                 │    └─ Generic: use URL as title, hash as post_id
                 └─ UPSERT into saved_posts with source
```

---

## Files

| File | Purpose |
|---|---|
| `src/main/sources/reddit/ntfy.ts` | Core polling logic — HTTP call, NDJSON parse, DB upsert |
| `src/main/sources/reddit/metadata.ts` | Fetches post title/body/score from the Reddit JSON API |
| `src/main/sources/reddit/validation.ts` | URL validation regex and normalizer |
| `src/main/sources/reddit/index.ts` | Module entry — startup poll, mutex, push events |
| `src/main/sources/link-sources.ts` | Source detection registry — `detectSource()`, `getSourceLabel()`, `fetchMetadataForUrl()` |
| `src/main/ipc/index.ts` | IPC handlers exposed to the renderer |
| `src/shared/ipc-types.ts` | Shared types: `NtfyPollResult`, `NtfyStaleness`, `LinkSource` |

---

## Settings Keys

All stored in the `settings` table via `getSetting` / `setSetting`.

| Key | Description |
|---|---|
| `ntfy_topic` | Topic name on the ntfy server (required) |
| `ntfy_server_url` | Base URL of the ntfy server (defaults to `https://ntfy.sh`) |
| `ntfy_last_message_id` | ID of the last ntfy message processed — used as the `since` cursor |
| `ntfy_last_polled_at` | Unix timestamp of the last successful poll |
| `ntfy_poll_interval_minutes` | Background poll interval in minutes (default `60`) |

---

## Polling (`ntfy.ts`)

### Trigger points

1. **Startup** — `pollNtfyStartup()` is called when `RedditModule.initialize()` runs (main process boot). Errors are caught and broadcast as a push event; they do not crash the app.
2. **Scheduled** — a cron scheduler runs `triggerNtfyPoll()` using `ntfy_poll_interval_minutes` (defaults to 60). Existing scheduler tasks are restarted whenever interval settings change.
3. **Manual** — `triggerNtfyPoll()` is called by the `reddit:pollNtfy` IPC handler when the user clicks "Test Connection" or "Sync Now" in the UI.

All URLs are processed regardless of source. Non-Reddit URLs are routed through source detection and their source-specific metadata fetcher (or the generic fallback).

### Concurrency guard

A module-level `pollingInProgress` boolean prevents concurrent polls. `triggerNtfyPoll()` returns `{ postsIngested: 0, messagesReceived: 0 }` immediately if a poll is already running.

### HTTP request

```
GET {ntfy_server_url}/{topic}/json?poll=1&since={cursor}
```

- `poll=1` — return messages already in the server's log (non-streaming).
- `since=all` — fetch all historical messages when `ntfy_last_message_id` is not yet set.
- `since={id}` — fetch only messages newer than the last processed ID on subsequent polls.
- Timeout: 10 seconds via `AbortController`.
- **Throws** on network error or non-2xx HTTP status (callers handle the error).

### NDJSON parsing

The response body is newline-delimited JSON. Each line is one ntfy event:

```json
{"id":"abc123","event":"message","message":"https://www.reddit.com/..."}
```

Only lines where `event === "message"` are processed. Other event types (`open`, `keepalive`) are skipped.

### Message body parsing (`parseNtfyMessage`)

The `message` field supports three formats:

| Format | Example | Behaviour |
|---|---|---|
| Plain URL | `https://www.reddit.com/r/...` | URL only, no note |
| URL + note | `https://...\nmy note text` | First line = URL, rest = note |
| JSON object (share sheet) | `{"":"https://..."}` | Scans values for the first `https://` string |

The JSON format arises when certain mobile share-sheet clients (e.g. iOS Shortcuts) send structured data.

URLs from any HTTP/HTTPS source are accepted. Source detection determines metadata handling (see Source Detection below).

### Cursor advancement

After processing all lines, `ntfy_last_message_id` is updated to the last `msg.id` seen. This means re-polls only fetch new messages. `ntfy_last_polled_at` is always updated to the current timestamp on a successful poll, regardless of whether any posts were ingested.

---

## Source Detection (`link-sources.ts`)

The `SourceDefinition` interface defines per-source behaviour: URL pattern, post ID extraction, and metadata fetching. Source definitions are evaluated in order; the first matching `urlPattern` wins. If no pattern matches, the source is `generic`.

| Source | `urlPattern` | Metadata behaviour |
|---|---|---|
| `reddit` | `reddit.com/...` | Resolve short links, fetch Reddit JSON API for full post metadata |
| `x` | `x.com/...` or `twitter.com/...` | Extract handle and status ID from URL |
| `bsky` | `bsky.app/...` | Extract handle and post ID from URL |
| `generic` | _(fallback)_ | Use URL as title, hash URL for `post_id` |

Public functions:

- `detectSource(url)` — returns the `LinkSource` for a URL
- `getSourceLabel(source)` — returns a display label (e.g. `'Reddit'`, `'X'`, `'Bluesky'`, `'Link'`)
- `fetchMetadataForUrl(url, note)` — returns a `SavedPostInput` with source-specific fields populated

---

## URL Validation (`validation.ts`)

`isRedditPostUrl(url)` accepts:

- `https://reddit.com/r/.../comments/ID...`
- `https://www.reddit.com/r/.../comments/ID...`
- `https://new.reddit.com/r/.../comments/ID...`
- `https://old.reddit.com/r/.../comments/ID...`
- `https://m.reddit.com/r/.../comments/ID...`
- All of the above with `/s/SHORTCODE` instead of `/comments/ID` (share links)

`normalizeRedditUrl(url)` strips query strings and fragments, ensures a trailing `/`, and rewrites `new.`/`old.`/`m.` subdomains to `www.` for compatibility with the Reddit JSON API.

---

## Metadata Fetching (`metadata.ts`)

### Short link resolution

If the URL matches `/r/.../s/SHORTCODE`, a `HEAD` request is sent with `redirect: 'follow'`. The final `response.url` is the resolved canonical `/comments/...` URL. This is necessary because the Reddit JSON API does not understand `/s/` short links.

### JSON API call

```
GET https://www.reddit.com/r/{subreddit}/comments/{id}/.json
```

The response is an array; post data lives at `[0].data.children[0].data`. Fields extracted:

- `id`, `title`, `url`, `permalink`, `subreddit`, `author`, `score`, `selftext`

Both requests use a 10-second `AbortController` timeout and a `User-Agent` header to avoid Reddit's bot blocks.

---

## Database Upsert

The upsert uses `ON CONFLICT(post_id) DO UPDATE`:

```sql
INSERT INTO saved_posts (post_id, title, url, permalink, subreddit, author, score, body, saved_at, tags, note)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(post_id) DO UPDATE SET
  title    = excluded.title,
  url      = excluded.url,
  score    = excluded.score,
  note     = COALESCE(excluded.note, saved_posts.note)
```

Key points:
- Re-sending a URL that was already ingested updates its score and title (score can change over time).
- `note` is only overwritten if the new message includes one — an existing note is preserved if the re-send has no note (`COALESCE`).
- `tags` are never touched by the ingest path; they are managed exclusively through the UI.

---

## IPC Interface

| Channel | Direction | Description |
|---|---|---|
| `reddit:pollNtfy` | Renderer → Main | Triggers a manual poll. Returns `NtfyPollResult`. Throws `NO_TOPIC_CONFIGURED` if `ntfy_topic` is not set. |
| `reddit:getNtfyStaleness` | Renderer → Main | Returns `NtfyStaleness` — whether a topic is configured and whether the last poll was more than 24 hours ago. |
| `settings:setNtfyPollInterval` | Renderer → Main | Validates and saves `ntfy_poll_interval_minutes` (1..1440) and reapplies scheduler immediately. |
| `reddit:ntfyIngestComplete` | Main → Renderer (push) | Emitted after startup, scheduled, or manual poll completes. Payload: `{ postsIngested: number, error?: string }`. |

### `NtfyPollResult`

```typescript
interface NtfyPollResult {
  postsIngested: number    // Reddit posts successfully upserted
  messagesReceived: number // ntfy messages with event === 'message'
  lastPolledAt: number     // Unix timestamp of the completed poll
}
```

### `NtfyStaleness`

```typescript
interface NtfyStaleness {
  topicConfigured: boolean  // ntfy_topic setting is non-empty
  lastPolledAt: number | null
  isStale: boolean          // topicConfigured && (never polled OR last poll > 24h ago)
}
```

---

## Push Event Flow (Renderer)

The `SavedPostsWidget` and `SavedPosts` route both listen to `reddit:ntfyIngestComplete`. When received, they re-fetch the post list so newly ingested posts appear without a manual page refresh.

The `StaleWarning` banner reads `NtfyStaleness.isStale` on mount and shows an amber prompt to sync if data is more than 24 hours old.

---

## Staleness Threshold

A poll is considered stale if `now - ntfy_last_polled_at > 86400` seconds (24 hours). This threshold only applies when a topic is configured — if no topic is set, `isStale` is always `false` and the onboarding wizard is shown instead.
