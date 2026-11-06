import React from "react";
import type {
  SportEvent,
  SportLeague,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { TeamAvatar } from "./TeamAvatar";
import { formatDateTime } from "./team-display-utils";
import { resolveTrackedTeamSide } from "./side-resolution";
import { getLeagueCountry, formatVenueLine } from "./location-display";

export function FeaturedNextGame({
  game,
  teams,
  showTime,
  showVenue,
  leaguesById,
  dense,
}: {
  game: SportEvent;
  teams: TrackedTeam[];
  showTime: boolean;
  showVenue: boolean;
  leaguesById: Record<string, SportLeague>;
  dense: boolean;
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

  return (
    <section
      className={`min-w-0 rounded-lg border p-2${dense ? " flex h-full min-h-0 flex-col gap-1.5" : ""}`}
      aria-label="Next up"
    >
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Next up · {formatDateTime(game, showTime)}
      </p>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <div className="flex min-w-0 flex-col items-center">
          <TeamAvatar
            name={game.awayTeam}
            src={awayTeam?.badgeUrl ?? game.awayTeamBadgeUrl}
            className={`rounded-full ${dense ? "h-7 w-7" : "h-9 w-9"}`}
          />
          <p
            className={`mt-0.5 max-w-full truncate text-center font-semibold ${dense ? "text-xs" : "text-sm"}`}
            title={game.awayTeam}
          >
            {game.awayTeam}
          </p>
        </div>
        <span className="text-xs text-muted-foreground">at</span>
        <div className="flex min-w-0 flex-col items-center">
          <TeamAvatar
            name={game.homeTeam}
            src={homeTeam?.badgeUrl ?? game.homeTeamBadgeUrl}
            className={`rounded-full ${dense ? "h-7 w-7" : "h-9 w-9"}`}
          />
          <p
            className={`mt-0.5 max-w-full truncate text-center font-semibold ${dense ? "text-xs" : "text-sm"}`}
            title={game.homeTeam}
          >
            {game.homeTeam}
          </p>
        </div>
      </div>
      {venueLine ? (
        <p
          className="truncate text-[11px] text-muted-foreground"
          title={venueLine}
        >
          {venueLine}
        </p>
      ) : null}
    </section>
  );
}
