import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureRequiredSchemaMigrations } from "../schema";

describe("ensureRequiredSchemaMigrations", () => {
  it("adds missing sports event location columns even when only some exist", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sports_events (event_id TEXT, venue_region TEXT);
      CREATE TABLE astronomy_cache (id TEXT);
      CREATE TABLE ingested_links (id TEXT);
    `);

    ensureRequiredSchemaMigrations(db, () => {
      throw new Error("migration file should not be read");
    });

    const columns = (db.prepare("PRAGMA table_info(sports_events)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(["venue_city", "venue_region", "venue_country"]));
    db.close();
  });
});
