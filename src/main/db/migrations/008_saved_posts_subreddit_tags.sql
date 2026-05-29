-- Backfill Reddit subreddit tags for existing saved posts.
UPDATE saved_posts
SET tags = json_array(lower(trim(subreddit)))
WHERE source = 'reddit'
  AND subreddit IS NOT NULL
  AND trim(subreddit) <> ''
  AND (tags IS NULL OR tags = '' OR tags = '[]');

UPDATE saved_posts
SET tags = json_insert(tags, '$[#]', lower(trim(subreddit)))
WHERE source = 'reddit'
  AND subreddit IS NOT NULL
  AND trim(subreddit) <> ''
  AND tags IS NOT NULL
  AND tags <> ''
  AND json_valid(tags)
  AND NOT EXISTS (
    SELECT 1
    FROM json_each(CASE WHEN json_valid(saved_posts.tags) THEN saved_posts.tags ELSE '[]' END)
    WHERE lower(CAST(value AS TEXT)) = lower(trim(saved_posts.subreddit))
  );