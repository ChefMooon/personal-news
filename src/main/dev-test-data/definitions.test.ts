import { describe, expect, it } from "vitest";
import {
  createFixtureContext,
  fixtureDate,
  fixtureTimestamp,
  fixtureWeekStart,
} from "./fixtures";
import { buildRedditDigestFixtures } from "./definitions/reddit-digest";
import { buildSavedPostFixtures } from "./definitions/saved-posts";
import {
  buildSportsFixture,
  SPORTS_FIXTURE_EVENT_IDS,
  SPORTS_FIXTURE_LEAGUE_IDS,
  SPORTS_FIXTURE_TEAM_IDS,
} from "./definitions/sports";
import { buildWeatherFixture } from "./definitions/weather";
import { buildYouTubeFixtures } from "./definitions/youtube";
import { buildAstronomyFixture } from "./definitions/astronomy";

describe("development fixture definitions", () => {
  it("uses one injectable anchor for timestamps, dates, and weeks", () => {
    const context = createFixtureContext(Date.parse("2026-10-14T15:30:00Z"));
    expect(fixtureTimestamp(context)).toBe(1791991800);
    expect(fixtureDate(context)).toBe("2026-10-14");
    expect(fixtureWeekStart(context)).toBe("2026-10-12");
  });

  it("builds stable fixture records from a fixed context", () => {
    const context = createFixtureContext(Date.parse("2026-10-14T15:30:00Z"));
    const again = createFixtureContext(context.now);
    const reddit = buildRedditDigestFixtures(context);
    expect(reddit).toEqual(buildRedditDigestFixtures(again));
    expect(reddit).toHaveLength(10);
    for (const post of reddit) {
      expect(post.created_utc).toBeGreaterThanOrEqual(
        Date.parse(`${post.week_start_date}T00:00:00Z`) / 1000,
      );
      expect(post.created_utc).toBeLessThan(
        Date.parse(`${post.week_start_date}T00:00:00Z`) / 1000 + 7 * 86400,
      );
    }
    expect(buildSavedPostFixtures(context)).toHaveLength(6);
    const sports = buildSportsFixture(context);
    expect(sports).toHaveLength(4);
    const liveBaseball = sports.find(
      (event) => event.sport === "Baseball" && event.status === "LIVE",
    )!;
    const liveBasketball = sports.find(
      (event) => event.sport === "Basketball",
    )!;
    expect(liveBasketball).toMatchObject({
      eventDate: liveBaseball.eventDate,
      eventTime: liveBaseball.eventTime,
      status: "LIVE",
      homeScore: "62",
      awayScore: "58",
    });
    expect(SPORTS_FIXTURE_EVENT_IDS).toHaveLength(4);
    expect(SPORTS_FIXTURE_LEAGUE_IDS).toHaveLength(2);
    expect(SPORTS_FIXTURE_TEAM_IDS).toHaveLength(4);
    expect(buildWeatherFixture(context).snapshot.fetchedAt).toBe(
      fixtureTimestamp(context),
    );
    const astronomy = buildAstronomyFixture(context);
    expect(astronomy).toEqual(buildAstronomyFixture(again));
    expect(astronomy.forTimestamp).toBe(fixtureTimestamp(context));
    expect(
      astronomy.groups.events.data.every(
        (event) => event.time > astronomy.forTimestamp,
      ),
    ).toBe(true);
    const youtube = buildYouTubeFixtures(context);
    expect(youtube.channels).toHaveLength(4);
    expect(youtube.videos).toHaveLength(30);
  });

  it("keeps Monday morning digest posts inside their week and before fetch time", () => {
    const context = createFixtureContext(Date.parse("2026-10-12T00:15:00Z"));
    const posts = buildRedditDigestFixtures(context);

    for (const post of posts) {
      const weekStart = Date.parse(`${post.week_start_date}T00:00:00Z`) / 1000;
      expect(post.created_utc).toBeGreaterThanOrEqual(weekStart);
      expect(post.created_utc).toBeLessThan(weekStart + 7 * 86400);
      if (post.week_start_date === "2026-10-12") {
        expect(post.created_utc).toBeLessThanOrEqual(post.fetched_at);
      }
    }
  });
});
