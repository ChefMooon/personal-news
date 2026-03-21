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
    channel_id    TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    thumbnail_url TEXT,
    added_at      INTEGER NOT NULL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    sort_order    INTEGER NOT NULL DEFAULT 0
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
    FOREIGN KEY (channel_id) REFERENCES yt_channels(channel_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_yt_videos_channel_published
    ON yt_videos (channel_id, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_yt_videos_broadcast_status
    ON yt_videos (broadcast_status)
    WHERE broadcast_status IN ('upcoming', 'live');

CREATE TABLE IF NOT EXISTS reddit_digest_posts (
    post_id      TEXT PRIMARY KEY,
    subreddit    TEXT NOT NULL,
    title        TEXT NOT NULL,
    url          TEXT NOT NULL,
    permalink    TEXT NOT NULL,
    author       TEXT,
    score        INTEGER,
    num_comments INTEGER,
    created_utc  INTEGER NOT NULL,
    fetched_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reddit_digest_subreddit_score
    ON reddit_digest_posts (subreddit, score DESC);

CREATE INDEX IF NOT EXISTS idx_reddit_digest_fetched_at
    ON reddit_digest_posts (fetched_at DESC);

CREATE TABLE IF NOT EXISTS saved_posts (
    post_id   TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    url       TEXT NOT NULL,
    permalink TEXT NOT NULL,
    subreddit TEXT,
    author    TEXT,
    score     INTEGER,
    body      TEXT,
    saved_at  INTEGER NOT NULL,
    tags      TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS saved_posts_fts
    USING fts5(title, body, subreddit, content='saved_posts', content_rowid='rowid');

CREATE TRIGGER IF NOT EXISTS saved_posts_ai AFTER INSERT ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(rowid, title, body, subreddit)
        VALUES (new.rowid, new.title, new.body, new.subreddit);
END;

CREATE TRIGGER IF NOT EXISTS saved_posts_ad AFTER DELETE ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(saved_posts_fts, rowid, title, body, subreddit)
        VALUES ('delete', old.rowid, old.title, old.body, old.subreddit);
END;

CREATE TRIGGER IF NOT EXISTS saved_posts_au AFTER UPDATE ON saved_posts BEGIN
    INSERT INTO saved_posts_fts(saved_posts_fts, rowid, title, body, subreddit)
        VALUES ('delete', old.rowid, old.title, old.body, old.subreddit);
    INSERT INTO saved_posts_fts(rowid, title, body, subreddit)
        VALUES (new.rowid, new.title, new.body, new.subreddit);
END;

CREATE INDEX IF NOT EXISTS idx_saved_posts_saved_at
    ON saved_posts (saved_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_posts_subreddit
    ON saved_posts (subreddit);

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

-- Seed data

INSERT OR IGNORE INTO meta VALUES ('schema_version', '1');

INSERT OR IGNORE INTO settings VALUES ('schema_version', '1');
INSERT OR IGNORE INTO settings VALUES ('widget_order', '["youtube","reddit_digest","saved_posts"]');
INSERT OR IGNORE INTO settings VALUES ('widget_visibility', '{"youtube":true,"reddit_digest":true,"saved_posts":true}');
INSERT OR IGNORE INTO settings VALUES ('rss_poll_interval_minutes', '15');
INSERT OR IGNORE INTO settings VALUES ('active_theme_id', 'system');
INSERT OR IGNORE INTO settings VALUES ('reddit_digest_view_config', '{"sort_by":"score","sort_dir":"desc","group_by":"subreddit","layout_mode":"columns"}');

INSERT OR IGNORE INTO reddit_digest_posts VALUES
  ('abc001', 'programming', 'I built a personal news dashboard in Electron',
   'https://github.com/example/personal-news',
   '/r/programming/comments/abc001/i_built_a_personal_news_dashboard_in_electron/',
   'user_one', 1842, 93, 1709900000, 1710100000),
  ('abc002', 'programming', 'Why SQLite is the best database for desktop apps',
   'https://example.com/sqlite-desktop',
   '/r/programming/comments/abc002/why_sqlite/',
   'user_two', 967, 44, 1709800000, 1710100000),
  ('abc003', 'rust', 'Rust 2024 edition — what changed',
   'https://blog.rust-lang.org/2024/edition',
   '/r/rust/comments/abc003/rust_2024_edition/',
   'rustacean_99', 3201, 187, 1709950000, 1710100000),
  ('abc004', 'rust', 'async Rust is finally good',
   'https://example.com/async-rust',
   '/r/rust/comments/abc004/async_rust/',
   'async_fan', 2110, 204, 1709870000, 1710100000);

INSERT OR IGNORE INTO saved_posts
  (post_id, title, url, permalink, subreddit, author, score, body, saved_at, tags)
VALUES
  ('sp001', 'Why Rust async is finally good',
   'https://example.com/rust-async',
   '/r/rust/comments/sp001/why_rust_async_is_finally_good/',
   'rust', 'async_fan', 2110, NULL, 1742036400, NULL),
  ('sp002', 'I built a personal news dashboard in Electron',
   'https://github.com/example/personal-news',
   '/r/programming/comments/sp002/i_built/',
   'programming', 'user_one', 842, NULL, 1741950000, '["projects","electron"]'),
  ('sp003', 'New generics patterns in Go 1.22',
   'https://go.dev/blog/generics',
   '/r/golang/comments/sp003/new_generics/',
   'golang', 'gopher_99', 1203, NULL, 1741863600, NULL);
