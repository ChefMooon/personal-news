import { describe, expect, it } from "vitest";
import type { SportEvent } from "../../../../shared/ipc-types";
import {
  getEligibleTodayGames,
  getSelectedTodayGame,
} from "./sports-game-selection";

function createEvent(
  eventId: string,
  eventDate: string,
  status: string,
): SportEvent {
  return {
    eventId,
    leagueId: "mlb",
    sport: "Baseball",
    homeTeamId: "home",
    awayTeamId: "away",
    homeTeam: "Home Team",
    awayTeam: "Away Team",
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: null,
    awayScore: null,
    eventDate,
    eventTime: "19:00",
    status,
    venue: null,
  };
}

describe("sports game selection", () => {
  it("keeps past, present, and future games on the local day", () => {
    const games = getEligibleTodayGames(
      [
        createEvent("past", "2026-08-27", "Final"),
        createEvent("live", "2026-08-27", "Live"),
        createEvent("scheduled", "2026-08-27", "Scheduled"),
        createEvent("tomorrow", "2026-08-28", "Live"),
      ],
      "2026-08-27",
    );

    expect(games.map((game) => game.eventId)).toEqual([
      "past",
      "live",
      "scheduled",
    ]);
  });

  it("preserves a selected game and falls back to the first available game", () => {
    const games = [
      createEvent("first", "2026-08-27", "Live"),
      createEvent("second", "2026-08-27", "Live"),
    ];

    expect(getSelectedTodayGame(games, "second")?.eventId).toBe("second");
    expect(getSelectedTodayGame(games, "removed")?.eventId).toBe("first");
    expect(getSelectedTodayGame([], "removed")).toBeNull();
  });
});
