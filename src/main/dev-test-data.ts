import type Database from "better-sqlite3";
import type { IpcMutationResult } from "../shared/ipc-types";
import { getDb } from "./db/database";
import { redditDigestFixtureContributor } from "./dev-test-data/reddit-digest";
import { savedPostsFixtureContributor } from "./dev-test-data/saved-posts";
import { sportsFixtureContributor } from "./dev-test-data/sports";
import { weatherFixtureContributor } from "./dev-test-data/weather";
import { youtubeFixtureContributor } from "./dev-test-data/youtube";
import type { DevTestDataContributor } from "./dev-test-data/types";

export const DEV_TEST_DATA_ACTIVE_SETTING_KEY = "dev_test_data_active";

export function assertDevTestDataMutationAllowed(isPackaged: boolean): void {
  if (isPackaged) {
    throw new Error("Developer test data is unavailable in packaged builds.");
  }
}

export function createDevTestDataMutationHandler(
  isPackaged: () => boolean,
  mutation: () => void,
): () => IpcMutationResult {
  return () => {
    assertDevTestDataMutationAllowed(isPackaged());
    mutation();
    return { ok: true, error: null };
  };
}

export const DEV_TEST_DATA_CONTRIBUTORS: readonly DevTestDataContributor[] = [
  redditDigestFixtureContributor,
  savedPostsFixtureContributor,
  weatherFixtureContributor,
  sportsFixtureContributor,
  youtubeFixtureContributor,
];

const WEATHER_SETTINGS_KEY = "weather_settings_json";
const WEATHER_FIXTURE_LOCATION_ID = "pn_dev_fixture_weather_location";

function readSetting(database: Database.Database, key: string): string | null {
  const row = database
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function writeSetting(
  database: Database.Database,
  key: string,
  value: string,
): void {
  database
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

function updateWeatherFixtureDefault(
  database: Database.Database,
  clear: boolean,
): void {
  const raw = readSetting(database, WEATHER_SETTINGS_KEY);
  let settings: Record<string, unknown> = {};
  if (raw != null) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed == null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return;
      }
      settings = parsed as Record<string, unknown>;
    } catch {
      return;
    }
  }

  if (clear) {
    if (settings.defaultLocationId !== WEATHER_FIXTURE_LOCATION_ID) {
      return;
    }
    settings.defaultLocationId = null;
  } else {
    if (
      settings.defaultLocationId != null &&
      settings.defaultLocationId !== ""
    ) {
      return;
    }
    settings.defaultLocationId = WEATHER_FIXTURE_LOCATION_ID;
  }

  writeSetting(database, WEATHER_SETTINGS_KEY, JSON.stringify(settings));
}

export function isDevTestDataActive(
  database: Database.Database = getDb(),
): boolean {
  return readSetting(database, DEV_TEST_DATA_ACTIVE_SETTING_KEY) === "true";
}

export function seedDevTestData(database: Database.Database = getDb()): void {
  const seedTransaction = database.transaction(() => {
    for (const contributor of DEV_TEST_DATA_CONTRIBUTORS) {
      contributor.seed(database);
    }
    updateWeatherFixtureDefault(database, false);
    writeSetting(database, DEV_TEST_DATA_ACTIVE_SETTING_KEY, "true");
  });
  seedTransaction();
}

export function clearDevTestData(database: Database.Database = getDb()): void {
  const clearTransaction = database.transaction(() => {
    updateWeatherFixtureDefault(database, true);
    for (const contributor of [...DEV_TEST_DATA_CONTRIBUTORS].reverse()) {
      contributor.clear(database);
    }
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(DEV_TEST_DATA_ACTIVE_SETTING_KEY);
  });
  clearTransaction();
}
