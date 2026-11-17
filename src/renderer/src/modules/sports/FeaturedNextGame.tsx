import React from "react";
import type {
  SportEvent,
  SportLeague,
  SportTeamEvents,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { Badge } from "../../components/ui/badge";
import { cn } from "../../lib/utils";
import { TeamAvatar } from "./TeamAvatar";
import { GameCardFooter } from "./GameCardFooter";
import { SportLabel } from "./SportLabel";
import { formatPreviousResult } from "./game-card-utils";
import { formatTime, formatWeekdayDate } from "./team-display-utils";
import { getPreviousGame, resolveTrackedTeamSide } from "./side-resolution";
import { getLeagueCountry, formatVenueLine } from "./location-display";

export function FeaturedNextGame({
  game,
  teams,
  teamEventsById,
  showTime,
  showVenue,
  leaguesById,
  dense,
  compact = false,
}: {
  game: SportEvent;
  teams: TrackedTeam[];
  teamEventsById: Record<string, SportTeamEvents>;
  showTime: boolean;
  showVenue: boolean;
  leaguesById: Record<string, SportLeague>;
  dense: boolean;
  compact?: boolean;
}): React.ReactElement {
  const variant = compact ? "compact" : dense ? "dense" : "default";
  const paddingClass = compact || dense ? "p-2" : "p-3";
  const bodyClass = compact || dense ? "mt-2" : "mt-3";
  const gapClass = compact || dense ? "gap-2" : "gap-4";
  const avatarClass = compact || dense ? "h-7 w-7" : "h-9 w-9";
  const nameClass =
    variant === "compact"
      ? "mt-1 text-xs"
      : variant === "dense"
        ? "mt-0.5 text-xs"
        : "mt-1 text-sm";
  const scoreClass =
    variant === "compact"
      ? "text-sm"
      : variant === "dense"
        ? "text-base"
        : "text-lg";
  const homeTeam = teams.find(
    (team) =>
      resolveTrackedTeamSide(game, team.teamId, team.name, team.leagueId) ===
      "home",
  );
  const awayTeam = teams.find(
    (team) =>
      resolveTrackedTeamSide(game, team.teamId, team.name, team.leagueId) ===
      "away",
  );
  const trackedTeam =
    teams.find((team) =>
      resolveTrackedTeamSide(game, team.teamId, team.name, team.leagueId),
    ) ?? null;
  const trackedSide = trackedTeam
    ? resolveTrackedTeamSide(
        game,
        trackedTeam.teamId,
        trackedTeam.name,
        trackedTeam.leagueId,
      )
    : null;
  const leftSide = trackedSide ?? "away";
  const rightSide = leftSide === "home" ? "away" : "home";
  const leftTeam = leftSide === "home" ? homeTeam : awayTeam;
  const rightTeam = rightSide === "home" ? homeTeam : awayTeam;
  const previousGame = trackedTeam
    ? getPreviousGame(
        teamEventsById[trackedTeam.teamId],
        trackedTeam.teamId,
        trackedTeam.name,
        game.eventId,
        trackedTeam.leagueId,
      )
    : null;
  const previousText = formatPreviousResult(previousGame, trackedTeam);
  const venueLine =
    formatVenueLine(game, getLeagueCountry(game, leaguesById)) ?? "Venue TBD";
  const pillText = `Next up · ${formatWeekdayDate(game)}`;
  const timeLabel = showTime ? formatTime(game) || "TBD" : null;

  return (
    <section
      data-sports-next-up
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-violet-500/20 bg-violet-500/5",
        paddingClass,
      )}
      aria-label="Next up"
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Badge
          variant="secondary"
          className="min-w-0 shrink border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300"
        >
          <span className="truncate">{pillText}</span>
        </Badge>
        <SportLabel sport={game.sport} size={variant} />
      </div>
      <div
        data-sports-next-up-body
        className={cn("flex min-h-0 flex-1 flex-col justify-center", bodyClass)}
      >
        <div
          className={cn(
            "grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center text-center",
            gapClass,
          )}
        >
          <div className="min-w-0">
            <TeamAvatar
              name={
                leftTeam?.name ??
                (leftSide === "home" ? game.homeTeam : game.awayTeam)
              }
              src={
                leftTeam?.badgeUrl ??
                (leftSide === "home"
                  ? game.homeTeamBadgeUrl
                  : game.awayTeamBadgeUrl)
              }
              className={cn("mx-auto rounded-full", avatarClass)}
            />
            <p
              className={cn("truncate font-semibold", nameClass)}
              title={
                leftTeam?.name ??
                (leftSide === "home" ? game.homeTeam : game.awayTeam)
              }
            >
              {leftTeam?.name ??
                (leftSide === "home" ? game.homeTeam : game.awayTeam)}
            </p>
            <p className={cn("font-bold tabular-nums", scoreClass)}>-</p>
          </div>
          <span className="text-xs text-muted-foreground">
            {timeLabel ?? ""}
          </span>
          <div className="min-w-0">
            <TeamAvatar
              name={
                rightTeam?.name ??
                (rightSide === "home" ? game.homeTeam : game.awayTeam)
              }
              src={
                rightTeam?.badgeUrl ??
                (rightSide === "home"
                  ? game.homeTeamBadgeUrl
                  : game.awayTeamBadgeUrl)
              }
              className={cn("mx-auto rounded-full", avatarClass)}
            />
            <p
              className={cn("truncate font-semibold", nameClass)}
              title={
                rightTeam?.name ??
                (rightSide === "home" ? game.homeTeam : game.awayTeam)
              }
            >
              {rightTeam?.name ??
                (rightSide === "home" ? game.homeTeam : game.awayTeam)}
            </p>
            <p className={cn("font-bold tabular-nums", scoreClass)}>-</p>
          </div>
        </div>
      </div>
      <GameCardFooter
        size={variant}
        showVenue={showVenue}
        venueLine={venueLine}
        previousText={previousText}
      />
    </section>
  );
}
