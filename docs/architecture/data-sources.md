# Data Source Modules — Implementation Spec

**Project:** personal-news
**Last Updated:** 2026-03-15 (rev 2)

---

## 0. Module Interface

All data source modules implement the `DataSourceModule` interface defined in `src/main/sources/registry.ts`:

```typescript
import type { Database } from 'better-sqlite3';

export interface DataSourceModule {
  id: string;                    // Unique, stable identifier — used as FK across the system
  displayName: string;           // Human-readable name shown in UI
  initialize(db: Database): void; // Called once on app start; receives open DB connection
  shutdown(): void;              // Called on app quit; clear timers, kill child processes
}
```

The registry holds the array of all registered modules. On app start, `registry.initialize(db)` calls `initialize` on each module in registration order. On app quit, `registry.shutdown()` calls `shutdown` on each.

The renderer module registry (`src/renderer/modules/registry.ts`) separately maps `id` to `WidgetComponent` and `SettingsComponent`. The `id` field is the join key between the two registries.

---

## 1. YouTube Module

**Location:** `src/main/sources/youtube/`
**Module ID:** `youtube`

### 1.1 Files

| File | Responsibility |
|------|----------------|
| `index.ts` | `YouTubeModule` class — implements `DataSourceModule`; starts/stops poller |
| `rss.ts` | `fetchChannelFeed(channelId)` — fetches and parses the Atom XML feed |
| `api.ts` | `YouTubeApiClient` — wraps `videos.list` and `channels.list` calls |
| `poller.ts` | `RssPoller` — manages the interval timer; runs poll cycles |

### 1.2 Initialization (`initialize`)

```
1. Read rss_poll_interval_minutes from settings table (default 15)
2. Construct RssPoller with interval
3. Start the poller (runs immediately, then on interval)
4. Register a listener for settings changes to rss_poll_interval_minutes
   — on change, stop the current poller and start a new one with the new interval
```

### 1.3 RSS Poll Cycle (`poller.ts`)

Called for all enabled channels on every interval tick:

```typescript
async function pollCycle(db: Database, apiClient: YouTubeApiClient) {
  const channels = db.prepare(
    'SELECT channel_id FROM yt_channels WHERE enabled = 1'
  ).all();

  for (const { channel_id } of channels) {
    const feedVideoIds = await fetchChannelFeed(channel_id);  // rss.ts

    const knownIds = db.prepare(
      'SELECT video_id FROM yt_videos WHERE channel_id = ?'
    ).all(channel_id).map(r => r.video_id);

    const newIds = feedVideoIds.filter(id => !knownIds.includes(id));

    if (newIds.length > 0) {
      const videos = await apiClient.videosListBatch(newIds);
      upsertVideos(db, videos);  // INSERT OR REPLACE into yt_videos
    }

    // Re-check upcoming/live streams for schedule changes
    const activeStreams = db.prepare(
      "SELECT video_id FROM yt_videos WHERE channel_id = ? AND broadcast_status IN ('upcoming', 'live')"
    ).all(channel_id).map(r => r.video_id);

    if (activeStreams.length > 0) {
      const refreshed = await apiClient.videosListBatch(activeStreams);
      upsertVideos(db, refreshed);
    }
  }

  // Notify renderer of updates
  BrowserWindow.getAllWindows()[0]?.webContents.send('youtube:updated');
}
```

### 1.4 RSS Feed Parser (`rss.ts`)

- Fetches `https://www.youtube.com/feeds/videos.xml?channel_id={channelId}`
- Parses Atom XML using **`fast-xml-parser`** (confirmed). No native module; pure JavaScript; fast enough for the feed sizes encountered here (15–30 entries per channel).
- Extracts `<yt:videoId>` elements.
- Returns `string[]` of video IDs.
- Throws a typed error if the HTTP request fails or response is not valid XML; the poller catches and logs this, then continues to the next channel.

