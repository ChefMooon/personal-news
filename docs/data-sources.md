# Data Sources Specification — Personal News Dashboard

**Project:** personal-news
**Status:** Current implementation
**Last Updated:** 2026-03-24
**Related Docs:** [PRD.md](./PRD.md) | [tech-notes.md](./tech-notes.md)

---

## Overview

This document specifies how each data source is integrated, what data is collected, how it is fetched, and how it is stored. All sources write to the local SQLite database. No data is sent to any external service by the app itself.

Each data source is a self-contained module. The plugin/module boundary is defined such that adding a new source does not require changes to core dashboard code (see NFR-04 in PRD.md).

---

## 1. YouTube

### 1.1 Purpose

Display upcoming live streams and recent video uploads for a configured list of YouTube channels.

### 1.2 Data Collected

| Field | Source | Notes |
|-------|--------|-------|
| Channel ID | User config | Entered in Settings |
| Channel name | YouTube Data API v3 | Fetched on channel add |
| Channel thumbnail | Temp avatar + YouTube Data API v3 | Temporary avatar on channel add; replaced on later poll by channels.list |
| Video ID | RSS feed | Primary discovery mechanism |
| Video title | RSS feed | Available in feed |
| Video published date | RSS feed | Available in feed |
| Video thumbnail | YouTube Data API v3 | Fetched only for new videos |
| Video duration | YouTube Data API v3 | Fetched only for new videos |
| Stream scheduled start time | YouTube Data API v3 | Only for upcoming/active live streams |
| Stream status | YouTube Data API v3 | liveBroadcastContent: none / live / upcoming |

### 1.3 Fetch Strategy

The app uses a two-tier strategy to minimize YouTube Data API v3 quota consumption (quota cost is 1 unit per `videos.list` call for up to 50 videos):

**Tier 1 — RSS Feed (quota-free)**

YouTube exposes a public Atom RSS feed per channel:
```
https://www.youtube.com/feeds/videos.xml?channel_id={CHANNEL_ID}
```
This feed returns the 15 most recent uploads with title, published date, video ID, and description. No API key required.

- The app polls this feed on a user-configurable interval (default: 15 minutes). The interval is stored in the `settings` table under the key `rss_poll_interval_minutes` and is configurable from the YouTube section of the Settings screen.
- Feed results are compared against stored video IDs.
- If no new video IDs are detected, no API call is made.

**Tier 2 — YouTube Data API v3 (triggered by RSS delta)**

When new video IDs are detected in the RSS feed:
- A batch `videos.list` request is made for all new IDs in a single call (up to 50 per call).
- Parts requested: `snippet`, `contentDetails`, `liveStreamingDetails`.
- Results are stored in the database and the UI is updated.

**Channel initialization (on add):**
- A temporary local avatar is stored immediately so the channel list has a stable thumbnail without waiting for poll.
- An initial `videos.list` call fetches metadata for the first batch of videos from the RSS feed.

**Channel thumbnail refresh (during poll):**
- Poll cycles run a `channels.list` refresh only for channels still using temporary or missing thumbnails.
- The returned channel thumbnail replaces `yt_channels.thumbnail_url`.
- This refresh updates channel thumbnails only and does not modify `yt_videos.thumbnail_url` behavior.

### 1.4 Live Stream Detection

- A video is flagged as "upcoming" when `liveStreamingDetails.scheduledStartTime` is present and `snippet.liveBroadcastContent == "upcoming"`.
- A video is flagged as "live" when `snippet.liveBroadcastContent == "live"`.
- Upcoming and live streams are shown in the left card on the channel row.
- Time-until-start is calculated client-side from `scheduledStartTime`.

**Edge cases:**
- Streams that are delayed or rescheduled: the app re-fetches `liveStreamingDetails` for known upcoming streams on each RSS poll cycle to pick up schedule changes.
- Streams that end: once `liveBroadcastContent` transitions away from "live", the stream card is removed and the video moves to the recent video carousel.
- Cancelled streams: treated as regular videos once they are no longer "upcoming".

### 1.5 API Key Requirements

- A YouTube Data API v3 key is required. This is a server key (no OAuth needed for public channel data).
- Entered via the Settings screen and stored via `safeStorage` (see tech-notes.md Section 5).
- Assumed: free-tier quota (10,000 units/day) is sufficient for personal use with a reasonable channel count and polling interval.

### 1.6 Database Schema (YouTube)

