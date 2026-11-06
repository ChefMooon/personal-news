import { describe, expect, it } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CompactSportsView } from "../CompactSportsView";
import { TeamCardsView } from "../TeamCards";
import { TodayView } from "../TodayTeamsView";
import { getFirstDifferentGame, getOpponent, getOpponentBadgeUrl, getOutcome, getScore, getTodayGameDisplayData } from "../team-display-utils";
import type {
  SportEvent,
  SportTeamEvents,
} from "../../../../../shared/ipc-types";
import {
  getPreviousGame,
  getTodayGame,
  resolveTrackedTeamSide,
} from "../side-resolution";
import { getOutcomeForTeam, getRecentOutcomes } from "../page-utils";

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
  it("returns placeholders for an unresolved side and skips unrelated games", () => {
    const team = { teamId: "team-raptors", name: "Toronto Raptors", leagueId: "4387" };
    const unknown = makeEvent({ homeTeam: "Other Team", homeScore: "110", awayScore: "100" });
    const collision = makeEvent({ leagueId: "other", homeScore: "110", awayScore: "100" });
    const matching = makeEvent({ eventId: "matching" });
    expect(getOutcome(unknown, team.teamId, team.name, team.leagueId)).toBeNull();
    expect(getScore(unknown, team.teamId, team.name, team.leagueId)).toBe("—");
    expect(getOpponent(unknown, team.teamId, team.name, team.leagueId)).toBe("Unknown opponent");
    expect(getOpponentBadgeUrl(unknown, team.teamId, team.name, team.leagueId)).toBeNull();
    expect(getOutcome(collision, team.teamId, team.name, team.leagueId)).toBeNull();
    expect(getFirstDifferentGame([unknown, collision, matching], null, team)).toBe(matching);
  });

  it("preserves home, away, and unknown sides in today display data", () => {
    const team = { teamId: "team-raptors", name: "Toronto Raptors", leagueId: "4387" };
    const display = (event: SportEvent) =>
      getTodayGameDisplayData(event, team.teamId, team.name, false, team.leagueId);
    expect(display(makeEvent()).side).toBe("home");
    expect(display(makeEvent({ homeTeamId: "team-celtics", awayTeamId: team.teamId, homeTeam: "Boston Celtics", awayTeam: team.name })).side).toBe("away");
    const unknown = display(makeEvent({ homeTeam: "Other Team", homeScore: "110", awayScore: "100", status: "Final" }));
    expect(unknown.side).toBeNull();
    expect(unknown.primaryText).toBe("—");
    expect(unknown.opponent).toBe("Unknown opponent");
  });

  it("does not show another league's games in team and today views", () => {
    const team = { teamId: "team-raptors", leagueId: "4387", sport: "Basketball", name: "Toronto Raptors", shortName: null, badgeUrl: null, enabled: true, sortOrder: 0 };
    const collision = makeEvent({ leagueId: "other", awayTeam: "Wrong League", eventDate: "2026-04-24", homeScore: "110", awayScore: "100" });
    const events = { last: [collision], next: [collision] };
    const common = { teams: [team], teamEventsById: { [team.teamId]: events }, leaguesById: {}, showVenue: false, showTime: false, showLiveStartTime: false, showSportLabels: false };
    const cards = renderToStaticMarkup(React.createElement(TeamCardsView, { ...common, viewMode: "standard", fillAvailable: false }));
    const today = renderToStaticMarkup(React.createElement(TodayView, { ...common, today: "2026-04-23", showTeamCarousel: false, hideTodayGameCards: false }));
    expect(cards).not.toContain("Wrong League");
    expect(today).not.toContain("Wrong League");
    expect(today).toContain("No upcoming games");
  });

  it("keeps outcomes for same-provider IDs when team names vary", () => {
    const team = {
      teamId: "espn:4387:28",
      name: "Toronto Raptors",
      leagueId: "4387",
    };
    const event = makeEvent({
      eventId: "espn:123",
      homeTeamId: team.teamId,
      homeTeam: "Toronto",
      homeScore: "110",
      awayScore: "100",
    });

    expect(getRecentOutcomes([event], team)).toEqual(["W"]);
    expect(getOutcomeForTeam({ ...event, leagueId: "other" }, team)).toBeNull();
    expect(getOutcomeForTeam({ ...event, eventId: "123" }, team)).toBeNull();
    const sportsDbTeam = { ...team, teamId: "133602" };
    expect(
      getOutcomeForTeam(
        { ...event, eventId: "123", homeTeamId: "133602" },
        sportsDbTeam,
      ),
    ).toBe("W");
    expect(
      getOutcomeForTeam({ ...event, homeTeamId: "133602" }, sportsDbTeam),
    ).toBeNull();
  });

  it("calculates home and away outcomes across provider IDs", () => {
    const team = {
      teamId: "sportsdb:133602",
      name: "Toronto Raptors",
      leagueId: "4387",
    };
    const home = makeEvent({
      homeTeamId: "espn:28",
      awayTeamId: "espn:2",
      homeScore: "110",
      awayScore: "100",
    });
    const away = makeEvent({
      homeTeamId: "espn:2",
      awayTeamId: "espn:28",
      homeTeam: "Boston Celtics",
      awayTeam: "Toronto Raptors",
      homeScore: "110",
      awayScore: "100",
    });

    expect(getOutcomeForTeam(home, team)).toBe("W");
    expect(getOutcomeForTeam(away, team)).toBe("L");
    expect(getOutcomeForTeam({ ...away, homeScore: "100" }, team)).toBe("D");
  });

  it("excludes unknown sides and matching names from another league", () => {
    const team = {
      teamId: "sportsdb:133602",
      name: "Toronto Raptors",
      leagueId: "4387",
    };
    const unknown = makeEvent({
      homeTeam: "Other Team",
      homeScore: "110",
      awayScore: "100",
    });
    const otherLeague = makeEvent({
      leagueId: "other",
      homeScore: "110",
      awayScore: "100",
    });

    expect(getOutcomeForTeam(unknown, team)).toBeNull();
    expect(getOutcomeForTeam(otherLeague, team)).toBeNull();
    expect(getRecentOutcomes([unknown, otherLeague], team)).toEqual([]);
  });
  it("selects widget games by provider identity within the tracked league", () => {
    const matching = makeEvent({
      eventId: "espn:123",
      homeTeamId: "espn:4387:28",
      homeTeam: "Toronto",
      status: "In Progress",
    });
    const collision = {
      ...matching,
      eventId: "espn:456",
      leagueId: "other",
      homeTeam: "Toronto Raptors",
    };
    const events = { next: [collision, matching], last: [collision, matching] };
    expect(
      getTodayGame(
        events,
        "2026-04-23",
        "espn:4387:28",
        "Toronto Raptors",
        "4387",
      ),
    ).toBe(matching);
    expect(
      getPreviousGame(
        events,
        "espn:4387:28",
        "Toronto Raptors",
        "current",
        "4387",
      ),
    ).toBe(matching);
    expect(
      resolveTrackedTeamSide(
        collision,
        "espn:4387:28",
        "Toronto Raptors",
        "4387",
      ),
    ).toBeNull();
  });

  it("uses the correct tracked team in the compact widget when league names collide", () => {
    const event = makeEvent({
      eventId: "espn:123",
      homeTeamId: "espn:4387:28",
      homeTeam: "Toronto",
      status: "In Progress",
    });
    const team = {
      teamId: "espn:4387:28",
      leagueId: "4387",
      sport: "Basketball",
      name: "Toronto Raptors",
      shortName: null,
      badgeUrl: null,
      enabled: true,
      sortOrder: 0,
    };
    const other = {
      ...team,
      teamId: "different",
      leagueId: "other",
      name: "Toronto",
    };
    const html = renderToStaticMarkup(
      React.createElement(CompactSportsView, {
        events: [event],
        teams: [other, team],
        teamEventsById: {},
        selectedGameId: event.eventId,
        onSelectGame: () => {},
        showTime: true,
      }),
    );
    expect(html).toContain("Toronto Raptors");
  });

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