### 1.5 YouTube API Client (`api.ts`)

```typescript
class YouTubeApiClient {
  private apiKey: string;  // Decrypted from safeStorage on construction

  async videosListBatch(videoIds: string[]): Promise<RawVideoData[]>;
  // Parts: snippet,contentDetails,liveStreamingDetails
  // URL: https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,liveStreamingDetails&id={ids}&key={apiKey}
  // Max 50 IDs per call. If videoIds.length > 50, split into batches.

  async channelsList(channelId: string): Promise<RawChannelData>;
  // Parts: snippet
  // URL: https://www.googleapis.com/youtube/v3/channels?part=snippet&id={channelId}&key={apiKey}
}
```

- All HTTP calls use the Node.js built-in `fetch` (available in Node 18+, which Electron 28+ ships with).
- On HTTP 403 (quota exceeded): log a warning; do not throw; return empty array so the poller can continue.
- On HTTP 400 (bad request / invalid key): log an error; emit an IPC event `youtube:apiError` with the error message so the renderer can surface a "Check your API key" prompt.

### 1.6 Channel Add Flow (IPC: `youtube:addChannel`)

```
1. Parse input: if URL, extract channel ID.
   - Handle both @handle URLs and direct channel ID URLs.
   - If @handle format: make a search.list call to resolve channel ID.
     (Cost: 100 units — acceptable as one-time operation on channel add)
2. Check channel not already in DB.
3. Call channelsList(channelId) → get name and thumbnail.
4. Insert into yt_channels.
5. Fetch RSS feed for initial video IDs.
6. Batch-fetch video metadata via videosListBatch.
7. Upsert into yt_videos.
8. Return the new Channel record.
```

### 1.7 Shutdown

```
1. clearInterval on the poller timer.
```

---

## 2. Reddit Module

**Location:** `src/main/sources/reddit/`
**Module ID:** `reddit`

### 2.1 Files

| File | Responsibility |
|------|----------------|
| `index.ts` | `RedditModule` class — implements `DataSourceModule`; runs ntfy startup poll |
| `ntfy.ts` | `pollNtfy(db, options)` — polls ntfy topic, ingests saved posts |
| `metadata.ts` | `fetchRedditPost(url)` — fetches Reddit post metadata from JSON API |

### 2.2 Initialization (`initialize`)

```
1. Store db reference.
2. Call pollNtfy(db) immediately (startup ingestion).
3. After poll completes (success or failure), send 'reddit:ntfyIngestComplete' to renderer.
```

### 2.3 ntfy.sh Poller (`ntfy.ts`)

```typescript
async function pollNtfy(db: Database): Promise<{ postsIngested: number }> {
  const topic = getSetting(db, 'ntfy_topic');
  if (!topic) return { postsIngested: 0 };

  const serverUrl = getSetting(db, 'ntfy_server_url') ?? 'https://ntfy.sh';
  const lastMessageId = getSetting(db, 'ntfy_last_message_id') ?? null;

  const since = lastMessageId ?? 'all';
  const url = `${serverUrl}/${topic}/json?poll=1&since=${since}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'personal-news/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Network error — log, leave cursor unchanged, do NOT update ntfy_last_polled_at
    logger.warn('ntfy.sh unreachable — skipping startup poll');
    return { postsIngested: 0 };
  }

  if (!response.ok) {
    logger.warn(`ntfy poll returned HTTP ${response.status}`);
    return { postsIngested: 0 };
  }

  const text = await response.text();
  const lines = text.trim().split('\n').filter(Boolean);
  const messages = lines.map(l => JSON.parse(l)).filter(m => m.event === 'message');

  let postsIngested = 0;
  let lastProcessedId: string | null = null;

  for (const msg of messages) {
    lastProcessedId = msg.id;
    const url = msg.message?.trim();

    if (!isRedditPostUrl(url)) {
      logger.info(`ntfy: ignoring non-Reddit message ${msg.id}`);
      continue;
    }

    try {
      const post = await fetchRedditPost(url);
      upsertSavedPost(db, post);
      postsIngested++;
    } catch (err) {
      logger.warn(`ntfy: failed to fetch Reddit metadata for ${url}`, err);
      // Continue — cursor advances past failed messages
    }
  }

  if (lastProcessedId) {
    setSetting(db, 'ntfy_last_message_id', lastProcessedId);
  }
  setSetting(db, 'ntfy_last_polled_at', String(Math.floor(Date.now() / 1000)));

  return { postsIngested };
}
```

### 2.4 Reddit URL Validation

```typescript
const REDDIT_POST_URL_PATTERN =
  /^https?:\/\/(www\.)?reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+/i;

