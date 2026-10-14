import type { SavedPost } from "../../../shared/ipc-types";
import { fixtureTimestamp, type FixtureContext } from "../fixtures";

export const SAVED_POST_FIXTURE_IDS = [
  "pn_dev_fixture_saved_read",
  "pn_dev_fixture_saved_unread",
  "pn_dev_fixture_saved_research",
  "pn_dev_fixture_saved_discussion",
  "pn_dev_fixture_saved_inspiration",
  "pn_dev_fixture_saved_reference",
] as const;

const CASES = [
  {
    id: SAVED_POST_FIXTURE_IDS[0],
    suffix: "read",
    title: "Synthetic saved post with notes",
    subreddit: "syntheticnews",
    author: "fixture_author",
    score: 91,
    body: "Synthetic body text for saved-post search and preview coverage.",
    tags: ["syntheticnews", "fixture", "research"],
    note: "Synthetic note: revisit this example.",
    savedOffset: 0,
    viewedOffset: -600,
  },
  {
    id: SAVED_POST_FIXTURE_IDS[1],
    suffix: "unread",
    title: "Synthetic unread saved post",
    subreddit: "synthetictechnology",
    author: "fixture_author",
    score: 37,
    body: "Another synthetic body containing searchablefixture for full-text search.",
    tags: ["synthetictechnology", "fixture"],
    note: "Synthetic note: review this unread post when you have time.",
    savedOffset: -300,
    viewedOffset: null,
  },
  {
    id: SAVED_POST_FIXTURE_IDS[2],
    suffix: "research",
    title: "Synthetic research roundup",
    subreddit: "syntheticnews",
    author: "fixture_researcher",
    score: 64,
    body: "A synthetic roundup for testing saved-post notes and tags.",
    tags: ["syntheticnews", "fixture", "research"],
    note: "Synthetic note: compare this roundup with the weekly digest.",
    savedOffset: -600,
    viewedOffset: null,
  },
  {
    id: SAVED_POST_FIXTURE_IDS[3],
    suffix: "discussion",
    title: "Synthetic community discussion",
    subreddit: "synthetictechnology",
    author: "fixture_reader",
    score: 52,
    body: "A synthetic discussion for testing subreddit grouping.",
    tags: ["synthetictechnology", "fixture"],
    note: "Synthetic note: revisit the top comment later.",
    savedOffset: -900,
    viewedOffset: -300,
  },
  {
    id: SAVED_POST_FIXTURE_IDS[4],
    suffix: "inspiration",
    title: "Synthetic design inspiration",
    subreddit: "syntheticdesign",
    author: "fixture_designer",
    score: 28,
    body: "A synthetic design post for testing previews and source badges.",
    tags: ["syntheticdesign", "fixture", "ideas"],
    note: "Synthetic note: use this as a layout inspiration example.",
    savedOffset: -1200,
    viewedOffset: null,
  },
  {
    id: SAVED_POST_FIXTURE_IDS[5],
    suffix: "reference",
    title: "Synthetic reference guide",
    subreddit: "synthetictechnology",
    author: "fixture_curator",
    score: 19,
    body: "A synthetic reference guide with searchable fixture text.",
    tags: ["synthetictechnology", "fixture", "reference"],
    note: "Synthetic note: keep this guide with the other test references.",
    savedOffset: -1500,
    viewedOffset: null,
  },
] as const;

export const SAVED_POST_FIXTURE_SUBREDDITS = [
  ...new Set(CASES.map((fixture) => fixture.subreddit)),
];

export function buildSavedPostFixtures(context: FixtureContext): SavedPost[] {
  const savedAt = fixtureTimestamp(context);
  return CASES.map((fixture) => ({
    post_id: fixture.id,
    title: fixture.title,
    url: `https://example.invalid/fixture/saved-${fixture.suffix}`,
    permalink: `/r/${fixture.subreddit}/comments/fixture_saved_${fixture.suffix}/`,
    subreddit: fixture.subreddit,
    author: fixture.author,
    score: fixture.score,
    body: fixture.body,
    saved_at: savedAt + fixture.savedOffset,
    tags: [...fixture.tags],
    note: fixture.note,
    source: "reddit",
    viewed_at:
      fixture.viewedOffset === null
        ? null
        : fixtureTimestamp(context, fixture.viewedOffset),
  }));
}