```sql
CREATE TABLE yt_channels (
    channel_id   TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    thumbnail_url TEXT,
    added_at     INTEGER NOT NULL,  -- Unix timestamp
    enabled      INTEGER NOT NULL DEFAULT 1  -- 1 = shown on dashboard, 0 = hidden; config and cache retained when disabled
);

CREATE TABLE yt_videos (
    video_id     TEXT PRIMARY KEY,
    channel_id   TEXT NOT NULL REFERENCES yt_channels(channel_id),
    title        TEXT NOT NULL,
    published_at INTEGER NOT NULL,  -- Unix timestamp
    thumbnail_url TEXT,
    duration_sec INTEGER,
    broadcast_status TEXT,          -- 'none' | 'upcoming' | 'live'
    scheduled_start INTEGER,        -- Unix timestamp, nullable
    fetched_at   INTEGER NOT NULL,
    FOREIGN KEY (channel_id) REFERENCES yt_channels(channel_id)
);
```

---

## 2. Reddit — Automated Digest

### 2.1 Purpose

Surface the top posts from configured subreddits over the past week, collected automatically by a managed script rather than by real-time API calls from the UI.

### 2.2 Data Collection Mechanism

This source uses the Script Manager (see Section 4) to run a Python script on a schedule. The script queries Reddit for top posts and writes results to the local SQLite database. The dashboard UI reads from the database — it does not call the Reddit API directly.

This separation means:
- The UI is never blocked by slow API calls.
- The script can be run independently or debugged outside the app.
- Users can customize or replace the script without modifying app code.

### 2.3 Default Script Behavior

The bundled Reddit digest script:
- Accepts a list of subreddits and a time window (default: `week`) as configuration.
- Supports one-off current-week runs for a supplied subreddit subset when the user adds a new subreddit in Settings.
- Buckets each ingest run under a `week_start_date` derived from the user's configured week-start day (`Sunday` or `Monday`).
- Uses the Reddit public JSON API (`https://www.reddit.com/r/{subreddit}/top.json?t=week&limit=25`) — no OAuth required for public subreddits.
- Writes results to the `reddit_digest_posts` table.
- Is idempotent within a week: re-running during the same week updates the same `(post_id, week_start_date)` row instead of duplicating it.

When a subreddit is added in Settings, the app saves it immediately and then starts a background current-week sync for that subreddit so the user does not need to wait for the next scheduled weekly run.

This means the same Reddit post can appear in multiple weekly snapshots if it remains a top post across multiple weeks.

**Access method:** The public Reddit JSON API is used — no OAuth and no user login required. This is sufficient for top posts on public subreddits, which is the intended scope. Private subreddits and NSFW content are explicitly out of scope for v1 and are not supported by this approach.

**Rate limiting:** The public API allows ~1 request/second with a proper User-Agent. The script should set a descriptive User-Agent and include appropriate delays between subreddit requests.

### 2.4 Database Schema (Reddit Digest)

```sql
CREATE TABLE reddit_digest_posts (
    post_id         TEXT NOT NULL,
    week_start_date TEXT NOT NULL,   -- ISO date for the start of the ingest week, e.g. 2026-03-16
    subreddit       TEXT NOT NULL,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    permalink       TEXT NOT NULL,
    author          TEXT,
    score           INTEGER,
    num_comments    INTEGER,
    created_utc     INTEGER NOT NULL,  -- Unix timestamp
    fetched_at      INTEGER NOT NULL,
    PRIMARY KEY (post_id, week_start_date)
);
```

---

## 3. Saved Posts (ntfy.sh)

### 3.1 Purpose

Allow users to save Reddit posts and other links from their phone. The user shares a URL to a private ntfy.sh topic via an iOS Shortcut or Android Share Sheet action. The Electron app polls that topic on startup and on a recurring interval, then ingests each supported URL as a saved-post entry.

### 3.2 Mechanism

**ntfy.sh topic polling**

