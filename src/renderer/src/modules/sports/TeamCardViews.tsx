import React from "react";
import type {
  SportEvent,
  SportLeague,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { cn } from "../../lib/utils";
import { TeamBadge } from "./TeamBadges";
import {
  formatDateLabel,
  formatDateTime,
  formatTime,
  getLiveStartTimeText,
  getOpponent,
  getOutcome,
  getScore,
  getTeamMeta,
  getTodayBadgeClasses,
  outcomeClasses,
} from "./team-display-utils";
import {
  getGamePhase,
  getGamePhaseLabel,
  hasResolvedScore,
  isLiveStatus,
} from "./utils";

export interface SummarizedTeamCardProps {
  team: TrackedTeam;
  lastGame: SportEvent | null;
  todayGame: SportEvent | null;
  nextGame: SportEvent | null;
  showTime: boolean;
  showSportLabels: boolean;
  leaguesById: Record<string, SportLeague>;
  fillAvailable: boolean;
}

export interface StandardTeamCardProps extends SummarizedTeamCardProps {
  showVenue: boolean;
  showLiveStartTime: boolean;
}

export interface DetailedTeamCardProps extends StandardTeamCardProps {
  streak: string;
}

function GameStateDisplay({
  game,
  teamId,
  teamName,
  showTime,
  scheduledFallback = "Today",
}: {
  game: SportEvent;
  teamId: string;
  teamName?: string | null;
  showTime: boolean;
  scheduledFallback?: string;
}): React.ReactElement {
  if (isLiveStatus(game.status)) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-red-500 animate-pulse">●</span>
        <span className="text-sm font-semibold tabular-nums">
          {getScore(game, teamId, teamName)}
        </span>
        <span className="text-xs text-muted-foreground">
          {game.status ?? "Live"}
        </span>
      </div>
    );
  }

  if (getGamePhase(game) === "finished") {
    const outcome = getOutcome(game, teamId, teamName);
    const classes = outcomeClasses(outcome);

    return (
      <div className={cn("text-sm font-semibold tabular-nums", classes.text)}>
        {getScore(game, teamId, teamName)}
        {outcome ? ` · ${outcome}` : ""}
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground">
      {showTime && game.eventTime ? formatTime(game) : scheduledFallback}
    </div>
  );
}

export function SummarizedTeamCard({
  team,
  lastGame,
  todayGame,
  nextGame,
  showTime,
  showSportLabels,
  leaguesById,
  fillAvailable,
}: SummarizedTeamCardProps): React.ReactElement {
  const displayGame = todayGame ?? lastGame;
  const displayPhase = getGamePhase(displayGame);
  const outcome = displayGame
    ? getOutcome(displayGame, team.teamId, team.name)
    : null;
  const opponent = todayGame
    ? getOpponent(todayGame, team.teamId, team.name)
    : nextGame
      ? getOpponent(nextGame, team.teamId, team.name)
      : null;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        fillAvailable ? "min-h-0 flex-1 justify-center" : "rounded-lg border",
      )}
    >
      <TeamBadge team={team} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="block truncate text-sm font-semibold">
              {team.name}
            </span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {getTeamMeta(team, leaguesById, showSportLabels)}
            </span>
          </div>
          {displayGame ? (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
                getTodayBadgeClasses(displayGame),
              )}
            >
              {todayGame && displayPhase === "scheduled"
                ? "Today"
                : getGamePhaseLabel(displayGame)}
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {todayGame && opponent ? (
            <>
              Today: <span className="text-foreground/80">{opponent}</span> ·{" "}
              {displayPhase === "live"
                ? `${getScore(todayGame, team.teamId, team.name)} · ${todayGame.status ?? "Live"}`
                : displayPhase === "finished"
                  ? `Final score ${getScore(todayGame, team.teamId, team.name)}${outcome ? ` · ${outcome}` : ""}`
                  : showTime && todayGame.eventTime
                    ? `${formatTime(todayGame)} · Today`
                    : "Today"}
            </>
          ) : nextGame ? (
            <>
              Next:{" "}
              <span className="text-foreground/80">
                {getOpponent(nextGame, team.teamId, team.name)}
              </span>{" "}
              · {formatDateTime(nextGame, showTime)}
            </>
          ) : (
            "No upcoming games"
          )}
        </p>
      </div>
    </div>
  );
}

