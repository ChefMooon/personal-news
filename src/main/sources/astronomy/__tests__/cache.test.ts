import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import {
  markUnavailable,
  readCachedSnapshot,
  upsertAstronomySnapshot,
  deleteAstronomyCache,
} from "../cache";
import type { AstronomyGroups } from "../../../../shared/ipc-types";

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
    CREATE TABLE astronomy_cache (
      location_id     TEXT PRIMARY KEY,
      payload_json    TEXT NOT NULL,
      status          TEXT NOT NULL,
      for_timestamp   INTEGER,
      calculated_at   INTEGER,
      FOREIGN KEY (location_id) REFERENCES weather_locations(id) ON DELETE CASCADE
    );
    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  db.prepare(
    `INSERT INTO weather_locations VALUES ('loc1', 'Test', NULL, NULL, NULL, 40.7, -74.0, 'America/New_York', 0)`,
  ).run();
  return db;
}

function groupsWithMoon(): AstronomyGroups {
  return {
    moon: {
      status: "fresh",
      data: {
        phaseAngle: 90,
        phaseName: "first_quarter",
        illuminationPercent: 50,
        trend: "waxing",
        synodicProgress: 0.25,
        distanceKm: 384400,
        librationLatitude: 1,
        librationLongitude: -2,
        nextPrimaryPhaseName: "full",
        nextPrimaryPhaseTime: 1700000000,
        nextPerigeeTime: null,
        nextApogeeTime: null,
      },
    },
    horizon: { status: "unavailable", data: null },
    planets: { status: "unavailable", data: [] },
    events: { status: "unavailable", data: [] },
  };
}

let db: Database.Database;

beforeEach(() => {
  db = freshDb();
});

describe("astronomy cache", () => {
  it("stores and reads a snapshot with partial status", () => {
    const now = Math.floor(Date.now() / 1000);
    upsertAstronomySnapshot(db, "loc1", now, now, groupsWithMoon());
    const snapshot = readCachedSnapshot(db, "loc1");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.status).toBe("partial");
    expect(snapshot!.groups.moon.data?.phaseName).toBe("first_quarter");
    expect(snapshot!.stale).toBe(false);
  });

  it("preserves prior fresh group data when a later group fails", () => {
    // First write: moon fresh.
    upsertAstronomySnapshot(db, "loc1", 1000, 1000, groupsWithMoon());
    // Second write: everything unavailable (simulated failure).
    upsertAstronomySnapshot(db, "loc1", 2000, 2000, {
      moon: { status: "unavailable", data: null },
      horizon: { status: "unavailable", data: null },
      planets: { status: "unavailable", data: [] },
      events: { status: "unavailable", data: [] },
    });

    const snapshot = readCachedSnapshot(db, "loc1");
    expect(snapshot!.groups.moon.status).toBe("stale");
    expect(snapshot!.groups.moon.data?.phaseName).toBe("first_quarter");
  });

  it("marks unavailable rows durably even after total failure", () => {
    markUnavailable(db, "loc1", 1000);
    const snapshot = readCachedSnapshot(db, "loc1");
    expect(snapshot).not.toBeNull();
    expect(snapshot!.status).toBe("unavailable");
  });

  it("cascades deletion with the location row", () => {
    db.pragma("foreign_keys = ON");
    upsertAstronomySnapshot(db, "loc1", 1000, 1000, groupsWithMoon());
    db.prepare("DELETE FROM weather_locations WHERE id = 'loc1'").run();
    expect(readCachedSnapshot(db, "loc1")).toBeNull();
  });

  it("deletes cache rows explicitly", () => {
    upsertAstronomySnapshot(db, "loc1", 1000, 1000, groupsWithMoon());
    deleteAstronomyCache(db, "loc1");
    expect(readCachedSnapshot(db, "loc1")).toBeNull();
  });
});
