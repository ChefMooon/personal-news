import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SportEvent } from "../../../../shared/ipc-types";
import { getEligibleTodayGames } from "../../../../renderer/src/modules/sports/sports-game-selection";
import { resolveTrackedTeamSide } from "../../../../renderer/src/modules/sports/side-resolution";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompactSportsView } from "../../../../renderer/src/modules/sports/CompactSportsView";
import { MediumLiveGameView } from "../../../../renderer/src/modules/sports/MediumLiveGameView";

vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("../../../harness-mode", () => ({ isElectronHarnessRun: () => true }));
vi.mock("../../../dev-test-data", () => ({ isDevTestDataActive: () => false }));
vi.mock("../api", () => ({
  fetchLeagueEventsForDateWithFallback: vi.fn(),
  fetchTeamDetailsInLeague: vi.fn().mockResolvedValue({ badgeUrl: "badge" }),
  fetchLastEventsForTeam: vi.fn().mockResolvedValue([]),
  fetchNextEventsForTeam: vi.fn().mockResolvedValue([]),
}));

import { fetchLeagueEventsForDateWithFallback } from "../api";
import { getTeamEvents, getTodayEvents } from "../cache";
import { refreshSportsData, SportsModule } from "..";

function event(overrides: Partial<SportEvent>): SportEvent {
  return {
    eventId: "db:1", leagueId: "nba", sport: "Basketball",
    homeTeamId: "team", awayTeamId: "opponent", homeTeam: "Los Angeles Clippers",
    awayTeam: "Toronto Raptors", homeTeamBadgeUrl: null, awayTeamBadgeUrl: null,
    homeScore: null, awayScore: null, eventDate: "2026-08-02", eventTime: "19:00",
    status: "Scheduled", venue: null, ...overrides,
  };
}

