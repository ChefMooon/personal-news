ALTER TABLE reddit_digest_posts RENAME TO reddit_digest_posts_old;

CREATE TABLE reddit_digest_posts (
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
    PRIMARY KEY (post_id, week_start_date)
);

INSERT INTO reddit_digest_posts (
    post_id,
    week_start_date,
    subreddit,
    title,
    url,
    permalink,
    author,
    score,
    num_comments,
    created_utc,
    fetched_at
)
SELECT
    post_id,
    date(
        fetched_at,
        'unixepoch',
        'start of day',
        printf('-%d days', (CAST(strftime('%w', fetched_at, 'unixepoch') AS INTEGER) + 6) % 7)
    ) AS week_start_date,
    subreddit,
    title,
    url,
    permalink,
    author,
    score,
    num_comments,
    created_utc,
    fetched_at
FROM reddit_digest_posts_old;

DROP TABLE reddit_digest_posts_old;

CREATE INDEX idx_reddit_digest_subreddit_score
    ON reddit_digest_posts (subreddit, score DESC);

CREATE INDEX idx_reddit_digest_fetched_at
    ON reddit_digest_posts (fetched_at DESC);

CREATE INDEX idx_reddit_digest_week_start
    ON reddit_digest_posts (week_start_date DESC);