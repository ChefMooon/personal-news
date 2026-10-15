import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type {
  SportEvent,
  SportLeague,
  SportTeamEvents,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { cn } from "../../lib/utils";
import { getTodayGame } from "./side-resolution";
import { getGamePhase, getGamePhaseHeadline, getGamePhaseLabel } from "./utils";
import { TeamBadge, OpponentBadge } from "./TeamBadges";
import {
  formatDateLabel,
  formatDateTime,
  formatTime,
  getLiveStartTimeText,
  getOpponent,
  getOutcome,
  getScore,
  getFirstDifferentGame,
  outcomeClasses,
  getTeamMeta,
  getTodayGameDisplayData,
  getTodayBadgeClasses,
  getTodayDotClasses,
} from "./team-display-utils";

function TodayGameCard({
  team,
  todayGame,
  lastGame,
  showTime,
  showVenue,
  showLiveStartTime,
  showSportLabels,
  leaguesById,
}: {
  team: TrackedTeam;
  todayGame: SportEvent | null;
  lastGame: SportEvent | null;
  showTime: boolean;
  showVenue: boolean;
  showLiveStartTime: boolean;
  showSportLabels: boolean;
  leaguesById: Record<string, SportLeague>;
}): React.ReactElement {
  const priorGame =
    lastGame && lastGame.eventId !== todayGame?.eventId ? lastGame : null;
  const outcome = todayGame
    ? getOutcome(todayGame, team.teamId, team.name)
    : null;
  const classes = outcomeClasses(outcome);
  const todayGameDisplay = todayGame
    ? getTodayGameDisplayData(todayGame, team.teamId, team.name, showTime)
    : null;
  const phase = todayGameDisplay?.phase ?? getGamePhase(todayGame);
  const opponent = todayGameDisplay?.opponent ?? null;
  const opponentBadgeUrl = todayGameDisplay?.opponentBadgeUrl ?? null;
  const isHome = todayGameDisplay?.isHome ?? false;
  const startTimeText = getLiveStartTimeText(todayGame, showLiveStartTime);
  const hasStartTime = Boolean(startTimeText);
  const hasVenue = showVenue && Boolean(todayGame?.venue);
  const hasLastGame = Boolean(priorGame);
  const footerSectionCount =
    Number(hasStartTime) + Number(hasVenue) + Number(hasLastGame);

  return (
    <div className="overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-500/5">
      <div className="flex items-center gap-3 border-b border-emerald-500/10 px-3 py-2.5">
        <TeamBadge team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">
            {getTeamMeta(team, leaguesById, showSportLabels)}
          </p>
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5",
            getTodayBadgeClasses(todayGame),
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              getTodayDotClasses(todayGame),
            )}
          />
          <span className="text-[10px] font-bold uppercase tracking-wide">
            {phase === "scheduled" ? "Today" : getGamePhaseLabel(todayGame)}
          </span>
        </div>
      </div>

      {todayGame ? (
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-3 py-3 text-center">
          <div>
            <div className="mx-auto w-fit">
              <TeamBadge team={team} size="lg" />
            </div>
            <p className="mt-1 text-xs font-semibold">
              {team.shortName ?? team.name}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {isHome ? "Home" : "Away"}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {phase === "scheduled"
                ? "Today"
                : getGamePhaseHeadline(todayGame)}
            </p>
            {phase === "live" ? (
              <>
                <p className="mt-1 text-base font-extrabold tracking-tight tabular-nums">
                  {todayGameDisplay?.primaryText ??
                    getScore(todayGame, team.teamId, team.name)}
                </p>
                <p className="text-[10px] text-red-500">
                  {todayGameDisplay?.secondaryText ??
                    todayGame?.status ??
                    "Live"}
                </p>
              </>
            ) : phase === "finished" ? (
              <>
                <p
                  className={cn(
                    "mt-1 text-base font-extrabold tracking-tight tabular-nums",
                    classes.text,
                  )}
                >
                  {todayGameDisplay?.primaryText ??
                    getScore(todayGame, team.teamId, team.name)}
                </p>
                <p className={cn("text-[10px]", classes.text)}>
                  {todayGameDisplay?.secondaryText ??
                    (outcome ? `${outcome} · Final score` : "Final score")}
                </p>
              </>
            ) : (
              <>
                <p className="mt-1 text-base font-extrabold tracking-tight">
                  {todayGameDisplay?.primaryText ??
                    (showTime && todayGame?.eventTime
                      ? formatTime(todayGame)
                      : "Today")}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {todayGameDisplay?.secondaryText ??
                    (todayGame
                      ? `${formatDateLabel(todayGame.eventDate)} · Today`
                      : "Today")}
                </p>
              </>
            )}
          </div>
          <div>
            <div className="mx-auto w-fit">
              <OpponentBadge
                name={opponent ?? "--"}
                badgeUrl={opponentBadgeUrl}
                size="lg"
              />
            </div>
            <p className="mt-1 text-xs font-semibold">{opponent}</p>
            <p className="text-[10px] text-muted-foreground">
              {isHome ? "Opponent" : "At"}
            </p>
          </div>
        </div>
      ) : null}

      {hasStartTime || hasVenue || hasLastGame ? (
        <div
          className={cn(
            "grid border-t bg-muted/10 text-xs",
            footerSectionCount >= 2 ? "divide-x" : null,
            footerSectionCount === 3
              ? "grid-cols-3"
              : footerSectionCount === 2
                ? "grid-cols-2"
                : "grid-cols-1",
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
          {hasLastGame ? (
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Last Result
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                {priorGame ? (
                  <>
                    {getOutcome(priorGame, team.teamId, team.name) ? (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                          outcomeClasses(
                            getOutcome(priorGame, team.teamId, team.name),
                          ).text,
                          outcomeClasses(
                            getOutcome(priorGame, team.teamId, team.name),
                          ).bg,
                        )}
                      >
                        {getOutcome(priorGame, team.teamId, team.name)}
                      </span>
                    ) : null}
                    <span className="text-foreground/80">
                      {getScore(priorGame, team.teamId, team.name)}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TodayRestingRow({
  team,
  nextGame,
  showTime,
  showSportLabels,
  leaguesById,
}: {
  team: TrackedTeam;
  nextGame: SportEvent | null;
  showTime: boolean;
  showSportLabels: boolean;
  leaguesById: Record<string, SportLeague>;
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 opacity-40">
      <TeamBadge team={team} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-muted-foreground">
          {team.name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {getTeamMeta(team, leaguesById, showSportLabels)}
        </p>
        <p className="text-xs text-muted-foreground">
          {nextGame ? (
            <>
              Next: {getOpponent(nextGame, team.teamId, team.name)} ·{" "}
              {formatDateTime(nextGame, showTime)}
            </>
          ) : (
            "No upcoming games"
          )}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground/50">-</span>
    </div>
  );
}

function NoGameTodayCarousel({
  teams,
  showSportLabels,
  leaguesById,
}: {
  teams: TrackedTeam[];
  showSportLabels: boolean;
  leaguesById: Record<string, SportLeague>;
}): React.ReactElement {
  const [index, setIndex] = useState(0);
  const team = teams[index] ?? teams[0];

  if (!team) return <></>;

  return (
    <div
      data-sports-team-carousel
      className="min-w-0 rounded-lg border bg-muted/10 p-2"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          No game today
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className="rounded p-1 hover:bg-accent disabled:opacity-40"
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            disabled={index === 0}
            aria-label="Previous team"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-[10px] text-muted-foreground">
            {index + 1}/{teams.length}
          </span>
          <button
            type="button"
            className="rounded p-1 hover:bg-accent disabled:opacity-40"
            onClick={() =>
              setIndex((value) => Math.min(teams.length - 1, value + 1))
            }
            disabled={index === teams.length - 1}
            aria-label="Next team"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-1 flex min-w-0 items-center gap-2">
        <TeamBadge team={team} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold" title={team.name}>
            {team.name}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">
            {getTeamMeta(team, leaguesById, showSportLabels)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TodayView({
  teams,
  teamEventsById,
  showVenue,
  showTime,
  showLiveStartTime,
  today,
  showSportLabels,
  leaguesById,
  showTeamCarousel,
  hideTodayGameCards,
}: {
  teams: TrackedTeam[];
  teamEventsById: Record<string, SportTeamEvents>;
  showVenue: boolean;
  showTime: boolean;
  showLiveStartTime: boolean;
  today: string;
  showSportLabels: boolean;
  leaguesById: Record<string, SportLeague>;
  showTeamCarousel: boolean;
  hideTodayGameCards: boolean;
}): React.ReactElement {
  const playing = teams.filter(
    (team) => getTodayGame(teamEventsById[team.teamId], today) !== null,
  );
  const resting = teams.filter(
    (team) => getTodayGame(teamEventsById[team.teamId], today) === null,
  );

  if (playing.length === 0) {
    return (
      <div className="space-y-3" data-sports-today-team-count={teams.length}>
        <div className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
          None of your teams are playing today.
        </div>
        {resting.length > 0 ? (
          showTeamCarousel ? (
            <NoGameTodayCarousel
              teams={resting}
              showSportLabels={showSportLabels}
              leaguesById={leaguesById}
            />
          ) : (
            <div className="space-y-1.5">
              {resting.map((team) => {
                const nextGame = teamEventsById[team.teamId]?.next?.[0] ?? null;
                return (
                  <TodayRestingRow
                    key={team.teamId}
                    team={team}
                    nextGame={nextGame}
                    showTime={showTime}
                    showSportLabels={showSportLabels}
                    leaguesById={leaguesById}
                  />
                );
              })}
            </div>
          )
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-sports-today-team-count={teams.length}>
      {!hideTodayGameCards &&
        playing.map((team) => {
          const events = teamEventsById[team.teamId];
          const todayGame = getTodayGame(events, today);
          const lastGame = getFirstDifferentGame(
            events?.last,
            todayGame?.eventId ?? null,
          );
          return (
            <TodayGameCard
              key={team.teamId}
              team={team}
              todayGame={todayGame}
              lastGame={lastGame}
              showTime={showTime}
              showVenue={showVenue}
              showLiveStartTime={showLiveStartTime}
              showSportLabels={showSportLabels}
              leaguesById={leaguesById}
            />
          );
        })}

      {resting.length > 0 ? (
        showTeamCarousel ? (
          <NoGameTodayCarousel
            teams={resting}
            showSportLabels={showSportLabels}
            leaguesById={leaguesById}
          />
        ) : (
          <div>
            <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">
              No game today
            </p>
            <div className="space-y-1.5">
              {resting.map((team) => {
                const nextGame = teamEventsById[team.teamId]?.next?.[0] ?? null;
                return (
                  <TodayRestingRow
                    key={team.teamId}
                    team={team}
                    nextGame={nextGame}
                    showTime={showTime}
                    showSportLabels={showSportLabels}
                    leaguesById={leaguesById}
                  />
                );
              })}
            </div>
          </div>
        )
      ) : null}
    </div>
  );
}