function isRedditPostUrl(url: unknown): url is string {
  return typeof url === 'string' && REDDIT_POST_URL_PATTERN.test(url);
}
```

### 2.5 Reddit Post Metadata Fetcher (`metadata.ts`)

```typescript
async function fetchRedditPost(postUrl: string): Promise<SavedPostInput> {
  // Normalize URL: strip query params, ensure it ends with /
  const cleanUrl = normalizeRedditUrl(postUrl);
  const apiUrl = `${cleanUrl}.json`;

  const response = await fetch(apiUrl, {
    headers: { 'User-Agent': 'personal-news/1.0' },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) {
    throw new Error(`Reddit post not found: ${postUrl}`);
  }
  if (!response.ok) {
    throw new Error(`Reddit API error: HTTP ${response.status}`);
  }

  const data = await response.json();
  const post = data[0]?.data?.children?.[0]?.data;

  if (!post) {
    throw new Error(`Unexpected Reddit API response shape for ${postUrl}`);
  }

  return {
    postId: post.id,
    title: post.title,
    url: post.url,
    permalink: post.permalink,
    subreddit: post.subreddit,
    author: post.author === '[deleted]' ? null : post.author,
    score: post.score,
    body: post.selftext || null,
    savedAt: Math.floor(Date.now() / 1000),
    tags: null,
  };
}
```

### 2.6 Staleness Detection (`reddit:getNtfyStaleness`)

Handled in the IPC layer, not in the module:

```typescript
ipcMain.handle('reddit:getNtfyStaleness', () => {
  const topic = getSetting(db, 'ntfy_topic');
  const lastPolledAt = getSetting(db, 'ntfy_last_polled_at');
  const lastPolledAtNum = lastPolledAt ? parseInt(lastPolledAt, 10) : null;
  const topicConfigured = Boolean(topic);

  const STALE_THRESHOLD_SEC = 86400; // 24 hours
  const now = Math.floor(Date.now() / 1000);

  const isStale = topicConfigured && (
    lastPolledAtNum === null ||
    (now - lastPolledAtNum) > STALE_THRESHOLD_SEC
  );

  return { lastPolledAt: lastPolledAtNum, isStale, topicConfigured };
});
```

### 2.7 Tag Operations

Tag management (rename, delete) uses SQLite's `json_each()` to find and modify posts:

```sql
-- Find all posts with tag 'foo':
SELECT post_id, tags FROM saved_posts
WHERE EXISTS (
  SELECT 1 FROM json_each(tags) WHERE value = 'foo'
);

-- Rename tag (done in application code: load, modify array, write back):
-- 1. SELECT post_id, tags FROM saved_posts WHERE tags LIKE '%"foo"%'
-- 2. For each: parse JSON array, replace 'foo' with 'bar', UPDATE saved_posts SET tags = ?
```

### 2.8 Shutdown

No persistent timers. Nothing to clean up.

---

## 3. Script Manager Module

**Location:** `src/main/sources/scripts/`
**Module ID:** `scripts`

### 3.1 Files

| File | Responsibility |
|------|----------------|
| `index.ts` | `ScriptManagerModule` — implements `DataSourceModule`; orchestrates scheduler and executor |
| `executor.ts` | `ScriptExecutor` — wraps `child_process.spawn`; streams output; writes run record |
| `scheduler.ts` | `ScriptScheduler` — manages `node-cron` jobs; detects stale scripts |

### 3.2 Initialization (`initialize`)

```
1. Store db reference.
2. Load all enabled scripts with a non-null schedule from the DB.
3. For each script with schedule.type === 'on_app_start': execute immediately via executor.ts.
4. For each script with schedule.type === 'interval' or 'fixed_time': register a node-cron job.
5. Scheduler stores a Map<scriptId, CronJob> for later cancellation/replacement.
```

### 3.3 Executor (`executor.ts`)

```typescript
interface RunResult {
  runId: number;
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runScript(
  db: Database,
  scriptId: number,
  interpreter: string,     // 'python3' in v1
  filePath: string,
  args: string[],
  onOutput: (chunk: string, stream: 'stdout' | 'stderr') => void,
): Promise<RunResult> {

  const startedAt = Math.floor(Date.now() / 1000);

  // Insert in-progress run record
  const runId = db.prepare(
    'INSERT INTO script_runs (script_id, started_at) VALUES (?, ?)'
  ).run(scriptId, startedAt).lastInsertRowid as number;

  const child = spawn(interpreter, [filePath, ...args], {
    cwd: path.dirname(filePath),
    env: { ...process.env },
  });

  const MAX_OUTPUT_BYTES = 50 * 1024; // 50KB
  let stdoutBuf = '';
  let stderrBuf = '';

  child.stdout.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    onOutput(text, 'stdout');
    if (Buffer.byteLength(stdoutBuf, 'utf8') < MAX_OUTPUT_BYTES) {
      stdoutBuf += text;
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    onOutput(text, 'stderr');
    if (Buffer.byteLength(stderrBuf, 'utf8') < MAX_OUTPUT_BYTES) {
      stderrBuf += text;
    }
  });

  const exitCode = await new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? -1));
  });

  const finishedAt = Math.floor(Date.now() / 1000);

  // Update run record
  db.prepare(`
    UPDATE script_runs
    SET finished_at = ?, exit_code = ?, stdout = ?, stderr = ?
    WHERE id = ?
  `).run(finishedAt, exitCode, truncate(stdoutBuf, MAX_OUTPUT_BYTES), truncate(stderrBuf, MAX_OUTPUT_BYTES), runId);

  return { runId, exitCode, stdout: stdoutBuf, stderr: stderrBuf };
}
```

The IPC handler for `scripts:run` holds a `Map<scriptId, ChildProcess>` to support cancellation via `scripts:cancel`.

### 3.4 Scheduler (`scheduler.ts`)

```typescript
// Schedule conversion: ScheduleConfig → cron expression
function toCronExpression(schedule: ScheduleConfig): string {
  switch (schedule.type) {
    case 'interval':
      // Every N minutes: */N * * * *  (max every 1 min)
      return `*/${schedule.minutes} * * * *`;
    case 'fixed_time':
      // Daily at HH:MM: MM HH * * *
      return `${schedule.minute} ${schedule.hour} * * *`;
    default:
      throw new Error(`Cannot create cron for schedule type: ${schedule.type}`);
  }
}
```

On `scripts:create` or `scripts:update`, the scheduler:
1. Cancels the existing cron job for that script ID (if any).
2. If the new schedule is `interval` or `fixed_time`, creates and starts a new cron job.
3. Updates the `Map<scriptId, CronJob>`.

### 3.5 Stale Detection

Computed at query time in the `scripts:getAll` IPC handler:

```typescript
function isScriptStale(script: ScriptRow, lastSuccessfulRun: ScriptRunRow | null): boolean {
  if (!script.schedule) return false;
  const schedule = JSON.parse(script.schedule) as ScheduleConfig;
  if (schedule.type === 'on_app_start') return false;

  const thresholdSeconds =
    schedule.type === 'interval'
      ? schedule.minutes * 60
      : 86400; // fixed_time = 24h

  if (!lastSuccessfulRun) return true; // never run = immediately stale

  const now = Math.floor(Date.now() / 1000);
  return (now - lastSuccessfulRun.finished_at) > thresholdSeconds;
}
```

### 3.6 Shutdown

```
1. Iterate Map<scriptId, CronJob> — call job.stop() on each.
2. Iterate Map<scriptId, ChildProcess> (running scripts) — call child.kill() on each.
```

---

## 4. Default Reddit Digest Script

**Location:** `resources/scripts/reddit_digest.py`
**Bundled with app:** Yes (via electron-builder `extraResources`)

### 4.1 Purpose

Collects top posts for configured subreddits and writes them to the `reddit_digest_posts` table in the local SQLite database.

### 4.2 Configuration

The script reads its configuration from two sources (in priority order):
1. Command-line arguments: `--db-path`, `--subreddits`, `--time-window`
2. The `settings` table in the SQLite database at `--db-path`

Required args:
- `--db-path <path>`: Absolute path to `data.db`
- `--subreddits <r1,r2,r3>`: Comma-separated subreddit names

Optional args:
- `--time-window <week|month|all>`: Default `week`
- `--limit <n>`: Posts per subreddit. Default `25`.

### 4.3 Behavior

```python
import sqlite3, requests, time, argparse

