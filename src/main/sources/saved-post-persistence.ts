import type Database from "better-sqlite3";
import type { SavedPostInput } from "../../shared/ipc-types";
import { parseBlueskyPostUrl } from "./bluesky";

// Both manual saves and ntfy imports retain an existing X title when a
// duplicate arrives with only a local fallback. A supplied note is intentional.
export const SAVED_POST_UPSERT_SQL = `
    INSERT INTO saved_posts (post_id, title, url, permalink, subreddit, author, score, body, saved_at, tags, note, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET
      title = CASE
        WHEN excluded.source IN ('x', 'bsky') AND excluded.note IS NULL THEN saved_posts.title
        ELSE excluded.title
      END,
      url = excluded.url,
      score = excluded.score,
      body = COALESCE(excluded.body, saved_posts.body),
      note = COALESCE(excluded.note, saved_posts.note),
      source = excluded.source
  `;
/** Shared manual/ntfy save path. Re-key only a legacy rkey-only Bluesky row
 * whose stored permalink proves that it belongs to this exact author and post. */
export function persistSavedPost(db: Database.Database, post: SavedPostInput): void {
  db.transaction(() => {
    const parsed = post.source === "bsky" ? parseBlueskyPostUrl(post.url) : null;
    if (parsed && post.postId === `bsky_${parsed.handle}_${parsed.rkey}`) {
      const legacy = db.prepare("SELECT post_id, url FROM saved_posts WHERE post_id = ? AND source = 'bsky'")
        .get(`bsky_${parsed.rkey}`) as { post_id: string; url: string } | undefined;
      const legacyPost = legacy ? parseBlueskyPostUrl(legacy.url) : null;
      const canonicalExists = db.prepare("SELECT 1 FROM saved_posts WHERE post_id = ?").get(post.postId);
      if (legacy && !canonicalExists && legacyPost?.handle === parsed.handle && legacyPost.rkey === parsed.rkey) {
        db.prepare("UPDATE saved_posts SET post_id = ? WHERE post_id = ?").run(post.postId, legacy.post_id);
      }
    }
    db.prepare(SAVED_POST_UPSERT_SQL).run(
      post.postId, post.title, post.url, post.permalink, post.subreddit, post.author,
      post.score, post.body, post.savedAt, post.tags ? JSON.stringify(post.tags) : null,
      post.note, post.source,
    );
  })();
}
