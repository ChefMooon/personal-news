import type Database from "better-sqlite3";

// Extend this list when another feature must be visible with fixtures.
// Keep the saved-posts backup key compatible with existing Development profiles.
const FIXTURE_FEATURE_PREFERENCES = [
  {
    key: "reddit_digest_enabled",
    backupKey: "dev_test_data_reddit_digest_enabled_before",
    value: "true",
  },
  {
    key: "weather_enabled",
    backupKey: "dev_test_data_weather_enabled_before",
    value: "true",
  },
  {
    key: "saved_posts_enabled",
    backupKey: "dev_test_data_saved_posts_enabled_before",
    value: "true",
  },
  {
    key: "sports_enabled",
    backupKey: "dev_test_data_sports_enabled_before",
    value: "true",
  },
] as const;

const ASTRONOMY_SETTINGS_KEY = "astronomy_settings_json";
const ASTRONOMY_BACKUP_KEY = "dev_test_data_astronomy_enabled_before";

interface JsonFlagBackup {
  settingExisted: boolean;
  flagExisted: boolean;
  value?: unknown;
}

function readJsonObject(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed != null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function read(database: Database.Database, key: string): string | null {
  return (
    (
      database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
        { value: string } | undefined
    )?.value ?? null
  );
}

function write(database: Database.Database, key: string, value: string): void {
  database
    .prepare(
      "INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, value);
}

export function enableFixtureFeaturePreferences(
  database: Database.Database,
  onlyUncaptured = false,
): void {
  for (const preference of FIXTURE_FEATURE_PREFERENCES) {
    const captured = read(database, preference.backupKey) !== null;
    if (onlyUncaptured && captured) continue;
    if (!captured) {
      write(
        database,
        preference.backupKey,
        JSON.stringify(read(database, preference.key)),
      );
    }
    write(database, preference.key, preference.value);
  }
  const captured = read(database, ASTRONOMY_BACKUP_KEY) !== null;
  if (onlyUncaptured && captured) return;
  const raw = read(database, ASTRONOMY_SETTINGS_KEY);
  const settings = readJsonObject(raw);
  // Malformed JSON already falls back to the enabled source default; preserve it.
  if (!settings) return;
  if (!captured) {
    const backup: JsonFlagBackup = {
      settingExisted: raw !== null,
      flagExisted: Object.hasOwn(settings, "enabled"),
      value: settings.enabled,
    };
    write(database, ASTRONOMY_BACKUP_KEY, JSON.stringify(backup));
  }
  write(
    database,
    ASTRONOMY_SETTINGS_KEY,
    JSON.stringify({ ...settings, enabled: true }),
  );
}

export function restoreFixtureFeaturePreferences(
  database: Database.Database,
): void {
  for (const preference of FIXTURE_FEATURE_PREFERENCES) {
    const backup = read(database, preference.backupKey);
    if (backup === null) continue;
    let previous: unknown;
    try {
      previous = JSON.parse(backup);
    } catch {
      continue;
    }
    if (previous === null)
      database
        .prepare("DELETE FROM settings WHERE key = ?")
        .run(preference.key);
    else if (typeof previous === "string")
      write(database, preference.key, previous);
    else continue;
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(preference.backupKey);
  }
  const backupRaw = read(database, ASTRONOMY_BACKUP_KEY);
  if (backupRaw === null) return;
  let backup: JsonFlagBackup;
  try {
    backup = JSON.parse(backupRaw) as JsonFlagBackup;
  } catch {
    return;
  }
  if (
    backup == null ||
    typeof backup.settingExisted !== "boolean" ||
    typeof backup.flagExisted !== "boolean"
  )
    return;
  const settings = readJsonObject(read(database, ASTRONOMY_SETTINGS_KEY));
  if (!settings) return;
  if (backup.flagExisted) settings.enabled = backup.value;
  else delete settings.enabled;
  if (!backup.settingExisted && Object.keys(settings).length === 0)
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(ASTRONOMY_SETTINGS_KEY);
  else write(database, ASTRONOMY_SETTINGS_KEY, JSON.stringify(settings));
  database
    .prepare("DELETE FROM settings WHERE key = ?")
    .run(ASTRONOMY_BACKUP_KEY);
}
