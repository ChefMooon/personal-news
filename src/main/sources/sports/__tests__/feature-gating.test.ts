import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SportEvent } from "../../../../shared/ipc-types";
import { getLocalDateString } from "../cache";

const mockedState = vi.hoisted(() => ({
  isDevTestDataActive: vi.fn(() => false),
  fetchLeagueEventsForDateWithFallback: vi.fn(),
}));
const settingsMap = vi.hoisted(() => new Map<string, string>());

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
}));
vi.mock("../../../harness-mode", () => ({
  isElectronHarnessRun: (): boolean => false,
}));
vi.mock("../../../dev-test-data", () => ({
  isDevTestDataActive: mockedState.isDevTestDataActive,
}));
vi.mock("../../../settings/store", () => ({
  getSetting: (key: string): string | null => settingsMap.get(key) ?? null,
  setSetting: (key: string, value: string): void => {
    settingsMap.set(key, value);
  },
}));
vi.mock("../api", () => ({
  fetchEventById: vi.fn(),
  fetchEventDetails: vi.fn(),
  fetchEspnEventDetails: vi.fn(),
  fetchTeamBadgesForLeague: vi.fn().mockResolvedValue([]),
  fetchTeamDetails: vi.fn(),
  fetchLastEventsForTeam: vi.fn().mockResolvedValue([]),
  fetchLeagueStandings: vi.fn(),
  fetchLeagueEventsForDateWithFallback:
    mockedState.fetchLeagueEventsForDateWithFallback,
  fetchLeaguesForSport: vi.fn().mockResolvedValue([]),
  fetchNextEventsForTeam: vi.fn().mockResolvedValue([]),
  fetchTeamDetailsInLeague: vi.fn(),
  searchTeams: vi.fn().mockResolvedValue([]),
}));

import {
  applySportsEnabled,
  refreshSportsBadges,
  refreshSportsData,
  SportsModule,
} from "../index";

function freshDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE sports_leagues (
      league_id TEXT PRIMARY KEY, sport TEXT, name TEXT, country TEXT,
      logo_url TEXT, enabled INTEGER, sort_order INTEGER, added_at INTEGER
    );
    CREATE TABLE sports_teams (
      team_id TEXT PRIMARY KEY, league_id TEXT, sport TEXT, name TEXT,
      short_name TEXT, badge_url TEXT, enabled INTEGER, sort_order INTEGER,
      added_at INTEGER
    );
    CREATE TABLE sports_opponent_cache (
      team_id TEXT PRIMARY KEY, name TEXT, badge_url TEXT, fetched_at INTEGER
    );
    CREATE TABLE sports_events (
      event_id TEXT PRIMARY KEY, league_id TEXT, sport TEXT, home_team_id TEXT,
      away_team_id TEXT, home_team TEXT, away_team TEXT, home_team_normalized TEXT,
      away_team_normalized TEXT, home_score TEXT, away_score TEXT, event_date TEXT,
      event_time TEXT, status TEXT, venue TEXT, venue_city TEXT, venue_region TEXT,
      venue_country TEXT, fetched_date TEXT
    );
    CREATE TABLE sports_cache_meta (
      sport TEXT NOT NULL, fetch_date TEXT NOT NULL, fetched_at INTEGER NOT NULL,
      PRIMARY KEY (sport, fetch_date)
    );
    INSERT INTO sports_leagues VALUES (
      'nba', 'Basketball', 'NBA', NULL, NULL, 1, 0, 0
    );
    INSERT INTO sports_cache_meta VALUES (
      'badge:Basketball:nba', 'badge-sync', ${Math.floor(Date.now() / 1000)}
    );
  `);
  return db;
}

function liveEvent(): SportEvent {
  return {
    eventId: "nba-live",
    leagueId: "nba",
    sport: "Basketball",
    homeTeamId: null,
    awayTeamId: null,
    homeTeam: "Home",
    awayTeam: "Away",
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: "1",
    awayScore: "0",
    eventDate: getLocalDateString(),
    eventTime: "12:00",
    status: "In Progress",
    venue: null,
  };
}

let db: Database.Database;

beforeEach(() => {
  vi.useFakeTimers();
  settingsMap.clear();
  settingsMap.set("sports_enabled", "false");
  mockedState.isDevTestDataActive.mockReturnValue(false);
  mockedState.fetchLeagueEventsForDateWithFallback.mockReset();
  mockedState.fetchLeagueEventsForDateWithFallback.mockResolvedValue([
    liveEvent(),
  ]);
  db = freshDb();
  SportsModule.initialize(db);
});

afterEach(() => {
  SportsModule.shutdown();
  db.close();
  vi.useRealTimers();
});

describe("Sports feature gating", () => {
  it("does not start a polling timer on startup while Sports is disabled", () => {
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears polling and live-refresh timers on disable and restarts one poll timer on enable", async () => {
    settingsMap.set("sports_enabled", "true");
    mockedState.isDevTestDataActive.mockReturnValue(true);
    applySportsEnabled(true);
    expect(vi.getTimerCount()).toBe(1);

    mockedState.isDevTestDataActive.mockReturnValue(false);
    await refreshSportsData("Basketball");
    expect(vi.getTimerCount()).toBe(2);

    settingsMap.set("sports_enabled", "false");
    applySportsEnabled(false);
    expect(vi.getTimerCount()).toBe(0);

    settingsMap.set("sports_enabled", "true");
    mockedState.isDevTestDataActive.mockReturnValue(true);
    applySportsEnabled(true);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("rejects manual refreshes while Sports is disabled", async () => {
    await expect(refreshSportsData("Basketball")).rejects.toThrow(
      "Sports is disabled.",
    );
    await expect(refreshSportsBadges("Basketball")).rejects.toThrow(
      "Sports is disabled.",
    );
  });
});
