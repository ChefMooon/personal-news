import type Database from "better-sqlite3";
import { FEATURE_IDS } from "../../shared/feature-manifest";

export const ONBOARDING_COMPLETED_KEY = "onboarding_completed";
export const FEATURES_SEEN_KEY = "features_seen_ids";

export function isFreshDatabase(database: Database.Database): boolean {
  const tables = new Set(
    (
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('meta', 'settings')",
        )
        .all() as Array<{ name: string }>
    ).map(({ name }) => name),
  );
  const hasSchemaVersion =
    tables.has("meta") &&
    database
      .prepare("SELECT 1 FROM meta WHERE key = ?")
      .get("schema_version") !== undefined;

  return !hasSchemaVersion && !tables.has("settings");
}

export function recordOnboardingBaseline(
  database: Database.Database,
  wasFresh: boolean,
): void {
  const existing = database
    .prepare("SELECT 1 FROM settings WHERE key = ?")
    .get(ONBOARDING_COMPLETED_KEY);
  if (existing) return;

  database
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run(ONBOARDING_COMPLETED_KEY, wasFresh ? "false" : "true");
  database
    .prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)")
    .run(FEATURES_SEEN_KEY, JSON.stringify([...FEATURE_IDS]));
}
