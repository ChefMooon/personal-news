# Data Source Modules — Implementation Spec

**Project:** personal-news
**Last Updated:** 2026-03-24 (rev 3)

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

The renderer module registry (`src/renderer/src/modules/registry.ts`) separately maps `id` to the widget component used on the dashboard. Widget settings panels live with the widget implementation rather than in a second registry.

---

## 1. YouTube Module

**Location:** `src/main/sources/youtube/`
**Module ID:** `youtube`

### 1.1 Files

| File | Responsibility |
|------|----------------|
| `index.ts` | `YouTubeModule` plus RSS parsing, YouTube Data API fetches, persistence, notification dispatch, and poll scheduling |

### 1.2 Initialization (`initialize`)

```
1. Read rss_poll_interval_minutes from settings table (default 15)
2. Keep the DB reference and create a node-cron task for that interval
3. Start the poller (immediate cycle + scheduled cycles)
4. Refresh channel thumbnails that were initially created from RSS-only metadata
```

### 1.3 Poll Cycle (`index.ts`)

Called for all enabled channels on every interval tick:

```typescript
async function pollCycle(db: Database): Promise<void> {
  const channels = getEnabledChannels(db)
  const rssCandidates = await fetchRssCandidates(channels)
  const uncachedVideoIds = findNewVideoIds(db, rssCandidates)
  const activeVideoIds = findTrackedUpcomingAndLiveVideoIds(db)

  const apiVideoIds = [...uncachedVideoIds, ...activeVideoIds]
  const apiVideos = await fetchYoutubeVideos(apiVideoIds)
  upsertVideos(db, apiVideos)
  emitYoutubeUpdated()
}
```

Current behavior highlights:

- RSS parsing is done inline with `fast-xml-parser`
- YouTube Data API access is performed from the same module after decrypting the stored API key with `safeStorage`
- media type classification (`video`, `short`, `upcoming_stream`, `live`) happens during ingest
- new-video and live-start desktop notifications are emitted from the poll cycle when preferences allow
- `settings:setRssPollInterval` reapplies the cron schedule immediately

### 1.4 Channel Add / Mutations

`youtube:addChannel` accepts either a channel ID or a supported YouTube URL, resolves channel metadata, creates the `yt_channels` row, and hydrates initial `yt_videos` data from RSS + API fetches.

The module also owns these mutations:

- `youtube:setChannelEnabled`
- `youtube:setChannelNotify`
- `youtube:setVideoWatched`
- `youtube:markChannelWatched`
- `youtube:clearVideosCache`
- `youtube:removeChannel`

    `youtube:addChannel` accepts either a channel ID or a supported YouTube URL, resolves channel metadata, creates the `yt_channels` row, and hydrates initial `yt_videos` data from RSS + API fetches.

    The current module also owns these mutations:

    - `youtube:setChannelEnabled`
    - `youtube:setChannelNotify`
    - `youtube:setVideoWatched`
    - `youtube:markChannelWatched`
    - `youtube:clearVideosCache`
    - `youtube:removeChannel`
async function pollNtfy(db: Database): Promise<{ postsIngested: number; messagesReceived: number }> {
  const topic = getSetting('ntfy_topic')
  if (!topic) return { postsIngested: 0, messagesReceived: 0 }

  const serverUrl = getSetting('ntfy_server_url') || 'https://ntfy.sh'
  const lastMessageId = getSetting('ntfy_last_message_id')
  const since = lastMessageId ?? 'all'
  const fetchUrl = `${serverUrl}/${encodeURIComponent(topic)}/json?poll=1&since=${encodeURIComponent(since)}`

  const response = await fetch(fetchUrl, { signal: controller.signal })
  const lines = (await response.text()).split('\n').filter(Boolean)

  for (const line of lines) {
    const msg = JSON.parse(line)
    if (msg.event !== 'message') continue

    const { url, note } = parseNtfyMessage(msg.message)
    if (!/^https?:\/\//i.test(url)) continue

    const post = await fetchMetadataForUrl(url, note)
    upsertSavedPost(db, post)
  }

  setSetting('ntfy_last_message_id', lastProcessedId)
  setSetting('ntfy_last_polled_at', String(Math.floor(Date.now() / 1000)))
  return { postsIngested, messagesReceived }
}
```

Key current behaviors:

- accepts Reddit, X/Twitter, Bluesky, and generic HTTP(S) URLs
- preserves an optional freeform note from the ntfy payload
- advances the cursor even when one message cannot be enriched
- throws on network/non-2xx failures so the caller can emit an error event while leaving the cursor unchanged

### 2.4 Source Routing and Reddit Validation

Saved Posts routing is not Reddit-only anymore. `link-sources.ts` matches the incoming URL first and then uses source-specific metadata handling. Reddit-specific validation remains in `validation.ts` / `metadata.ts` because Reddit still has the richest enrichment path.

Current source set:

- `reddit`
- `x`
- `bsky`
- `generic`

Reddit-specific validation:

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

Collects top posts for configured subreddits and writes a JSON payload to stdout. The Electron main process validates that payload and upserts it into `reddit_digest_posts`.

### 4.2 Configuration

The script reads its configuration from two sources (in priority order):
1. Command-line arguments: `--db-path`, `--time-window`, `--limit`, `--week-start`, optional `--subreddits`
2. The `settings` table in the SQLite database at `--db-path`

Required args:
- `--db-path <path>`: Absolute path to `data.db`

Optional args:
- `--time-window <week|month|all>`: Default `week`
- `--limit <n>`: Posts per subreddit. Default `25`.
- `--week-start <0|1>`: Week boundary used for snapshot bucketing. `0 = Sunday`, `1 = Monday` (default).
- `--subreddits <comma,separated,list>`: Optional subreddit subset for one-off current-week syncs started after adding a subreddit in Settings.

Required settings:
- `reddit_digest_subreddits`: JSON array of subreddit names, e.g. `["programming", "rust"]`

### 4.3 Behavior

```python
def fetch_top_posts(subreddit, time_window, limit):
  ...

payload = {
  "generated_at": int(time.time()),
  "week_start_date": "2026-03-16",
  "subreddits": subreddits,
  "posts": normalized_posts,
}
print(json.dumps(payload))
```

- Rate limiting: 1-second `time.sleep` between subreddit requests.
- Idempotent within a week: the Electron main process upserts on `(post_id, week_start_date)`.
- Exits with code `0` on success, non-zero on failure.
- Prints progress to stderr (visible in Script Manager live output) and reserves stdout for the final JSON payload.
- If `--subreddits` is provided, the script runs only for that subset; otherwise it uses the full configured subreddit list from settings.

### 4.4 First-Run Registration

When the user configures their first subreddit in Settings → Reddit Digest, the app automatically registers `reddit_digest.py` as a Script Manager entry with a default weekly schedule at `09:00` on Monday. The user can modify or delete this registration in the Script Manager.

After any newly added subreddit is saved, the app also starts a one-off background run of the bundled script for that subreddit only. This uses the same ingest path and weekly bucket semantics as scheduled runs, but it does not modify the stored schedule.

The app locates the bundled script via `process.resourcesPath/resources/scripts/reddit_digest.py`, with dev fallbacks to the repository `resources/scripts` path.

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
