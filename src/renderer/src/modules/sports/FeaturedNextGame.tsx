import React from "react";
import type {
  SportEvent,
  SportLeague,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { cn } from "../../lib/utils";
import { TeamAvatar } from "./TeamAvatar";
import { formatTime, formatWeekdayDate } from "./team-display-utils";
import { resolveTrackedTeamSide } from "./side-resolution";
import { getLeagueCountry, formatVenueLine } from "./location-display";

export function FeaturedNextGame({
  game,
  teams,
  showTime,
  showVenue,
  leaguesById,
  dense,
  compact = false,
}: {
  game: SportEvent;
  teams: TrackedTeam[];
  showTime: boolean;
  showVenue: boolean;
  leaguesById: Record<string, SportLeague>;
  dense: boolean;
  compact?: boolean;
}): React.ReactElement {
  const awayTeam = teams.find(
    (team) =>
      resolveTrackedTeamSide(game, team.teamId, team.name, team.leagueId) ===
      "away",
  );
  const homeTeam = teams.find(
    (team) =>
      resolveTrackedTeamSide(game, team.teamId, team.name, team.leagueId) ===
      "home",
  );
  const venueLine = showVenue
    ? formatVenueLine(game, getLeagueCountry(game, leaguesById))
    : null;
  const dateLabel = formatWeekdayDate(game);
  const timeLabel = showTime ? formatTime(game) || "Time TBD" : null;
  const avatarClass = cn(
    "rounded-full",
    compact ? "h-6 w-6" : dense ? "h-7 w-7" : "h-9 w-9",
  );
  const nameClass = cn(
    "mt-0.5 max-w-full truncate text-center font-semibold",
    dense ? "text-xs" : "text-sm",
  );

  return (
    <section
      data-sports-next-up
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border",
        dense ? "gap-1.5 p-2" : "gap-2 p-3",
      )}
      aria-label="Next up"
    >
      <p className="shrink-0 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Next up
      </p>
      <div
        data-sports-next-up-body
        className="flex min-h-0 flex-1 flex-col justify-center gap-2"
      >
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="flex min-w-0 flex-col items-center">
            <TeamAvatar
              name={game.awayTeam}
              src={awayTeam?.badgeUrl ?? game.awayTeamBadgeUrl}
              className={avatarClass}
            />
            <p className={nameClass} title={game.awayTeam}>
              {game.awayTeam}
            </p>
          </div>
          <span className="text-xs text-muted-foreground">at</span>
          <div className="flex min-w-0 flex-col items-center">
            <TeamAvatar
              name={game.homeTeam}
              src={homeTeam?.badgeUrl ?? game.homeTeamBadgeUrl}
              className={avatarClass}
            />
            <p className={nameClass} title={game.homeTeam}>
              {game.homeTeam}
            </p>
          </div>
        </div>
        {compact ? (
          <p className="truncate text-center text-xs font-semibold text-muted-foreground">
            {timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel}
          </p>
        ) : (
          <div className="min-w-0 text-center">
            <p className="truncate text-xs text-muted-foreground">
              {dateLabel}
            </p>
            {timeLabel ? (
              <p className="truncate text-base font-bold tabular-nums">
                {timeLabel}
              </p>
            ) : null}
          </div>
        )}
      </div>
      {venueLine ? (
        <p
          className="shrink-0 truncate border-t pt-1.5 text-[11px] text-muted-foreground"
          title={venueLine}
        >
          {venueLine}
        </p>
      ) : null}
    </section>
  );
}
