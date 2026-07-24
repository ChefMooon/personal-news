import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import type { SportEvent } from "../../../../shared/ipc-types";
import { getLeagueById, upsertEvents } from "../cache";

describe("sports event upsert foreign keys", () => {
  it("creates a placeholder league row for events that reference an unknown league", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE sports_leagues (
        league_id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        name TEXT NOT NULL,
        country TEXT,
        logo_url TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        added_at INTEGER NOT NULL
      );

      CREATE TABLE sports_events (
        event_id TEXT PRIMARY KEY,
        league_id TEXT NOT NULL,
        sport TEXT NOT NULL,
        home_team_id TEXT,
        away_team_id TEXT,
        home_team TEXT NOT NULL,
        away_team TEXT NOT NULL,
        home_team_normalized TEXT,
        away_team_normalized TEXT,
        home_score TEXT,
        away_score TEXT,
        event_date TEXT NOT NULL,
        event_time TEXT,
        status TEXT,
        venue TEXT,
        fetched_date TEXT NOT NULL,
        FOREIGN KEY (league_id) REFERENCES sports_leagues(league_id) ON DELETE CASCADE
      );
    `);

    const event: SportEvent = {
      eventId: "event-1",
      leagueId: "league-unknown",
      sport: "Basketball",
      homeTeamId: null,
      awayTeamId: null,
      homeTeam: "Toronto Raptors",
      awayTeam: "Boston Celtics",
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: null,
      homeScore: null,
      awayScore: null,
      eventDate: "2024-01-01",
      eventTime: "20:00",
      status: "scheduled",
      venue: "Air Canada Centre",
    };

    expect(() => upsertEvents(db, [event], "2024-01-01")).not.toThrow();

    const insertedLeague = getLeagueById(db, "league-unknown");
    expect(insertedLeague).toMatchObject({
      leagueId: "league-unknown",
      sport: "Basketball",
      name: "league-unknown",
    });
  });
});
