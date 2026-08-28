import type { WidgetSize } from "../../../../shared/ipc-types";

export type SportsViewMode =
  "today" | "summarized" | "standard" | "detailed" | "all_games";

export interface SportsContentPolicy {
  effectiveViewMode: SportsViewMode;
  liveGameLimit: number;
  teamLimit: number;
  eventLimit: number;
  secondaryItemLimit: number;
  showLiveSelector: boolean;
  showTeamCarousel: boolean;
  compact: boolean;
  capped: boolean;
  disclosureLabel: string | null;
  overflow: "hidden" | "auto";
}

export function getSportsContentPolicy({
  size,
  viewMode,
  liveGameCount,
  teamCount,
  eventCount,
  contentWidth = Number.POSITIVE_INFINITY,
}: {
  size: WidgetSize;
  viewMode: SportsViewMode;
  liveGameCount: number;
  teamCount: number;
  eventCount: number;
  contentWidth?: number;
}): SportsContentPolicy {
  if (size === "small") {
    const capped = liveGameCount > 1 || eventCount > 3 || teamCount > 3;
    return {
      effectiveViewMode: viewMode === "all_games" ? "all_games" : "today",
      liveGameLimit: 1,
      teamLimit: 1,
      eventLimit: 3,
      secondaryItemLimit: 2,
      showLiveSelector: liveGameCount > 1,
      showTeamCarousel: false,
      compact: true,
      capped,
      disclosureLabel: null,
      overflow: "hidden",
    };
  }

  if (size === "medium") {
    const canUseColumns = contentWidth >= 440;
    const capped = eventCount > 8 || teamCount > 8;
    return {
      effectiveViewMode: viewMode,
      liveGameLimit: liveGameCount,
      teamLimit: 8,
      eventLimit: 8,
      secondaryItemLimit: 4,
      showLiveSelector: liveGameCount > 1,
      showTeamCarousel: teamCount > 0 && canUseColumns,
      compact: false,
      capped,
      disclosureLabel: capped ? "View all games" : null,
      overflow: "hidden",
    };
  }

  return {
    effectiveViewMode: viewMode,
    liveGameLimit: liveGameCount,
    teamLimit: teamCount,
    eventLimit: Number.POSITIVE_INFINITY,
    secondaryItemLimit: eventCount,
    showLiveSelector: liveGameCount > 1,
    showTeamCarousel: false,
    compact: false,
    capped: false,
    disclosureLabel: null,
    overflow: "auto",
  };
}
