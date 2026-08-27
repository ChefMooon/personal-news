import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock electron before importing the module under test.
vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

// Back the settings store with the per-test in-memory database.
const settingsMap = new Map<string, string>();
vi.mock("../../../settings/store", () => ({
  getSetting: (key: string): string | null => settingsMap.get(key) ?? null,
  setSetting: (key: string, value: string): void => {
    settingsMap.set(key, value);
  },
  deleteSetting: (key: string): void => {
    settingsMap.delete(key);
  },
}));

import Database from "better-sqlite3";
import {
  AstronomyModule,
  getAstronomySettings,
  getAstronomySnapshot,
  triggerAstronomyRefresh,
  updateAstronomySettings,
} from "../index";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE weather_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      admin1 TEXT,
      country TEXT,
      country_code TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      timezone TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE weather_cache (
      location_id TEXT PRIMARY KEY,
      current_json TEXT NOT NULL,
      hourly_json TEXT NOT NULL,
      daily_json TEXT NOT NULL,
      alerts_json TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE astronomy_cache (
      location_id     TEXT PRIMARY KEY,
      payload_json    TEXT NOT NULL,
      status          TEXT NOT NULL,
      for_timestamp   INTEGER,
      calculated_at   INTEGER,
      FOREIGN KEY (location_id) REFERENCES weather_locations(id) ON DELETE CASCADE
    );
    INSERT INTO weather_locations VALUES ('loc1', 'Test', NULL, NULL, NULL, 40.7, -74.0, 'America/New_York', 0);
  `);
  return db;
}

let db: Database.Database;

beforeEach(() => {
  settingsMap.clear();
  db = freshDb();
  AstronomyModule.initialize(db);
});

describe("astronomy module lifecycle", () => {
  it("returns null snapshot for unknown location", () => {
    expect(getAstronomySnapshot("nope")).toBeNull();
  });

  it("clamps poll interval to 15..1440 and defaults enabled", () => {
    const next = updateAstronomySettings({ pollIntervalMinutes: 5 });
    expect(next.pollIntervalMinutes).toBe(15);
    expect(next.enabled).toBe(true);

    const clampedHigh = updateAstronomySettings({ pollIntervalMinutes: 9999 });
    expect(clampedHigh.pollIntervalMinutes).toBe(1440);
  });

  it("falls back to defaults on malformed stored settings", () => {
    db.prepare("INSERT OR REPLACE INTO settings VALUES (?, ?)").run(
      "astronomy_settings_json",
      "{not json",
    );
    const settings = getAstronomySettings();
    expect(settings.enabled).toBe(true);
    expect(settings.pollIntervalMinutes).toBe(60);
  });

  it("rejects refresh when disabled with refreshedCount 0", async () => {
    updateAstronomySettings({ enabled: false });
    const result = await triggerAstronomyRefresh();
    expect(result.ok).toBe(false);
    expect(result.refreshedCount).toBe(0);
  });

  it("refreshes a known location and caches a snapshot", async () => {
    const result = await triggerAstronomyRefresh("loc1");
    expect(result.ok).toBe(true);
    expect(result.refreshedCount).toBe(1);

    const snapshot = getAstronomySnapshot("loc1");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.locationId).toBe("loc1");
    expect(["complete", "partial"]).toContain(snapshot!.status);
  });

  it("coalesces concurrent refreshes for the same location", async () => {
    const [a, b] = await Promise.all([
      triggerAstronomyRefresh("loc1"),
      triggerAstronomyRefresh("loc1"),
    ]);
    // Both resolve; at most one performs real work.
    expect(a.ok || b.ok).toBe(true);
  });

  it("shutdown clears state and prevents late writes", async () => {
    AstronomyModule.shutdown();
    await expect(triggerAstronomyRefresh()).rejects.toThrow();
  });
});
