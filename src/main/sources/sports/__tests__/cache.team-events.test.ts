import { describe, expect, it } from "vitest";
import type { SportEvent } from "../../../../shared/ipc-types";
import { getLastTeamEvents } from "../cache";

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
  it("does not treat a postponed past fixture as a previous game", () => {
    const events = [
      makeEvent("postponed-game", "2026-09-22", "Postponed", "0", "0"),
      makeEvent("completed-game", "2026-09-21", "Final", "4", "2"),
    ];

    expect(
      getLastTeamEvents(events, "2026-09-23").map((event) => event.eventId),
    ).toEqual(["completed-game"]);
  });
});