[ntfy.sh](https://ntfy.sh) is a free, open-source push notification service. Users create a private topic (a unique URL-safe string they choose). The mobile share flow sends the shared URL as a message to that topic. The desktop app polls the topic's HTTP API to retrieve new messages.

This approach was chosen because:
- No desktop-side listener or open port required — the app only makes outbound HTTP requests.
- Works across any mobile OS via native share sheets or Shortcuts.
- No app installation required on mobile — share to ntfy.sh topic via a pre-configured shortcut.
- ntfy.sh can be self-hosted if a user does not want to use the public service.
- The topic name is not a credential, but obscurity still provides a basic access barrier — only someone who knows the topic name can publish to it.

### 3.3 Mobile Send Flow

**iOS:**
1. User opens a supported link in a browser or app.
2. Uses a pre-configured iOS Shortcut with either Ask for Input (URL on line 1, optional notes on line 2) or Get Clipboard (URL-only).
3. The Shortcut uses Get Contents of URL to POST to `https://ntfy.sh/{TOPIC}`.
4. Request details are plain text: header `content-type: text/plain`, request body from Ask for Input or Clipboard (no key/value wrapper).

**Android:**
1. User opens a supported link.
2. Taps Share → selects an HTTP Request shortcut (e.g., via HTTP Shortcuts app) pre-configured to POST to `https://ntfy.sh/{TOPIC}`.

Both flows are user-configured once and require no further interaction per save.

### 3.4 Desktop Ingestion Flow

On app startup and on a user-configurable interval afterward (default: 60 minutes), the main process:
1. Reads the configured ntfy.sh topic URL from settings.
2. Fetches `https://ntfy.sh/{TOPIC}/json?poll=1&since=last_ingested_id` to retrieve only new messages since the last ingest.
3. For each message, extracts the first HTTP URL plus an optional free-form note.
4. Detects the source and builds metadata:
    - Reddit URLs fetch structured metadata from the Reddit JSON API.
    - X/Twitter URLs store the link, optional note-derived title, and parsed author handle when available.
    - Bluesky URLs store the link, optional note-derived title, and parsed handle when available.
    - Other HTTP URLs fall back to a generic saved-link record.
5. Upserts the record into `saved_posts`.
6. Stores the ID of the last successfully processed message to use as the `since` cursor on the next poll.

The `since` cursor is persisted in the `settings` table so re-ingestion does not occur across restarts.

**Error handling:**
- If ntfy.sh is unreachable (offline), ingestion is skipped silently. No posts are lost — ntfy.sh retains messages; they will be ingested on the next successful poll.
- If a Reddit URL returns a 404 or cannot be resolved, the message is logged and skipped. The cursor still advances.
- If a message does not contain a valid HTTP URL, it is ignored.

### 3.5a Supported URL Sources

| Source | Detection | Metadata strategy |
|--------|-----------|-------------------|
| Reddit | `reddit.com` URLs | Fetch full post metadata from Reddit JSON API |
| X / Twitter | `x.com` or `twitter.com` URLs | Store canonical link, inferred handle, and optional note |
| Bluesky | `bsky.app` URLs | Store canonical link, inferred handle, and optional note |
| Generic links | Any other HTTP URL | Store raw URL plus optional note |

### 3.5 Storage

The ntfy topic name and server URL are not credentials — they carry no billing implications and no account access. Both are stored as plain text values in the `settings` table:

| Key | Value | Notes |
|-----|-------|-------|
| `ntfy_topic` | e.g., `xK9mQr4vLpTw8nZj2cY` | Plain text |
| `ntfy_server_url` | e.g., `https://ntfy.sh` | Plain text; defaults to `https://ntfy.sh` if absent |
| `ntfy_last_message_id` | ntfy message ID string | Cursor for incremental polling |
| `ntfy_last_polled_at` | Unix timestamp | Used for stale-poll detection |

The only value in the app stored via `safeStorage` is the YouTube Data API v3 key. See tech-notes.md Section 5.

The app only reads from the ntfy topic — it never publishes to it from the desktop. A long random topic name provides basic obscurity, but users who want stronger isolation can self-host ntfy.sh (supported via the custom server URL setting).

### 3.6 Data Collected

| Field | Source |
|-------|--------|
| Post ID | Source-specific parser or Reddit API |
| Title | Reddit API, optional note fallback, or raw URL |
| URL | Source URL |
| Permalink | Source URL or Reddit permalink |
| Subreddit | Reddit API (Reddit only) |
| Author | Reddit API or parsed handle when available |
| Score | Reddit API (Reddit only) |
| Body text (if text post) | Reddit API (Reddit only) |
| Saved timestamp | App (local time of ingestion) |
| Note | Optional text supplied in the ntfy message |
| Tags | User-applied in app |
| Source | App-detected source identifier (`reddit`, `x`, `bsky`, `generic`) |
| Viewed timestamp | App |

### 3.7 Database Schema (Saved Posts)

```sql
CREATE TABLE saved_posts (
    post_id      TEXT PRIMARY KEY,
    title        TEXT NOT NULL,
    url          TEXT NOT NULL,
    permalink    TEXT NOT NULL,
    subreddit    TEXT,
    author       TEXT,
    score        INTEGER,
    body         TEXT,
    saved_at     INTEGER NOT NULL,  -- Unix timestamp
    tags         TEXT,
    note         TEXT,
    source       TEXT NOT NULL DEFAULT 'reddit',
    viewed_at    INTEGER
);
```

The `since` cursor is stored in the `settings` table:
```sql
-- Key: 'ntfy_last_message_id', Value: ntfy message ID string
```

The app also maintains an FTS5 index over `title`, `body`, `subreddit`, and `source` to support Saved Posts search.

---

## 4. Script Manager

### 4.1 Purpose

Allow users to register, schedule, and monitor data-gathering Python scripts. Scripts are a first-class feature, not a hidden implementation detail. The Reddit digest script is one example of a managed script.

**v1 scope:** Python only. The interpreter is fixed to `python3`. The internal execution interface is designed to accept an interpreter parameter so that support for Node.js, shell scripts, or others can be added in future versions without restructuring the Script Manager.

### 4.2 Script Registration

A user registers a script by providing:
- A display name
- The absolute path to the `.py` script file
- Optional: arguments string
- Optional: schedule (see 4.3)

The interpreter is always `python3` in v1 and is not exposed as a user-editable field. Internally, the execution layer stores the interpreter value so it can be made configurable in a future version.

### 4.3 Scheduling

Scripts can be configured to run:
- **Manually only** — user triggers from the UI.
- **On app start** — runs once each time the app launches.
- **On interval** — runs every N minutes/hours.
- **On fixed schedule** — runs at a specific time of day (e.g., 06:00 daily).

Scheduling is implemented using a JavaScript scheduler within the Electron main process (`node-cron`). The OS scheduler (Task Scheduler, cron daemon) is not used, so scripts only run while the app is open. This means a scheduled script will be skipped if the app is closed during its run window.

### 4.3a Stale Script Detection

When a script has an **interval** or **fixed-time** schedule, the app tracks whether it has fallen behind and surfaces a warning in the Script Manager UI.

**Staleness threshold:**
A script is considered stale when:
```
current_time − last_run_at > schedule_interval
```
Where `schedule_interval` is derived from the script's configured schedule:
- Interval schedule (every N minutes/hours): threshold = N minutes/hours
- Fixed-time schedule (daily at HH:MM): threshold = 24 hours

**Scripts excluded from stale detection:**
- **Manually only** — no schedule, so no expected run time.
- **On app start** — runs on every launch by design; the warning is not meaningful here.

**`last_run_at` tracking:**
The `script_runs` table already records `started_at` and `finished_at` per run. Stale detection uses the `finished_at` timestamp of the most recent run with a successful exit code (`exit_code = 0`). A script that has never run has no `last_run_at` and is treated as stale immediately (if it has a schedule configured).

No new database columns are required — the staleness value is computed at read time by joining `scripts` with the latest successful row in `script_runs`.

**Display:**
See ui-ux.md Section 7.4 for the full visual specification. In brief:
- A stale script shows an amber warning indicator on its row in the Script Manager list.
- The Script Manager nav item shows a subtle badge if one or more scripts are stale.
- The script's detail panel shows: "Last ran: [relative timestamp] — [Run Now]".
- Clicking "Run Now" triggers immediate execution and clears the indicator on success.

### 4.4 Execution & Output

- Scripts are spawned as child processes using Node.js `child_process.spawn`.
- `stdout` and `stderr` are captured and stored in the database (truncated to a configurable limit, e.g., 50KB per run).
- Exit code is recorded.
- The UI shows a live output stream while the script is running.
- A run history view shows past runs with timestamp, duration, exit code, and output preview.

### 4.5 Security Considerations

- Scripts run with the same permissions as the Electron app process.
- Users register scripts by file path — the app does not execute arbitrary code from untrusted sources.
- No sandboxing is applied (Assumed: users are trusted to manage their own scripts. This is consistent with the personal-use nature of the app).

### 4.6 Database Schema (Script Manager)

```sql
CREATE TABLE scripts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    file_path    TEXT NOT NULL,
    interpreter  TEXT NOT NULL DEFAULT 'python3',  -- Fixed to 'python3' in v1; stored for future extensibility
    args         TEXT,
    schedule     TEXT,              -- JSON schedule config, nullable
    enabled      INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL
);

CREATE TABLE script_runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    script_id    INTEGER NOT NULL REFERENCES scripts(id),
    started_at   INTEGER NOT NULL,
    finished_at  INTEGER,
    exit_code    INTEGER,
    stdout       TEXT,
    stderr       TEXT
);
```

---

## 5. Future Data Sources

The following sources were not specified for v1 but the module architecture should not preclude them:

- RSS/Atom feeds (generic)
- GitHub notifications or activity
- Hacker News top stories
- Weather
- Calendar (local ICS file or Google Calendar)
- Custom API integrations

Each future source should be addable as a new module without modifying core dashboard, layout, or database infrastructure code.

---

## 6. Data Refresh Summary

| Source | Mechanism | Trigger | Frequency |
|--------|-----------|---------|-----------|
| YouTube (RSS) | HTTP fetch in main process | Interval timer | User-configurable; default 15 min |
| YouTube (API v3) | HTTP fetch in main process | New RSS delta detected | As needed |
| Reddit Digest | Python script (Script Manager) | Schedule / manual | User-configured per script |
| Saved Posts | ntfy.sh topic poll | App startup + interval timer | User-configurable; default 60 min |
| Script output | Child process stdout | Manual / schedule | Per script config |
