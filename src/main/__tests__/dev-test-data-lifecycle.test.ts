import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDevTestData,
  DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY,
  DEV_TEST_DATA_CONTRIBUTORS,
  DEV_TEST_DATA_VERSION,
  DEV_TEST_DATA_VERSION_SETTING_KEY,
  getDevTestDataStatus,
  initializeDevTestDataForStartup,
  resetDevTestData,
  seedDevTestData,
  updateDevTestData,
} from "../dev-test-data";
import { createFixtureContext } from "../dev-test-data/fixtures";
import { REDDIT_DIGEST_FIXTURE_IDS } from "../dev-test-data/reddit-digest";
import { SAVED_POST_FIXTURE_IDS } from "../dev-test-data/saved-posts";
import {
  SPORTS_FIXTURE_HOME_TEAM_ID,
  SPORTS_FIXTURE_LEAGUE_ID,
} from "../dev-test-data/sports";
import {
  YOUTUBE_FIXTURE_CHANNEL_ID,
  YOUTUBE_FIXTURE_VIDEO_IDS,
} from "../dev-test-data/youtube";

vi.mock("../db/database", () => ({
  getDb: () => {
    throw new Error("Pass the test database explicitly");
  },
}));
vi.mock("electron", () => ({
  app: { isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}));

let database: Database.Database;
const normalStartup = { isPackaged: false, harnessMode: false };

function setting(key: string): string | null {
  return (
    (
      database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
        { value: string } | undefined
    )?.value ?? null
  );
}

function setSetting(key: string, value: string): void {
  database
    .prepare(
      "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, value);
}

function databaseSnapshot(): unknown {
  const tables = [
    "settings",
    "reddit_digest_posts",
    "saved_posts",
    "weather_locations",
    "weather_cache",
    "weather_alert_state",
    "astronomy_cache",
    "sports_leagues",
    "sports_teams",
    "sports_events",
    "yt_channels",
    "yt_videos",
  ];
  return Object.fromEntries(
    tables.map((table) => [
      table,
      database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
    ]),
  );
}

function editInteractions(): void {
  database
    .prepare(
      "UPDATE saved_posts SET tags = '[\"mine\"]', note = 'my note', viewed_at = 123 WHERE post_id = ?",
    )
    .run(SAVED_POST_FIXTURE_IDS[0]);
  database
    .prepare("UPDATE reddit_digest_posts SET viewed_at = 456 WHERE post_id = ?")
    .run(REDDIT_DIGEST_FIXTURE_IDS[0]);
  database
    .prepare("UPDATE yt_videos SET watched_at = 789 WHERE video_id = ?")
    .run(YOUTUBE_FIXTURE_VIDEO_IDS[0]);
  database
    .prepare(
      "UPDATE yt_channels SET enabled = 0, sort_order = 42, notify_new_videos = 0, notify_live_start = 0 WHERE channel_id = ?",
    )
    .run(YOUTUBE_FIXTURE_CHANNEL_ID);
  database
    .prepare(
      "UPDATE sports_leagues SET enabled = 0, sort_order = 17 WHERE league_id = ?",
    )
    .run(SPORTS_FIXTURE_LEAGUE_ID);
  database
    .prepare(
      "UPDATE sports_teams SET enabled = 0, sort_order = 19 WHERE team_id = ?",
    )
    .run(SPORTS_FIXTURE_HOME_TEAM_ID);
  setSetting("saved_posts_enabled", "false");
  setSetting("widget_instances", '[{"id":"mine","config":{"limit":2}}]');
  setSetting("widget_layout", '{"mine":{"x":3,"y":9}}');
}

function interactions(): unknown[] {
  return [
    database
      .prepare("SELECT tags,note,viewed_at FROM saved_posts WHERE post_id = ?")
      .get(SAVED_POST_FIXTURE_IDS[0]),
    database
      .prepare("SELECT viewed_at FROM reddit_digest_posts WHERE post_id = ?")
      .get(REDDIT_DIGEST_FIXTURE_IDS[0]),
    database
      .prepare("SELECT watched_at FROM yt_videos WHERE video_id = ?")
      .get(YOUTUBE_FIXTURE_VIDEO_IDS[0]),
    database
      .prepare(
        "SELECT enabled,sort_order,notify_new_videos,notify_live_start FROM yt_channels WHERE channel_id = ?",
      )
      .get(YOUTUBE_FIXTURE_CHANNEL_ID),
    database
      .prepare(
        "SELECT enabled,sort_order FROM sports_leagues WHERE league_id = ?",
      )
      .get(SPORTS_FIXTURE_LEAGUE_ID),
    database
      .prepare("SELECT enabled,sort_order FROM sports_teams WHERE team_id = ?")
      .get(SPORTS_FIXTURE_HOME_TEAM_ID),
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T14:00:00Z"));
  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  const migrations = join(process.cwd(), "src/main/db/migrations");
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith(".sql"))
    .sort())
    database.exec(readFileSync(join(migrations, file), "utf8"));
});

