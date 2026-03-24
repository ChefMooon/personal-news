-- Migration 001: Initial schema

CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS themes (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    tokens     TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS yt_channels (
    channel_id         TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    thumbnail_url      TEXT,
    added_at           INTEGER NOT NULL,
    enabled            INTEGER NOT NULL DEFAULT 1,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    notify_new_videos  INTEGER NOT NULL DEFAULT 1,
    notify_live_start  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS yt_videos (
    video_id         TEXT PRIMARY KEY,
    channel_id       TEXT NOT NULL,
    title            TEXT NOT NULL,
    published_at     INTEGER NOT NULL,
    thumbnail_url    TEXT,
    duration_sec     INTEGER,
    broadcast_status TEXT,
    scheduled_start  INTEGER,
    fetched_at       INTEGER NOT NULL,
    media_type       TEXT,
    watched_at       INTEGER,
    FOREIGN KEY (channel_id) REFERENCES yt_channels(channel_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_yt_videos_channel_published
    ON yt_videos (channel_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_yt_videos_broadcast_status
    ON yt_videos (broadcast_status)
    WHERE broadcast_status IN ('upcoming', 'live');

CREATE INDEX IF NOT EXISTS idx_yt_videos_media_type_published
    ON yt_videos (media_type, published_at DESC);

CREATE TABLE IF NOT EXISTS yt_sync_retry_batches (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    poll_cycle_id             TEXT NOT NULL,
    batch_index               INTEGER NOT NULL,
    batch_size                INTEGER NOT NULL,
    video_ids_json            TEXT NOT NULL,
    source_channel_ids_json   TEXT NOT NULL,
    request_path              TEXT,
    response_path             TEXT,
    normalized_preview_path   TEXT,
    reason                    TEXT NOT NULL,
    attempt_count             INTEGER NOT NULL DEFAULT 0,
    status                    TEXT NOT NULL DEFAULT 'pending',
    last_error                TEXT,
    next_retry_at             INTEGER,
    created_at                INTEGER NOT NULL,
    updated_at                INTEGER NOT NULL,
    CHECK (status IN ('pending', 'resolved', 'dead'))
);

CREATE INDEX IF NOT EXISTS idx_yt_sync_retry_status_next
    ON yt_sync_retry_batches (status, next_retry_at, created_at);

CREATE INDEX IF NOT EXISTS idx_yt_sync_retry_cycle
    ON yt_sync_retry_batches (poll_cycle_id, batch_index);

CREATE TABLE IF NOT EXISTS reddit_digest_posts (
    post_id         TEXT NOT NULL,
    week_start_date TEXT NOT NULL,
    subreddit       TEXT NOT NULL,
    title           TEXT NOT NULL,
    url             TEXT NOT NULL,
    permalink       TEXT NOT NULL,
    author          TEXT,
    score           INTEGER,
    num_comments    INTEGER,
    created_utc     INTEGER NOT NULL,
    fetched_at      INTEGER NOT NULL,
    viewed_at       INTEGER,
    PRIMARY KEY (post_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_reddit_digest_subreddit_score
    ON reddit_digest_posts (subreddit, score DESC);

CREATE INDEX IF NOT EXISTS idx_reddit_digest_fetched_at
    ON reddit_digest_posts (fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_reddit_digest_week_start
    ON reddit_digest_posts (week_start_date DESC);

CREATE INDEX IF NOT EXISTS idx_reddit_digest_viewed_at
    ON reddit_digest_posts (viewed_at);

CREATE INDEX IF NOT EXISTS idx_reddit_digest_week_viewed
    ON reddit_digest_posts (week_start_date, viewed_at);

CREATE TABLE IF NOT EXISTS saved_posts (
    post_id    TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    url        TEXT NOT NULL,
    permalink  TEXT NOT NULL,
    subreddit  TEXT,
    author     TEXT,
    score      INTEGER,
    body       TEXT,
    saved_at   INTEGER NOT NULL,
    tags       TEXT,
    note       TEXT,
    source     TEXT NOT NULL DEFAULT 'reddit',
    viewed_at  INTEGER
);

CREATE VIRTUAL TABLE IF NOT EXISTS saved_posts_fts
    USING fts5(title, body, subreddit, source, content='saved_posts', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS saved_posts_ai AFTER INSERT ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(rowid, title, body, subreddit, source)
        VALUES (new.rowid, new.title, new.body, new.subreddit, new.source);
END;

CREATE TRIGGER IF NOT EXISTS saved_posts_ad AFTER DELETE ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(saved_posts_fts, rowid, title, body, subreddit, source)
        VALUES ('delete', old.rowid, old.title, old.body, old.subreddit, old.source);
END;

CREATE TRIGGER IF NOT EXISTS saved_posts_au AFTER UPDATE ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(saved_posts_fts, rowid, title, body, subreddit, source)
        VALUES ('delete', old.rowid, old.title, old.body, old.subreddit, old.source);
    INSERT INTO saved_posts_fts(rowid, title, body, subreddit, source)
        VALUES (new.rowid, new.title, new.body, new.subreddit, new.source);
END;

CREATE INDEX IF NOT EXISTS idx_saved_posts_saved_at
    ON saved_posts (saved_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_posts_subreddit
    ON saved_posts (subreddit);

CREATE INDEX IF NOT EXISTS idx_saved_posts_source
    ON saved_posts (source);

CREATE INDEX IF NOT EXISTS idx_saved_posts_viewed_at
    ON saved_posts (viewed_at);

CREATE INDEX IF NOT EXISTS idx_saved_posts_saved_viewed
    ON saved_posts (saved_at DESC, viewed_at);

CREATE TABLE IF NOT EXISTS scripts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    description TEXT,
    file_path   TEXT NOT NULL,
    interpreter TEXT NOT NULL DEFAULT 'python3',
    args        TEXT,
    schedule    TEXT,
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS script_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    script_id   INTEGER NOT NULL,
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    exit_code   INTEGER,
    stdout      TEXT,
    stderr      TEXT,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_script_runs_script_started
    ON script_runs (script_id, started_at DESC);

CREATE TABLE IF NOT EXISTS script_notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    script_id   INTEGER NOT NULL,
    run_id      INTEGER,
    severity    TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
    message     TEXT NOT NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    read_at     INTEGER,
    FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES script_runs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_script_notifications_created
    ON script_notifications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_notifications_read
    ON script_notifications (is_read, created_at DESC);

INSERT OR IGNORE INTO meta VALUES ('schema_version', '1');

INSERT OR IGNORE INTO settings VALUES ('widget_order', '["youtube","reddit_digest","saved_posts"]');
INSERT OR IGNORE INTO settings VALUES ('widget_visibility', '{"youtube":true,"reddit_digest":true,"saved_posts":true}');
INSERT OR IGNORE INTO settings VALUES ('rss_poll_interval_minutes', '15');
INSERT OR IGNORE INTO settings VALUES ('active_theme_id', 'system');
INSERT OR IGNORE INTO settings VALUES ('reddit_digest_view_config', '{"sort_by":"score","sort_dir":"desc","group_by":"subreddit","layout_mode":"columns"}');
INSERT OR IGNORE INTO settings VALUES ('ntfy_poll_interval_minutes', '60');
INSERT OR IGNORE INTO settings VALUES ('desktop_notification_prefs', '{"desktopNotificationsEnabled":true,"youtube":{"newVideo":true,"liveStart":true},"savedPosts":{"syncSuccess":true},"redditDigest":{"runSuccess":true,"runFailure":true},"scriptManager":{"autoRunSuccess":true,"autoRunFailure":true,"startupWarning":true}}');
