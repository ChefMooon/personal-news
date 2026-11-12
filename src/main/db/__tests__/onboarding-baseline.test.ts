import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FEATURE_IDS } from "../../../shared/feature-manifest";
import {
  FEATURES_SEEN_KEY,
  isFreshDatabase,
  ONBOARDING_COMPLETED_KEY,
  recordOnboardingBaseline,
} from "../onboarding-baseline";

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
  "012_sports_event_location.sql",
];

function createDatabaseWithMigrations(): Database.Database {
  const database = new Database(":memory:");
  for (const migration of MIGRATIONS) {
    database.exec(
      readFileSync(
        fileURLToPath(new URL(`../migrations/${migration}`, import.meta.url)),
        "utf8",
      ),
    );
  }
  database
    .prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'")
    .run(String(MIGRATIONS.length));
  return database;
}

function readSetting(database: Database.Database, key: string): string | null {
  const row = database
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

describe("onboarding database baseline", () => {
  it("treats an empty database as fresh", () => {
    const database = new Database(":memory:");
    try {
      expect(isFreshDatabase(database)).toBe(true);
    } finally {
      database.close();
    }
  });

  it("treats a migrated database with a schema version as existing", () => {
    const database = createDatabaseWithMigrations();
    try {
      expect(isFreshDatabase(database)).toBe(false);
    } finally {
      database.close();
    }
  });

  it("treats a settings table without a schema version as existing", () => {
    const database = new Database(":memory:");
    database.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    try {
      expect(isFreshDatabase(database)).toBe(false);
    } finally {
      database.close();
    }
  });

  it("records a fresh profile as incomplete and marks all features seen", () => {
    const database = createDatabaseWithMigrations();
    try {
      recordOnboardingBaseline(database, true);

      expect(readSetting(database, ONBOARDING_COMPLETED_KEY)).toBe("false");
      expect(readSetting(database, FEATURES_SEEN_KEY)).toBe(
        JSON.stringify([...FEATURE_IDS]),
      );
    } finally {
      database.close();
    }
  });

  it("grandfathers an existing profile and marks all features seen", () => {
    const database = createDatabaseWithMigrations();
    try {
      recordOnboardingBaseline(database, false);

      expect(readSetting(database, ONBOARDING_COMPLETED_KEY)).toBe("true");
      expect(readSetting(database, FEATURES_SEEN_KEY)).toBe(
        JSON.stringify([...FEATURE_IDS]),
      );
    } finally {
      database.close();
    }
  });

  it.each(["false", "true"])("never overwrites an existing %s marker", (value) => {
    const database = createDatabaseWithMigrations();
    try {
      database
        .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
        .run(ONBOARDING_COMPLETED_KEY, value);

      recordOnboardingBaseline(database, value !== "true");

      expect(readSetting(database, ONBOARDING_COMPLETED_KEY)).toBe(value);
      expect(readSetting(database, FEATURES_SEEN_KEY)).toBeNull();
    } finally {
      database.close();
    }
  });

  it("keeps an incomplete marker when a fresh profile is reopened mid-wizard", () => {
    const database = createDatabaseWithMigrations();
    try {
      recordOnboardingBaseline(database, true);
      recordOnboardingBaseline(database, false);

      expect(readSetting(database, ONBOARDING_COMPLETED_KEY)).toBe("false");
    } finally {
      database.close();
    }
  });

  it("checks freshness before entering the migration loop", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../database.ts", import.meta.url)),
      "utf8",
    );

    expect(source.indexOf("isFreshDatabase(database)")).toBeLessThan(
      source.indexOf("while (nextVersion"),
    );
  });
});