afterEach(() => {
  database.close();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("fixture lifecycle", () => {
  it("rolls back all definitions and feature flags when Astronomy preference capture fails", () => {
    setSetting("sports_enabled", "false");
    setSetting(
      "astronomy_settings_json",
      '{"enabled":false,"pollIntervalMinutes":90}',
    );
    database.exec(
      "CREATE TRIGGER fail_astronomy_backup BEFORE INSERT ON settings WHEN NEW.key = 'dev_test_data_astronomy_enabled_before' BEGIN SELECT RAISE(ABORT, 'astronomy backup failure'); END;",
    );
    const before = databaseSnapshot();
    expect(() => seedDevTestData(database)).toThrow("astronomy backup failure");
    expect(databaseSnapshot()).toEqual(before);
  });

  it.each(["false", "true", null])(
    "enables Sports on Seed/Reset and restores its original flag on Clear (%s)",
    (original) => {
      if (original !== null) setSetting("sports_enabled", original);
      else
        database
          .prepare("DELETE FROM settings WHERE key = 'sports_enabled'")
          .run();
      seedDevTestData(database);
      expect(setting("sports_enabled")).toBe("true");
      setSetting("sports_enabled", "false");
      seedDevTestData(database);
      updateDevTestData(database);
      expect(setting("sports_enabled")).toBe("false");
      resetDevTestData(database);
      expect(setting("sports_enabled")).toBe("true");
      resetDevTestData(database);
      clearDevTestData(database);
      expect(setting("sports_enabled")).toBe(original);
    },
  );

  it.each([false, true, undefined])(
    "restores only Astronomy's original enabled flag and preserves unrelated JSON changes (%s)",
    (originalEnabled) => {
      const original = {
        pollIntervalMinutes: 75,
        custom: "before",
        ...(originalEnabled === undefined ? {} : { enabled: originalEnabled }),
      };
      setSetting("astronomy_settings_json", JSON.stringify(original));
      seedDevTestData(database);
      expect(JSON.parse(setting("astronomy_settings_json")!)).toEqual({
        ...original,
        enabled: true,
      });
      setSetting(
        "astronomy_settings_json",
        JSON.stringify({
          enabled: false,
          pollIntervalMinutes: 120,
          custom: "edited",
          extra: 1,
        }),
      );
      updateDevTestData(database);
      expect(JSON.parse(setting("astronomy_settings_json")!).enabled).toBe(
        false,
      );
      resetDevTestData(database);
      expect(JSON.parse(setting("astronomy_settings_json")!).enabled).toBe(
        true,
      );
      clearDevTestData(database);
      expect(JSON.parse(setting("astronomy_settings_json")!)).toEqual({
        pollIntervalMinutes: 120,
        custom: "edited",
        extra: 1,
        ...(originalEnabled === undefined ? {} : { enabled: originalEnabled }),
      });
      expect(setting("dev_test_data_astronomy_enabled_before")).toBeNull();
    },
  );

  it("restores unset Astronomy settings, preserving any new unrelated fields", () => {
    database
      .prepare("DELETE FROM settings WHERE key = 'astronomy_settings_json'")
      .run();
    seedDevTestData(database);
    clearDevTestData(database);
    expect(setting("astronomy_settings_json")).toBeNull();
    seedDevTestData(database);
    setSetting(
      "astronomy_settings_json",
      '{"enabled":true,"pollIntervalMinutes":90}',
    );
    resetDevTestData(database);
    clearDevTestData(database);
    expect(JSON.parse(setting("astronomy_settings_json")!)).toEqual({
      pollIntervalMinutes: 90,
    });
  });

  it("captures new feature gates once when updating a legacy active fixture profile", () => {
    seedDevTestData(database);
    database
      .prepare("DELETE FROM settings WHERE key IN (?, ?)")
      .run(
        "dev_test_data_sports_enabled_before",
        "dev_test_data_astronomy_enabled_before",
      );
    setSetting("sports_enabled", "false");
    setSetting(
      "astronomy_settings_json",
      '{"enabled":false,"pollIntervalMinutes":90}',
    );
    updateDevTestData(database);
    expect(setting("sports_enabled")).toBe("true");
    expect(JSON.parse(setting("astronomy_settings_json")!)).toEqual({
      enabled: true,
      pollIntervalMinutes: 90,
    });
    setSetting("sports_enabled", "false");
    setSetting(
      "astronomy_settings_json",
      '{"enabled":false,"pollIntervalMinutes":120}',
    );
    updateDevTestData(database);
    expect(setting("sports_enabled")).toBe("false");
    expect(JSON.parse(setting("astronomy_settings_json")!).enabled).toBe(false);
    clearDevTestData(database);
    expect(setting("sports_enabled")).toBe("false");
    expect(JSON.parse(setting("astronomy_settings_json")!)).toEqual({
      enabled: false,
      pollIntervalMinutes: 120,
    });
  });

  it("leaves active profile content, dates, interactions, deletions and settings unchanged across a later week startup", () => {
    initializeDevTestDataForStartup(database, normalStartup);
    editInteractions();
    database
      .prepare("DELETE FROM saved_posts WHERE post_id = ?")
      .run(SAVED_POST_FIXTURE_IDS[1]);
    const before = databaseSnapshot();
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z"));
    initializeDevTestDataForStartup(database, normalStartup);
    expect(databaseSnapshot()).toEqual(before);
    seedDevTestData(database);
    expect(databaseSnapshot()).toEqual(before);
  });

  it("passes one captured context to every contributor", () => {
    const spies = DEV_TEST_DATA_CONTRIBUTORS.map((contributor) =>
      vi.spyOn(contributor, "seed"),
    );
    const context = createFixtureContext();
    seedDevTestData(database, context);
    for (const spy of spies)
      expect(spy).toHaveBeenCalledWith(database, context);
    expect(
      database
        .prepare("SELECT added_at FROM sports_leagues WHERE league_id = ?")
        .get(SPORTS_FIXTURE_LEAGUE_ID),
    ).toEqual({ added_at: Math.floor(context.now / 1000) });
  });

  it("applies current content on Update and preserves existing interactions, feature preferences and widget edits", () => {
    seedDevTestData(database);
    editInteractions();
    database
      .prepare("UPDATE saved_posts SET title = 'outdated' WHERE post_id = ?")
      .run(SAVED_POST_FIXTURE_IDS[0]);
    const before = interactions();
    const oldWeek = database
      .prepare(
        "SELECT week_start_date FROM reddit_digest_posts WHERE post_id = ?",
      )
      .get(REDDIT_DIGEST_FIXTURE_IDS[0]);
    vi.setSystemTime(new Date("2026-10-28T14:00:00Z"));
    updateDevTestData(database);
    expect(interactions()).toEqual(before);
    expect(
      database
        .prepare("SELECT title FROM saved_posts WHERE post_id = ?")
        .get(SAVED_POST_FIXTURE_IDS[0]),
    ).not.toEqual({ title: "outdated" });
    expect(
      database
        .prepare(
          "SELECT week_start_date FROM reddit_digest_posts WHERE post_id = ?",
        )
        .get(REDDIT_DIGEST_FIXTURE_IDS[0]),
    ).not.toEqual(oldWeek);
    expect(setting("saved_posts_enabled")).toBe("false");
    expect(setting("widget_instances")).toBe(
      '[{"id":"mine","config":{"limit":2}}]',
    );
    expect(setting("widget_layout")).toBe('{"mine":{"x":3,"y":9}}');
  });

  it.each(["false", "true", null])(
    "Reset restores examples and keeps the original prefixture preference (%s) until Clear",
    (original) => {
      if (original !== null) setSetting("saved_posts_enabled", original);
      seedDevTestData(database);
      const defaults = interactions();
      editInteractions();
      resetDevTestData(database);
      expect(interactions()).toEqual(defaults);
      expect(setting("widget_layout")).toBe('{"mine":{"x":3,"y":9}}');
      resetDevTestData(database);
      clearDevTestData(database);
      expect(setting("saved_posts_enabled")).toBe(original);
    },
  );

  it("reports inactive, legacy, older and current fixture versions", () => {
    expect(getDevTestDataStatus(database)).toEqual({
      available: true,
      active: false,
      latestVersion: DEV_TEST_DATA_VERSION,
      appliedVersion: null,
      updateAvailable: false,
    });
    seedDevTestData(database);
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(DEV_TEST_DATA_VERSION_SETTING_KEY);
    expect(getDevTestDataStatus(database)).toMatchObject({
      appliedVersion: null,
      updateAvailable: true,
    });
    setSetting(DEV_TEST_DATA_VERSION_SETTING_KEY, "0");
    expect(getDevTestDataStatus(database)).toMatchObject({
      appliedVersion: 0,
      updateAvailable: true,
    });
    updateDevTestData(database);
    expect(getDevTestDataStatus(database)).toMatchObject({
      appliedVersion: DEV_TEST_DATA_VERSION,
      updateAvailable: false,
    });
    expect(getDevTestDataStatus(database, false)).toMatchObject({
      available: false,
      active: false,
      appliedVersion: null,
    });
  });

  it.each([false, true])(
    "respects manual Clear before bootstrap (manual Seed first: %s)",
    (seedFirst) => {
      if (seedFirst) seedDevTestData(database);
      clearDevTestData(database);
      initializeDevTestDataForStartup(database, normalStartup);
      expect(getDevTestDataStatus(database).active).toBe(false);
      expect(setting(DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY)).toBe("true");
      expect(
        database.prepare("SELECT COUNT(*) AS count FROM saved_posts").get(),
      ).toEqual({ count: 0 });
    },
  );

  it("removes retired namespace IDs on Update and Clear while preserving similarly named user rows", () => {
    seedDevTestData(database);
    const insert = database.prepare(
      "INSERT INTO saved_posts (post_id,title,url,permalink,saved_at) VALUES (?, 'old', 'https://example.invalid', '/old', 1)",
    );
    insert.run("pn_dev_fixture_retired_saved");
    insert.run("pnXdevXfixture_user");
    database
      .prepare(
        "INSERT INTO yt_channels (channel_id,name,added_at) VALUES ('pn_dev_fixture_retired_channel','old',1)",
      )
      .run();
    database
      .prepare(
        "INSERT INTO yt_videos (video_id,channel_id,title,published_at,fetched_at) VALUES ('pn_dev_fixture_retired_video','pn_dev_fixture_retired_channel','old',1,1)",
      )
      .run();
    updateDevTestData(database);
    expect(
      database
        .prepare(
          "SELECT post_id FROM saved_posts WHERE post_id LIKE '%retired%'",
        )
        .all(),
    ).toEqual([]);
    expect(
      database
        .prepare(
          "SELECT channel_id FROM yt_channels WHERE channel_id LIKE '%retired%'",
        )
        .all(),
    ).toEqual([]);
    insert.run("pn_dev_fixture_later_retired");
    clearDevTestData(database);
    expect(database.prepare("SELECT post_id FROM saved_posts").all()).toEqual([
      { post_id: "pnXdevXfixture_user" },
    ]);
  });

  it("rolls back Update cleanup when user records reference a retired fixture parent", () => {
    seedDevTestData(database);
    database
      .prepare(
        "INSERT INTO yt_channels (channel_id,name,added_at) VALUES ('pn_dev_fixture_retired_channel','old',1)",
      )
      .run();
    database
      .prepare(
        "INSERT INTO yt_videos (video_id,channel_id,title,published_at,fetched_at) VALUES ('user_video','pn_dev_fixture_retired_channel','user',1,1)",
      )
      .run();
    const before = databaseSnapshot();
    expect(() => updateDevTestData(database)).toThrow(
      "Cannot clear test YouTube data",
    );
    expect(databaseSnapshot()).toEqual(before);
  });

  it.each([updateDevTestData, resetDevTestData])(
    "rolls back definitions, preferences, interactions and version when a mutation fails",
    (mutation) => {
      setSetting("saved_posts_enabled", "false");
      seedDevTestData(database);
      editInteractions();
      setSetting(DEV_TEST_DATA_VERSION_SETTING_KEY, "0");
      database.exec(
        `CREATE TRIGGER fail_fixture_version BEFORE INSERT ON settings WHEN NEW.key = '${DEV_TEST_DATA_VERSION_SETTING_KEY}' BEGIN SELECT RAISE(ABORT, 'version failure'); END;`,
      );
      const before = databaseSnapshot();
      expect(() => mutation(database)).toThrow("version failure");
      expect(databaseSnapshot()).toEqual(before);
    },
  );

  it("requires an active fixture profile for Update and Reset", () => {
    expect(() => updateDevTestData(database)).toThrow(
      "Seed developer test data before updating it",
    );
    expect(() => resetDevTestData(database)).toThrow(
      "Seed developer test data before resetting it",
    );
  });
});
