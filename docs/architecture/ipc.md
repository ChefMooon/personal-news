# IPC Channel Registry — Personal News Dashboard

**Project:** personal-news
**Last Updated:** 2026-03-15 (rev 2)

---

## 1. Convention

All renderer-to-main communication uses `ipcRenderer.invoke` / `ipcMain.handle` (request/response, returns a Promise). All main-to-renderer push notifications use `BrowserWindow.webContents.send` / `ipcRenderer.on`.

**Invoke channels** (renderer calls, main handles): named `domain:verb` or `domain:verbNoun`.
**Push channels** (main sends, renderer listens): named `domain:eventName`.

The preload script exposes:

```typescript
window.api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on:     (channel: string, listener: Function) => ipcRenderer.on(channel, (_, ...args) => listener(...args)),
  off:    (channel: string, listener: Function) => ipcRenderer.removeListener(channel, listener),
}
```

Type-safe channel definitions live in `src/shared/ipc-types.ts` and are imported by both the preload script and the renderer.

---

## 2. YouTube Channels

### Invoke — Renderer → Main

---

#### `youtube:getChannels`

Returns all configured channels.

- **Args:** none
- **Returns:** `Channel[]`

```typescript
interface Channel {
  channelId: string;
  name: string;
  thumbnailUrl: string | null;
  addedAt: number;       // Unix timestamp
  enabled: boolean;
  sortOrder: number;
}
```

---

#### `youtube:addChannel`

Adds a new channel. Resolves the channel ID if a URL was provided, fetches channel metadata via `channels.list`, runs an initial `videos.list` for the RSS feed's current content, and upserts into `yt_channels` and `yt_videos`.

- **Args:** `[channelIdOrUrl: string]`
- **Returns:** `Channel` (the newly added channel)
- **Throws:** `{ code: 'NO_API_KEY' | 'CHANNEL_NOT_FOUND' | 'API_ERROR', message: string }`

---

#### `youtube:removeChannel`

Permanently removes a channel and all its cached videos.

- **Args:** `[channelId: string]`
- **Returns:** `{ ok: true }`

---

#### `youtube:setChannelEnabled`

Toggles a channel's enabled state on the dashboard.

- **Args:** `[channelId: string, enabled: boolean]`
- **Returns:** `{ ok: true }`

---

#### `youtube:getVideos`

Returns cached videos for a specific channel, sorted by `published_at DESC`.

- **Args:** `[channelId: string, limit?: number]`
- **Returns:** `Video[]`

```typescript
interface Video {
  videoId: string;
  channelId: string;
  title: string;
  publishedAt: number;
  thumbnailUrl: string | null;
  durationSec: number | null;
  broadcastStatus: 'none' | 'upcoming' | 'live' | null;
  scheduledStart: number | null;
  fetchedAt: number;
}
```

---

#### `youtube:getUpcomingStreams`

Returns all upcoming and live videos across all enabled channels, sorted by `scheduled_start ASC` (live streams first, then upcoming by time).

- **Args:** none
- **Returns:** `Video[]` (filtered to `broadcast_status IN ('upcoming', 'live')`)

---

#### `youtube:pollNow`

Triggers an immediate RSS poll for all enabled channels, bypassing the scheduled interval.

- **Args:** none
- **Returns:** `{ videosAdded: number }`

---

### Push — Main → Renderer

---

#### `youtube:updated`

Fired after any RSS poll cycle that detected new or changed data. The renderer re-fetches via `youtube:getChannels` / `youtube:getVideos`.

- **Payload:** none (renderer should re-query)

---

## 3. Reddit / Saved Posts Channels

### Invoke — Renderer → Main

---

#### `reddit:getSavedPosts`

Returns saved posts, sorted by `saved_at DESC`.

- **Args:** `[options?: { search?: string; subreddit?: string; tag?: string; limit?: number; offset?: number }]`
- **Returns:** `{ posts: SavedPost[]; total: number }`

```typescript
interface SavedPost {
  postId: string;
  title: string;
  url: string;
  permalink: string;
  subreddit: string | null;
  author: string | null;
  score: number | null;
  body: string | null;
  savedAt: number;
  tags: string[];  // empty array if null in DB
}
```

---

#### `reddit:updatePostTags`

Sets the tags on a saved post (full replace — not append).

- **Args:** `[postId: string, tags: string[]]`
- **Returns:** `{ ok: true }`

---

#### `reddit:getAllTags`

Returns a deduplicated list of all tag strings currently in use across saved posts.

- **Args:** none
- **Returns:** `string[]`

---

