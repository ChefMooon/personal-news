import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}));

const settingsMap = new Map<string, string>();
vi.mock("../../../settings/store", () => ({
  getSetting: (key: string): string | null => settingsMap.get(key) ?? null,
  setSetting: (key: string, value: string): void => {
    settingsMap.set(key, value);
  },
}));
vi.mock("../../../harness-mode", () => ({
  isElectronHarnessRun: (): boolean => false,
}));
vi.mock("../../../dev-test-data", () => ({
  isDevTestDataActive: (): boolean => false,
}));
vi.mock("../../../notifications/notification-service", () => ({
  notifyWeatherAlerts: vi.fn(),
}));

import {
  applyWeatherEnabled,
  triggerWeatherRefresh,
  WeatherModule,
} from "../index";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
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
    INSERT INTO weather_locations VALUES (
      'loc1', 'Test', NULL, NULL, NULL, 40.7, -74.0, 'America/New_York', 0
    );
  `);
  return db;
}

let db: Database.Database;

beforeEach(() => {
  vi.useFakeTimers();
  settingsMap.clear();
  settingsMap.set("weather_enabled", "true");
  db = freshDb();
  WeatherModule.initialize(db);
});

afterEach(() => {
  WeatherModule.shutdown();
  db.close();
  vi.useRealTimers();
});

describe("Weather feature gating", () => {
  it("rejects manual refresh while Weather is disabled", async () => {
    settingsMap.set("weather_enabled", "false");

    await expect(triggerWeatherRefresh()).rejects.toThrow(
      "Weather is disabled.",
    );
  });

  it("clears the polling timer when Weather is disabled", () => {
    expect(vi.getTimerCount()).toBe(1);

    settingsMap.set("weather_enabled", "false");
    applyWeatherEnabled(false);

    expect(vi.getTimerCount()).toBe(0);
  });
});