def fetch_top_posts(subreddit, time_window, limit):
    url = f"https://www.reddit.com/r/{subreddit}/top.json?t={time_window}&limit={limit}"
    headers = {"User-Agent": "personal-news-digest/1.0"}
    resp = requests.get(url, headers=headers, timeout=15)
    resp.raise_for_status()
    return resp.json()["data"]["children"]

def upsert_post(conn, post_data, subreddit):
    data = post_data["data"]
    conn.execute("""
        INSERT INTO reddit_digest_posts
            (post_id, subreddit, title, url, permalink, author, score, num_comments, created_utc, fetched_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(post_id) DO UPDATE SET
            score = excluded.score,
            num_comments = excluded.num_comments,
            fetched_at = excluded.fetched_at
    """, (
        data["id"], subreddit, data["title"], data["url"],
        data["permalink"], data.get("author"), data["score"],
        data["num_comments"], int(data["created_utc"]),
        int(time.time())
    ))
```

- Rate limiting: 1-second `time.sleep` between subreddit requests.
- Idempotent: uses `ON CONFLICT DO UPDATE` (upsert).
- Exits with code `0` on success, non-zero on failure.
- Prints progress to stdout (visible in Script Manager live output).

### 4.4 First-Run Registration

When the user configures their first subreddit in Settings → Reddit Digest, the app automatically registers `reddit_digest.py` as a Script Manager entry with a default `fixed_time` schedule of `06:00` daily. The user can modify or delete this registration in the Script Manager.

The app locates the bundled script via `app.getAppPath()` + `resources/scripts/reddit_digest.py` (or `process.resourcesPath` in packaged builds).

---

## 5. Module Registry

**Location:** `src/main/sources/registry.ts`

```typescript
import { YouTubeModule } from './youtube/index';
import { RedditModule } from './reddit/index';
import { ScriptManagerModule } from './scripts/index';

const modules: DataSourceModule[] = [
  new YouTubeModule(),
  new RedditModule(),
  new ScriptManagerModule(),
];

export const registry = {
  initialize(db: Database) {
    for (const mod of modules) mod.initialize(db);
  },
  shutdown() {
    for (const mod of modules) mod.shutdown();
  },
  getAll() {
    return modules;
  },
};
```

Adding a new data source = create a new module class implementing `DataSourceModule`, add one line to the array. No other changes required to core app code.