describe("sports refresh provider identity", () => {
  let db: Database.Database;
  afterEach(() => {
    SportsModule.shutdown();
    db?.close();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("retains provider pairs for team matching while returning one game, and rejects ambiguous pairs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T12:00:00"));
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sports_leagues (league_id TEXT PRIMARY KEY, sport TEXT, name TEXT, country TEXT, logo_url TEXT, enabled INTEGER, sort_order INTEGER, added_at INTEGER);
      CREATE TABLE sports_teams (team_id TEXT PRIMARY KEY, league_id TEXT, sport TEXT, name TEXT, short_name TEXT, badge_url TEXT, enabled INTEGER, sort_order INTEGER, added_at INTEGER);
      CREATE TABLE sports_opponent_cache (team_id TEXT PRIMARY KEY, name TEXT, badge_url TEXT, fetched_at INTEGER);
      CREATE TABLE sports_events (event_id TEXT PRIMARY KEY, league_id TEXT, sport TEXT, home_team_id TEXT, away_team_id TEXT, home_team TEXT, away_team TEXT, home_team_normalized TEXT, away_team_normalized TEXT, home_score TEXT, away_score TEXT, event_date TEXT, event_time TEXT, status TEXT, venue TEXT, fetched_date TEXT);
      CREATE TABLE sports_cache_meta (sport TEXT, fetch_date TEXT, fetched_at INTEGER, PRIMARY KEY (sport, fetch_date));
      INSERT INTO sports_leagues VALUES ('nba', 'Basketball', 'NBA', NULL, NULL, 1, 0, 0);
      INSERT INTO sports_teams VALUES ('team', 'nba', 'Basketball', 'Los Angeles Clippers', NULL, 'badge', 1, 0, 0);
      INSERT INTO sports_teams VALUES ('opponent', 'nba', 'Basketball', 'Toronto Raptors', NULL, 'badge', 1, 1, 0);
      INSERT INTO sports_cache_meta VALUES ('badge:Basketball:nba', 'badge-sync', 1785585600);
    `);
    SportsModule.initialize(db);
    const source = event({});
    const pair = event({ eventId: "espn:1", homeTeamId: "espn:team", homeTeam: "LA Clippers", awayTeamId: "espn:opponent" });
    const sourceFuture = event({ eventId: "db:2", eventDate: "2026-08-03" });
    const future = event({ eventId: "espn:2", homeTeamId: "espn:team", homeTeam: "LA Clippers", awayTeamId: "espn:opponent", awayTeam: "Toronto", eventDate: "2026-08-03" });
    const historySource = event({ eventId: "db:past", eventDate: "2026-08-01", status: "Final", homeScore: "100", awayScore: "99" });
    const historyEspn = event({ ...historySource, eventId: "espn:past", homeTeamId: "espn:team", homeTeam: "LA Clippers", awayTeamId: "espn:opponent", awayTeam: "Toronto" });
    const ambiguousSource = event({ eventId: "db:ambiguous", homeTeamId: "unknown", homeTeam: "Other Club", awayTeamId: "shared", awayTeam: "Shared Opponent", eventDate: "2026-08-04" });
    const ambiguousEspn = event({ eventId: "espn:ambiguous", homeTeamId: "espn:unknown", homeTeam: "Unknown Club", awayTeamId: "espn:shared", awayTeam: "Shared Opponent", eventDate: "2026-08-04" });
    const collisionEspn = event({ ...ambiguousEspn, eventId: "espn:ambiguous2", homeTeamId: "espn:unknown2", homeTeam: "Another Club" });
    vi.mocked(fetchLeagueEventsForDateWithFallback).mockResolvedValue([source, pair, sourceFuture, future, historySource, historyEspn, ambiguousSource, ambiguousEspn, collisionEspn]);

    await refreshSportsData("Basketball", true);
    expect(db.prepare("SELECT count(*) AS count FROM sports_events").get()).toEqual({ count: 9 });
    expect(getTodayEvents(db, "Basketball", "2026-08-02").map((item) => item.eventId)).toEqual(["espn:1"]);
    const compactGames = getEligibleTodayGames(getTodayEvents(db, "Basketball", "2026-08-03"), "2026-08-03");
    expect(compactGames.map((item) => item.eventId)).toEqual(["espn:2"]);
    expect(getTodayEvents(db, "Basketball", "2026-08-04").map((item) => item.eventId).sort()).toEqual(["db:ambiguous", "espn:ambiguous", "espn:ambiguous2"]);
    const result = getTeamEvents(db, "team", "2026-08-01");
    expect(result.next.map((item) => item.eventId)).toEqual(["espn:1", "espn:2"]);
    expect(result.last.map((item) => item.eventId)).toEqual(["espn:past"]);
    expect(resolveTrackedTeamSide(result.next[1], "team", "Los Angeles Clippers", "nba")).toBe("home");
    const opponentResult = getTeamEvents(db, "opponent", "2026-08-01");
    const todayGame = getTodayEvents(db, "Basketball", "2026-08-03")[0];
    const copies = [result.next[1], opponentResult.next[1], todayGame];
    for (const game of copies) {
      expect(resolveTrackedTeamSide(game, "team", "Los Angeles Clippers", "nba")).toBe("home");
      expect(resolveTrackedTeamSide(game, "opponent", "Toronto Raptors", "nba")).toBe("away");
      expect(resolveTrackedTeamSide(game, "opponent", "Toronto Raptors", "wnba")).toBeNull();
    }
    const teams = [
      { teamId: "team", leagueId: "nba", sport: "Basketball", name: "Los Angeles Clippers", shortName: null, badgeUrl: null, enabled: true, sortOrder: 0 },
      { teamId: "opponent", leagueId: "nba", sport: "Basketball", name: "Toronto Raptors", shortName: null, badgeUrl: null, enabled: true, sortOrder: 1 },
    ];
    vi.setSystemTime(new Date("2026-08-03T12:00:00"));
    const props = { events: [copies[0]], teams, teamEventsById: { team: result, opponent: opponentResult }, selectedGameId: "espn:2", onSelectGame: () => {} };
    const compact = renderToStaticMarkup(React.createElement(CompactSportsView, props));
    const medium = renderToStaticMarkup(React.createElement(MediumLiveGameView, props));
    expect(compact).toContain("Toronto Raptors");
    expect(medium).toContain("Toronto Raptors");

    const collision = event({ eventId: "espn:collision", homeTeamId: "espn:collision", homeTeam: "Another Club", awayTeamId: "espn:opponent" });
    vi.mocked(fetchLeagueEventsForDateWithFallback).mockResolvedValue([source, pair, collision]);
    await refreshSportsData("Basketball", true);
    expect(getTeamEvents(db, "team", "2026-08-01").next.map((item) => item.eventId)).toEqual(["db:1", "db:2"]);
  });
});
