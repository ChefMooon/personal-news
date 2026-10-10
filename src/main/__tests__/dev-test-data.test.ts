import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDevTestData,
  createDevTestDataMutationHandler,
  DEV_TEST_DATA_ACTIVE_SETTING_KEY,
  isDevTestDataActive,
  seedDevTestData,
} from "../dev-test-data";
import {
  SPORTS_FIXTURE_EVENT_IDS,
  SPORTS_FIXTURE_HOME_TEAM_ID,
  SPORTS_FIXTURE_LEAGUE_ID,
} from "../dev-test-data/sports";
import { WEATHER_FIXTURE_LOCATION_ID } from "../dev-test-data/weather";
import {
  YOUTUBE_FIXTURE_CHANNEL_ID,
  YOUTUBE_FIXTURE_VIDEO_IDS,
} from "../dev-test-data/youtube";
import { getWeatherSnapshot, WeatherModule } from "../sources/weather";
import {
  getLeagueById,
  getTrackedTeam,
  listEnabledLeagues,
  listTrackedTeams,
} from "../sources/sports/cache";

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
});

afterEach(() => {
  WeatherModule.shutdown();
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
      database
        .prepare("SELECT viewed_at FROM reddit_digest_posts WHERE post_id = ?")
        .get("pn_dev_fixture_digest_previous"),
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
    expect(listEnabledLeagues(database, "Fixture League")).toHaveLength(1);
    expect(
      listTrackedTeams(database, "Fixture League").map((team) => team.teamId),
    ).toContain(SPORTS_FIXTURE_HOME_TEAM_ID);
    expect(
      database
        .prepare(
          "SELECT status FROM sports_events WHERE event_id IN (?, ?, ?) ORDER BY event_date",
        )
        .all(...SPORTS_FIXTURE_EVENT_IDS),
    ).toHaveLength(3);
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
          "SELECT media_type, watched_at FROM yt_videos WHERE video_id IN (?, ?, ?) ORDER BY video_id",
        )
        .all(...YOUTUBE_FIXTURE_VIDEO_IDS),
    ).toHaveLength(3);

    expect(
      JSON.parse(readSetting("weather_settings_json") ?? "{}"),
    ).toHaveProperty("defaultLocationId", WEATHER_FIXTURE_LOCATION_ID);
  });

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
