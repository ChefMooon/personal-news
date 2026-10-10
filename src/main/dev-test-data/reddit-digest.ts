import type { DigestPost } from "../../shared/ipc-types";
import { fixtureTimestamp, fixtureWeekStart } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export const REDDIT_DIGEST_FIXTURE_IDS = [
  "pn_dev_fixture_digest_current",
  "pn_dev_fixture_digest_previous",
  "pn_dev_fixture_digest_older",
] as const;

function getFixturePosts(): DigestPost[] {
  const fetchedAt = fixtureTimestamp();
  return [
    {
      post_id: REDDIT_DIGEST_FIXTURE_IDS[0],
      week_start_date: fixtureWeekStart(),
      subreddit: "syntheticnews",
      title: "Synthetic current-week discussion",
      url: "https://example.invalid/fixture/digest-current",
      permalink: "/r/syntheticnews/comments/fixture_current/",
      author: "fixture_author",
      score: 128,
      num_comments: 24,
      created_utc: fixtureTimestamp(-3600),
      fetched_at: fetchedAt,
      viewed_at: null,
    },
    {
      post_id: REDDIT_DIGEST_FIXTURE_IDS[1],
      week_start_date: fixtureWeekStart(-1),
      subreddit: "synthetictechnology",
      title: "Synthetic previous-week report",
      url: "https://example.invalid/fixture/digest-previous",
      permalink: "/r/synthetictechnology/comments/fixture_previous/",
      author: "fixture_author",
      score: 76,
      num_comments: 11,
      created_utc: fixtureTimestamp(-8 * 24 * 60 * 60),
      fetched_at: fetchedAt,
      viewed_at: fixtureTimestamp(-6 * 24 * 60 * 60),
    },
    {
      post_id: REDDIT_DIGEST_FIXTURE_IDS[2],
      week_start_date: fixtureWeekStart(-2),
      subreddit: "syntheticreading",
      title: "Synthetic older-week reading list",
      url: "https://example.invalid/fixture/digest-older",
      permalink: "/r/syntheticreading/comments/fixture_older/",
      author: "fixture_author",
      score: 43,
      num_comments: 8,
      created_utc: fixtureTimestamp(-15 * 24 * 60 * 60),
      fetched_at: fetchedAt,
      viewed_at: null,
    },
  ];
}

export const redditDigestFixtureContributor: DevTestDataContributor = {
  id: "reddit-digest",
  seed(database): void {
    const insert = database.prepare(`
      INSERT INTO reddit_digest_posts (
        post_id, week_start_date, subreddit, title, url, permalink, author,
        score, num_comments, created_utc, fetched_at, viewed_at
      ) VALUES (
        @post_id, @week_start_date, @subreddit, @title, @url, @permalink,
        @author, @score, @num_comments, @created_utc, @fetched_at, @viewed_at
      )
      ON CONFLICT(post_id, week_start_date) DO UPDATE SET
        subreddit = excluded.subreddit,
        title = excluded.title,
        url = excluded.url,
        permalink = excluded.permalink,
        author = excluded.author,
        score = excluded.score,
        num_comments = excluded.num_comments,
        created_utc = excluded.created_utc,
        fetched_at = excluded.fetched_at,
        viewed_at = excluded.viewed_at
    `);

    for (const post of getFixturePosts()) {
      insert.run(post);
    }
  },
  clear(database): void {
    const placeholders = REDDIT_DIGEST_FIXTURE_IDS.map(() => "?").join(", ");
    database
      .prepare(
        `DELETE FROM reddit_digest_posts WHERE post_id IN (${placeholders})`,
      )
      .run(...REDDIT_DIGEST_FIXTURE_IDS);
  },
};