#### `reddit:renameTag`

Renames a tag across all saved posts that use it.

- **Args:** `[oldTag: string, newTag: string]`
- **Returns:** `{ affectedPosts: number }`

---

#### `reddit:deleteTag`

Removes a tag from all saved posts that use it.

- **Args:** `[tag: string]`
- **Returns:** `{ affectedPosts: number }`

---

#### `reddit:pollNtfy`

Triggers an immediate ntfy.sh poll (same logic as startup ingestion). Used by the stale warning "Sync Now" button and the Settings "Test Connection" button.

- **Args:** none
- **Returns:** `{ postsIngested: number; lastPolledAt: number }`
- **Throws:** `{ code: 'NTFY_UNREACHABLE' | 'NO_TOPIC_CONFIGURED', message: string }`

---

#### `reddit:getNtfyStaleness`

Returns the ntfy polling staleness state. The renderer uses this to decide whether to show the stale warning banner.

- **Args:** none
- **Returns:** `{ lastPolledAt: number | null; isStale: boolean; topicConfigured: boolean }`
  - `isStale` is `true` when `lastPolledAt` is null (and topic is configured) or when `Date.now()/1000 - lastPolledAt > 86400`.

---

#### `reddit:getDigestPosts`

Returns all digest posts. The handler returns raw data sorted by `fetched_at DESC` within each subreddit — the renderer applies the user's chosen sort/group/layout config client-side via `useRedditDigestConfig`.

- **Args:** `[options?: { subreddits?: string[]; limit?: number }]`
  - `subreddits`: if provided, limits results to those subreddits. Defaults to all.
  - `limit`: max posts per subreddit. Defaults to 25.
- **Returns:** `DigestPost[]` — flat array; grouping by subreddit is done in the renderer.

```typescript
interface DigestPost {
  postId: string;
  subreddit: string;
  title: string;
  url: string;
  permalink: string;
  author: string | null;
  score: number | null;
  numComments: number | null;
  createdUtc: number;
  fetchedAt: number;
}
```

Note: the previous return type was `{ [subreddit: string]: DigestPost[] }`. This is changed to a flat `DigestPost[]` array because the renderer's grouping logic is now owned by `RedditDigestWidget` (which applies `group_by` from the view config). The main process does not need to know about the grouping preference.

---

#### `reddit:getSavedPostsSummary`

Returns the N most recently saved posts for use by the `SavedPostsWidget` on the dashboard. Intentionally minimal — no search, no filtering, no tags loaded. The full `reddit:getSavedPosts` channel is used by the dedicated Saved Posts route.

- **Args:** `[limit?: number]` — defaults to `5`
- **Returns:** `SavedPostSummary[]`

```typescript
interface SavedPostSummary {
  postId: string;
  title: string;
  permalink: string;
  subreddit: string | null;
  savedAt: number;
}
```

---

### Push — Main → Renderer

---

#### `reddit:ntfyIngestComplete`

Fired after startup ntfy ingestion completes (success or failure).

- **Payload:** `{ postsIngested: number; error?: string }`

---

## 4. Script Manager Channels

### Invoke — Renderer → Main

---

#### `scripts:getAll`

Returns all registered scripts with their last-run summary.

- **Args:** none
- **Returns:** `ScriptSummary[]`

```typescript
interface ScriptSummary {
  id: number;
  name: string;
  filePath: string;
  interpreter: string;   // always 'python3' in v1
  args: string | null;
  schedule: ScheduleConfig | null;
  enabled: boolean;
  createdAt: number;
  lastRun: {
    startedAt: number;
    finishedAt: number | null;
    exitCode: number | null;
  } | null;
  isStale: boolean;      // computed: see data-sources.md staleness logic
  staleSince: number | null;  // Unix timestamp of last successful run (or null if never run)
}

type ScheduleConfig =
  | { type: 'on_app_start' }
  | { type: 'interval'; minutes: number }
  | { type: 'fixed_time'; hour: number; minute: number };
```

---

#### `scripts:create`

Registers a new script.

- **Args:** `[input: ScriptInput]`

```typescript
interface ScriptInput {
  name: string;
  filePath: string;
  args?: string;
  schedule?: ScheduleConfig | null;
}
```

- **Returns:** `ScriptSummary`
- **Throws:** `{ code: 'FILE_NOT_FOUND' | 'INVALID_PATH', message: string }`

---

#### `scripts:update`

Updates a registered script's configuration. If the schedule changes, the scheduler replaces the existing cron job.

- **Args:** `[id: number, updates: Partial<ScriptInput>]`
- **Returns:** `ScriptSummary`

