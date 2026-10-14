import {
  buildSavedPostFixtures,
  SAVED_POST_FIXTURE_IDS,
} from "./definitions/saved-posts";
import { createFixtureContext, type FixtureContext } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export { SAVED_POST_FIXTURE_IDS } from "./definitions/saved-posts";

export const savedPostsFixtureContributor: DevTestDataContributor = {
  id: "saved-posts",
  seed(database, context: FixtureContext = createFixtureContext()): void {
    const insert = database.prepare(`
      INSERT INTO saved_posts (
        post_id, title, url, permalink, subreddit, author, score, body,
        saved_at, tags, note, source, viewed_at
      ) VALUES (
        @post_id, @title, @url, @permalink, @subreddit, @author, @score, @body,
        @saved_at, @tags, @note, @source, @viewed_at
      )
      ON CONFLICT(post_id) DO UPDATE SET
        title = excluded.title, url = excluded.url, permalink = excluded.permalink,
        subreddit = excluded.subreddit, author = excluded.author, score = excluded.score,
        body = excluded.body, saved_at = excluded.saved_at, tags = excluded.tags,
        note = excluded.note, source = excluded.source, viewed_at = excluded.viewed_at
    `);
    for (const post of buildSavedPostFixtures(context))
      insert.run({ ...post, tags: JSON.stringify(post.tags) });
  },
  clear(database): void {
    database
      .prepare(
        `DELETE FROM saved_posts WHERE post_id IN (${SAVED_POST_FIXTURE_IDS.map(() => "?").join(", ")})`,
      )
      .run(...SAVED_POST_FIXTURE_IDS);
  },
};
