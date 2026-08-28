import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { SportEvent, TrackedTeam } from "../../../../shared/ipc-types";
import { getLocalDateKey } from "../../../../shared/sports-event-utils";
import { Badge } from "../../components/ui/badge";
import { TeamAvatar } from "./TeamAvatar";
import {
  getGameOutcome,
  getGamePhase,
  getGamePhaseBadgeClasses,
  isLiveStatus,
} from "./utils";
import {
  getPreviousGame,
  getTodayGame,
  resolveTrackedTeamSide,
} from "./side-resolution";
import {
  getEligibleTodayGames,
  getSelectedTodayGame,
} from "./sports-game-selection";

function formatEventTime(game: SportEvent): string {
  if (!game.eventTime) return "TBD";
  return new Date(`${game.eventDate}T${game.eventTime}:00Z`).toLocaleTimeString(
    [],
    {
      hour: "numeric",
      minute: "2-digit",
    },
  );
}

function formatNextGameLabel(game: SportEvent): string {
  const date = new Date(`${game.eventDate}T12:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
  const time = game.eventTime ? formatEventTime(game) : "TBD";
  return `${date} · ${time}`;
}

function getCompactBadgeClasses(game: SportEvent): string {
  return getGamePhaseBadgeClasses(game);
}

function shortTeamName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1
    ? words
        .map((word) => word[0])
        .join("")
        .slice(0, 4)
    : name.slice(0, 8);
}

function CompactTeamCard({
  team,
  nextGame,
}: {
  team: TrackedTeam;
  nextGame: SportEvent | null;
}): React.ReactElement {
  return (
    <div className="min-w-0 rounded-md border bg-muted/10 p-2">
      <div className="flex min-w-0 items-center gap-2">
        <TeamAvatar
          name={team.name}
          src={team.badgeUrl}
          className="h-6 w-6 shrink-0 rounded-full"
        />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold" title={team.name}>
            {team.name}
          </p>
          <p className="text-[10px] leading-tight text-muted-foreground">
            {nextGame
              ? `Next: ${formatNextGameLabel(nextGame)}`
              : "No upcoming"}
          </p>
        </div>
      </div>
    </div>
  );
}

function CompactGameSummary({
  game,
  trackedTeam,
  opponentTeam,
  previousGame,
}: {
  game: SportEvent;
  trackedTeam: TrackedTeam | null;
  opponentTeam: TrackedTeam | null;
  previousGame: SportEvent | null;
}): React.ReactElement {
  const live = getGamePhase(game) === "live";
  const finished = getGamePhase(game) === "finished";
  const trackedSide = trackedTeam
    ? resolveTrackedTeamSide(game, trackedTeam.teamId, trackedTeam.name)
    : null;
  const outcome = getGameOutcome(game, trackedSide);
  const outcomeClass =
    outcome === "win"
      ? "text-emerald-400"
      : outcome === "loss"
        ? "text-red-400"
        : "";
  const previousTrackedSide =
    previousGame && trackedTeam
      ? resolveTrackedTeamSide(
          previousGame,
          trackedTeam.teamId,
          trackedTeam.name,
        )
      : null;
  const previousTrackedTeam =
    previousGame && previousTrackedSide
      ? previousTrackedSide === "home"
        ? {
            name: previousGame.homeTeam,
            score: previousGame.homeScore,
          }
        : {
            name: previousGame.awayTeam,
            score: previousGame.awayScore,
          }
      : null;
  const previousOpponent =
    previousGame && previousTrackedSide
      ? previousTrackedSide === "home"
        ? {
            name: previousGame.awayTeam,
            score: previousGame.awayScore,
          }
        : {
            name: previousGame.homeTeam,
            score: previousGame.homeScore,
          }
      : null;
  const trackedIsHome = trackedSide === "home";
  const primaryTeam = trackedTeam
    ? {
        name: trackedTeam.name,
        badgeUrl: trackedTeam.badgeUrl,
        score: trackedIsHome ? game.homeScore : game.awayScore,
      }
    : {
        name: game.awayTeam,
        badgeUrl: game.awayTeamBadgeUrl,
        score: game.awayScore,
      };
  const opponent = trackedTeam
    ? {
        name:
          opponentTeam?.name ?? (trackedIsHome ? game.awayTeam : game.homeTeam),
        badgeUrl:
          opponentTeam?.badgeUrl ??
          (trackedIsHome ? game.awayTeamBadgeUrl : game.homeTeamBadgeUrl),
        score: trackedIsHome ? game.awayScore : game.homeScore,
      }
    : {
        name: game.homeTeam,
        badgeUrl: game.homeTeamBadgeUrl,
        score: game.homeScore,
      };
  return (
    <div className="min-w-0 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className={getCompactBadgeClasses(game)}>
          {live
            ? (game.status ?? "Live")
            : getGamePhase(game) === "finished"
              ? "Final"
              : "Today"}
        </Badge>
        <span className="truncate text-[11px] text-muted-foreground">
          {game.sport}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="min-w-0">
          <TeamAvatar
            name={primaryTeam.name}
            src={primaryTeam.badgeUrl}
            className="mx-auto h-7 w-7 rounded-full"
          />
          <p
            className={`mt-1 truncate text-xs font-semibold ${outcomeClass}`}
            title={primaryTeam.name}
          >
            {primaryTeam.name}
          </p>
          <p className={`text-sm font-bold tabular-nums ${outcomeClass}`}>
            {primaryTeam.score ?? "-"}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">
          {live
            ? (game.status ?? "Live")
            : finished
              ? "Final score"
              : formatEventTime(game)}
        </span>
        <div className="min-w-0">
          <TeamAvatar
            name={opponent.name}
            src={opponent.badgeUrl}
            className="mx-auto h-7 w-7 rounded-full"
          />
          <p
            className="mt-1 truncate text-xs font-semibold"
            title={opponent.name}
          >
            {opponent.name}
          </p>
          <p className="text-sm font-bold tabular-nums">
            {opponent.score ?? "-"}
          </p>
        </div>
      </div>
      <div className="mt-2 grid min-w-0 grid-cols-2 divide-x border-t pt-1.5 text-[10px] text-muted-foreground">
        <div className="min-w-0 pr-2 text-left">
          <p className="font-semibold uppercase tracking-wide">Location</p>
          <p className="truncate" title={game.venue ?? undefined}>
            {game.venue ?? "Venue TBD"}
          </p>
        </div>
        <div className="min-w-0 pl-2 text-right">
          <p className="font-semibold uppercase tracking-wide">Previous</p>
          <p className="truncate" title={previousGame?.awayTeam}>
            {previousTrackedTeam && previousOpponent
              ? `${shortTeamName(previousTrackedTeam.name)} ${previousTrackedTeam.score ?? "-"} - ${previousOpponent.score ?? "-"} ${shortTeamName(previousOpponent.name)}`
              : "No previous game"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function CompactSportsView({
  events,
  teams,
  teamEventsById,
  selectedGameId,
  onSelectGame,
}: {
  events: SportEvent[];
  teams: TrackedTeam[];
  teamEventsById: Record<string, { last: SportEvent[]; next: SportEvent[] }>;
  selectedGameId: string | null;
  onSelectGame: (eventId: string) => void;
}): React.ReactElement {
  const [secondaryPage, setSecondaryPage] = useState(0);
  const today = getLocalDateKey(new Date());
  const liveOrToday = useMemo(
    () => getEligibleTodayGames(events, today),
    [events, today],
  );
  const selectedGame = getSelectedTodayGame(liveOrToday, selectedGameId);
  const selectedTeam = selectedGame
    ? (teams.find((team) =>
        resolveTrackedTeamSide(selectedGame, team.teamId, team.name),
      ) ?? null)
    : null;
  const opponentTeam = selectedGame
    ? (teams.find(
        (team) =>
          team.teamId !== selectedTeam?.teamId &&
          resolveTrackedTeamSide(selectedGame, team.teamId, team.name),
      ) ?? null)
    : null;
  const previousGame = selectedTeam
    ? getPreviousGame(
        teamEventsById[selectedTeam.teamId],
        selectedTeam.teamId,
        selectedTeam.name,
        selectedGame?.eventId ?? "",
      )
    : null;
  const secondaryEvents = liveOrToday
    .filter((event) => event.eventId !== selectedGame?.eventId)
    .map((event) => ({ type: "event" as const, event }));
  const restingTeams = teams
    .filter(
      (team) =>
        !getTodayGame(
          teamEventsById[team.teamId],
          today,
          team.teamId,
          team.name,
        ),
    )
    .map((team) => ({
      type: "team" as const,
      team,
      nextGame: teamEventsById[team.teamId]?.next?.[0] ?? null,
    }));
  const secondaryItems = [...secondaryEvents, ...restingTeams];
  const pageSize = 2;
  const pageCount = Math.max(1, Math.ceil(secondaryItems.length / pageSize));
  const currentPage = Math.min(secondaryPage, pageCount - 1);
  const visibleSecondaryItems = secondaryItems.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );

  const secondaryColumn = (
    <div className="flex h-full min-h-28 min-w-0 flex-col gap-1.5">
      <div className="min-h-0 flex-1 space-y-1.5">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Also today
        </p>
        {visibleSecondaryItems.map((item) =>
          item.type === "event" ? (
            <button
              key={item.event.eventId}
              type="button"
              className="block w-full min-w-0 rounded-md border px-2 py-2 text-left hover:bg-accent"
              onClick={() => onSelectGame(item.event.eventId)}
            >
              <span
                className="block truncate text-[11px] font-medium"
                title={`${item.event.awayTeam} at ${item.event.homeTeam}`}
              >
                {shortTeamName(item.event.awayTeam)} at{" "}
                {shortTeamName(item.event.homeTeam)}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {isLiveStatus(item.event.status)
                  ? (item.event.status ?? "Live")
                  : formatEventTime(item.event)}
              </span>
            </button>
          ) : (
            <CompactTeamCard
              key={item.team.teamId}
              team={item.team}
              nextGame={item.nextGame}
            />
          ),
        )}
        {visibleSecondaryItems.length === 0 ? (
          <p className="px-1 text-[11px] text-muted-foreground">
            No other games or teams
          </p>
        ) : null}
      </div>
      {pageCount > 1 ? (
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            className="rounded p-1 hover:bg-accent disabled:opacity-40"
            onClick={() => setSecondaryPage((page) => Math.max(0, page - 1))}
            disabled={currentPage === 0}
            aria-label="Previous sports teams and games"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] text-muted-foreground">
            {currentPage + 1}/{pageCount}
          </span>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent disabled:opacity-40"
            onClick={() =>
              setSecondaryPage((page) => Math.min(pageCount - 1, page + 1))
            }
            disabled={currentPage === pageCount - 1}
            aria-label="Next sports teams and games"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );

  if (!selectedGame) {
    return (
      <div className="grid min-w-0 grid-cols-[minmax(0,3fr)_minmax(7rem,1fr)] gap-2 overflow-hidden">
        <div className="flex min-h-28 min-w-0 items-center justify-center rounded-lg border border-dashed px-3 text-center text-sm text-muted-foreground">
          No games today
        </div>
        {secondaryColumn}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1 overflow-hidden">
      {liveOrToday.length > 0 ? (
        <div
          className="flex min-w-0 gap-1 overflow-x-auto"
          aria-label="Today's games"
        >
          {liveOrToday.map((game) => {
            const selected = game.eventId === selectedGame.eventId;
            return (
              <button
                key={game.eventId}
                type="button"
                className={`flex min-w-0 shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${selected ? "border-primary bg-primary/10 font-semibold" : "hover:bg-accent"}`}
                onClick={() => onSelectGame(game.eventId)}
                aria-pressed={selected}
                aria-label={`Show ${game.awayTeam} at ${game.homeTeam}`}
              >
                <TeamAvatar
                  name={game.awayTeam}
                  src={game.awayTeamBadgeUrl}
                  className="h-4 w-4 rounded-full"
                />
                <span className="max-w-20 truncate">
                  {shortTeamName(game.awayTeam)} v{" "}
                  {shortTeamName(game.homeTeam)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="grid min-w-0 grid-cols-[minmax(0,3fr)_minmax(7rem,1fr)] gap-2">
        <CompactGameSummary
          game={selectedGame}
          trackedTeam={selectedTeam}
          opponentTeam={opponentTeam}
          previousGame={previousGame}
        />
        {secondaryColumn}
      </div>
    </div>
  );
}
