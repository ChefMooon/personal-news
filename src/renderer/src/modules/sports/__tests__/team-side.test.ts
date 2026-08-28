import { describe, expect, it } from "vitest";
import type {
  SportEvent,
  SportTeamEvents,
} from "../../../../../shared/ipc-types";
import {
  getPreviousGame,
  getTodayGame,
  resolveTrackedTeamSide,
} from "../side-resolution";

function makeEvent(overrides: Partial<SportEvent> = {}): SportEvent {
  return {
    eventId: "evt-1",
    leagueId: "4387",
    sport: "Basketball",
    homeTeamId: "team-raptors",
    awayTeamId: "team-celtics",
    homeTeam: "Toronto Raptors",
    awayTeam: "Boston Celtics",
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: null,
    awayScore: null,
    eventDate: "2026-04-23",
    eventTime: "19:00",
    status: "Scheduled",
    venue: "Scotiabank Arena",
    ...overrides,
  };
}

describe("team side resolution and today selection", () => {
  it("resolves side by team ID when present", () => {
    const side = resolveTrackedTeamSide(
      makeEvent(),
      "team-raptors",
      "Toronto Raptors",
    );
    expect(side).toBe("home");
  });

  it("falls back to normalized team-name when IDs mismatch", () => {
    const side = resolveTrackedTeamSide(
      makeEvent({
        homeTeamId: "sportsdb:133602",
        awayTeamId: "sportsdb:133600",
        homeTeam: "Toronto-Raptors",
      }),
      "espn:16",
      "Toronto Raptors",
    );

    expect(side).toBe("home");
  });

  it("returns null for ambiguous same-name matchup", () => {
    const side = resolveTrackedTeamSide(
      makeEvent({
        homeTeam: "Toronto Raptors",
        awayTeam: "Toronto Raptors",
        homeTeamId: null,
        awayTeamId: null,
      }),
      "espn:16",
      "Toronto Raptors",
    );

    expect(side).toBeNull();
  });

  it("does not trust an ID when the event name belongs to another team", () => {
    const side = resolveTrackedTeamSide(
      makeEvent({ homeTeamId: "team-raptors", homeTeam: "Kansas City Royals" }),
      "team-raptors",
      "Toronto Raptors",
    );

    expect(side).toBeNull();
  });

  it("prefers next-today game over last-today game", () => {
    const events: SportTeamEvents = {
      last: [
        makeEvent({
          eventId: "evt-last",
          status: "Final",
          homeScore: "99",
          awayScore: "90",
        }),
      ],
      next: [makeEvent({ eventId: "evt-next", status: "Scheduled" })],
    };

    const game = getTodayGame(events, "2026-04-23");
    expect(game?.eventId).toBe("evt-next");
  });

  it("rejects a same-day event that does not contain the tracked team", () => {
    const events: SportTeamEvents = {
      last: [],
      next: [makeEvent({ eventId: "wrong-team" })],
    };

    expect(
      getTodayGame(events, "2026-04-23", "team-raptors", "Toronto Raptors"),
    ).toBeTruthy();
    expect(
      getTodayGame(
        events,
        "2026-04-23",
        "team-maple-leafs",
        "Toronto Maple Leafs",
      ),
    ).toBeNull();
  });

  it("skips unrelated and current events when selecting the previous game", () => {
    const events: SportTeamEvents = {
      last: [
        makeEvent({
          eventId: "wrong-team",
          homeTeamId: "team-maple-leafs",
          homeTeam: "Toronto Maple Leafs",
        }),
        makeEvent({ eventId: "current-game" }),
        makeEvent({
          eventId: "previous-game",
          awayTeamId: "team-knicks",
          awayTeam: "New York Knicks",
        }),
      ],
      next: [],
    };

    expect(
      getPreviousGame(events, "team-raptors", "Toronto Raptors", "current-game")
        ?.eventId,
    ).toBe("previous-game");
  });

  it("rejects previous events with a conflicting tracked team ID and name", () => {
    const events: SportTeamEvents = {
      last: [
        makeEvent({
          eventId: "conflicting-game",
          homeTeam: "Kansas City Royals",
        }),
      ],
      next: [],
    };

    expect(
      getPreviousGame(
        events,
        "team-raptors",
        "Toronto Raptors",
        "current-game",
      ),
    ).toBeNull();
  });
});