---

#### `scripts:delete`

Removes a script and all its run history.

- **Args:** `[id: number]`
- **Returns:** `{ ok: true }`

---

#### `scripts:run`

Triggers immediate execution of a script. If the script is already running, returns an error.

- **Args:** `[id: number]`
- **Returns:** `{ runId: number }` (the newly created `script_runs` row ID)
- **Throws:** `{ code: 'ALREADY_RUNNING' | 'FILE_NOT_FOUND' | 'SCRIPT_NOT_FOUND', message: string }`

---

#### `scripts:cancel`

Sends SIGTERM to a running script.

- **Args:** `[id: number]`
- **Returns:** `{ ok: true }`
- **Throws:** `{ code: 'NOT_RUNNING', message: string }`

---

#### `scripts:getRunHistory`

Returns run history for a script, newest first.

- **Args:** `[scriptId: number, limit?: number]`
- **Returns:** `ScriptRun[]`

```typescript
interface ScriptRun {
  id: number;
  scriptId: number;
  startedAt: number;
  finishedAt: number | null;
  exitCode: number | null;
  stdout: string | null;
  stderr: string | null;
}
```

---

#### `scripts:getStaleStatus`

Returns a simple flag indicating whether any scheduled scripts are currently stale. Used by the Sidebar to show/hide the nav badge without loading full script data.

- **Args:** none
- **Returns:** `{ hasStale: boolean }`

---

### Push — Main → Renderer

---

#### `scripts:output`

Streams stdout/stderr chunks to the renderer while a script is running.

- **Payload:** `{ scriptId: number; runId: number; chunk: string; stream: 'stdout' | 'stderr' }`

---

#### `scripts:runComplete`

Fired when a script process exits (success or failure).

- **Payload:** `{ scriptId: number; runId: number; exitCode: number }`

---

## 5. Settings Channels

### Invoke — Renderer → Main

---

#### `settings:get`

Gets a single value from the `settings` table.

- **Args:** `[key: string]`
- **Returns:** `string | null`

---

#### `settings:set`

Sets a single value in the `settings` table. Upserts.

- **Args:** `[key: string, value: string]`
- **Returns:** `{ ok: true }`

---

#### `settings:getApiKeyStatus`

Returns whether the YouTube API key has been set, without returning the key value itself.

- **Args:** none
- **Returns:** `{ hasKey: boolean }`

---

#### `settings:setApiKey`

Encrypts and stores the YouTube API key via `safeStorage`.

- **Args:** `[key: string]`
- **Returns:** `{ ok: true }`

---

#### `settings:clearApiKey`

Removes the stored YouTube API key from `safeStorage`.

- **Args:** none
- **Returns:** `{ ok: true }`

---

#### `settings:testApiKey`

Validates the stored YouTube API key by making a minimal `channels.list` call.

- **Args:** none
- **Returns:** `{ valid: boolean; error?: string }`

---

#### `settings:getNtfyConfig`

Returns the ntfy configuration from the `settings` table.

- **Args:** none
- **Returns:** `{ topic: string | null; serverUrl: string }`
  - `serverUrl` defaults to `"https://ntfy.sh"` if not set.

---

#### `settings:setNtfyConfig`

Saves the ntfy topic and server URL to the `settings` table (plain text).

- **Args:** `[config: { topic: string; serverUrl?: string }]`
- **Returns:** `{ ok: true }`

---

#### `settings:getWidgetLayout`

Returns the current widget order and visibility state.

- **Args:** none
- **Returns:** `{ order: string[]; visibility: Record<string, boolean> }`

---

#### `settings:setWidgetLayout`

Persists a new widget order and/or visibility state.

- **Args:** `[layout: { order?: string[]; visibility?: Record<string, boolean> }]`
- **Returns:** `{ ok: true }`

---

#### `settings:getRedditDigestConfig`

Returns the configured subreddit list and time window.

- **Args:** none
- **Returns:** `{ subreddits: string[]; timeWindow: 'week' | 'month' | 'all' }`

---

#### `settings:setRedditDigestConfig`

Saves the subreddit list and time window to the `settings` table.

- **Args:** `[config: { subreddits: string[]; timeWindow: 'week' | 'month' | 'all' }]`
- **Returns:** `{ ok: true }`

---

#### `settings:getTheme`

Returns the active theme's identifier and, for user-created themes, its token map. Used by `ThemeProvider` on mount and after a theme change.

