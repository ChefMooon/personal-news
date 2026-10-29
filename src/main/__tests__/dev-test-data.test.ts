import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDevTestData,
  createDevTestDataMutationHandler,
  DEV_TEST_DATA_ACTIVE_SETTING_KEY,
  DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY,
  initializeDevTestDataForStartup,
  isDevTestDataActive,
  seedDevTestData,
  updateDevTestData,
  resetDevTestData,
} from "../dev-test-data";
import {
  SPORTS_FIXTURE_EVENT_IDS,
  SPORTS_FIXTURE_HOME_TEAM_ID,
  SPORTS_FIXTURE_LEAGUE_ID,
  SPORTS_FIXTURE_SPORT,
} from "../dev-test-data/sports";
import { REDDIT_DIGEST_FIXTURE_IDS } from "../dev-test-data/reddit-digest";
import { WEATHER_FIXTURE_LOCATION_ID } from "../dev-test-data/weather";
import {
  YOUTUBE_FIXTURE_CHANNEL_ID,
  YOUTUBE_FIXTURE_CHANNEL_IDS,
  YOUTUBE_FIXTURE_VIDEO_IDS,
} from "../dev-test-data/youtube";
import { getWeatherSnapshot, WeatherModule } from "../sources/weather";
import { AstronomyModule, getAstronomySnapshot } from "../sources/astronomy";
import {
  SportsModule,
  getSportsTodayEvents,
  getSportsTeamEvents,
  getSportsEventDetails,
  getSportsLeagues,
  getSportsStandings,
} from "../sources/sports";
import {
  getLeagueById,
  getTrackedTeam,
  listEnabledLeagues,
  listTrackedTeams,
} from "../sources/sports/cache";
import { isSupportedSport } from "../../shared/sports";
import * as sportsApi from "../sources/sports/api";
import { createFixtureContext } from "../dev-test-data/fixtures";
import { SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY } from "../dev-test-data/dashboard-presets";

const mockedDatabase = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("../db/database", () => ({
  getDb: () => mockedDatabase.current,
}));

