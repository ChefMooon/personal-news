import type { SportEvent, TrackedTeam } from "../../../../shared/ipc-types";
import {
  getLocalDateKey,
  isSportEventOnLocalDate,
} from "../../../../shared/sports-event-utils";
import { getTrackedTeamMeta, type LeaguesById } from "./league-display";
import {
  getGamePhase,
  getGamePhaseBadgeClasses,
  getGamePhaseDotClasses,
  type GamePhase,
} from "./utils";
import { resolveTrackedTeamSide } from "./side-resolution";

export function formatDateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(game: SportEvent, showTime: boolean): string {
  const dateLabel = new Date(`${game.eventDate}T12:00:00`).toLocaleDateString(
    [],
    {
      weekday: "short",
      month: "short",
      day: "numeric",
    },
  );
  if (!showTime || !game.eventTime) {
    return dateLabel;
  }

  const timeLabel = new Date(
    `${game.eventDate}T${game.eventTime}:00Z`,
  ).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateLabel} ${timeLabel}`;
}

export function formatTime(game: SportEvent): string {
  if (!game.eventTime) {
    return "";
  }

  return new Date(`${game.eventDate}T${game.eventTime}:00Z`).toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    },
  );
}

export function getLiveStartTimeText(
  game: SportEvent | null,
  showLiveStartTime: boolean,
): string | null {
  if (
    !game ||
    !showLiveStartTime ||
    getGamePhase(game) !== "live" ||
    !game.eventTime
  ) {
    return null;
  }

  return formatTime(game);
}

export function getTodayString(): string {
  return getLocalDateKey(new Date());
}

export function getOpponent(
  game: SportEvent,
  teamId: string,
  teamName?: string | null,
): string {
  const side = resolveTrackedTeamSide(game, teamId, teamName);
  if (side === "home") {
    return game.awayTeam;
  }
  if (side === "away") {
    return game.homeTeam;
  }

  return game.awayTeam;
}

export function getOpponentBadgeUrl(
  game: SportEvent,
  teamId: string,
  teamName?: string | null,
): string | null {
  const side = resolveTrackedTeamSide(game, teamId, teamName);
  if (side === "home") {
    return game.awayTeamBadgeUrl;
  }
  if (side === "away") {
    return game.homeTeamBadgeUrl;
  }

  return game.awayTeamBadgeUrl;
}

export function getOutcome(
  game: SportEvent,
  teamId: string,
  teamName?: string | null,
): "W" | "L" | "T" | null {
  const side = resolveTrackedTeamSide(game, teamId, teamName);
  const isHome = side === "home";
  const teamScore = Number.parseInt(
    isHome ? (game.homeScore ?? "") : (game.awayScore ?? ""),
    10,
  );
  const opponentScore = Number.parseInt(
    isHome ? (game.awayScore ?? "") : (game.homeScore ?? ""),
    10,
  );
  if (!Number.isFinite(teamScore) || !Number.isFinite(opponentScore)) {
    return null;
  }

  if (game.sport === "Ice Hockey" && teamScore === opponentScore) {
    return null;
  }

  return teamScore > opponentScore
    ? "W"
    : teamScore < opponentScore
      ? "L"
      : "T";
}

export function getScore(
  game: SportEvent,
  teamId: string,
  teamName?: string | null,
): string {
  const side = resolveTrackedTeamSide(game, teamId, teamName);
  const isHome = side === "home";
  const teamScore = isHome ? game.homeScore : game.awayScore;
  const opponentScore = isHome ? game.awayScore : game.homeScore;
  if (!teamScore || !opponentScore) {
    return "—";
  }

  return `${teamScore}-${opponentScore}`;
}

export function getFirstDifferentGame(
  events: SportEvent[] | undefined,
  excludedEventId: string | null,
): SportEvent | null {
  if (!events) {
    return null;
  }

  return events.find((event) => event.eventId !== excludedEventId) ?? null;
}

export function computeStreak(
  lastGames: SportEvent[],
  teamId: string,
  teamName: string,
): string {
  if (!lastGames.length) {
    return "";
  }

  const results = lastGames.map((game) => getOutcome(game, teamId, teamName));
  const first = results[0];
  if (!first) {
    return "";
  }

  let count = 0;
  for (const result of results) {
    if (result === first) {
      count += 1;
      continue;
    }
    break;
  }

  return `${first}${count}`;
}

export function outcomeClasses(outcome: "W" | "L" | "T" | null): {
  text: string;
  bg: string;
  border: string;
} {
  if (outcome === "W") {
    return {
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
    };
  }
  if (outcome === "L") {
    return {
      text: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    };
  }
  if (outcome === "T") {
    return {
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/20",
    };
  }
  return {
    text: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-muted",
  };
}

export function getTeamMeta(
  team: TrackedTeam,
  leaguesById: LeaguesById,
  showSportLabels: boolean,
): string {
  return getTrackedTeamMeta(team, leaguesById, showSportLabels);
}

type TodayGameDisplayData = {
  phase: GamePhase;
  opponent: string;
  opponentBadgeUrl: string | null;
  isHome: boolean;
  outcome: "W" | "L" | "T" | null;
  score: string;
  primaryText: string;
  secondaryText: string;
};

export function getTodayGameDisplayData(
  game: SportEvent,
  teamId: string,
  teamName: string,
  showTime: boolean,
): TodayGameDisplayData {
  const phase = getGamePhase(game);
  const side = resolveTrackedTeamSide(game, teamId, teamName);
  const isHome = side === "home";
  const outcome = getOutcome(game, teamId, teamName);

  if (phase === "live") {
    return {
      phase,
      opponent: getOpponent(game, teamId, teamName),
      opponentBadgeUrl: getOpponentBadgeUrl(game, teamId, teamName),
      isHome,
      outcome,
      score: getScore(game, teamId, teamName),
      primaryText: getScore(game, teamId, teamName),
      secondaryText: game.status ?? "Live",
    };
  }

  if (phase === "finished") {
    return {
      phase,
      opponent: getOpponent(game, teamId, teamName),
      opponentBadgeUrl: getOpponentBadgeUrl(game, teamId, teamName),
      isHome,
      outcome,
      score: getScore(game, teamId, teamName),
      primaryText: getScore(game, teamId, teamName),
      secondaryText: outcome ? `${outcome} · Final score` : "Final score",
    };
  }

  return {
    phase,
    opponent: getOpponent(game, teamId, teamName),
    opponentBadgeUrl: getOpponentBadgeUrl(game, teamId, teamName),
    isHome,
    outcome,
    score: getScore(game, teamId, teamName),
    primaryText: showTime && game.eventTime ? formatTime(game) : "Today",
    secondaryText: `${formatDateLabel(game.eventDate)} · Today`,
  };
}

export function getTodayBadgeClasses(game: SportEvent | null): string {
  if (
    game &&
    getGamePhase(game) === "scheduled" &&
    isSportEventOnLocalDate(game.eventDate, game.eventTime, getTodayString())
  ) {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300";
  }

  return getGamePhaseBadgeClasses(game);
}

export function getTodayDotClasses(game: SportEvent | null): string {
  if (
    game &&
    getGamePhase(game) === "scheduled" &&
    isSportEventOnLocalDate(game.eventDate, game.eventTime, getTodayString())
  ) {
    return "bg-emerald-400";
  }

  return getGamePhaseDotClasses(game);
}