- **Args:** none
- **Returns:** `{ id: string; tokens: Record<string, string> | null }`
  - `id`: the `active_theme_id` setting value — one of `'system'`, `'light'`, `'dark'`, or a user-created theme ID from the `themes` table.
  - `tokens`: `null` for built-in themes; the `themes.tokens` JSON object for user-created themes. The renderer injects these as CSS custom properties on `:root` inside a `<style>` tag.

---

#### `settings:setTheme`

Sets the active theme. Updates `settings.active_theme_id`.

- **Args:** `[themeId: string]`
- **Returns:** `{ ok: true }`
- **Throws:** `{ code: 'THEME_NOT_FOUND', message: string }` if `themeId` is not a built-in ID and has no row in the `themes` table.

---

#### `settings:getAvailableThemes`

Returns the list of all themes the user can select: the three built-ins plus any user-created themes from the `themes` table.

- **Args:** none
- **Returns:** `ThemeOption[]`

```typescript
interface ThemeOption {
  id: string;
  name: string;
  isBuiltIn: boolean;  // true for 'system', 'light', 'dark'
}
```

---

## 6. Channel Summary Table

| Channel | Direction | Type | Description |
|---------|-----------|------|-------------|
| `youtube:getChannels` | R→M | invoke | List all channels |
| `youtube:addChannel` | R→M | invoke | Add channel by ID or URL |
| `youtube:removeChannel` | R→M | invoke | Delete channel + cached videos |
| `youtube:setChannelEnabled` | R→M | invoke | Toggle channel visibility |
| `youtube:getVideos` | R→M | invoke | Get cached videos for channel |
| `youtube:getUpcomingStreams` | R→M | invoke | Get all upcoming/live streams |
| `youtube:pollNow` | R→M | invoke | Manual RSS poll trigger |
| `youtube:updated` | M→R | push | New video/stream data available |
| `reddit:getSavedPosts` | R→M | invoke | Get saved posts (with search/filter) |
| `reddit:getSavedPostsSummary` | R→M | invoke | Get N most recent saved posts for dashboard widget |
| `reddit:updatePostTags` | R→M | invoke | Set tags on a post |
| `reddit:getAllTags` | R→M | invoke | List all tags in use |
| `reddit:renameTag` | R→M | invoke | Rename a tag across all posts |
| `reddit:deleteTag` | R→M | invoke | Delete a tag from all posts |
| `reddit:pollNtfy` | R→M | invoke | Manual ntfy poll trigger |
| `reddit:getNtfyStaleness` | R→M | invoke | Get ntfy poll staleness state |
| `reddit:getDigestPosts` | R→M | invoke | Get Reddit digest posts (flat array) |
| `reddit:ntfyIngestComplete` | M→R | push | Startup ingestion finished |
| `scripts:getAll` | R→M | invoke | List all scripts with status |
| `scripts:create` | R→M | invoke | Register a new script |
| `scripts:update` | R→M | invoke | Edit script config |
| `scripts:delete` | R→M | invoke | Delete script + run history |
| `scripts:run` | R→M | invoke | Run script immediately |
| `scripts:cancel` | R→M | invoke | Kill running script |
| `scripts:getRunHistory` | R→M | invoke | Get run history for script |
| `scripts:getStaleStatus` | R→M | invoke | Check if any scripts are stale |
| `scripts:output` | M→R | push | Live stdout/stderr chunk |
| `scripts:runComplete` | M→R | push | Script execution finished |
| `settings:get` | R→M | invoke | Get one setting value |
| `settings:set` | R→M | invoke | Set one setting value |
| `settings:getApiKeyStatus` | R→M | invoke | Check if YouTube API key is set |
| `settings:setApiKey` | R→M | invoke | Store YouTube API key (safeStorage) |
| `settings:clearApiKey` | R→M | invoke | Remove YouTube API key |
| `settings:testApiKey` | R→M | invoke | Validate stored API key |
| `settings:getNtfyConfig` | R→M | invoke | Get ntfy topic + server URL |
| `settings:setNtfyConfig` | R→M | invoke | Save ntfy topic + server URL |
| `settings:getWidgetLayout` | R→M | invoke | Get widget order + visibility |
| `settings:setWidgetLayout` | R→M | invoke | Persist widget order + visibility |
| `settings:getRedditDigestConfig` | R→M | invoke | Get subreddit list + time window |
| `settings:setRedditDigestConfig` | R→M | invoke | Save subreddit list + time window |
| `settings:getTheme` | R→M | invoke | Get active theme ID + tokens |
| `settings:setTheme` | R→M | invoke | Set active theme by ID |
| `settings:getAvailableThemes` | R→M | invoke | List all selectable themes (built-in + custom) |
