import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  IPC,
  type IpcMutationResult,
  type SportEvent,
  type SportLeague,
  type SportsDataUpdatedEvent,
  type SportSyncStatus,
  type SportTeamEvents,
  type TrackedTeam,
} from "../../../../shared/ipc-types";
import { getLocalDateKey } from "../../../../shared/sports-event-utils";
import { getLeagueKey } from "./league-display";
import { resolveTrackedTeamSide } from "./side-resolution";
import { getEligibleTodayGames } from "./sports-game-selection";

function dedupeEvents(events: SportEvent[]): SportEvent[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    if (seen.has(event.eventId)) return false;
    seen.add(event.eventId);
    return true;
  });
}

function sortUpcomingEvents(a: SportEvent, b: SportEvent): number {
  return (
    Date.parse(`${a.eventDate}T${a.eventTime ?? "12:00"}:00Z`) -
    Date.parse(`${b.eventDate}T${b.eventTime ?? "12:00"}:00Z`)
  );
}

function formatLastSynced(timestamp: number | null): string {
  if (timestamp == null) return "Never";
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const timeLabel = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  if (date.toDateString() === today.toDateString())
    return `Today at ${timeLabel}`;
  if (date.toDateString() === yesterday.toDateString())
    return `Yesterday at ${timeLabel}`;
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function useSportsWidgetData(selectedSports: string[]) {
  const [todayEvents, setTodayEvents] = useState<SportEvent[]>([]);
  const [trackedTeams, setTrackedTeams] = useState<TrackedTeam[]>([]);
  const [leagues, setLeagues] = useState<SportLeague[]>([]);
  const [syncStatusBySport, setSyncStatusBySport] = useState<
    Record<string, SportSyncStatus>
  >({});
  const [teamEventsById, setTeamEventsById] = useState<
    Record<string, SportTeamEvents>
  >({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const hasLoadedDataRef = useRef(false);
  const latestLoadIdRef = useRef(0);

  const loadData = useCallback(
    async ({
      preserveContent = false,
    }: { preserveContent?: boolean } = {}): Promise<boolean> => {
      const loadId = ++latestLoadIdRef.current;
      if (!preserveContent || !hasLoadedDataRef.current) setLoading(true);
      try {
        const [eventResults, leagueResults, allTeams, statusList] =
          await Promise.all([
            Promise.all(
              selectedSports.map((sport) =>
                window.api.invoke(IPC.SPORTS_GET_TODAY_EVENTS, { sport }),
              ),
            ),
            Promise.all(
              selectedSports.map((sport) =>
                window.api.invoke(IPC.SPORTS_GET_LEAGUES, { sport }),
              ),
            ),
            window.api.invoke(IPC.SPORTS_GET_TRACKED_TEAMS),
            window.api.invoke(IPC.SPORTS_GET_STATUS),
          ]);
        const selectedSportSet = new Set(selectedSports);
        const sportTeams = (allTeams as TrackedTeam[]).filter((team) =>
          selectedSportSet.has(team.sport),
        );
        const pairs = await Promise.all(
          sportTeams.map(
            async (team) =>
              [
                team.teamId,
                (await window.api.invoke(IPC.SPORTS_GET_TEAM_EVENTS, {
                  teamId: team.teamId,
                })) as SportTeamEvents,
              ] as const,
          ),
        );
        if (loadId !== latestLoadIdRef.current) return false;
        setTodayEvents((eventResults as SportEvent[][]).flat());
        setLeagues((leagueResults as SportLeague[][]).flat());
        setTrackedTeams(sportTeams);
        setSyncStatusBySport(
          Object.fromEntries(
            (statusList as SportSyncStatus[]).map(
              (status) => [status.sport, status] as const,
            ),
          ),
        );
        setTeamEventsById(Object.fromEntries(pairs));
        hasLoadedDataRef.current = true;
        setRefreshError(null);
        return true;
      } catch (err) {
        if (loadId !== latestLoadIdRef.current) return false;
        const message =
          err instanceof Error
            ? err.message
            : "Failed to load Sports widget data.";
        setRefreshError(message);
        toast.error(message);
        return false;
      } finally {
        if (loadId === latestLoadIdRef.current) setLoading(false);
      }
    },
    [selectedSports],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);
  useEffect(
    () =>
      window.api.on(IPC.SPORTS_DATA_UPDATED, (event) => {
        const payload = event as SportsDataUpdatedEvent;
        if (!selectedSports.includes(payload.sport)) return;
        void loadData({ preserveContent: true }).then(() => {
          if (!payload.ok) {
            setRefreshError(payload.error ?? "Sports data refresh failed.");
            if (payload.error) toast.error(payload.error);
          }
        });
      }),
    [loadData, selectedSports],
  );

  const leaguesById = useMemo(
    () =>
      Object.fromEntries(
        leagues.map(
          (league) =>
            [getLeagueKey(league.sport, league.leagueId), league] as const,
        ),
      ),
    [leagues],
  );
  const enabledTeams = useMemo(
    () =>
      trackedTeams
        .filter((team) => team.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [trackedTeams],
  );
  const fallbackEvents = useMemo(() => {
    const enabledLeagueIds = new Set(
      leagues
        .filter((league) => league.enabled)
        .map((league) => getLeagueKey(league.sport, league.leagueId)),
    );
    return dedupeEvents(
      enabledTeams.flatMap((team) => teamEventsById[team.teamId]?.next ?? []),
    )
      .filter(
        (event) =>
          enabledLeagueIds.size === 0 ||
          enabledLeagueIds.has(getLeagueKey(event.sport, event.leagueId)),
      )
      .sort(sortUpcomingEvents);
  }, [enabledTeams, leagues, teamEventsById]);
  const lastUpdatedAt = useMemo(() => {
    const timestamps = selectedSports
      .map((sport) => syncStatusBySport[sport]?.lastFetchedAt ?? null)
      .filter((timestamp): timestamp is number => timestamp != null);
    return timestamps.length ? Math.max(...timestamps) : null;
  }, [selectedSports, syncStatusBySport]);
  const lastUpdatedLabel = useMemo(
    () => formatLastSynced(lastUpdatedAt),
    [lastUpdatedAt],
  );
  const compactEvents = useMemo(() => {
    const events = [
      ...enabledTeams.flatMap((team) => [
        ...(teamEventsById[team.teamId]?.next ?? []),
        ...(teamEventsById[team.teamId]?.last ?? []),
      ]),
      ...todayEvents,
    ];
    const tracked = events.filter((event) =>
      enabledTeams.some(
        (team) =>
          resolveTrackedTeamSide(event, team.teamId, team.name) !== null,
      ),
    );
    return dedupeEvents(tracked);
  }, [enabledTeams, todayEvents, teamEventsById]);
  const localToday = getLocalDateKey(new Date());
  const eligibleTodayEvents = useMemo(
    () => getEligibleTodayGames(compactEvents, localToday),
    [compactEvents, localToday],
  );

  const refreshNow = useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const results = (await Promise.all(
        selectedSports.map((sport) =>
          window.api.invoke(IPC.SPORTS_REFRESH, { sport }),
        ),
      )) as IpcMutationResult[];
      const failed = results.find((result) => !result.ok);
      if (failed) {
        const message = failed.error ?? "Failed to refresh Sports data.";
        setRefreshError(message);
        toast.error(message);
        return;
      }
      const loaded = await loadData({ preserveContent: true });
      if (!loaded) return;
      setRefreshError(null);
      toast.success("Sports data refresh complete.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to refresh Sports data.";
      setRefreshError(message);
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, [loadData, selectedSports]);

  return {
    todayEvents,
    trackedTeams,
    leagues,
    teamEventsById,
    loading,
    refreshing,
    refreshError,
    setRefreshError,
    refreshNow,
    loadData,
    leaguesById,
    enabledTeams,
    fallbackEvents,
    lastUpdatedLabel,
    compactEvents,
    eligibleTodayEvents,
  };
}
