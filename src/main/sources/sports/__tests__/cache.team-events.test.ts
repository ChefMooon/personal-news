import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { SportEvent } from "../../../../shared/ipc-types";
import {
  getCachedEvent,
  getLastTeamEvents,
  getTeamEvents,
  upsertEvents,
} from "../cache";
import { getTodayGame, resolveTrackedTeamSide } from "../../../../renderer/src/modules/sports/side-resolution";

function makeEvent(
  eventId: string,
  eventDate: string,
  status: string,
  homeScore: string | null,
  awayScore: string | null,
): SportEvent {
  return {
    eventId,
    leagueId: "mlb",
    sport: "Baseball",
    homeTeamId: "orioles",
    awayTeamId: "blue-jays",
    homeTeam: "Baltimore Orioles",
    awayTeam: "Toronto Blue Jays",
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore,
    awayScore,
    eventDate,
    eventTime: null,
    status,
    venue: "Oriole Park at Camden Yards",
  };
}

describe("sports team event history", () => {
  it("does not match a team ID or name from another league", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sports_teams (team_id TEXT, league_id TEXT, sport TEXT, name TEXT, short_name TEXT, badge_url TEXT, enabled INTEGER, sort_order INTEGER);
      CREATE TABLE sports_opponent_cache (team_id TEXT, badge_url TEXT);
      CREATE TABLE sports_events (event_id TEXT, league_id TEXT, sport TEXT, home_team_id TEXT, away_team_id TEXT, home_team TEXT, away_team TEXT, home_team_normalized TEXT, away_team_normalized TEXT, home_score TEXT, away_score TEXT, event_date TEXT, event_time TEXT, status TEXT, venue TEXT, venue_city TEXT, venue_region TEXT, venue_country TEXT);
      INSERT INTO sports_teams VALUES ('1', 'wnba', 'Basketball', 'Example', NULL, NULL, 1, 0);
      INSERT INTO sports_events VALUES ('correct', 'wnba', 'Basketball', '1', NULL, 'Example', 'Other', 'example', 'other', NULL, NULL, '2026-08-02', NULL, 'Scheduled', NULL, NULL, NULL, NULL);
      INSERT INTO sports_events VALUES ('wrong', 'nba', 'Basketball', '1', NULL, 'Example', 'Other', 'example', 'other', NULL, NULL, '2026-08-02', NULL, 'Scheduled', NULL, NULL, NULL, NULL);
    `);
    expect(
      getTeamEvents(db, "1", "2026-08-01").next.map((event) => event.eventId),
    ).toEqual(["correct"]);
    db.close();
  });
  it("matches uniquely paired provider identities and rejects ambiguous or cross-league pairs", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sports_teams (team_id TEXT, league_id TEXT, sport TEXT, name TEXT, short_name TEXT, badge_url TEXT, enabled INTEGER, sort_order INTEGER);
      CREATE TABLE sports_opponent_cache (team_id TEXT, badge_url TEXT);
      CREATE TABLE sports_events (event_id TEXT, league_id TEXT, sport TEXT, home_team_id TEXT, away_team_id TEXT, home_team TEXT, away_team TEXT, home_team_normalized TEXT, away_team_normalized TEXT, home_score TEXT, away_score TEXT, event_date TEXT, event_time TEXT, status TEXT, venue TEXT, venue_city TEXT, venue_region TEXT, venue_country TEXT);
      INSERT INTO sports_teams VALUES ('133602', 'nba', 'Basketball', 'Los Angeles Clippers', NULL, NULL, 1, 0);
      INSERT INTO sports_events VALUES ('db:1', 'nba', 'Basketball', '133602', 'raptors', 'Los Angeles Clippers', 'Toronto Raptors', 'losangelesclippers', 'torontoraptors', NULL, NULL, '2026-08-02', '19:00', 'Scheduled', NULL, NULL, NULL, NULL);
      INSERT INTO sports_events VALUES ('espn:1', 'nba', 'Basketball', 'espn:nba:12', 'espn:nba:28', 'LA Clippers', 'Toronto Raptors', 'laclippers', 'torontoraptors', NULL, NULL, '2026-08-02', '19:00', 'Scheduled', NULL, NULL, NULL, NULL);
      INSERT INTO sports_events VALUES ('espn:2', 'nba', 'Basketball', 'espn:nba:12', 'espn:nba:3', 'LA Clippers', 'Boston Celtics', 'laclippers', 'bostonceltics', NULL, NULL, '2026-08-03', '19:00', 'Scheduled', NULL, NULL, NULL, NULL);
      INSERT INTO sports_events VALUES ('other:1', 'wnba', 'Basketball', '133602', 'raptors', 'Los Angeles Clippers', 'Toronto Raptors', 'losangelesclippers', 'torontoraptors', NULL, NULL, '2026-08-04', '19:00', 'Scheduled', NULL, NULL, NULL, NULL);
      INSERT INTO sports_events VALUES ('espn:wrong', 'wnba', 'Basketball', 'espn:nba:12', 'espn:wnba:3', 'LA Clippers', 'Other', 'laclippers', 'other', NULL, NULL, '2026-08-05', '19:00', 'Scheduled', NULL, NULL, NULL, NULL);
    `);
    expect(
      getTeamEvents(db, "133602", "2026-08-01").next.map(
        (event) => event.eventId,
      ),
    ).toEqual(["espn:1", "espn:2"]);
    expect(getTeamEvents(db, "133602", "2026-08-01").next).toMatchObject([
      { eventId: "espn:1", homeTeamId: "espn:nba:12", homeTeam: "LA Clippers", trackedTeamIdentities: [{ teamId: "133602", side: "home" }, { teamId: "raptors", side: "away" }] },
      { eventId: "espn:2", homeTeamId: "espn:nba:12", homeTeam: "LA Clippers", trackedTeamIdentities: [{ teamId: "133602", side: "home" }] },
    ]);

    const result = getTeamEvents(db, "133602", "2026-08-01");
    const inferred = result.next[0];
    expect(resolveTrackedTeamSide(inferred, "133602", "Los Angeles Clippers", "nba")).toBe("home");
    expect(getTodayGame(result, "2026-08-02", "133602", "Los Angeles Clippers", "nba")).toEqual(inferred);
    expect(resolveTrackedTeamSide(inferred, "another-team", "Another Club", "nba")).toBeNull();
    expect(resolveTrackedTeamSide(inferred, "133602", "Los Angeles Clippers", "wnba")).toBeNull();
    expect(resolveTrackedTeamSide({ ...inferred, trackedTeamIdentities: undefined }, "133602", "Los Angeles Clippers", "nba")).toBeNull();

    db.exec(
      `INSERT INTO sports_events VALUES ('espn:collision', 'nba', 'Basketball', 'espn:nba:99', 'espn:nba:28', 'Another Club', 'Toronto Raptors', 'anotherclub', 'torontoraptors', NULL, NULL, '2026-08-02', '19:00', 'Scheduled', NULL, NULL, NULL, NULL)`,
    );
    expect(
      getTeamEvents(db, "133602", "2026-08-01").next.map(
        (event) => event.eventId,
      ),
    ).toEqual(["db:1"]);
    db.close();
  });
  it("reuses league identity work across teams and invalidates after writes and rollback", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sports_teams (team_id TEXT, league_id TEXT, sport TEXT, name TEXT, short_name TEXT, badge_url TEXT, enabled INTEGER, sort_order INTEGER);
      CREATE TABLE sports_opponent_cache (team_id TEXT, badge_url TEXT);
      CREATE TABLE sports_events (event_id TEXT, league_id TEXT, sport TEXT, home_team_id TEXT, away_team_id TEXT, home_team TEXT, away_team TEXT, home_team_normalized TEXT, away_team_normalized TEXT, home_score TEXT, away_score TEXT, event_date TEXT, event_time TEXT, status TEXT, venue TEXT, venue_city TEXT, venue_region TEXT, venue_country TEXT);
      INSERT INTO sports_teams VALUES ('a', 'nba', 'Basketball', 'Alpha', NULL, NULL, 1, 0), ('b', 'nba', 'Basketball', 'Beta', NULL, NULL, 1, 1);
      INSERT INTO sports_events VALUES ('db:1', 'nba', 'Basketball', 'a', 'b', 'Alpha', 'Beta', 'alpha', 'beta', NULL, NULL, '2026-08-02', '19:00', 'Scheduled', NULL, NULL, NULL, NULL);
      INSERT INTO sports_events VALUES ('espn:1', 'nba', 'Basketball', 'espn:a', 'espn:b', 'Other Alpha', 'Beta', 'otheralpha', 'beta', NULL, NULL, '2026-08-02', '19:00', 'Scheduled', NULL, NULL, NULL, NULL);
    `);
    const prepare = vi.spyOn(db, "prepare");
    const snapshotReads = () => prepare.mock.calls.filter(([sql]) => sql.includes("WHERE se.league_id = ? AND se.sport = ?")).length;
    expect(getTeamEvents(db, "a", "2026-08-01").next[0].eventId).toBe("espn:1");
    expect(getTeamEvents(db, "b", "2026-08-01").next[0].eventId).toBe("espn:1");
    expect(snapshotReads()).toBe(1);
    db.exec("DELETE FROM sports_events WHERE event_id = 'espn:1'");
    expect(getTeamEvents(db, "a", "2026-08-01").next[0].eventId).toBe("db:1");
    expect(snapshotReads()).toBe(2);
    db.exec("BEGIN");
    db.exec("DELETE FROM sports_events");
    expect(getTeamEvents(db, "a", "2026-08-01").next).toEqual([]);
    db.exec("ROLLBACK");
    expect(getTeamEvents(db, "a", "2026-08-01").next[0].eventId).toBe("db:1");
    expect(snapshotReads()).toBe(4);
    db.close();
  });
  it("does not treat a postponed past fixture as a previous game", () => {
    const events = [
      makeEvent("postponed-game", "2026-09-22", "Postponed", "0", "0"),
      makeEvent("completed-game", "2026-09-21", "Final", "4", "2"),
    ];

    expect(
      getLastTeamEvents(events, "2026-09-23").map((event) => event.eventId),
    ).toEqual(["completed-game"]);
  });

  it("round-trips event location through the cache", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sports_leagues (
        league_id TEXT PRIMARY KEY,
        sport TEXT NOT NULL,
        name TEXT NOT NULL,
        country TEXT,
        logo_url TEXT,
        enabled INTEGER NOT NULL,
        sort_order INTEGER NOT NULL,
        added_at INTEGER NOT NULL
      );
      CREATE TABLE sports_teams (team_id TEXT PRIMARY KEY, badge_url TEXT);
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
        venue_city TEXT,
        venue_region TEXT,
        venue_country TEXT,
        fetched_date TEXT NOT NULL
      );
    `);
    const event: SportEvent = {
      eventId: "location-event",
      leagueId: "mlb",
      sport: "Baseball",
      homeTeamId: null,
      awayTeamId: null,
      homeTeam: "Toronto Blue Jays",
      awayTeam: "Baltimore Orioles",
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: null,
      homeScore: null,
      awayScore: null,
      eventDate: "2026-08-02",
      eventTime: "19:00",
      status: "Scheduled",
      venue: "Rogers Centre",
      venueCity: "Toronto",
      venueRegion: "ON",
      venueCountry: "Canada",
    };

    upsertEvents(db, [event], "2026-08-02");

    expect(getCachedEvent(db, event.eventId)).toMatchObject({
      venueCity: "Toronto",
      venueRegion: "ON",
      venueCountry: "Canada",
    });
    db.close();
  });
});
