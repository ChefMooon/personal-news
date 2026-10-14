import React from "react";
import type {
  SportEvent,
  SportTeamEvents,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { Badge } from "../../components/ui/badge";
import { ScrollArea } from "../../components/ui/scroll-area";
import { TeamAvatar } from "./TeamAvatar";
import { cn } from "../../lib/utils";
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
  dense,
}: {
  name: string;
  badgeUrl: string | null;
  score: string | null;
  outcome: "win" | "loss" | "tie" | null;
  dense: boolean;
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
        className={cn("mx-auto rounded-full", dense ? "h-7 w-7" : "h-9 w-9")}
      />
      <p
        className={cn(
          "truncate font-semibold",
          dense ? "mt-0.5 text-xs" : "mt-1 text-sm",
          outcomeClass,
        )}
        title={name}
      >
        {name}
      </p>
      <p
        className={cn(
          "font-bold tabular-nums",
          dense ? "text-base" : "text-lg",
          outcomeClass,
        )}
      >
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
  dense = false,
}: {
  events: SportEvent[];
  teams: TrackedTeam[];
  teamEventsById: Record<string, SportTeamEvents>;
  selectedGameId: string | null;
  onSelectGame: (eventId: string) => void;
  dense?: boolean;
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
    <section
      className={cn(
        "min-w-0",
        dense ? "flex h-full min-h-0 flex-col gap-1.5" : "space-y-2",
      )}
      aria-label="Today's live games"
    >
      <ScrollArea
        orientation="horizontal"
        className={cn("min-w-0", dense && "shrink-0")}
      >
        <div className="flex w-max gap-1">
          {events.map((event) => {
            const selected = event.eventId === selectedGame.eventId;
            return (
              <button
                key={event.eventId}
                type="button"
                className={cn(
                  "flex min-w-0 shrink-0 items-center rounded-md border",
                  dense
                    ? "gap-1 px-2 py-1 text-[11px]"
                    : "gap-1.5 px-2.5 py-1.5 text-xs",
                  selected
                    ? "border-primary bg-primary/10 font-semibold"
                    : "hover:bg-accent",
                )}
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
                  className={cn("rounded-full", dense ? "h-4 w-4" : "h-5 w-5")}
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
      </ScrollArea>
      <div
        className={cn(
          "min-w-0 rounded-lg border border-emerald-500/20 bg-emerald-500/5",
          dense ? "flex min-h-0 flex-1 flex-col p-2" : "p-3",
        )}
      >
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
        <div
          className={cn(
            "grid min-w-0 grid-cols-[1fr_auto_1fr] items-center",
            dense ? "mt-2 min-h-0 flex-1 content-center gap-2" : "mt-3 gap-4",
          )}
        >
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
            dense={dense}
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
            dense={dense}
          />
        </div>
        <div
          className={cn(
            "grid grid-cols-2 divide-x border-t text-muted-foreground",
            dense ? "mt-2 shrink-0 pt-1.5 text-[11px]" : "mt-3 pt-2 text-xs",
          )}
        >
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
