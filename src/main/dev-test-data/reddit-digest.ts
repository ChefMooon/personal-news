import {
  buildRedditDigestFixtures,
  LEGACY_REDDIT_DIGEST_FIXTURE_IDS,
  REDDIT_DIGEST_FIXTURE_IDS,
} from "./definitions/reddit-digest";
import { createFixtureContext, type FixtureContext } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export { REDDIT_DIGEST_FIXTURE_IDS } from "./definitions/reddit-digest";

export const redditDigestFixtureContributor: DevTestDataContributor = {
  id: "reddit-digest",
  seed(database, context: FixtureContext = createFixtureContext()): void {
    const ids = [
      ...REDDIT_DIGEST_FIXTURE_IDS,
      ...LEGACY_REDDIT_DIGEST_FIXTURE_IDS,
    ];
    database
      .prepare(
        `DELETE FROM reddit_digest_posts WHERE post_id IN (${ids.map(() => "?").join(", ")})`,
      )
      .run(...ids);
    const insert = database.prepare(`
      INSERT INTO reddit_digest_posts (
        post_id, week_start_date, subreddit, title, url, permalink, author,
        score, num_comments, created_utc, fetched_at, viewed_at
      ) VALUES (
        @post_id, @week_start_date, @subreddit, @title, @url, @permalink,
        @author, @score, @num_comments, @created_utc, @fetched_at, @viewed_at
      )
      ON CONFLICT(post_id, week_start_date) DO UPDATE SET
        subreddit = excluded.subreddit, title = excluded.title, url = excluded.url,
        permalink = excluded.permalink, author = excluded.author, score = excluded.score,
        num_comments = excluded.num_comments, created_utc = excluded.created_utc,
        fetched_at = excluded.fetched_at, viewed_at = excluded.viewed_at
    `);
    for (const post of buildRedditDigestFixtures(context)) insert.run(post);
  },
  clear(database): void {
    const ids = [
      ...REDDIT_DIGEST_FIXTURE_IDS,
      ...LEGACY_REDDIT_DIGEST_FIXTURE_IDS,
    ];
    database
      .prepare(
        `DELETE FROM reddit_digest_posts WHERE post_id IN (${ids.map(() => "?").join(", ")})`,
      )
      .run(...ids);
  },
};
