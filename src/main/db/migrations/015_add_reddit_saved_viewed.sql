ALTER TABLE reddit_digest_posts ADD COLUMN viewed_at INTEGER;
ALTER TABLE saved_posts ADD COLUMN viewed_at INTEGER;

CREATE INDEX IF NOT EXISTS idx_reddit_digest_viewed_at
    ON reddit_digest_posts (viewed_at);

CREATE INDEX IF NOT EXISTS idx_reddit_digest_week_viewed
    ON reddit_digest_posts (week_start_date, viewed_at);

CREATE INDEX IF NOT EXISTS idx_saved_posts_viewed_at
    ON saved_posts (viewed_at);

CREATE INDEX IF NOT EXISTS idx_saved_posts_saved_viewed
    ON saved_posts (saved_at DESC, viewed_at);