vi.mock("electron", () => ({
  app: { isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}));

const MIGRATIONS = [
  "001_initial.sql",
  "002_weather.sql",
  "003_sports.sql",
  "004_sports_team_cache.sql",
  "005_youtube_livestream_lifecycle.sql",
  "006_sports_team_name_normalization.sql",
  "007_weather_poll_interval_default.sql",
  "008_saved_posts_subreddit_tags.sql",
  "009_ingested_links.sql",
  "010_astronomy_cache.sql",
  "011_saved_post_metadata_status.sql",
];

const FIXTURE_ID_PREFIX = "pn_dev_fixture_";
const PREVIOUS_HARNESS_VALUE = process.env.PERSONAL_NEWS_ELECTRON_HARNESS;

let database: Database.Database;

function readSetting(key: string): string | null {
  const row = database
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function insertSentinelRows(): void {
  const now = Math.floor(Date.now() / 1000);
  database
    .prepare(
      `
    INSERT INTO reddit_digest_posts (
      post_id, week_start_date, subreddit, title, url, permalink, author,
      score, num_comments, created_utc, fetched_at, viewed_at
    ) VALUES ('user_digest', '2026-09-28', 'usernews', 'User digest',
      'https://example.invalid/user-digest', '/r/usernews/user_digest',
      'user', 12, 3, ?, ?, NULL)
  `,
    )
    .run(now, now);
  database
    .prepare(
      `
    INSERT INTO saved_posts (
      post_id, title, url, permalink, subreddit, author, score, body,
      saved_at, tags, note, source, viewed_at
    ) VALUES ('user_saved', 'User saved post',
      'https://example.invalid/user-saved', '/r/usernews/user_saved',
      'usernews', 'user', 5, 'preserved searchable sentinel', ?, '[]',
      NULL, 'reddit', NULL)
  `,
    )
    .run(now);
  database
    .prepare(
      `
    INSERT INTO weather_locations (
      id, name, admin1, country, country_code, latitude, longitude, timezone,
      created_at
    ) VALUES ('user_weather', 'User City', NULL, 'User Country', 'UC',
      1, 2, 'UTC', ?)
  `,
    )
    .run(now);
  database
    .prepare(
      `
    INSERT INTO weather_cache (
      location_id, current_json, hourly_json, daily_json, alerts_json, fetched_at
    ) VALUES ('user_weather', '{}', '[]', '[]', '[]', ?)
  `,
    )
    .run(now);
  database
    .prepare(
      `
    INSERT INTO weather_alert_state (location_id, alert_hash, last_notified_at)
    VALUES ('user_weather', 'user-alert-hash', ?)
  `,
    )
    .run(now);
  database
    .prepare(
      `
    INSERT INTO astronomy_cache (
      location_id, payload_json, status, for_timestamp, calculated_at
    ) VALUES ('user_weather', '{}', 'success', ?, ?)
  `,
    )
    .run(now, now);
  database
    .prepare(
      `
    INSERT INTO sports_leagues (
      league_id, sport, name, country, logo_url, enabled, sort_order, added_at
    ) VALUES ('user_league', 'User Sport', 'User League', NULL, NULL, 1, 0, ?)
  `,
    )
    .run(now);
  database
    .prepare(
      `
    INSERT INTO sports_teams (
      team_id, league_id, sport, name, short_name, badge_url, enabled,
      sort_order, added_at
    ) VALUES ('user_team', 'user_league', 'User Sport', 'User Team', NULL,
      NULL, 1, 0, ?)
  `,
    )
    .run(now);
  database
    .prepare(
      `
    INSERT INTO sports_events (
      event_id, league_id, sport, home_team_id, away_team_id, home_team,
      away_team, home_team_normalized, away_team_normalized, home_score,
      away_score, event_date, event_time, status, venue, fetched_date
    ) VALUES ('user_event', 'user_league', 'User Sport', 'user_team', NULL,
      'User Team', 'Guest Team', 'userteam', 'guestteam', '1', '0',
      '2026-10-09', '12:00', 'FT', 'User Venue', '2026-10-09')
  `,
    )
    .run();
  database
    .prepare(
      `
    INSERT INTO sports_cache_meta (sport, fetch_date, fetched_at)
    VALUES ('User Sport', '2026-10-09', ?)
  `,
    )
    .run(now);
  database
    .prepare(
      `
    INSERT INTO yt_channels (
      channel_id, name, thumbnail_url, added_at, enabled, sort_order,
      notify_new_videos, notify_live_start
    ) VALUES ('user_channel', 'User Channel', NULL, ?, 1, 0, 1, 1)
  `,
    )
    .run(now);
  database
    .prepare(
      `
    INSERT INTO yt_videos (
      video_id, channel_id, title, published_at, thumbnail_url, duration_sec,
      broadcast_status, scheduled_start, actual_start_time, actual_end_time,
      is_livestream, fetched_at, media_type, watched_at
    ) VALUES ('user_video', 'user_channel', 'User Video', ?, NULL, 30, 'none',
      NULL, NULL, NULL, 0, ?, 'video', NULL)
  `,
    )
    .run(now, now);
  database
    .prepare(
      "INSERT INTO settings (key, value) VALUES ('user_setting', 'kept')",
    )
    .run();
}

function fixtureCounts(): Record<string, number> {
  const tables = [
    ["reddit_digest_posts", "post_id"],
    ["saved_posts", "post_id"],
    ["weather_locations", "id"],
    ["weather_cache", "location_id"],
    ["weather_alert_state", "location_id"],
    ["astronomy_cache", "location_id"],
    ["sports_leagues", "league_id"],
    ["sports_teams", "team_id"],
    ["sports_events", "event_id"],
    ["yt_channels", "channel_id"],
    ["yt_videos", "video_id"],
  ] as const;

  return Object.fromEntries(
    tables.map(([table, column]) => {
      const row = database
        .prepare(
          `SELECT COUNT(*) AS count FROM ${table} WHERE ${column} GLOB ?`,
        )
        .get(`${FIXTURE_ID_PREFIX}*`) as { count: number };
      return [table, row.count];
    }),
  );
}

function fixtureSnapshot(): Record<string, unknown[]> {
  return {
    digest: database
      .prepare(
        "SELECT post_id, week_start_date, viewed_at FROM reddit_digest_posts WHERE post_id GLOB ? ORDER BY post_id",
      )
      .all(`${FIXTURE_ID_PREFIX}*`),
    savedPosts: database
      .prepare(
        "SELECT post_id, tags, note, viewed_at FROM saved_posts WHERE post_id GLOB ? ORDER BY post_id",
      )
      .all(`${FIXTURE_ID_PREFIX}*`),
    weather: database
      .prepare(
        "SELECT location_id, current_json, hourly_json, daily_json, alerts_json FROM weather_cache WHERE location_id GLOB ?",
      )
      .all(`${FIXTURE_ID_PREFIX}*`),
    sports: database
      .prepare(
        "SELECT event_id, event_date, status, home_score FROM sports_events WHERE event_id GLOB ? ORDER BY event_id",
      )
      .all(`${FIXTURE_ID_PREFIX}*`),
    youtube: database
      .prepare(
        "SELECT video_id, media_type, watched_at FROM yt_videos WHERE video_id GLOB ? ORDER BY video_id",
      )
      .all(`${FIXTURE_ID_PREFIX}*`),
  };
}

beforeEach(() => {
  process.env.PERSONAL_NEWS_ELECTRON_HARNESS = "1";
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  mockedDatabase.current = database;
  for (const migration of MIGRATIONS) {
    database.exec(
      readFileSync(
        join(process.cwd(), "src", "main", "db", "migrations", migration),
        "utf8",
      ),
    );
  }
  WeatherModule.initialize(database);
  AstronomyModule.initialize(database);
  SportsModule.initialize(database);
});

afterEach(() => {
  WeatherModule.shutdown();
  AstronomyModule.shutdown();
  SportsModule.shutdown();
  if (database?.open) {
    database.close();
  }
  mockedDatabase.current = null;
  if (PREVIOUS_HARNESS_VALUE == null) {
    delete process.env.PERSONAL_NEWS_ELECTRON_HARNESS;
  } else {
    process.env.PERSONAL_NEWS_ELECTRON_HARNESS = PREVIOUS_HARNESS_VALUE;
  }
});

describe("development test data", () => {
  it.each([3, 4])(
    "upgrades old factory Sports defaults only on explicit Update for version %i",
    (version) => {
      seedDevTestData(database);
      database
        .prepare("DELETE FROM settings WHERE key=?")
        .run(SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY);
      database
        .prepare("UPDATE settings SET value=? WHERE key=?")
        .run(String(version), "dev_test_data_applied_version");
      const legacy = {
        sport: "Baseball",
        viewMode: "detailed",
        showVenue: true,
        showTime: true,
        showLiveStartTime: true,
      };
      const keys = ["small", "medium", "large"].map(
        (size) => `sports_view_config:pn_dev_fixture_widget_sports_${size}`,
      );
      for (const key of keys)
        database
          .prepare("UPDATE settings SET value=? WHERE key=?")
          .run(JSON.stringify(legacy), key);
      initializeDevTestDataForStartup(database, {
        isPackaged: false,
        harnessMode: false,
      });
      for (const key of keys)
        expect(JSON.parse(readSetting(key)!)).toEqual(legacy);
      expect(
        readSetting(SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY),
      ).toBeNull();
      updateDevTestData(database);
      for (const key of keys)
        expect(JSON.parse(readSetting(key)!)).toEqual({
          ...legacy,
          sport: "all",
        });
      expect(readSetting(SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY)).toBe(
        "1",
      );
    },
  );

  it("keeps ordinary Sports detail and standings reads on their existing provider path", async () => {
    const details = vi
      .spyOn(sportsApi, "fetchEventDetails")
      .mockResolvedValue(null);
    const standings = vi
      .spyOn(sportsApi, "fetchLeagueStandings")
      .mockResolvedValue([]);
    try {
      seedDevTestData(database);
      await getSportsEventDetails("user_event");
      await getSportsStandings("user_league", "2026", SPORTS_FIXTURE_SPORT);
      expect(details).toHaveBeenCalledWith("user_event");
      expect(standings).toHaveBeenCalledWith(
        "user_league",
        "2026",
        SPORTS_FIXTURE_SPORT,
        undefined,
      );
      clearDevTestData(database);
      await getSportsEventDetails(SPORTS_FIXTURE_EVENT_IDS[1]);
      await getSportsStandings(
        SPORTS_FIXTURE_LEAGUE_ID,
        "2026",
        SPORTS_FIXTURE_SPORT,
      );
      expect(details).toHaveBeenCalledWith(SPORTS_FIXTURE_EVENT_IDS[1]);
      expect(standings).toHaveBeenCalledWith(
        SPORTS_FIXTURE_LEAGUE_ID,
        "2026",
        SPORTS_FIXTURE_SPORT,
        undefined,
      );
    } finally {
      details.mockRestore();
      standings.mockRestore();
    }
  });

  it("reads supported Sports examples and details offline through the normal source APIs", async () => {
    const fetch = vi.fn(() => {
      throw new Error("Fixtures must stay offline");
    });
    vi.stubGlobal("fetch", fetch);
    try {
      seedDevTestData(database);
      expect(isSupportedSport(SPORTS_FIXTURE_SPORT)).toBe(true);
      expect(getSportsTodayEvents(SPORTS_FIXTURE_SPORT)).toContainEqual(
        expect.objectContaining({
          eventId: SPORTS_FIXTURE_EVENT_IDS[1],
          sport: SPORTS_FIXTURE_SPORT,
          status: "LIVE",
        }),
      );
      const teamEvents = getSportsTeamEvents(SPORTS_FIXTURE_HOME_TEAM_ID);
      expect(teamEvents.last).toContainEqual(
        expect.objectContaining({
          eventId: SPORTS_FIXTURE_EVENT_IDS[0],
          status: "FT",
        }),
      );
      expect(teamEvents.next).toContainEqual(
        expect.objectContaining({
          eventId: SPORTS_FIXTURE_EVENT_IDS[2],
          homeScore: null,
          awayScore: null,
          status: "NS",
        }),
      );
      expect(
        await getSportsEventDetails(SPORTS_FIXTURE_EVENT_IDS[1]),
      ).toMatchObject({
        eventId: SPORTS_FIXTURE_EVENT_IDS[1],
        progress: "Top 5th inning",
        descriptionEN: expect.stringContaining("Synthetic"),
      });
      expect(getSportsTodayEvents("Basketball")).toContainEqual(
        expect.objectContaining({
          eventId: SPORTS_FIXTURE_EVENT_IDS[3],
          sport: "Basketball",
          status: "LIVE",
          homeScore: "62",
          awayScore: "58",
        }),
      );
      expect(
        await getSportsEventDetails(SPORTS_FIXTURE_EVENT_IDS[3]),
      ).toMatchObject({
        sport: "Basketball",
        progress: "End of 3rd quarter",
        descriptionEN: expect.stringContaining("Basketball"),
      });
      expect(
        await getSportsEventDetails("pn_dev_fixture_missing_event"),
      ).toBeNull();
      expect(
        await getSportsStandings(
          SPORTS_FIXTURE_LEAGUE_ID,
          "2026",
          SPORTS_FIXTURE_SPORT,
        ),
      ).toEqual([]);
      expect(await getSportsLeagues("Soccer")).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("reads all cached Astronomy groups through its API and Weather enrichment", () => {
    const context = createFixtureContext();
    seedDevTestData(database, context);
    const snapshot = getAstronomySnapshot(WEATHER_FIXTURE_LOCATION_ID);
    expect(snapshot).toMatchObject({
      locationId: WEATHER_FIXTURE_LOCATION_ID,
      forTimestamp: Math.floor(context.now / 1000),
      status: "complete",
      stale: false,
    });
    expect(snapshot?.groups.moon.data?.phaseName).toBe("waxing_gibbous");
    expect(snapshot?.groups.horizon.data?.solarState).toBe("day");
    expect(
      snapshot?.groups.planets.data.map((planet) => planet.skyState),
    ).toEqual(["too_bright", "up", "below_horizon"]);
    expect(snapshot?.groups.events.data).toHaveLength(4);
    expect(getWeatherSnapshot(WEATHER_FIXTURE_LOCATION_ID)?.astronomy).toEqual(
      snapshot,
    );
  });

  it("rejects packaged IPC mutations before running their operation", () => {
    const mutation = vi.fn();
    const packagedHandler = createDevTestDataMutationHandler(
      () => true,
      mutation,
    );
    expect(() => packagedHandler()).toThrow(
      "Developer test data is unavailable in packaged builds.",
    );
    expect(mutation).not.toHaveBeenCalled();

    const unpackagedHandler = createDevTestDataMutationHandler(
      () => false,
      mutation,
    );
    expect(unpackagedHandler()).toEqual({ ok: true, error: null });
    expect(mutation).toHaveBeenCalledOnce();
  });

  it("bootstraps fixtures on the first normal unpackaged startup", () => {
    initializeDevTestDataForStartup(database, {
      isPackaged: false,
      harnessMode: false,
    });

    expect(isDevTestDataActive(database)).toBe(true);
    expect(readSetting(DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY)).toBe("true");
    expect(fixtureCounts().saved_posts).toBe(6);
    expect(readSetting("saved_posts_enabled")).toBe("true");
  });

  it("preserves fixture deletions on later startups", () => {
    initializeDevTestDataForStartup(database, {
      isPackaged: false,
      harnessMode: false,
    });
    database
      .prepare("DELETE FROM saved_posts WHERE post_id = ?")
      .run("pn_dev_fixture_saved_reference");

    initializeDevTestDataForStartup(database, {
      isPackaged: false,
      harnessMode: false,
    });

    expect(fixtureCounts().saved_posts).toBe(5);
    expect(
      database
        .prepare("SELECT note FROM saved_posts WHERE post_id = ?")
        .get("pn_dev_fixture_saved_reference"),
    ).toBeUndefined();
  });

  it("keeps an explicit clear effective across later startups", () => {
    initializeDevTestDataForStartup(database, {
      isPackaged: false,
      harnessMode: false,
    });
    clearDevTestData(database);

    initializeDevTestDataForStartup(database, {
      isPackaged: false,
      harnessMode: false,
    });

    expect(isDevTestDataActive(database)).toBe(false);
    expect(Object.values(fixtureCounts()).every((count) => count === 0)).toBe(
      true,
    );
    expect(readSetting(DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY)).toBe("true");
  });

  it.each([
    ["Playwright harness", { isPackaged: false, harnessMode: true }],
    ["packaged app", { isPackaged: true, harnessMode: false }],
  ])("does not bootstrap fixtures for a %s", (_description, options) => {
    initializeDevTestDataForStartup(database, options);

    expect(isDevTestDataActive(database)).toBe(false);
    expect(readSetting(DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY)).toBeNull();
    expect(Object.values(fixtureCounts()).every((count) => count === 0)).toBe(
      true,
    );
  });

  it.each([
    ["false", "false"],
    ["true", "true"],
    [null, null],
  ])(
    "enables Saved Posts while fixtures are active and restores its prior setting (%s)",
    (previousPreference, expectedRestoredPreference) => {
      if (previousPreference != null) {
        database
          .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
          .run("saved_posts_enabled", previousPreference);
      }

      initializeDevTestDataForStartup(database, {
        isPackaged: false,
        harnessMode: false,
      });

      expect(readSetting("saved_posts_enabled")).toBe("true");
      clearDevTestData(database);

      expect(readSetting("saved_posts_enabled")).toBe(
        expectedRestoredPreference,
      );
    },
  );

  it("seeds representative records readable through existing source queries", () => {
    seedDevTestData(database);

    expect(isDevTestDataActive(database)).toBe(true);
    expect(
      database
        .prepare(
          "SELECT COUNT(DISTINCT week_start_date) AS count FROM reddit_digest_posts WHERE post_id GLOB ?",
        )
        .get(`${FIXTURE_ID_PREFIX}*`),
    ).toEqual({ count: 3 });
    expect(
      (
        database
          .prepare(
            "SELECT post_id FROM reddit_digest_posts WHERE post_id IN (" +
              REDDIT_DIGEST_FIXTURE_IDS.map(() => "?").join(", ") +
              ")",
          )
          .all(...REDDIT_DIGEST_FIXTURE_IDS) as Array<{ post_id: string }>
      ).map(({ post_id }) => post_id),
    ).toHaveLength(10);
    expect(
      database
        .prepare("SELECT viewed_at FROM reddit_digest_posts WHERE post_id = ?")
        .get(REDDIT_DIGEST_FIXTURE_IDS[4]),
    ).toMatchObject({ viewed_at: expect.any(Number) });

    const savedPostSearch = database
      .prepare(
        `
        SELECT saved_posts.post_id
        FROM saved_posts
        JOIN saved_posts_fts ON saved_posts.rowid = saved_posts_fts.rowid
        WHERE saved_posts_fts MATCH ?
      `,
      )
      .all("searchablefixture") as Array<{ post_id: string }>;
    expect(savedPostSearch).toContainEqual({
      post_id: "pn_dev_fixture_saved_unread",
    });
    expect(
      database
        .prepare("SELECT tags, note, body FROM saved_posts WHERE post_id = ?")
        .get("pn_dev_fixture_saved_read"),
    ).toMatchObject({
      tags: expect.stringContaining("research"),
      note: expect.stringContaining("Synthetic note"),
      body: expect.stringContaining("Synthetic body"),
    });
    const savedPostNotes = database
      .prepare(
        "SELECT note FROM saved_posts WHERE post_id GLOB ? ORDER BY post_id",
      )
      .all(`${FIXTURE_ID_PREFIX}saved_*`) as Array<{ note: string | null }>;
    expect(savedPostNotes).toHaveLength(6);
    expect(savedPostNotes.every(({ note }) => Boolean(note?.trim()))).toBe(
      true,
    );

    const weather = getWeatherSnapshot(WEATHER_FIXTURE_LOCATION_ID);
    expect(weather?.location.name).toBe("Fixture City");
    expect(weather?.current?.temperature).toBe(18.4);
    expect(weather?.hourly[0]).toMatchObject({ precipitationProbability: 5 });
    expect(weather?.daily[0]).toMatchObject({ date: expect.any(String) });
    expect(weather?.yesterday).toMatchObject({ date: expect.any(String) });
    expect(weather?.alerts[0]).toMatchObject({ kind: "wind" });
    expect(
      JSON.parse(
        (
          database
            .prepare(
              "SELECT current_json FROM weather_cache WHERE location_id = ?",
            )
            .get(WEATHER_FIXTURE_LOCATION_ID) as { current_json: string }
        ).current_json,
      ),
    ).toHaveProperty("yesterday");
    expect(
      JSON.parse(
        (
          database
            .prepare(
              "SELECT hourly_json FROM weather_cache WHERE location_id = ?",
            )
            .get(WEATHER_FIXTURE_LOCATION_ID) as { hourly_json: string }
        ).hourly_json,
      ),
    ).toHaveLength(6);

    expect(getLeagueById(database, SPORTS_FIXTURE_LEAGUE_ID)?.name).toBe(
      "Synthetic Demonstration League",
    );
    expect(getTrackedTeam(database, SPORTS_FIXTURE_HOME_TEAM_ID)?.name).toBe(
      "Fixture Owls",
    );
    expect(listEnabledLeagues(database, SPORTS_FIXTURE_SPORT)).toHaveLength(1);
    expect(
      listTrackedTeams(database, SPORTS_FIXTURE_SPORT).map(
        (team) => team.teamId,
      ),
    ).toContain(SPORTS_FIXTURE_HOME_TEAM_ID);
    expect(
      database
        .prepare(
          "SELECT status FROM sports_events WHERE event_id IN (?, ?, ?, ?) ORDER BY event_date",
        )
        .all(...SPORTS_FIXTURE_EVENT_IDS),
    ).toHaveLength(4);
    expect(
      database
        .prepare("SELECT status FROM sports_events WHERE event_id = ?")
        .get(SPORTS_FIXTURE_EVENT_IDS[1]),
    ).toMatchObject({ status: "LIVE" });

    expect(
      database
        .prepare("SELECT name FROM yt_channels WHERE channel_id = ?")
        .get(YOUTUBE_FIXTURE_CHANNEL_ID),
    ).toMatchObject({ name: "Synthetic Video Channel" });
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM yt_channels WHERE channel_id GLOB ?",
        )
        .get(`${FIXTURE_ID_PREFIX}youtube_channel*`),
    ).toEqual({ count: 4 });
    expect(
      database
        .prepare(
          "SELECT media_type, watched_at FROM yt_videos WHERE video_id IN (" +
            YOUTUBE_FIXTURE_VIDEO_IDS.map(() => "?").join(", ") +
            ") ORDER BY video_id",
        )
        .all(...YOUTUBE_FIXTURE_VIDEO_IDS),
    ).toHaveLength(30);
    const youtubeVideoCounts = database
      .prepare(
        `SELECT channel_id, COUNT(*) AS count
         FROM yt_videos
         WHERE video_id IN (${YOUTUBE_FIXTURE_VIDEO_IDS.map(() => "?").join(", ")})
         GROUP BY channel_id`,
      )
      .all(...YOUTUBE_FIXTURE_VIDEO_IDS) as Array<{
      channel_id: string;
      count: number;
    }>;
    expect(youtubeVideoCounts).toHaveLength(4);
    expect(
      Object.fromEntries(
        youtubeVideoCounts.map(({ channel_id, count }) => [channel_id, count]),
      ),
    ).toEqual({
      [YOUTUBE_FIXTURE_CHANNEL_IDS[0]]: 15,
      [YOUTUBE_FIXTURE_CHANNEL_IDS[1]]: 5,
      [YOUTUBE_FIXTURE_CHANNEL_IDS[2]]: 5,
      [YOUTUBE_FIXTURE_CHANNEL_IDS[3]]: 5,
    });

    expect(
      JSON.parse(readSetting("weather_settings_json") ?? "{}"),
    ).toHaveProperty("defaultLocationId", WEATHER_FIXTURE_LOCATION_ID);
  });

  it("reconciles Reddit digest fixtures after the week rolls over", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-18T12:00:00.000Z"));

    try {
      insertSentinelRows();
      seedDevTestData(database);
      expect(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM reddit_digest_posts WHERE post_id IN (" +
              REDDIT_DIGEST_FIXTURE_IDS.map(() => "?").join(", ") +
              ")",
          )
          .get(...REDDIT_DIGEST_FIXTURE_IDS),
      ).toEqual({ count: 10 });
      expect(
        database
          .prepare(
            "SELECT DISTINCT week_start_date FROM reddit_digest_posts WHERE post_id IN (" +
              REDDIT_DIGEST_FIXTURE_IDS.map(() => "?").join(", ") +
              ") ORDER BY week_start_date",
          )
          .all(...REDDIT_DIGEST_FIXTURE_IDS),
      ).toEqual([
        { week_start_date: "2026-09-28" },
        { week_start_date: "2026-10-05" },
        { week_start_date: "2026-10-12" },
      ]);

      vi.setSystemTime(new Date("2026-10-19T12:00:00.000Z"));
      updateDevTestData(database);
      updateDevTestData(database);

      expect(
        database
          .prepare(
            "SELECT COUNT(*) AS count FROM reddit_digest_posts WHERE post_id IN (" +
              REDDIT_DIGEST_FIXTURE_IDS.map(() => "?").join(", ") +
              ")",
          )
          .get(...REDDIT_DIGEST_FIXTURE_IDS),
      ).toEqual({ count: 10 });
      expect(
        database
          .prepare(
            "SELECT DISTINCT week_start_date FROM reddit_digest_posts WHERE post_id IN (" +
              REDDIT_DIGEST_FIXTURE_IDS.map(() => "?").join(", ") +
              ") ORDER BY week_start_date",
          )
          .all(...REDDIT_DIGEST_FIXTURE_IDS),
      ).toEqual([
        { week_start_date: "2026-10-05" },
        { week_start_date: "2026-10-12" },
        { week_start_date: "2026-10-19" },
      ]);
      expect(
        database
          .prepare("SELECT post_id FROM reddit_digest_posts WHERE post_id = ?")
          .get("user_digest"),
      ).toEqual({ post_id: "user_digest" });

      clearDevTestData(database);

      expect(
        database
          .prepare("SELECT post_id FROM reddit_digest_posts ORDER BY post_id")
          .all(),
      ).toEqual([{ post_id: "user_digest" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([updateDevTestData, resetDevTestData])(
    "preserves all nonfixture source records and user settings on explicit mutation",
    (mutation) => {
      insertSentinelRows();
      database
        .prepare(
          "UPDATE settings SET value = json_set(value, '$.defaultLocationId', 'user_weather') WHERE key = 'weather_settings_json'",
        )
        .run();
      seedDevTestData(database);
      const sourceTables = [
        ["reddit_digest_posts", "post_id"],
        ["saved_posts", "post_id"],
        ["weather_locations", "id"],
        ["weather_cache", "location_id"],
        ["weather_alert_state", "location_id"],
        ["astronomy_cache", "location_id"],
        ["sports_leagues", "league_id"],
        ["sports_teams", "team_id"],
        ["sports_events", "event_id"],
        ["sports_cache_meta", "sport"],
        ["yt_channels", "channel_id"],
        ["yt_videos", "video_id"],
      ];
      const snapshot = (): unknown =>
        Object.fromEntries(
          sourceTables.map(([table, key]) => [
            table,
            database
              .prepare(
                `SELECT * FROM ${table} WHERE ${key} NOT GLOB ? ORDER BY rowid`,
              )
              .all(`${FIXTURE_ID_PREFIX}*`),
          ]),
        );
      const before = snapshot();
      const weatherPreferences = readSetting("weather_settings_json");
      mutation(database);
      expect(snapshot()).toEqual(before);
      expect(readSetting("user_setting")).toBe("kept");
      expect(readSetting("weather_settings_json")).toBe(weatherPreferences);
    },
  );

  it("is repeatable and clears only fixture-owned rows while preserving sentinels", () => {
    insertSentinelRows();
    expect(
      database.prepare("SELECT event_id FROM sports_events").all(),
    ).toEqual([{ event_id: "user_event" }]);
    seedDevTestData(database);
    expect(
      database.prepare("SELECT event_id FROM sports_events").all(),
    ).toContainEqual({ event_id: "user_event" });
    const firstSeed = fixtureSnapshot();
    const firstCounts = fixtureCounts();

    seedDevTestData(database);

    expect(fixtureCounts()).toEqual(firstCounts);
    expect(fixtureSnapshot()).toEqual(firstSeed);
    expect(isDevTestDataActive(database)).toBe(true);

    clearDevTestData(database);
    clearDevTestData(database);

    expect(fixtureCounts()).toEqual(
      Object.fromEntries(Object.keys(firstCounts).map((table) => [table, 0])),
    );
    expect(isDevTestDataActive(database)).toBe(false);
    expect(
      database.prepare("SELECT post_id FROM reddit_digest_posts").all(),
    ).toEqual([{ post_id: "user_digest" }]);
    expect(database.prepare("SELECT post_id FROM saved_posts").all()).toEqual([
      { post_id: "user_saved" },
    ]);
    expect(
      database.prepare("SELECT id FROM weather_locations ORDER BY id").all(),
    ).toEqual([{ id: "user_weather" }]);
    expect(
      database.prepare("SELECT location_id FROM weather_cache").all(),
    ).toEqual([{ location_id: "user_weather" }]);
    expect(
      database.prepare("SELECT location_id FROM weather_alert_state").all(),
    ).toEqual([{ location_id: "user_weather" }]);
    expect(
      database.prepare("SELECT location_id FROM astronomy_cache").all(),
    ).toEqual([{ location_id: "user_weather" }]);
    expect(
      database.prepare("SELECT event_id FROM sports_events").all(),
    ).toEqual([{ event_id: "user_event" }]);
    expect(database.prepare("SELECT team_id FROM sports_teams").all()).toEqual([
      { team_id: "user_team" },
    ]);
    expect(
      database.prepare("SELECT league_id FROM sports_leagues").all(),
    ).toEqual([{ league_id: "user_league" }]);
    expect(
      database.prepare("SELECT sport, fetch_date FROM sports_cache_meta").all(),
    ).toEqual([{ sport: "User Sport", fetch_date: "2026-10-09" }]);
    expect(
      database.prepare("SELECT channel_id FROM yt_channels").all(),
    ).toEqual([{ channel_id: "user_channel" }]);
    expect(
      database
        .prepare(
          "SELECT sort_order, notify_new_videos, notify_live_start FROM yt_channels WHERE channel_id = 'user_channel'",
        )
        .get(),
    ).toEqual({
      sort_order: 0,
      notify_new_videos: 1,
      notify_live_start: 1,
    });
    expect(database.prepare("SELECT video_id FROM yt_videos").all()).toEqual([
      { video_id: "user_video" },
    ]);
    expect(
      database
        .prepare(
          "SELECT post_id FROM saved_posts JOIN saved_posts_fts ON saved_posts.rowid = saved_posts_fts.rowid WHERE saved_posts_fts MATCH ?",
        )
        .all("preserved"),
    ).toEqual([{ post_id: "user_saved" }]);
    expect(readSetting("user_setting")).toBe("kept");
    expect(
      JSON.parse(readSetting("weather_settings_json") ?? "{}"),
    ).toHaveProperty("defaultLocationId", null);
  });

  it("does not replace an existing Weather default location", () => {
    database
      .prepare(
        "UPDATE settings SET value = json_set(value, '$.defaultLocationId', 'user_weather') WHERE key = 'weather_settings_json'",
      )
      .run();

    seedDevTestData(database);
    expect(
      JSON.parse(readSetting("weather_settings_json") ?? "{}"),
    ).toHaveProperty("defaultLocationId", "user_weather");

    clearDevTestData(database);
    expect(
      JSON.parse(readSetting("weather_settings_json") ?? "{}"),
    ).toHaveProperty("defaultLocationId", "user_weather");
  });

  it("rolls back clear rather than cascading into non-fixture child rows", () => {
    seedDevTestData(database);
    const beforeClear = fixtureSnapshot();
    const now = Math.floor(Date.now() / 1000);
    database
      .prepare(
        `
      INSERT INTO yt_videos (
        video_id, channel_id, title, published_at, thumbnail_url,
        duration_sec, broadcast_status, scheduled_start, actual_start_time,
        actual_end_time, is_livestream, fetched_at, media_type, watched_at
      ) VALUES (
        'user_video_on_fixture_channel', ?, 'User video', ?, NULL, 30,
        'none', NULL, NULL, NULL, 0, ?, 'video', NULL
      )
    `,
      )
      .run(YOUTUBE_FIXTURE_CHANNEL_ID, now, now);
    database
      .prepare(
        `
      INSERT INTO sports_events (
        event_id, league_id, sport, home_team_id, away_team_id, home_team,
        away_team, home_team_normalized, away_team_normalized, home_score,
        away_score, event_date, event_time, status, venue, fetched_date
      ) VALUES (
        'user_event_on_fixture_league', ?, 'Fixture League', NULL, NULL,
        'User Team', 'Guest Team', 'userteam', 'guestteam', NULL, NULL,
        '2026-10-10', '12:00', 'scheduled', 'User Venue', '2026-10-10'
      )
    `,
      )
      .run(SPORTS_FIXTURE_LEAGUE_ID);

    expect(() => clearDevTestData(database)).toThrow(
      "Cannot clear test YouTube data",
    );
    expect(isDevTestDataActive(database)).toBe(true);
    expect(fixtureSnapshot()).toEqual(beforeClear);
    expect(
      database
        .prepare("SELECT video_id FROM yt_videos WHERE video_id LIKE 'user_%'")
        .all(),
    ).toEqual([{ video_id: "user_video_on_fixture_channel" }]);
    expect(
      database
        .prepare(
          "SELECT event_id FROM sports_events WHERE event_id = 'user_event_on_fixture_league'",
        )
        .all(),
    ).toEqual([{ event_id: "user_event_on_fixture_league" }]);
  });

  it("rolls back all rows and the active marker when seeding fails", () => {
    database.exec(`
      CREATE TRIGGER fail_fixture_marker_insert
      BEFORE INSERT ON settings
      WHEN NEW.key = '${DEV_TEST_DATA_ACTIVE_SETTING_KEY}'
      BEGIN
        SELECT RAISE(ABORT, 'fixture marker failure');
      END;
    `);

    expect(() => seedDevTestData(database)).toThrow("fixture marker failure");
    expect(fixtureCounts()).toEqual(
      Object.fromEntries(
        Object.keys(fixtureCounts()).map((table) => [table, 0]),
      ),
    );
    expect(isDevTestDataActive(database)).toBe(false);
    expect(
      JSON.parse(readSetting("weather_settings_json") ?? "{}"),
    ).toHaveProperty("defaultLocationId", null);
    expect(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM saved_posts_fts WHERE saved_posts_fts MATCH ?",
        )
        .get("Synthetic"),
    ).toEqual({ count: 0 });
  });
});
