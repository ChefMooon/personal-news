-- Migration 007: Add source column to saved_posts for multi-source link ingestion

-- Add source column; backfill all existing rows as 'reddit'
ALTER TABLE saved_posts ADD COLUMN source TEXT NOT NULL DEFAULT 'reddit';

-- Index for filtering by source
CREATE INDEX IF NOT EXISTS idx_saved_posts_source ON saved_posts (source);

-- Drop existing FTS triggers
DROP TRIGGER IF EXISTS saved_posts_ai;
DROP TRIGGER IF EXISTS saved_posts_ad;
DROP TRIGGER IF EXISTS saved_posts_au;

-- Drop existing FTS table
DROP TABLE IF EXISTS saved_posts_fts;

-- Recreate FTS table with source column
CREATE VIRTUAL TABLE IF NOT EXISTS saved_posts_fts
    USING fts5(title, body, subreddit, source, content='saved_posts', content_rowid='rowid');

-- Repopulate FTS from existing data
INSERT INTO saved_posts_fts(rowid, title, body, subreddit, source)
    SELECT rowid, title, body, subreddit, source FROM saved_posts;

-- Recreate triggers with source column
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

-- Bump schema version
INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '7');
