// Both manual saves and ntfy imports retain an existing X title when a
// duplicate arrives with only a local fallback. A supplied note is intentional.
export const SAVED_POST_UPSERT_SQL = `
    INSERT INTO saved_posts (post_id, title, url, permalink, subreddit, author, score, body, saved_at, tags, note, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET
      title = CASE
        WHEN excluded.source = 'x' AND excluded.note IS NULL THEN saved_posts.title
        ELSE excluded.title
      END,
      url = excluded.url,
      score = excluded.score,
      body = COALESCE(excluded.body, saved_posts.body),
      note = COALESCE(excluded.note, saved_posts.note),
      source = excluded.source
  `;