export function StandardTeamCard({
  team,
  lastGame,
  todayGame,
  nextGame,
  showTime,
  showVenue,
  showLiveStartTime,
  showSportLabels,
  leaguesById,
  fillAvailable,
}: StandardTeamCardProps): React.ReactElement {
  const displayGame =
    todayGame && hasResolvedScore(todayGame) ? todayGame : lastGame;
  const outcome = displayGame
    ? getOutcome(displayGame, team.teamId, team.name)
    : null;
  const classes = outcomeClasses(outcome);
  const startTimeText = getLiveStartTimeText(todayGame, showLiveStartTime);
  const hasStartTime = Boolean(startTimeText);
  const hasVenue = showVenue && Boolean(todayGame?.venue);
  const footerSectionCount = Number(hasStartTime) + Number(hasVenue);

  return (
    <div
      className={cn(
        "overflow-hidden",
        fillAvailable ? "flex min-h-0 flex-1 flex-col" : "rounded-lg border",
      )}
    >
      <div className="flex items-center gap-3 border-b bg-muted/20 px-3 py-2.5">
        <TeamBadge team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">
            {getTeamMeta(team, leaguesById, showSportLabels)}
          </p>
        </div>
        {displayGame && outcome ? (
          <div
            className={cn(
              "flex shrink-0 flex-col items-center rounded-md px-2.5 py-1",
              classes.bg,
            )}
          >
            <span
              className={cn(
                "text-base font-extrabold leading-none",
                classes.text,
              )}
            >
              {outcome}
            </span>
            <span className={cn("text-[10px] font-semibold", classes.text)}>
              {getScore(displayGame, team.teamId, team.name)}
            </span>
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          "grid grid-cols-2 divide-x text-xs",
          fillAvailable ? "min-h-0 flex-1 items-stretch" : null,
        )}
      >
        <div
          className={cn(
            "px-3 py-2",
            fillAvailable ? "flex flex-col justify-center" : null,
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Last Game
          </p>
          {lastGame ? (
            <>
              <p className="mt-1 text-sm text-foreground/80">
                vs. {getOpponent(lastGame, team.teamId, team.name)}
              </p>
              <p className="text-muted-foreground">
                {formatDateLabel(lastGame.eventDate)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">No recent games</p>
          )}
        </div>
        <div
          className={cn(
            "px-3 py-2",
            fillAvailable ? "flex flex-col justify-center" : null,
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {todayGame ? "Today" : "Next Game"}
          </p>
          {todayGame ? (
            <>
              <p className="mt-1 text-sm text-foreground/80">
                vs. {getOpponent(todayGame, team.teamId, team.name)}
              </p>
              <div className="mt-1">
                <GameStateDisplay
                  game={todayGame}
                  teamId={team.teamId}
                  teamName={team.name}
                  showTime={showTime}
                />
              </div>
            </>
          ) : nextGame ? (
            <>
              <p className="mt-1 text-sm text-foreground/80">
                vs. {getOpponent(nextGame, team.teamId, team.name)}
              </p>
              <p className="text-muted-foreground">
                {formatDateTime(nextGame, showTime)}
                {showVenue && nextGame.venue ? ` · ${nextGame.venue}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">No upcoming games</p>
          )}
        </div>
      </div>
      {hasStartTime || hasVenue ? (
        <div
          className={cn(
            "grid border-t bg-muted/10 text-xs",
            footerSectionCount >= 2 ? "divide-x" : null,
            footerSectionCount === 2 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {hasStartTime ? (
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Start Time
              </p>
              <p className="mt-0.5 text-foreground/80">{startTimeText}</p>
            </div>
          ) : null}
          {hasVenue ? (
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Venue
              </p>
              <p className="mt-0.5 text-foreground/80">{todayGame?.venue}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function DetailedTeamCard({
  team,
  lastGame,
  todayGame,
  nextGame,
  streak,
  showTime,
  showVenue,
  showLiveStartTime,
  showSportLabels,
  leaguesById,
  fillAvailable,
}: DetailedTeamCardProps): React.ReactElement {
  const featuredGame = todayGame ?? lastGame;
  const outcome = featuredGame
    ? getOutcome(featuredGame, team.teamId, team.name)
    : null;
  const classes = outcomeClasses(outcome);
  const streakIsWin = streak.startsWith("W");
  const startTimeText = getLiveStartTimeText(todayGame, showLiveStartTime);
  const hasStartTime = Boolean(startTimeText);
  const hasVenue = showVenue && Boolean(todayGame?.venue);
  const middleSectionCount = Number(hasStartTime) + Number(hasVenue);

  return (
    <div
      className={cn(
        "overflow-hidden",
        fillAvailable ? "flex min-h-0 flex-1 flex-col" : "rounded-lg border",
      )}
    >
      <div className="flex items-center gap-3 border-b px-3 py-3">
        <TeamBadge team={team} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">
            {getTeamMeta(team, leaguesById, showSportLabels)}
          </p>
        </div>
        {streak ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Streak
            </p>
            <p
              className={cn(
                "text-sm font-extrabold",
                streakIsWin ? "text-emerald-400" : "text-red-400",
              )}
            >
              {streak}
            </p>
          </div>
        ) : null}
      </div>

      <div
        className={cn(
          "flex items-center gap-3 border-b px-3 py-2.5",
          fillAvailable ? "flex-1 justify-center" : null,
        )}
      >
        {outcome ? (
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border",
              classes.bg,
              classes.border,
            )}
          >
            <span
              className={cn(
                "text-sm font-extrabold leading-none",
                classes.text,
              )}
            >
              {outcome}
            </span>
            <span className={cn("text-[10px] font-semibold", classes.text)}>
              {featuredGame
                ? getScore(featuredGame, team.teamId, team.name)
                : ""}
            </span>
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {todayGame ? "Today" : "Last Game"}
            {featuredGame
              ? ` · ${formatDateLabel(featuredGame.eventDate)}`
              : ""}
          </p>
          {featuredGame ? (
            <>
              <p className="mt-0.5 text-sm font-medium">
                vs. {getOpponent(featuredGame, team.teamId, team.name)}
              </p>
              {todayGame ? (
                <div className="mt-1">
                  <GameStateDisplay
                    game={todayGame}
                    teamId={team.teamId}
                    teamName={team.name}
                    showTime={showTime}
                  />
                </div>
              ) : null}
              {!todayGame && outcome ? (
                <span
                  className={cn(
                    "mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold",
                    classes.text,
                    classes.bg,
                  )}
                >
                  {outcome === "W" ? "Win" : outcome === "L" ? "Loss" : "Tie"}
                </span>
              ) : null}
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              No recent games
            </p>
          )}
        </div>
      </div>

      {hasStartTime || hasVenue ? (
        <div
          className={cn(
            "grid border-b bg-muted/10 text-xs",
            fillAvailable ? "flex-1 items-stretch" : null,
            middleSectionCount >= 2 ? "divide-x" : null,
            middleSectionCount === 2 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {hasStartTime ? (
            <div
              className={cn(
                "px-3 py-2",
                fillAvailable ? "flex flex-col justify-center" : null,
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Start Time
              </p>
              <p className="mt-0.5 text-foreground/80">{startTimeText}</p>
            </div>
          ) : null}
          {hasVenue ? (
            <div
              className={cn(
                "px-3 py-2",
                fillAvailable ? "flex flex-col justify-center" : null,
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Venue
              </p>
              <p className="mt-0.5 text-foreground/80">{todayGame?.venue}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "flex items-center gap-3 bg-muted/10 px-3 py-2.5",
          fillAvailable ? "flex-1 justify-center" : null,
        )}
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-muted bg-muted/30 text-[11px] font-semibold text-muted-foreground">
          NEXT
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {todayGame ? "Up Next" : "Next Game"}
          </p>
          {nextGame ? (
            <>
              <p className="mt-0.5 text-sm font-medium">
                vs. {getOpponent(nextGame, team.teamId, team.name)}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(nextGame, showTime)}
                {showVenue && nextGame.venue ? ` · ${nextGame.venue}` : ""}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              No upcoming games scheduled
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
