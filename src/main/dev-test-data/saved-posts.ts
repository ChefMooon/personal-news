import type { SavedPost } from "../../shared/ipc-types";
import { fixtureTimestamp } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export const SAVED_POST_FIXTURE_IDS = [
  "pn_dev_fixture_saved_read",
  "pn_dev_fixture_saved_unread",
] as const;

type SavedPostFixture = Omit<SavedPost, "tags"> & {
  tags: string;
};

function getFixturePosts(): SavedPostFixture[] {
  const savedAt = fixtureTimestamp();
  return [
    {
      post_id: SAVED_POST_FIXTURE_IDS[0],
      title: "Synthetic saved post with notes",
      url: "https://example.invalid/fixture/saved-read",
      permalink: "/r/syntheticnews/comments/fixture_saved_read/",
      subreddit: "syntheticnews",
      author: "fixture_author",
      score: 91,
      body: "Synthetic body text for saved-post search and preview coverage.",
      saved_at: savedAt,
      tags: JSON.stringify(["syntheticnews", "fixture", "research"]),
      note: "Synthetic note: revisit this example.",
      source: "reddit",
      viewed_at: fixtureTimestamp(-600),
    },
    {
      post_id: SAVED_POST_FIXTURE_IDS[1],
      title: "Synthetic unread saved post",
      url: "https://example.invalid/fixture/saved-unread",
      permalink: "/r/synthetictechnology/comments/fixture_saved_unread/",
      subreddit: "synthetictechnology",
      author: "fixture_author",
      score: 37,
      body: "Another synthetic body containing searchablefixture for full-text search.",
      saved_at: savedAt - 300,
      tags: JSON.stringify(["synthetictechnology", "fixture"]),
      note: null,
      source: "reddit",
      viewed_at: null,
    },
  ];
}

export const savedPostsFixtureContributor: DevTestDataContributor = {
  id: "saved-posts",
  seed(database): void {
    const insert = database.prepare(`
      INSERT INTO saved_posts (
        post_id, title, url, permalink, subreddit, author, score, body,
        saved_at, tags, note, source, viewed_at
      ) VALUES (
        @post_id, @title, @url, @permalink, @subreddit, @author, @score, @body,
        @saved_at, @tags, @note, @source, @viewed_at
      )
      ON CONFLICT(post_id) DO UPDATE SET
        title = excluded.title,
        url = excluded.url,
        permalink = excluded.permalink,
        subreddit = excluded.subreddit,
        author = excluded.author,
        score = excluded.score,
        body = excluded.body,
        saved_at = excluded.saved_at,
        tags = excluded.tags,
        note = excluded.note,
        source = excluded.source,
        viewed_at = excluded.viewed_at
    `);

    for (const post of getFixturePosts()) {
      insert.run(post);
    }
  },
  clear(database): void {
    const placeholders = SAVED_POST_FIXTURE_IDS.map(() => "?").join(", ");
    database
      .prepare(`DELETE FROM saved_posts WHERE post_id IN (${placeholders})`)
      .run(...SAVED_POST_FIXTURE_IDS);
  },
};
