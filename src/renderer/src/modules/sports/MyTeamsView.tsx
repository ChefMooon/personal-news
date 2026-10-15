import React from "react";
import type {
  SportLeague,
  SportTeamEvents,
  TrackedTeam,
} from "../../../../shared/ipc-types";
import { getLocalDateKey } from "../../../../shared/sports-event-utils";
import { TodayView } from "./TodayTeamsView";
import { TeamCardsView } from "./TeamCards";

export function MyTeamsView({
  teams,
  teamEventsById,
  leaguesById,
  showVenue,
  showTime,
  showLiveStartTime,
  viewMode,
  showSportLabels = false,
  showTeamCarousel = false,
  hideTodayGameCards = false,
  fillAvailable = false,
}: {
  teams: TrackedTeam[];
  teamEventsById: Record<string, SportTeamEvents>;
  leaguesById: Record<string, SportLeague>;
  showVenue: boolean;
  showTime: boolean;
  showLiveStartTime: boolean;
  viewMode: "today" | "summarized" | "standard" | "detailed";
  showSportLabels?: boolean;
  showTeamCarousel?: boolean;
  hideTodayGameCards?: boolean;
  fillAvailable?: boolean;
}): React.ReactElement {
  const today = getLocalDateKey(new Date());
  if (!teams.length)
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        No tracked teams yet. Add teams from Settings → Sports.
      </div>
    );
  if (viewMode === "today")
    return (
      <TodayView
        teams={teams}
        teamEventsById={teamEventsById}
        leaguesById={leaguesById}
        showVenue={showVenue}
        showTime={showTime}
        showLiveStartTime={showLiveStartTime}
        today={today}
        showSportLabels={showSportLabels}
        showTeamCarousel={showTeamCarousel}
        hideTodayGameCards={hideTodayGameCards}
      />
    );
  return (
    <TeamCardsView
      teams={teams}
      teamEventsById={teamEventsById}
      leaguesById={leaguesById}
      showVenue={showVenue}
      showTime={showTime}
      showLiveStartTime={showLiveStartTime}
      viewMode={viewMode}
      showSportLabels={showSportLabels}
      fillAvailable={fillAvailable}
    />
  );
}

export default MyTeamsView;
