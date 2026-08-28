import type { SportEvent, SportTeamEvents } from "../../../../shared/ipc-types";
import { isSportEventOnLocalDate } from "../../../../shared/sports-event-utils";

export function normalizeTeamKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function resolveTrackedTeamSide(
  game: SportEvent,
  teamId: string,
  teamName?: string | null,
): "home" | "away" | null {
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

  if (idSide && !normalizedTeamName) {
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
): SportEvent | null {
  const nextToday = events?.next.find(
    (event) =>
      isSportEventOnLocalDate(event.eventDate, event.eventTime, today) &&
      (!teamId || resolveTrackedTeamSide(event, teamId, teamName) !== null),
  );
  if (nextToday) {
    return nextToday;
  }

  return (
    events?.last.find(
      (event) =>
        isSportEventOnLocalDate(event.eventDate, event.eventTime, today) &&
        (!teamId || resolveTrackedTeamSide(event, teamId, teamName) !== null),
    ) ?? null
  );
}

export function getPreviousGame(
  events: SportTeamEvents | undefined,
  teamId: string,
  teamName: string | null | undefined,
  currentEventId: string,
): SportEvent | null {
  return (
    events?.last.find(
      (event) =>
        event.eventId !== currentEventId &&
        resolveTrackedTeamSide(event, teamId, teamName) !== null,
    ) ?? null
  );
}
