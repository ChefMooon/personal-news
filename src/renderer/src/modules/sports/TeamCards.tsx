import React from "react";
import type {
  SportLeague,
  SportTeamEvents,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { cn } from "../../lib/utils";
import { getTodayGame } from "./side-resolution";
import {
  computeStreak,
  getFirstDifferentGame,
  getTodayString,
} from "./team-display-utils";
import {
  DetailedTeamCard,
  StandardTeamCard,
  SummarizedTeamCard,
} from "./TeamCardViews";

export function TeamCardsView({
  teams,
  teamEventsById,
  leaguesById,
  showVenue,
  showTime,
  showLiveStartTime,
  viewMode,
  showSportLabels,
  fillAvailable,
}: {
  teams: TrackedTeam[];
  teamEventsById: Record<string, SportTeamEvents>;
  leaguesById: Record<string, SportLeague>;
  showVenue: boolean;
  showTime: boolean;
  showLiveStartTime: boolean;
  viewMode: "summarized" | "standard" | "detailed";
  showSportLabels: boolean;
  fillAvailable: boolean;
}): React.ReactElement {
  const today = getTodayString();
  return (
    <div
      className={cn(
        fillAvailable ? "flex min-h-0 flex-1 flex-col" : "space-y-3",
      )}
    >
      {teams.map((team) => {
        const events = teamEventsById[team.teamId];
        const todayGame = getTodayGame(events, today);
        const lastGame = getFirstDifferentGame(
          events?.last,
          todayGame?.eventId ?? null,
        );
        const nextGame = getFirstDifferentGame(
          events?.next,
          todayGame?.eventId ?? null,
        );
        const streak = computeStreak(
          events?.last ?? [],
          team.teamId,
          team.name,
        );
        if (viewMode === "summarized")
          return (
            <SummarizedTeamCard
              key={team.teamId}
              team={team}
              lastGame={lastGame}
              todayGame={todayGame}
              nextGame={nextGame}
              showTime={showTime}
              showSportLabels={showSportLabels}
              leaguesById={leaguesById}
              fillAvailable={fillAvailable}
            />
          );
        if (viewMode === "standard")
          return (
            <StandardTeamCard
              key={team.teamId}
              team={team}
              lastGame={lastGame}
              todayGame={todayGame}
              nextGame={nextGame}
              showTime={showTime}
              showVenue={showVenue}
              showLiveStartTime={showLiveStartTime}
              showSportLabels={showSportLabels}
              leaguesById={leaguesById}
              fillAvailable={fillAvailable}
            />
          );
        return (
          <DetailedTeamCard
            key={team.teamId}
            team={team}
            lastGame={lastGame}
            todayGame={todayGame}
            nextGame={nextGame}
            streak={streak}
            showTime={showTime}
            showVenue={showVenue}
            showLiveStartTime={showLiveStartTime}
            showSportLabels={showSportLabels}
            leaguesById={leaguesById}
            fillAvailable={fillAvailable}
          />
        );
      })}
    </div>
  );
}
