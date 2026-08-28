import React from "react";
import type {
  SportEvent,
  SportTeamEvents,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { Badge } from "../../components/ui/badge";
import { TeamAvatar } from "./TeamAvatar";
import { resolveTrackedTeamSide } from "./side-resolution";
import {
  getGameOutcome,
  getGamePhase,
  getGamePhaseBadgeClasses,
} from "./utils";

function formatEventTime(game: SportEvent): string {
  if (!game.eventTime) {
    return "TBD";
  }

  return new Date(`${game.eventDate}T${game.eventTime}:00Z`).toLocaleTimeString(
    [],
    { hour: "numeric", minute: "2-digit" },
  );
}

function getTeamForSide(
  game: SportEvent,
  teams: TrackedTeam[],
  side: "home" | "away",
): TrackedTeam | null {
  const teamId = side === "home" ? game.homeTeamId : game.awayTeamId;
  return (
    teams.find(
      (team) =>
        (teamId && team.teamId === teamId) ||
        resolveTrackedTeamSide(game, team.teamId, team.name) === side,
    ) ?? null
  );
}

function GameSide({
  name,
  badgeUrl,
  score,
  outcome,
}: {
  name: string;
  badgeUrl: string | null;
  score: string | null;
  outcome: "win" | "loss" | "tie" | null;
}): React.ReactElement {
  const outcomeClass =
    outcome === "win"
      ? "text-emerald-400"
      : outcome === "loss"
        ? "text-red-400"
        : "";

  return (
    <div className="min-w-0 text-center">
      <TeamAvatar
        name={name}
        src={badgeUrl}
        className="mx-auto h-9 w-9 rounded-full"
      />
      <p
        className={`mt-1 truncate text-sm font-semibold ${outcomeClass}`}
        title={name}
      >
        {name}
      </p>
      <p className={`text-lg font-bold tabular-nums ${outcomeClass}`}>
        {score ?? "-"}
      </p>
    </div>
  );
}

export function MediumLiveGameView({
  events,
  teams,
  teamEventsById,
  selectedGameId,
  onSelectGame,
}: {
  events: SportEvent[];
  teams: TrackedTeam[];
  teamEventsById: Record<string, SportTeamEvents>;
  selectedGameId: string | null;
  onSelectGame: (eventId: string) => void;
}): React.ReactElement | null {
  const selectedGame =
    events.find((event) => event.eventId === selectedGameId) ?? events[0];

  if (!selectedGame) {
    return null;
  }

  const homeTeam = getTeamForSide(selectedGame, teams, "home");
  const awayTeam = getTeamForSide(selectedGame, teams, "away");
  const phase = getGamePhase(selectedGame);
  const isLive = phase === "live";
  const isFinished = phase === "finished";
  const selectedTeam =
    teams.find((team) =>
      resolveTrackedTeamSide(selectedGame, team.teamId, team.name),
    ) ?? null;
  const trackedSide = selectedTeam
    ? resolveTrackedTeamSide(
        selectedGame,
        selectedTeam.teamId,
        selectedTeam.name,
      )
    : null;
  const leftSide = trackedSide ?? "away";
  const rightSide = leftSide === "home" ? "away" : "home";
  const leftTeam = leftSide === "home" ? homeTeam : awayTeam;
  const rightTeam = rightSide === "home" ? homeTeam : awayTeam;
  const previousGame = selectedTeam
    ? (teamEventsById[selectedTeam.teamId]?.last.find(
        (event) => event.eventId !== selectedGame.eventId,
      ) ?? null)
    : null;
  const status = isLive
    ? (selectedGame.status ?? "Live")
    : formatEventTime(selectedGame);

  return (
    <section className="min-w-0 space-y-2" aria-label="Today's live games">
      <div className="flex min-w-0 gap-1 overflow-x-auto">
        {events.map((event) => {
          const selected = event.eventId === selectedGame.eventId;
          return (
            <button
              key={event.eventId}
              type="button"
              className={`flex min-w-0 shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${selected ? "border-primary bg-primary/10 font-semibold" : "hover:bg-accent"}`}
              onClick={() => onSelectGame(event.eventId)}
              aria-pressed={selected}
              aria-label={`Show ${event.awayTeam} at ${event.homeTeam}`}
            >
              <TeamAvatar
                name={event.awayTeam}
                src={
                  getTeamForSide(event, teams, "away")?.badgeUrl ??
                  event.awayTeamBadgeUrl
                }
                className="h-5 w-5 rounded-full"
              />
              <span className="max-w-40 truncate">
                {event.awayTeam} at {event.homeTeam}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {getGamePhase(event) === "live"
                  ? "Live"
                  : getGamePhase(event) === "finished"
                    ? "Final"
                    : formatEventTime(event)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="min-w-0 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
        <div className="flex items-center justify-between gap-2">
          <Badge
            variant="secondary"
            className={getGamePhaseBadgeClasses(selectedGame)}
          >
            {isLive ? status : phase === "scheduled" ? "Today" : "Final"}
          </Badge>
          <span className="truncate text-xs text-muted-foreground">
            {selectedGame.sport}
          </span>
        </div>
        <div className="mt-3 grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-4">
          <GameSide
            name={
              leftTeam?.name ??
              (leftSide === "home"
                ? selectedGame.homeTeam
                : selectedGame.awayTeam)
            }
            badgeUrl={
              leftTeam?.badgeUrl ??
              (leftSide === "home"
                ? selectedGame.homeTeamBadgeUrl
                : selectedGame.awayTeamBadgeUrl)
            }
            score={
              leftSide === "home"
                ? selectedGame.homeScore
                : selectedGame.awayScore
            }
            outcome={getGameOutcome(
              selectedGame,
              trackedSide === leftSide ? leftSide : null,
            )}
          />
          <div className="text-center text-xs text-muted-foreground">
            <p className="font-semibold">
              {isLive
                ? status
                : isFinished
                  ? "Final score"
                  : formatEventTime(selectedGame)}
            </p>
            <p>{selectedGame.eventDate}</p>
          </div>
          <GameSide
            name={
              rightTeam?.name ??
              (rightSide === "home"
                ? selectedGame.homeTeam
                : selectedGame.awayTeam)
            }
            badgeUrl={
              rightTeam?.badgeUrl ??
              (rightSide === "home"
                ? selectedGame.homeTeamBadgeUrl
                : selectedGame.awayTeamBadgeUrl)
            }
            score={
              rightSide === "home"
                ? selectedGame.homeScore
                : selectedGame.awayScore
            }
            outcome={getGameOutcome(
              selectedGame,
              trackedSide === rightSide ? rightSide : null,
            )}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 divide-x border-t pt-2 text-xs text-muted-foreground">
          <div className="min-w-0 pr-3 text-left">
            <p className="font-semibold uppercase tracking-wide">Location</p>
            <p className="truncate" title={selectedGame.venue ?? undefined}>
              {selectedGame.venue ?? "Venue TBD"}
            </p>
          </div>
          <div className="min-w-0 pl-3 text-right">
            <p className="font-semibold uppercase tracking-wide">Previous</p>
            <p className="truncate" title={previousGame?.eventDate}>
              {previousGame
                ? `${previousGame.eventDate} · ${previousGame.awayScore ?? "-"}-${previousGame.homeScore ?? "-"}`
                : "No previous game data"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
