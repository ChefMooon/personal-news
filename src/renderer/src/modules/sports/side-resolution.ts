import type { SportEvent, SportTeamEvents } from "../../../../shared/ipc-types";
import { isSportEventOnLocalDate } from "../../../../shared/sports-event-utils";

export function normalizeTeamKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function resolveTrackedTeamSide(
  game: SportEvent,
  teamId: string,
  teamName?: string | null,
  leagueId?: string,
): "home" | "away" | null {
  if (leagueId && leagueId !== game.leagueId) return null;

  const identity = game.trackedTeamIdentities?.find((item) => item.teamId === teamId);
  if (leagueId === game.leagueId && identity) {
    return identity.side;
  }

  const normalizedTeamName = normalizeTeamKey(teamName);
  const homeMatches = normalizedTeamName
    ? normalizeTeamKey(game.homeTeam) === normalizedTeamName
    : false;
  const awayMatches = normalizedTeamName
    ? normalizeTeamKey(game.awayTeam) === normalizedTeamName
    : false;
  const idSide =
    game.homeTeamId === teamId
      ? "home"
      : game.awayTeamId === teamId
        ? "away"
        : null;

  // ESPN IDs include the league; TheSportsDB uses numeric IDs for both
  // teams and events. Only trust these IDs when the league is also known.
  const trustedProviderId =
    leagueId === game.leagueId &&
    ((teamId.startsWith(`espn:${leagueId}:`) &&
      game.eventId.startsWith("espn:")) ||
      (/^\d+$/.test(teamId) && /^\d+$/.test(game.eventId)));
  if (idSide && (!normalizedTeamName || trustedProviderId)) {
    return idSide;
  }

  if (homeMatches !== awayMatches) {
    return homeMatches ? "home" : "away";
  }

  return null;
}

export function getTodayGame(
  events: SportTeamEvents | undefined,
  today: string,
  teamId?: string,
  teamName?: string | null,
  leagueId?: string,
): SportEvent | null {
  const nextToday = events?.next.find(
    (event) =>
      isSportEventOnLocalDate(event.eventDate, event.eventTime, today) &&
      (!teamId ||
        resolveTrackedTeamSide(event, teamId, teamName, leagueId) !== null),
  );
  if (nextToday) {
    return nextToday;
  }

  return (
    events?.last.find(
      (event) =>
        isSportEventOnLocalDate(event.eventDate, event.eventTime, today) &&
        (!teamId ||
          resolveTrackedTeamSide(event, teamId, teamName, leagueId) !== null),
    ) ?? null
  );
}

export function getPreviousGame(
  events: SportTeamEvents | undefined,
  teamId: string,
  teamName: string | null | undefined,
  currentEventId: string,
  leagueId?: string,
): SportEvent | null {
  return (
    events?.last.find(
      (event) =>
        event.eventId !== currentEventId &&
        resolveTrackedTeamSide(event, teamId, teamName, leagueId) !== null,
    ) ?? null
  );
}
