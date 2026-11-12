import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SportLeague } from "../../../../shared/ipc-types";

vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] } }));
vi.mock("../../../harness-mode", () => ({ isElectronHarnessRun: () => true }));
vi.mock("../../../dev-test-data", () => ({ isDevTestDataActive: () => false }));
vi.mock("../../../settings/store", () => ({
  getSetting: (): null => null,
  setSetting: vi.fn(),
}));
vi.mock("../api", () => ({
  fetchLeaguesForSport: vi.fn(),
  fetchTeamBadgesForLeague: vi.fn().mockResolvedValue([]),
}));
vi.mock("../cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../cache")>()),
  getTodayEvents: () => [],
}));

import { fetchLeaguesForSport } from "../api";
import { getLeagueById, setLeagueEnabled } from "../cache";
import { getSportsLeagues, refreshSportsBadges, SportsModule } from "..";

function league(leagueId: string, sport: string, name: string): SportLeague {
  return { leagueId, sport, name, country: null, logoUrl: null, enabled: false, sortOrder: 0 };
}

describe("sports league defaults", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE sports_leagues (
        league_id TEXT PRIMARY KEY, sport TEXT NOT NULL, name TEXT NOT NULL,
        country TEXT, logo_url TEXT, enabled INTEGER NOT NULL,
        sort_order INTEGER NOT NULL, added_at INTEGER NOT NULL
      );
      CREATE TABLE sports_cache_meta (
        sport TEXT NOT NULL, fetch_date TEXT NOT NULL, fetched_at INTEGER NOT NULL,
        PRIMARY KEY (sport, fetch_date)
      );
    `);
    SportsModule.initialize(db);
  });

  afterEach(() => {
    SportsModule.shutdown();
    db.close();
    vi.clearAllMocks();
  });

  it.each([
    ["Basketball", "American WNBA", "American NBA", "XWNBA"],
    ["Ice Hockey", "American PWHL", "National Hockey League", "XPWHL"],
  ])("enables new %s leagues and preserves choices on refresh", async (sport, target, existingDefault, unrelated) => {
    const catalog = [
      league("target", sport, target),
      league("default", sport, existingDefault),
      league("other", sport, unrelated),
    ];
    vi.mocked(fetchLeaguesForSport).mockResolvedValue(catalog);

    await getSportsLeagues(sport);
    expect(getLeagueById(db, "target")?.enabled).toBe(true);
    expect(getLeagueById(db, "default")?.enabled).toBe(true);
    expect(getLeagueById(db, "other")?.enabled).toBe(false);

    setLeagueEnabled(db, "target", false);
    setLeagueEnabled(db, "other", true);
    await refreshSportsBadges(sport);
    await refreshSportsBadges(sport);
    expect(getLeagueById(db, "target")?.enabled).toBe(false);
    expect(getLeagueById(db, "default")?.enabled).toBe(true);
    expect(getLeagueById(db, "other")?.enabled).toBe(true);
  });
});
