import React, { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import type {
  SportEvent,
  SportLeague,
  SportTeamEvents,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { AllGamesView } from "./AllGamesView";
import { MediumLiveGameView } from "./MediumLiveGameView";
import { MyTeamsView } from "./MyTeamsView";
import {
  getMediumItemCount,
  getMediumTeamItems,
  shouldShowMediumTeamCarousel,
} from "./sports-content-policy";

export function SportsMediumLayout({
  viewMode,
  todayEvents,
  fallbackEvents,
  eligibleTodayEvents,
  teams,
  teamEventsById,
  leaguesById,
  showTime,
  showVenue,
  showLiveStartTime,
  showSportLabels,
  showTeamCarousel,
  selectedGameId,
  onSelectGame,
}: {
  viewMode: "today" | "all_games" | "summarized" | "standard" | "detailed";
  todayEvents: SportEvent[];
  fallbackEvents: SportEvent[];
  eligibleTodayEvents: SportEvent[];
  teams: TrackedTeam[];
  teamEventsById: Record<string, SportTeamEvents>;
  leaguesById: Record<string, SportLeague>;
  showTime: boolean;
  showVenue: boolean;
  showLiveStartTime: boolean;
  showSportLabels: boolean;
  showTeamCarousel: boolean;
  selectedGameId: string | null;
  onSelectGame: (eventId: string | null) => void;
}): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [viewMode]);
  const mediumItemCount = getMediumItemCount({
    viewMode,
    todayEventCount: todayEvents.length,
    fallbackEventCount: fallbackEvents.length,
    teamCount: teams.length,
  });
  const hasMore = viewMode !== "today" && mediumItemCount > 1;
  const teamPanel = viewMode !== "today" && viewMode !== "all_games";
  const disclosureLabel =
    viewMode === "all_games" ? "View all games" : "View all teams";

  return (
    <div
      data-sports-layout="medium"
      className="grid min-h-0 flex-1 grid-cols-[minmax(0,3fr)_minmax(0,2fr)] grid-rows-[minmax(0,1fr)] gap-2"
    >
      <div className="min-h-0 min-w-0">
        <MediumLiveGameView
          events={eligibleTodayEvents}
          teams={teams}
          teamEventsById={teamEventsById}
          selectedGameId={selectedGameId}
          onSelectGame={onSelectGame}
          dense
        />
      </div>
      <div
        className={
          teamPanel
            ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border"
            : "flex min-h-0 flex-1 flex-col"
        }
      >
        <div
          data-sports-content-viewport="medium"
          className={
            teamPanel && !expanded
              ? "flex min-h-0 flex-1 flex-col overflow-hidden"
              : expanded
                ? "min-h-0 flex-1 overflow-y-auto"
                : "shrink-0 overflow-hidden"
          }
        >
          {viewMode === "all_games" ? (
            <AllGamesView
              events={expanded ? todayEvents : todayEvents.slice(0, 1)}
              leaguesById={leaguesById}
              showTime={showTime}
              showVenue={showVenue}
              showLiveStartTime={showLiveStartTime}
              fallbackEvents={
                expanded ? fallbackEvents : fallbackEvents.slice(0, 1)
              }
              fallbackEventLimit={expanded ? Number.POSITIVE_INFINITY : 1}
              showSportLabels={showSportLabels}
            />
          ) : (
            <MyTeamsView
              teams={getMediumTeamItems(teams, viewMode, expanded)}
              teamEventsById={teamEventsById}
              leaguesById={leaguesById}
              showVenue={showVenue}
              showTime={showTime}
              showLiveStartTime={showLiveStartTime}
              viewMode={viewMode}
              showSportLabels={showSportLabels}
              showTeamCarousel={shouldShowMediumTeamCarousel(
                viewMode,
                showTeamCarousel,
              )}
              hideTodayGameCards
              fillAvailable={!expanded && viewMode !== "today"}
            />
          )}
        </div>
        {hasMore && (
          <div
            className={
              teamPanel
                ? "shrink-0 border-t bg-muted/10"
                : "mt-auto shrink-0 pt-2"
            }
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={
                teamPanel
                  ? "h-8 w-full rounded-none border-0 bg-transparent text-xs shadow-none hover:bg-muted/40"
                  : "w-full text-xs"
              }
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show less" : disclosureLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
