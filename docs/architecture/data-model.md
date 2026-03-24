# Data Model & Schema — Personal News Dashboard

**Project:** personal-news
**Last Updated:** 2026-03-24 (rev 3)

All data is stored in a single SQLite file at `{userData}/data.db`. All timestamps are Unix epoch integers (seconds). Boolean fields use `INTEGER NOT NULL DEFAULT 0/1` (SQLite has no native boolean type).

---

## 1. Migration Strategy

### 1.1 Version Tracking

```sql
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Seeded on first run:
INSERT INTO meta VALUES ('schema_version', '1');
```

### 1.2 Migration Files

For the v1.0.0 baseline, the app ships a single migration file:

```
001_initial.sql
```

On startup, `db/database.ts`:
1. Opens the SQLite connection.
2. Reads `meta.schema_version` (defaults to `0` if the `meta` table does not exist).
3. Applies `001_initial.sql` when `schema_version` is less than `1`.
4. Updates `meta.schema_version` to `1`.

If any migration fails, the transaction is rolled back and the app shows an error dialog and refuses to start (a corrupted partial migration is worse than a startup failure).

### 1.3 Future Migration Rules

- `001_initial.sql` is the immutable baseline for v1.0.0. Do not edit it after release.
- Future schema changes should be added as new files starting at `002_*.sql`.
- Each migration file is idempotent where possible (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- Destructive changes (DROP COLUMN, ALTER TABLE) require a new migration number.
- All migration files are bundled into the app at build time via electron-vite's `extraResources` config.

---

## 2. Tables

### 2.1 `meta`

Application metadata and schema versioning.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | e.g. `schema_version` |
| `value` | TEXT | NOT NULL | String value |

---

### 2.2 `settings`

Key-value store for all plain-text application settings.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `key` | TEXT | PRIMARY KEY | Setting identifier |
| `value` | TEXT | NOT NULL | Setting value (always string; parse as needed) |

**Known keys:**

| Key | Type hint | Default | Description |
|-----|-----------|---------|-------------|
| `widget_layout` | JSON object (see below) | see `useWidgetLayout.ts` | Full dashboard layout: widget_order (instanceIds), widget_visibility, widget_instances |
| `rss_poll_interval_minutes` | integer string | `"15"` | YouTube RSS polling interval |
| `ntfy_topic` | string | — | ntfy.sh topic name (plain text) |
| `ntfy_server_url` | URL string | `"https://ntfy.sh"` | ntfy server base URL |
| `ntfy_last_message_id` | string | — | Cursor for incremental ntfy polling |
| `ntfy_last_polled_at` | integer string (Unix ts) | — | Timestamp of last successful ntfy poll |
| `ntfy_onboarding_dismissed` | boolean string `"1"/"0"` | `"0"` | Whether user dismissed onboarding without completing |
| `active_theme_id` | string | `"system"` | Active theme. Built-in values: `"system"`, `"light"`, `"dark"`. For user-created themes, this is the `themes.id` value (see §2.9). |
| `reddit_digest_view_config:<instanceId>` | JSON object string | see below | Per-instance Reddit Digest view config. Keys: sort_by, sort_dir, group_by, layout_mode, subreddit_filter |

**Widget layout shape (`widget_layout` key):**

```json
{
  "widget_order": ["youtube_1", "reddit_digest_1", "reddit_digest_2"],
  "widget_visibility": { "youtube_1": true, "reddit_digest_1": true, "reddit_digest_2": false },
  "widget_instances": {
    "youtube_1":       { "instanceId": "youtube_1",       "moduleId": "youtube",       "label": null },
    "reddit_digest_1": { "instanceId": "reddit_digest_1", "moduleId": "reddit_digest", "label": "Tech News" },
    "reddit_digest_2": { "instanceId": "reddit_digest_2", "moduleId": "reddit_digest", "label": "Gaming" }
  }
}
```

`widget_order` contains **instanceIds** (not moduleIds). Multiple instances of the same module are supported. `label` is a user-supplied display name; `null` means use the module's default display name.

**DigestViewConfig shape (per instance):**

```json
{
  "sort_by": "score",
  "sort_dir": "desc",
  "group_by": "subreddit",
  "layout_mode": "columns",
  "subreddit_filter": ["rust", "programming"]
}
```

`subreddit_filter` is `null` to show all subreddits, or an array of subreddit names to restrict the widget to those subreddits only. This is what enables two Reddit Digest instances to show different content.

The YouTube Data API v3 key is **not** stored here. It is encrypted via `safeStorage` and stored as a binary blob in Electron's app config directory.

---

### 2.3 `yt_channels`

One row per configured YouTube channel.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `channel_id` | TEXT | PRIMARY KEY | YouTube channel ID (e.g. `UCxxxxxx`) |
| `name` | TEXT | NOT NULL | Channel display name |
| `thumbnail_url` | TEXT | | Channel avatar URL |
| `added_at` | INTEGER | NOT NULL | Unix timestamp when channel was added |
| `enabled` | INTEGER | NOT NULL DEFAULT 1 | `1` = shown on dashboard; `0` = hidden. Config and cached data are retained when disabled. |
| `sort_order` | INTEGER | NOT NULL DEFAULT 0 | Display order within the YouTube widget (lower = higher). Used for future per-channel reordering; defaults to insertion order. |

**Indexes:**

```sql
-- No additional indexes needed; channel_id is PK and cardinality is low (personal use: <50 channels).
```

---

### 2.4 `yt_videos`

One row per video discovered for a configured channel.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `video_id` | TEXT | PRIMARY KEY | YouTube video ID |
| `channel_id` | TEXT | NOT NULL, FK → `yt_channels.channel_id` | Owning channel |
| `title` | TEXT | NOT NULL | Video title |
| `published_at` | INTEGER | NOT NULL | Unix timestamp of publication |
| `thumbnail_url` | TEXT | | Thumbnail URL (from API v3; may be null if only RSS data exists) |
| `duration_sec` | INTEGER | | Video duration in seconds (from API v3; null until fetched) |
| `broadcast_status` | TEXT | | `'none'` \| `'upcoming'` \| `'live'` — null means not a live broadcast |
| `scheduled_start` | INTEGER | | Unix timestamp of scheduled stream start; null if not a stream |
| `fetched_at` | INTEGER | NOT NULL | Unix timestamp of last API v3 fetch for this video |

**Indexes:**

```sql
CREATE INDEX idx_yt_videos_channel_published
    ON yt_videos (channel_id, published_at DESC);

CREATE INDEX idx_yt_videos_broadcast_status
    ON yt_videos (broadcast_status)
    WHERE broadcast_status IN ('upcoming', 'live');
```

**Constraints:**

- On channel delete: cascade delete all videos for that channel.
- `broadcast_status` is refreshed on each RSS poll cycle for rows where `broadcast_status IN ('upcoming', 'live')` — these rows need schedule-change checks.

---

### 2.5 `reddit_digest_posts`

Top posts per subreddit collected by the Reddit digest script.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `post_id` | TEXT | PK part | Reddit post ID (the `t3_xxxxx` base36 ID, stored without the `t3_` prefix) |
| `week_start_date` | TEXT | PK part, NOT NULL | ISO date for the start of the ingest week, based on the user's configured week-start day |
| `subreddit` | TEXT | NOT NULL | Subreddit name (without `r/` prefix) |
| `title` | TEXT | NOT NULL | Post title |
| `url` | TEXT | NOT NULL | Linked URL (or permalink for text posts) |
| `permalink` | TEXT | NOT NULL | Full Reddit permalink path (e.g. `/r/sub/comments/xxx/...`) |
| `author` | TEXT | | Post author username; null if deleted |
| `score` | INTEGER | | Upvote score at time of collection |
| `num_comments` | INTEGER | | Comment count at time of collection |
| `created_utc` | INTEGER | NOT NULL | Unix timestamp of original post creation |
| `fetched_at` | INTEGER | NOT NULL | Unix timestamp when the script collected this post |

**Primary key:** `(post_id, week_start_date)`

**Indexes:**

```sql
CREATE INDEX idx_reddit_digest_subreddit_score
    ON reddit_digest_posts (subreddit, score DESC);

CREATE INDEX idx_reddit_digest_fetched_at
    ON reddit_digest_posts (fetched_at DESC);

CREATE INDEX idx_reddit_digest_week_start
    ON reddit_digest_posts (week_start_date DESC);
```

---

### 2.6 `saved_posts`

Links saved by the user via the ntfy.sh mobile flow. Supports Reddit, X/Twitter, Bluesky, and generic URLs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `post_id` | TEXT | PRIMARY KEY | Post/link ID (source-specific or hashed URL for generic) |
| `title` | TEXT | NOT NULL | Post title |
| `url` | TEXT | NOT NULL | Linked URL (or permalink for text posts) |
| `permalink` | TEXT | NOT NULL | Full permalink path |
| `subreddit` | TEXT | | Subreddit name; null for non-Reddit sources or if fetch failed |
| `author` | TEXT | | Author username; null if deleted or unavailable |
| `score` | INTEGER | | Score at time of ingestion |
| `body` | TEXT | | Post body text (for text posts); null for link posts |
| `saved_at` | INTEGER | NOT NULL | Unix timestamp when the app ingested this post |
| `tags` | TEXT | | JSON array of tag strings, e.g. `["ai","research"]`; null if untagged |
| `source` | TEXT | NOT NULL DEFAULT `'reddit'` | Link source: `'reddit'`, `'x'`, `'bsky'`, `'generic'` |

**Full-text search:**

```sql
CREATE VIRTUAL TABLE saved_posts_fts
    USING fts5(title, body, subreddit, source, content='saved_posts', content_rowid='rowid');

-- Trigger to keep FTS index in sync:
CREATE TRIGGER saved_posts_ai AFTER INSERT ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(rowid, title, body, subreddit, source)
        VALUES (new.rowid, new.title, new.body, new.subreddit, new.source);
END;

CREATE TRIGGER saved_posts_ad AFTER DELETE ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(saved_posts_fts, rowid, title, body, subreddit, source)
        VALUES ('delete', old.rowid, old.title, old.body, old.subreddit, old.source);
END;

CREATE TRIGGER saved_posts_au AFTER UPDATE ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(saved_posts_fts, rowid, title, body, subreddit, source)
        VALUES ('delete', old.rowid, old.title, old.body, old.subreddit, old.source);
    INSERT INTO saved_posts_fts(rowid, title, body, subreddit, source)
        VALUES (new.rowid, new.title, new.body, new.subreddit, new.source);
END;
```

**Indexes:**

```sql
CREATE INDEX idx_saved_posts_saved_at
    ON saved_posts (saved_at DESC);

CREATE INDEX idx_saved_posts_subreddit
    ON saved_posts (subreddit);

CREATE INDEX idx_saved_posts_source
    ON saved_posts (source);
```

**Tags note:** Tags are stored as a JSON array in the `tags` column. This is sufficient for v1 given expected cardinality (personal use, tens to hundreds of posts). A normalized `tags` table is not needed for v1. Tag filtering is done with `json_each()` in SQLite.

---

### 2.7 `themes`

User-created and built-in custom themes. This table is the extensibility hook for the theme system. The three built-in themes (`system`, `light`, `dark`) are **not** stored here — they are hardcoded in the renderer's `ThemeProvider`. Only user-created themes are persisted as rows.

The table is created in `001_initial.sql` (schema exists from day one) but ships empty. This means the migration is stable and no future migration is needed to add custom theme support — the table is already in place.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | Unique theme identifier. For user-created themes: a slug derived from the name, e.g. `"solarized-dark"`. Must not collide with reserved built-in IDs: `system`, `light`, `dark`. |
| `name` | TEXT | NOT NULL | Human-readable display name, e.g. `"Solarized Dark"` |
| `tokens` | TEXT | NOT NULL | JSON object mapping CSS variable names to values. Shape: `{ "--background": "...", "--foreground": "...", ... }` — uses the same variable names as shadcn/ui's Tailwind CSS variable system. |
| `created_at` | INTEGER | NOT NULL | Unix timestamp when the theme was created |

**Token shape (example):**

```json
{
  "--background": "0 0% 100%",
  "--foreground": "222.2 84% 4.9%",
  "--primary": "221.2 83.2% 53.3%",
  "--primary-foreground": "210 40% 98%"
}
```

Tokens use Tailwind's HSL format (space-separated `H S% L%` without the `hsl()` wrapper), matching how shadcn/ui declares theme variables in `globals.css`.

**v1 behavior:** The themes table exists and is queryable via IPC, but the Settings Appearance section only exposes the three built-in options. The `active_theme_id` setting stores `"system"`, `"light"`, or `"dark"`. The renderer's `ThemeProvider` applies the built-in theme by toggling a `data-theme` attribute on `<html>`. Custom theme application (loading `tokens` from DB and injecting CSS variables) is implemented in the `ThemeProvider` so that future custom themes require zero architectural work — only a settings UI to create/import themes.

**Indexes:** None required for v1 (table will have zero or very few rows).

---

### 2.8 `scripts`

Registered Python scripts managed by the Script Manager.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Script row ID |
| `name` | TEXT | NOT NULL | User-supplied display name |
| `description` | TEXT | | Optional script description shown in Script Manager |
| `file_path` | TEXT | NOT NULL | Absolute path to the `.py` file |
| `interpreter` | TEXT | NOT NULL DEFAULT `'python3'` | Interpreter to use; fixed to `'python3'` in v1 but stored for future extensibility |
| `args` | TEXT | | Arguments string (space-separated); null if none |
| `schedule` | TEXT | | JSON schedule config (see below); null = manual only |
| `enabled` | INTEGER | NOT NULL DEFAULT 0 | `1` = auto-run enabled for scheduled scripts; `0` = disabled |
| `created_at` | INTEGER | NOT NULL | Unix timestamp when script was registered |

**Schedule JSON shape:**

```json
// Manual only — schedule column is NULL

// On app start:
{ "type": "on_app_start" }

// Every N minutes:
{ "type": "interval", "minutes": 60 }

// Daily at fixed time:
{ "type": "fixed_time", "hour": 6, "minute": 0 }
```

**Normalization rule:** manual schedule (`schedule IS NULL`) always implies `enabled = 0`. The backend rejects any attempt to persist manual schedule with auto-run enabled.

---

### 2.9 `script_runs`

Execution history for each registered script.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Run row ID |
| `script_id` | INTEGER | NOT NULL, FK → `scripts.id` | Owning script |
| `started_at` | INTEGER | NOT NULL | Unix timestamp when execution started |
| `finished_at` | INTEGER | | Unix timestamp when execution completed; null if still running |
| `exit_code` | INTEGER | | Process exit code; null if still running or killed |
| `stdout` | TEXT | | Captured stdout (truncated to 50KB) |
| `stderr` | TEXT | | Captured stderr (truncated to 50KB) |

**Indexes:**

```sql
CREATE INDEX idx_script_runs_script_started
    ON script_runs (script_id, started_at DESC);
```

**Stale detection query** (computed at read time — no extra columns needed):

```sql
-- For a given script_id, get the last successful run:
SELECT finished_at
FROM script_runs
WHERE script_id = ? AND exit_code = 0
ORDER BY started_at DESC
LIMIT 1;
```

A script is stale when `(current_unix_time - finished_at) > schedule_interval_seconds`. Scripts with `schedule IS NULL` or `schedule.type = 'on_app_start'` are excluded from stale detection.

---

## 3. Entity Relationships

```
meta               (standalone — no FK)
settings           (standalone — no FK)
                   └── active_theme_id references themes.id (soft ref — not enforced by FK;
                       built-in IDs 'system'/'light'/'dark' have no row in themes table)

themes             (standalone — user-created theme records; empty in v1)

yt_channels 1───* yt_videos
    └── ON DELETE CASCADE → yt_videos

reddit_digest_posts (standalone — populated by Reddit digest script)

saved_posts         (standalone — populated by ntfy ingestion)
    └── saved_posts_fts (FTS5 virtual table, synced via triggers)

scripts 1───* script_runs
    └── ON DELETE CASCADE → script_runs
```

---

## 4. Key Constraints

- **YouTube API key** is never stored in SQLite. It lives in `safeStorage` encrypted storage managed by Electron.
- **Cascade deletes** are enabled: removing a channel deletes all its cached videos; removing a script deletes all its run history.
- **Upsert semantics**: `yt_videos`, `reddit_digest_posts`, and `saved_posts` all use `INSERT OR REPLACE` (or `INSERT ... ON CONFLICT DO UPDATE`) to be idempotent on re-poll.
- **Output truncation**: `script_runs.stdout` and `script_runs.stderr` are truncated at 50KB before insert. The truncation happens in the executor, not via a DB constraint.
- **FTS5 sync**: `saved_posts_fts` is kept in sync with `saved_posts` via INSERT/UPDATE/DELETE triggers. If the FTS table becomes corrupt, it can be rebuilt with `INSERT INTO saved_posts_fts(saved_posts_fts) VALUES ('rebuild')`.

---

## 5. Migration 001 — Initial Schema

The complete initial migration (`src/main/db/migrations/001_initial.sql`) creates all tables defined above in dependency order:

```
meta → settings → themes → yt_channels → yt_videos → reddit_digest_posts
→ saved_posts → saved_posts_fts + triggers → scripts → script_runs
→ all indexes
```

The `themes` table is created in migration 001 even though it ships empty. This avoids a future migration to add the table and keeps custom theme support purely additive (new settings UI only, no schema change).

Seed values inserted in migration 001:
- `meta.schema_version = '1'`
- `settings.active_theme_id = 'system'`
- `settings.widget_order = '["youtube","reddit_digest","saved_posts"]'` (SavedPostsWidget included)
- `settings.widget_visibility = '{"youtube":true,"reddit_digest":true,"saved_posts":true}'`
- `settings.rss_poll_interval_minutes = '15'`
- `settings.reddit_digest_view_config = '{"sort_by":"score","sort_dir":"desc","group_by":"subreddit","layout_mode":"columns"}'`
- `settings.ntfy_poll_interval_minutes = '60'`
- `settings.desktop_notification_prefs = '{"desktopNotificationsEnabled":true,"youtube":{"newVideo":true,"liveStart":true},"savedPosts":{"syncSuccess":true},"redditDigest":{"runSuccess":true,"runFailure":true},"scriptManager":{"autoRunSuccess":true,"autoRunFailure":true,"startupWarning":true}}'`

The baseline migration intentionally does not seed widget content tables. On first launch, the database schema is present and user content tables are empty.
