import { describe, expect, it } from "vitest";
import type { SportLeague, TrackedTeam } from "../../../../shared/ipc-types";
import { getLeagueLabel, getTrackedTeamMeta } from "./league-display";

function makeLeague(name: string): SportLeague {
  return {
    leagueId: "4424",
    sport: "Baseball",
    name,
    country: "United States",
    logoUrl: null,
    enabled: true,
    sortOrder: 0,
  };
}

function makeTeam(): TrackedTeam {
  return {
    teamId: "team-1",
    leagueId: "4424",
    sport: "Baseball",
    name: "Fixture Team",
    shortName: null,
    badgeUrl: null,
    enabled: true,
    sortOrder: 0,
  };
}

describe("getLeagueLabel", () => {
  it("keeps a descriptive league name", () => {
    expect(
      getLeagueLabel({
        sport: "Baseball",
        leagueId: "4424",
        leaguesById: { "Baseball:4424": makeLeague("MLB") },
      }),
    ).toBe("MLB");
  });

  it("falls back to the sport label for a numeric league name", () => {
    expect(
      getLeagueLabel({
        sport: "Baseball",
        leagueId: "4424",
        leaguesById: { "Baseball:4424": makeLeague("4424") },
      }),
    ).toBe("Baseball");
  });

  it("falls back to the sport label when the league row is missing", () => {
    expect(
      getLeagueLabel({
        sport: "Baseball",
        leagueId: "4424",
        leaguesById: {},
      }),
    ).toBe("Baseball");
  });
});

describe("getTrackedTeamMeta", () => {
  it("shows a missing league's sport label only once", () => {
    expect(getTrackedTeamMeta(makeTeam(), {}, true)).toBe("Baseball");
  });
});
