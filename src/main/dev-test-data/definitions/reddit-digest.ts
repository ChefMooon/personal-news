import type { DigestPost } from "../../../shared/ipc-types";
import {
  fixtureTimestamp,
  fixtureWeekStart,
  type FixtureContext,
} from "../fixtures";

export const LEGACY_REDDIT_DIGEST_FIXTURE_IDS = [
  "pn_dev_fixture_digest_current",
  "pn_dev_fixture_digest_previous",
  "pn_dev_fixture_digest_older",
] as const;

const CASES = [
  {
    id: "pn_dev_fixture_digest_01",
    subreddit: "syntheticnews",
    title: "Synthetic current-week community discussion",
    weekOffset: 0,
    viewedAtOffset: null,
  },
  {
    id: "pn_dev_fixture_digest_02",
    subreddit: "synthetictechnology",
    title: "Synthetic current-week technology report",
    weekOffset: 0,
    viewedAtOffset: -3600,
  },
  {
    id: "pn_dev_fixture_digest_03",
    subreddit: "syntheticreading",
    title: "Synthetic current-week reading list",
    weekOffset: 0,
    viewedAtOffset: null,
  },
  {
    id: "pn_dev_fixture_digest_04",
    subreddit: "syntheticdesign",
    title: "Synthetic current-week design roundup",
    weekOffset: 0,
    viewedAtOffset: null,
  },
  {
    id: "pn_dev_fixture_digest_05",
    subreddit: "syntheticnews",
    title: "Synthetic previous-week research thread",
    weekOffset: 1,
    viewedAtOffset: -14400,
  },
  {
    id: "pn_dev_fixture_digest_06",
    subreddit: "synthetictechnology",
    title: "Synthetic previous-week product discussion",
    weekOffset: 1,
    viewedAtOffset: null,
  },
  {
    id: "pn_dev_fixture_digest_07",
    subreddit: "syntheticreading",
    title: "Synthetic previous-week community picks",
    weekOffset: 1,
    viewedAtOffset: null,
  },
  {
    id: "pn_dev_fixture_digest_08",
    subreddit: "syntheticdesign",
    title: "Synthetic older-week inspiration list",
    weekOffset: 2,
    viewedAtOffset: -25200,
  },
  {
    id: "pn_dev_fixture_digest_09",
    subreddit: "syntheticnews",
    title: "Synthetic older-week discussion highlights",
    weekOffset: 2,
    viewedAtOffset: null,
  },
  {
    id: "pn_dev_fixture_digest_10",
    subreddit: "synthetictechnology",
    title: "Synthetic older-week technology roundup",
    weekOffset: 2,
    viewedAtOffset: null,
  },
] as const;

export const REDDIT_DIGEST_FIXTURE_IDS = CASES.map((fixture) => fixture.id);
export const REDDIT_DIGEST_FIXTURE_SUBREDDITS = [
  ...new Set(CASES.map((fixture) => fixture.subreddit)),
];

export function buildRedditDigestFixtures(
  context: FixtureContext,
): DigestPost[] {
  const fetchedAt = fixtureTimestamp(context);
  return CASES.map((fixture, index) => {
    const weekStart = fixtureWeekStart(context, -fixture.weekOffset);
    return {
      post_id: fixture.id,
      week_start_date: weekStart,
      subreddit: fixture.subreddit,
      title: fixture.title,
      url: `https://example.invalid/fixture/digest-${index + 1}`,
      permalink: `/r/${fixture.subreddit}/comments/fixture_digest_${index + 1}/`,
      author: `fixture_author_${index + 1}`,
      score: 128 - index * 7,
      num_comments: 24 - index,
      created_utc: Math.min(
        Math.floor(Date.parse(`${weekStart}T12:00:00Z`) / 1000) + index * 600,
        fetchedAt,
      ),
      fetched_at: fetchedAt,
      viewed_at:
        fixture.viewedAtOffset === null
          ? null
          : fixtureTimestamp(context, fixture.viewedAtOffset),
    };
  });
}
