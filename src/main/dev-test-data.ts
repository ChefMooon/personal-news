import type Database from "better-sqlite3";
import type { DevTestDataStatus, IpcMutationResult } from "../shared/ipc-types";
import { getDb } from "./db/database";
import { astronomyFixtureContributor } from "./dev-test-data/astronomy";
import { redditDigestFixtureContributor } from "./dev-test-data/reddit-digest";
import { savedPostsFixtureContributor } from "./dev-test-data/saved-posts";
import { sportsFixtureContributor } from "./dev-test-data/sports";
import { weatherFixtureContributor } from "./dev-test-data/weather";
import { youtubeFixtureContributor } from "./dev-test-data/youtube";
import type { DevTestDataContributor } from "./dev-test-data/types";
import {
  createFixtureContext,
  type FixtureContext,
} from "./dev-test-data/fixtures";
import {
  captureFixtureInteractions,
  clearOwnedFixtureRows,
} from "./dev-test-data/ownership";
import {
  enableFixtureFeaturePreferences,
  restoreFixtureFeaturePreferences,
} from "./dev-test-data/preferences";
import {
  clearFixtureDashboardPresets,
  mergeFixtureDashboardPresets,
  resetFixtureDashboardPresets,
} from "./dev-test-data/dashboard-presets";

export const DEV_TEST_DATA_ACTIVE_SETTING_KEY = "dev_test_data_active";
export const DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY =
  "dev_test_data_bootstrap_complete";
export const DEV_TEST_DATA_VERSION_SETTING_KEY =
  "dev_test_data_applied_version";
// Bump when the shipped fixture definitions change.
export const DEV_TEST_DATA_VERSION = 4;

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
  astronomyFixtureContributor,
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
    if (
      typeof settings.defaultLocationId !== "string" ||
      !settings.defaultLocationId.startsWith("pn_dev_fixture_")
    ) {
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

export function getDevTestDataStatus(
  database: Database.Database = getDb(),
  available = true,
): DevTestDataStatus {
  const active = available && isDevTestDataActive(database);
  const rawVersion = readSetting(database, DEV_TEST_DATA_VERSION_SETTING_KEY);
  const appliedVersion =
    active && rawVersion != null && /^\d+$/.test(rawVersion)
      ? Number(rawVersion)
      : null;
  return {
    available,
    active,
    latestVersion: DEV_TEST_DATA_VERSION,
    appliedVersion,
    updateAvailable: active && appliedVersion !== DEV_TEST_DATA_VERSION,
  };
}

function applyFixtureDefinitions(
  database: Database.Database,
  context: FixtureContext,
): void {
  clearOwnedFixtureRows(database, true);
  for (const contributor of DEV_TEST_DATA_CONTRIBUTORS)
    contributor.seed(database, context);
  writeSetting(database, DEV_TEST_DATA_ACTIVE_SETTING_KEY, "true");
  writeSetting(database, DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY, "true");
  writeSetting(
    database,
    DEV_TEST_DATA_VERSION_SETTING_KEY,
    String(DEV_TEST_DATA_VERSION),
  );
}

export function seedDevTestData(
  database: Database.Database = getDb(),
  context: FixtureContext = createFixtureContext(),
): void {
  if (isDevTestDataActive(database)) return;
  database.transaction(() => {
    applyFixtureDefinitions(database, context);
    updateWeatherFixtureDefault(database, false);
    enableFixtureFeaturePreferences(database);
    mergeFixtureDashboardPresets(database);
  })();
}

export function updateDevTestData(
  database: Database.Database = getDb(),
  context: FixtureContext = createFixtureContext(),
): void {
  if (!isDevTestDataActive(database))
    throw new Error("Seed developer test data before updating it.");
  database.transaction(() => {
    const restoreInteractions = captureFixtureInteractions(database);
    applyFixtureDefinitions(database, context);
    restoreInteractions();
    enableFixtureFeaturePreferences(database, true);
    mergeFixtureDashboardPresets(database);
  })();
}

export function resetDevTestData(
  database: Database.Database = getDb(),
  context: FixtureContext = createFixtureContext(),
): void {
  if (!isDevTestDataActive(database))
    throw new Error("Seed developer test data before resetting it.");
  database.transaction(() => {
    // Retain original preference snapshots until the final Clear.
    clearOwnedFixtureRows(database);
    applyFixtureDefinitions(database, context);
    updateWeatherFixtureDefault(database, false);
    enableFixtureFeaturePreferences(database);
    resetFixtureDashboardPresets(database);
  })();
}

export function initializeDevTestDataForStartup(
  database: Database.Database,
  options: { isPackaged: boolean; harnessMode: boolean },
): void {
  if (options.isPackaged || options.harnessMode) {
    return;
  }

  if (readSetting(database, DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY) === "true") {
    return;
  }
  // Legacy active profiles also remain intact until an explicit Update/Reset.
  if (isDevTestDataActive(database)) {
    writeSetting(database, DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY, "true");
    return;
  }
  seedDevTestData(database, createFixtureContext());
}

export function clearDevTestData(database: Database.Database = getDb()): void {
  const clearTransaction = database.transaction(() => {
    updateWeatherFixtureDefault(database, true);
    restoreFixtureFeaturePreferences(database);
    clearOwnedFixtureRows(database);
    clearFixtureDashboardPresets(database);
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(DEV_TEST_DATA_ACTIVE_SETTING_KEY);
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(DEV_TEST_DATA_VERSION_SETTING_KEY);
    writeSetting(database, DEV_TEST_DATA_BOOTSTRAP_SETTING_KEY, "true");
  });
  clearTransaction();
}
