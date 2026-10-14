import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mergeFixtureDashboardPresets,
  SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY,
  upgradeLegacySportsFixtureDefaults,
} from "./dashboard-presets";
import {
  DASHBOARD_FIXTURE_SIZES,
  fixtureConfigKey,
  fixtureWidgetId,
} from "./definitions/dashboard-presets";

const legacy = {
  sport: "Baseball",
  viewMode: "detailed",
  showVenue: true,
  showTime: true,
  showLiveStartTime: true,
};
const keys = DASHBOARD_FIXTURE_SIZES.map((size) =>
  fixtureConfigKey("sports", fixtureWidgetId("sports", size)),
);
let db: Database.Database;
function put(key: string, config: unknown): void {
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)").run(
    key,
    JSON.stringify(config),
  );
}
function get(key: string): unknown {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
    { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
}
beforeEach(() => {
  db = new Database(":memory:");
  db.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
});
afterEach(() => db.close());

describe("legacy Sports fixture default upgrade", () => {
  it("upgrades all three canonical defaults regardless of field order", () => {
    for (const key of keys)
      put(key, Object.fromEntries(Object.entries(legacy).reverse()));
    expect(upgradeLegacySportsFixtureDefaults(db)).toBe(3);
    for (const key of keys)
      expect(get(key)).toEqual({ ...legacy, sport: "all" });
    expect(get(SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY)).toBe(1);
  });

  it.each([
    { sport: "Baseball" },
    { ...legacy, showVenue: false },
    { ...legacy, viewMode: "today" },
    { ...legacy, sport: "Basketball" },
    { ...legacy, customField: true },
    null,
    [legacy],
  ])("preserves a customized or partial config: %j", (config) => {
    put(keys[0], config);
    expect(upgradeLegacySportsFixtureDefaults(db)).toBe(0);
    expect(get(keys[0])).toEqual(config);
  });

  it("leaves ordinary user widgets and malformed settings untouched", () => {
    const userKey = "sports_view_config:user_sports";
    put(userKey, legacy);
    db.prepare("INSERT INTO settings(key,value) VALUES (?,?)").run(
      keys[0],
      "malformed",
    );
    expect(upgradeLegacySportsFixtureDefaults(db)).toBe(0);
    expect(get(userKey)).toEqual(legacy);
    expect(
      db.prepare("SELECT value FROM settings WHERE key=?").get(keys[0]),
    ).toEqual({ value: "malformed" });
  });

  it("preserves later intentional Baseball selections after upgrade", () => {
    put(keys[0], legacy);
    upgradeLegacySportsFixtureDefaults(db);
    put(keys[0], legacy);
    mergeFixtureDashboardPresets(db);
    expect(get(keys[0])).toEqual(legacy);
    expect(upgradeLegacySportsFixtureDefaults(db)).toBe(0);
  });

  it("marks fresh Seed complete before any user can choose Baseball", () => {
    mergeFixtureDashboardPresets(db);
    expect(get(SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY)).toBe(1);
    put(keys[0], legacy);
    mergeFixtureDashboardPresets(db);
    expect(get(keys[0])).toEqual(legacy);
  });

  it("rolls back upgraded configs if marker persistence fails", () => {
    for (const key of keys) put(key, legacy);
    db.exec(
      `CREATE TRIGGER fail_marker BEFORE INSERT ON settings WHEN NEW.key = '${SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY}' BEGIN SELECT RAISE(ABORT,'injected failure'); END`,
    );
    expect(() => upgradeLegacySportsFixtureDefaults(db)).toThrow(
      "injected failure",
    );
    for (const key of keys) expect(get(key)).toEqual(legacy);
    expect(get(SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY)).toBeNull();
  });
});
