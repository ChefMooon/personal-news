import type Database from "better-sqlite3";
import type { SavedPostInput } from "../../shared/ipc-types";
import { parseBlueskyPostUrl } from "./bluesky";

// Both manual saves and ntfy imports retain an existing X title when a
// duplicate arrives with only a local fallback. A supplied note is intentional.
export const SAVED_POST_UPSERT_SQL = `
    INSERT INTO saved_posts (post_id, title, url, permalink, subreddit, author, score, body, saved_at, tags, note, source, metadata_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(post_id) DO UPDATE SET
      title = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.title ELSE CASE
        WHEN excluded.source IN ('x', 'bsky') AND excluded.note IS NULL THEN saved_posts.title
        ELSE excluded.title
      END END,
      url = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.url ELSE excluded.url END,
      permalink = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.permalink ELSE excluded.permalink END,
      subreddit = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.subreddit ELSE excluded.subreddit END,
      author = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.author WHEN excluded.source = 'reddit' THEN COALESCE(excluded.author, saved_posts.author) ELSE saved_posts.author END,
      score = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.score ELSE excluded.score END,
      body = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.body ELSE COALESCE(excluded.body, saved_posts.body) END,
      note = COALESCE(excluded.note, saved_posts.note),
      source = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.source ELSE excluded.source END,
      metadata_status = CASE WHEN excluded.metadata_status = 'link_only' THEN saved_posts.metadata_status ELSE excluded.metadata_status END
  `;
/** Shared manual/ntfy save path. Re-key only a legacy rkey-only Bluesky row
 * whose stored permalink proves that it belongs to this exact author and post. */
export function persistSavedPost(db: Database.Database, post: SavedPostInput): "link_only" | null {
  return db.transaction(() => {
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
      post.note, post.source, post.metadataStatus ?? null,
    );
    const persisted = db.prepare("SELECT metadata_status FROM saved_posts WHERE post_id = ?").get(post.postId) as { metadata_status: "link_only" | null } | undefined;
    return persisted?.metadata_status ?? null;
  })();
}
