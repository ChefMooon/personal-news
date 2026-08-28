import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { RefreshCcw, RotateCcw, Settings2, X } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../../components/ui/alert-dialog";
import { useWidgetInstance } from "../../contexts/WidgetInstanceContext";
import {
  DEFAULT_SPORTS_VIEW_CONFIG,
  useSportsViewConfig,
} from "../../hooks/useSportsViewConfig";
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
import {
  ALL_SPORTS_ID,
  SUPPORTED_SPORTS,
  getSportLabel,
} from "../../../../shared/sports";
import { AllGamesView } from "./AllGamesView";
import { CompactSportsView } from "./CompactSportsView";
import { MediumLiveGameView } from "./MediumLiveGameView";
import { getLeagueKey } from "./league-display";
import { MyTeamsView } from "./MyTeamsView";
import { SportsSettingsPanel } from "./SportsSettingsPanel";
import { WidgetSizeControl } from "../../components/WidgetSizeControl";
import { getSportsContentPolicy } from "./sports-content-policy";
import { getGamePhase } from "./utils";
import { getLocalDateKey } from "../../../../shared/sports-event-utils";
import { resolveTrackedTeamSide } from "./side-resolution";
import { getEligibleTodayGames } from "./sports-game-selection";

function dedupeEvents(events: SportEvent[]): SportEvent[] {
  const seen = new Set<string>();
  const result: SportEvent[] = [];
  for (const event of events) {
    if (seen.has(event.eventId)) {
      continue;
    }
    seen.add(event.eventId);
    result.push(event);
  }
  return result;
}

function sortUpcomingEvents(a: SportEvent, b: SportEvent): number {
  const aValue = Date.parse(`${a.eventDate}T${a.eventTime ?? "12:00"}:00Z`);
  const bValue = Date.parse(`${b.eventDate}T${b.eventTime ?? "12:00"}:00Z`);
  return aValue - bValue;
}

function formatLastSynced(timestamp: number | null): string {
  if (timestamp == null) {
    return "Never";
  }

  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const timeLabel = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  const sameDay = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (sameDay) {
    return `Today at ${timeLabel}`;
  }

  if (isYesterday) {
    return `Yesterday at ${timeLabel}`;
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatUtcDateKey(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatUtcTimeKey(value: Date): string {
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function SportsWidget(): React.ReactElement {
  const { instanceId, label, size, editMode, onSizeChange } =
    useWidgetInstance();
  const widgetTitle = label ?? "Sports";
  const { config, setConfig } = useSportsViewConfig(instanceId);
  const selectedSports = useMemo(
    () => (config.sport === ALL_SPORTS_ID ? SUPPORTED_SPORTS : [config.sport]),
    [config.sport],
  );
  const showSportLabels = config.sport === ALL_SPORTS_ID;
  const sportLabel = getSportLabel(config.sport);
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
  const [showDevMockLiveGame, setShowDevMockLiveGame] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [snapshotConfig, setSnapshotConfig] = useState(config);
  const [editContentHeight, setEditContentHeight] = useState<number | null>(
    null,
  );
  const hasLoadedDataRef = useRef(false);
  const latestLoadIdRef = useRef(0);
  const cardContentRef = useRef<HTMLDivElement | null>(null);
  const defaultMockSport = selectedSports[0] ?? "Baseball";

  const loadTeamEvents = useCallback(
    async (teams: TrackedTeam[]): Promise<Record<string, SportTeamEvents>> => {
      const pairs = await Promise.all(
        teams.map(async (team) => {
          const events = (await window.api.invoke(IPC.SPORTS_GET_TEAM_EVENTS, {
            teamId: team.teamId,
          })) as SportTeamEvents;
          return [team.teamId, events] as const;
        }),
      );

      return Object.fromEntries(pairs);
    },
    [],
  );

  const loadData = useCallback(
    async ({ preserveContent = false }: { preserveContent?: boolean } = {}) => {
      const loadId = latestLoadIdRef.current + 1;
      latestLoadIdRef.current = loadId;

      if (!preserveContent || !hasLoadedDataRef.current) {
        setLoading(true);
      }

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
        const nextTeamEventsById = await loadTeamEvents(sportTeams);
        const nextStatusBySport = Object.fromEntries(
          (statusList as SportSyncStatus[]).map(
            (status) => [status.sport, status] as const,
          ),
        );

        if (loadId !== latestLoadIdRef.current) {
          return;
        }

        setTodayEvents((eventResults as SportEvent[][]).flat());
        setLeagues((leagueResults as SportLeague[][]).flat());
        setTrackedTeams(sportTeams);
        setSyncStatusBySport(nextStatusBySport);
        setTeamEventsById(nextTeamEventsById);
        hasLoadedDataRef.current = true;
      } catch (err) {
        if (loadId !== latestLoadIdRef.current) {
          return;
        }

        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to load Sports widget data.",
        );
      } finally {
        if (loadId === latestLoadIdRef.current) {
          setLoading(false);
        }
      }
    },
    [loadTeamEvents, selectedSports],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    return window.api.on(IPC.SPORTS_DATA_UPDATED, (event) => {
      const payload = event as SportsDataUpdatedEvent;
      if (!selectedSports.includes(payload.sport)) {
        return;
      }

      if (!payload.ok && payload.error) {
        toast.error(payload.error);
      }

      void loadData({ preserveContent: true });
    });
  }, [loadData, selectedSports]);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        handleClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing]);

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

  const mockTrackedTeam = useMemo<TrackedTeam>(() => {
    const existingEnabled = trackedTeams.find((team) => team.enabled);
    if (existingEnabled) {
      return existingEnabled;
    }

    return {
      teamId: `dev-mock-team:${instanceId}`,
      leagueId: "dev-mock-league",
      sport: defaultMockSport,
      name: "Toronto Blue Jays",
      shortName: "Blue Jays",
      badgeUrl: null,
      enabled: true,
      sortOrder: -1,
    };
  }, [defaultMockSport, instanceId, trackedTeams]);

  const mockLiveEvent = useMemo<SportEvent>(() => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    return {
      eventId: `dev-mock-live:${instanceId}`,
      leagueId: mockTrackedTeam.leagueId,
      sport: mockTrackedTeam.sport,
      homeTeamId: null,
      awayTeamId: mockTrackedTeam.teamId,
      homeTeam: "Los Angeles Angels",
      awayTeam: mockTrackedTeam.name,
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: mockTrackedTeam.badgeUrl,
      homeScore: "3",
      awayScore: "3",
      eventDate: formatUtcDateKey(startedAt),
      eventTime: formatUtcTimeKey(startedAt),
      status: "Live · Bot 7th",
      venue: "Angel Stadium",
    };
  }, [instanceId, mockTrackedTeam]);

  const mockPreviousEvent = useMemo<SportEvent>(() => {
    const playedAt = new Date(Date.now() - 26 * 60 * 60 * 1000);
    return {
      ...mockLiveEvent,
      eventId: `dev-mock-previous:${instanceId}`,
      homeTeam: "Seattle Mariners",
      homeTeamId: "dev-mock-mariners",
      homeScore: "2",
      awayScore: "5",
      eventDate: formatUtcDateKey(playedAt),
      eventTime: formatUtcTimeKey(playedAt),
      status: "Final",
      venue: "T-Mobile Park",
    };
  }, [instanceId, mockLiveEvent]);

  const mockSecondaryTrackedTeam = useMemo<TrackedTeam>(
    () => ({
      teamId: `dev-mock-secondary-team:${instanceId}`,
      leagueId: mockTrackedTeam.leagueId,
      sport: mockTrackedTeam.sport,
      name: "New York Yankees",
      shortName: "Yankees",
      badgeUrl: null,
      enabled: true,
      sortOrder: -2,
    }),
    [instanceId, mockTrackedTeam.leagueId, mockTrackedTeam.sport],
  );

  const mockSecondaryLiveEvent = useMemo<SportEvent>(() => {
    const startedAt = new Date(Date.now() - 90 * 60 * 1000);
    return {
      eventId: `dev-mock-live-secondary:${instanceId}`,
      leagueId: mockSecondaryTrackedTeam.leagueId,
      sport: mockSecondaryTrackedTeam.sport,
      homeTeamId: "dev-mock-red-sox",
      awayTeamId: mockSecondaryTrackedTeam.teamId,
      homeTeam: "Boston Red Sox",
      awayTeam: mockSecondaryTrackedTeam.name,
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: mockSecondaryTrackedTeam.badgeUrl,
      homeScore: "5",
      awayScore: "2",
      eventDate: formatUtcDateKey(startedAt),
      eventTime: formatUtcTimeKey(startedAt),
      status: "Live · Bot 5th",
      venue: "Fenway Park",
    };
  }, [instanceId, mockSecondaryTrackedTeam]);

  const displayTodayEvents = useMemo(() => {
    if (!import.meta.env.DEV || !showDevMockLiveGame) {
      return todayEvents;
    }

    const sanitized = todayEvents.filter(
      (event) => !event.eventId.startsWith("dev-mock-live:"),
    );
    return [mockLiveEvent, mockSecondaryLiveEvent, ...sanitized];
  }, [mockLiveEvent, mockSecondaryLiveEvent, showDevMockLiveGame, todayEvents]);

  const displayLeaguesById = useMemo(() => {
    if (!import.meta.env.DEV || !showDevMockLiveGame) {
      return leaguesById;
    }

    const leagueKey = getLeagueKey(mockLiveEvent.sport, mockLiveEvent.leagueId);
    if (leaguesById[leagueKey]) {
      return leaguesById;
    }

    return {
      ...leaguesById,
      [leagueKey]: {
        leagueId: mockLiveEvent.leagueId,
        sport: mockLiveEvent.sport,
        name: "MLB (Dev Mock)",
        country: null,
        logoUrl: null,
        enabled: true,
        sortOrder: -1,
      },
    };
  }, [leaguesById, mockLiveEvent, showDevMockLiveGame]);

  const enabledTeams = useMemo(
    () =>
      trackedTeams
        .filter((team) => team.enabled)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [trackedTeams],
  );

  const displayEnabledTeams = useMemo(() => {
    if (
      !import.meta.env.DEV ||
      !showDevMockLiveGame ||
      enabledTeams.length > 0
    ) {
      return showDevMockLiveGame
        ? [...enabledTeams, mockSecondaryTrackedTeam]
        : enabledTeams;
    }

    return [mockTrackedTeam, mockSecondaryTrackedTeam];
  }, [
    enabledTeams,
    mockSecondaryTrackedTeam,
    mockTrackedTeam,
    showDevMockLiveGame,
  ]);

  const displayTeamEventsById = useMemo(() => {
    if (!import.meta.env.DEV || !showDevMockLiveGame) {
      return teamEventsById;
    }

    const current = teamEventsById[mockTrackedTeam.teamId] ?? {
      last: [],
      next: [],
    };
    const sanitizedLast = current.last.filter(
      (event) => !event.eventId.startsWith("dev-mock-live:"),
    );
    const sanitizedNext = current.next.filter(
      (event) => !event.eventId.startsWith("dev-mock-live:"),
    );

    return {
      ...teamEventsById,
      [mockTrackedTeam.teamId]: {
        last: [mockPreviousEvent, ...sanitizedLast],
        next: [mockLiveEvent, ...sanitizedNext],
      },
      [mockSecondaryTrackedTeam.teamId]: {
        last: [],
        next: [mockSecondaryLiveEvent],
      },
    };
  }, [
    mockLiveEvent,
    mockPreviousEvent,
    mockSecondaryLiveEvent,
    mockSecondaryTrackedTeam.teamId,
    mockTrackedTeam.teamId,
    showDevMockLiveGame,
    teamEventsById,
  ]);

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

    if (timestamps.length === 0) {
      return null;
    }

    return Math.max(...timestamps);
  }, [selectedSports, syncStatusBySport]);

  const lastUpdatedLabel = useMemo(
    () => formatLastSynced(lastUpdatedAt),
    [lastUpdatedAt],
  );

  const compactEvents = useMemo(() => {
    const events = [
      ...displayEnabledTeams.flatMap((team) => [
        ...(displayTeamEventsById[team.teamId]?.next ?? []),
        ...(displayTeamEventsById[team.teamId]?.last ?? []),
      ]),
      ...displayTodayEvents,
    ];
    const trackedEvents = events.filter((event) =>
      displayEnabledTeams.some(
        (team) =>
          resolveTrackedTeamSide(event, team.teamId, team.name) !== null,
      ),
    );
    const seen = new Set<string>();
    return trackedEvents.filter((event) => {
      if (seen.has(event.eventId)) return false;
      seen.add(event.eventId);
      return true;
    });
  }, [displayEnabledTeams, displayTodayEvents, displayTeamEventsById]);

  const localToday = getLocalDateKey(new Date());
  const eligibleTodayEvents = getEligibleTodayGames(compactEvents, localToday);
  const liveTodayCount = eligibleTodayEvents.filter(
    (event) =>
      getGamePhase(event) === "live" || getGamePhase(event) === "scheduled",
  ).length;
  const sportsPolicy = getSportsContentPolicy({
    size,
    viewMode: config.viewMode,
    liveGameCount: liveTodayCount,
    teamCount: displayEnabledTeams.length,
    eventCount: eligibleTodayEvents.length,
  });

  useEffect(() => {
    if (
      selectedGameId &&
      eligibleTodayEvents.some((event) => event.eventId === selectedGameId)
    ) {
      return;
    }
    const nextGame = eligibleTodayEvents.find(
      (event) =>
        getGamePhase(event) === "live" || getGamePhase(event) === "scheduled",
    );
    setSelectedGameId(nextGame?.eventId ?? null);
  }, [eligibleTodayEvents, selectedGameId]);

  const refreshNow = async (): Promise<void> => {
    setRefreshing(true);
    try {
      const results = (await Promise.all(
        selectedSports.map((sport) =>
          window.api.invoke(IPC.SPORTS_REFRESH, { sport }),
        ),
      )) as IpcMutationResult[];
      const failed = results.find((result) => !result.ok);
      if (failed) {
        toast.error(failed.error ?? "Failed to refresh Sports data.");
        return;
      }
      toast.success("Sports data refresh complete.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to refresh Sports data.",
      );
    } finally {
      setRefreshing(false);
    }
  };

  function handleOpenEdit(): void {
    const currentHeight =
      cardContentRef.current?.getBoundingClientRect().height;
    if (currentHeight && currentHeight > 0) {
      setEditContentHeight(currentHeight);
    }
    setSnapshotConfig(config);
    setIsEditing(true);
  }

  function handleClose(): void {
    setIsEditing(false);
    setEditContentHeight(null);
    setSnapshotConfig(config);
  }

  function handleReset(): void {
    setConfig(snapshotConfig);
  }

  function handleFactoryReset(): void {
    setConfig(DEFAULT_SPORTS_VIEW_CONFIG);
    setSnapshotConfig(DEFAULT_SPORTS_VIEW_CONFIG);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg">{widgetTitle}</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Daily schedule and tracked teams for {sportLabel}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-muted-foreground">
              Updated: {lastUpdatedLabel}
            </p>
            {import.meta.env.DEV ? (
              <button
                type="button"
                className="rounded border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={() => setShowDevMockLiveGame((value) => !value)}
                aria-label="Toggle mock live game"
                title="Toggle mock live game"
              >
                {showDevMockLiveGame ? "Mock On" : "Mock Off"}
              </button>
            ) : null}
            <button
              type="button"
              className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
              onClick={() => void refreshNow()}
              disabled={refreshing}
              aria-label="Refresh sports data"
            >
              <RefreshCcw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
            {isEditing ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={handleReset}
                  title="Reset to when you opened this"
                  aria-label="Reset settings"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                      title="Restore defaults"
                      aria-label="Restore default settings"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore Defaults</AlertDialogTitle>
                      <AlertDialogDescription>
                        Reset all Sports widget settings to their defaults? This
                        cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleFactoryReset}>
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button
                  type="button"
                  className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  onClick={handleClose}
                  title="Close settings"
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                onClick={handleOpenEdit}
                aria-label="Sports widget settings"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent
        ref={cardContentRef}
        className="pt-0"
        style={
          isEditing && editContentHeight
            ? { height: editContentHeight, overflow: "hidden" }
            : undefined
        }
      >
        {isEditing ? (
          <div className="sports-card-edit">
            <div className="sports-card-edit__preview">
              {loading ? (
                <p className="text-sm text-muted-foreground">
                  Loading sports data...
                </p>
              ) : size === "small" ? (
                <CompactSportsView
                  events={compactEvents}
                  teams={displayEnabledTeams}
                  teamEventsById={displayTeamEventsById}
                  selectedGameId={selectedGameId}
                  onSelectGame={setSelectedGameId}
                />
              ) : size === "medium" || size === "large" ? (
                <div className="space-y-3">
                  <MediumLiveGameView
                    events={eligibleTodayEvents}
                    teams={displayEnabledTeams}
                    teamEventsById={displayTeamEventsById}
                    selectedGameId={selectedGameId}
                    onSelectGame={setSelectedGameId}
                  />
                  {config.viewMode === "all_games" ? (
                    <AllGamesView
                      events={displayTodayEvents.slice(
                        0,
                        sportsPolicy.eventLimit,
                      )}
                      leaguesById={displayLeaguesById}
                      showTime={config.showTime}
                      showVenue={config.showVenue}
                      showLiveStartTime={config.showLiveStartTime}
                      fallbackEvents={fallbackEvents}
                      showSportLabels={showSportLabels}
                    />
                  ) : (
                    <MyTeamsView
                      teams={displayEnabledTeams.slice(
                        0,
                        sportsPolicy.teamLimit,
                      )}
                      teamEventsById={displayTeamEventsById}
                      leaguesById={displayLeaguesById}
                      showVenue={config.showVenue}
                      showTime={config.showTime}
                      showLiveStartTime={config.showLiveStartTime}
                      viewMode={config.viewMode}
                      showSportLabels={showSportLabels}
                      hideTodayGameCards
                    />
                  )}
                </div>
              ) : config.viewMode === "all_games" ? (
                <AllGamesView
                  events={displayTodayEvents.slice(0, sportsPolicy.eventLimit)}
                  leaguesById={displayLeaguesById}
                  showTime={config.showTime}
                  showVenue={config.showVenue}
                  showLiveStartTime={config.showLiveStartTime}
                  fallbackEvents={fallbackEvents}
                  showSportLabels={showSportLabels}
                />
              ) : (
                <MyTeamsView
                  teams={displayEnabledTeams.slice(0, sportsPolicy.teamLimit)}
                  teamEventsById={displayTeamEventsById}
                  leaguesById={displayLeaguesById}
                  showVenue={config.showVenue}
                  showTime={config.showTime}
                  showLiveStartTime={config.showLiveStartTime}
                  viewMode={config.viewMode}
                  showSportLabels={showSportLabels}
                  hideTodayGameCards
                />
              )}
            </div>
            <div className="sports-card-edit__panel">
              <SportsSettingsPanel
                config={config}
                setConfig={setConfig}
                sizeControl={
                  <WidgetSizeControl
                    size={size}
                    editMode={editMode}
                    onChange={onSizeChange}
                  />
                }
              />
            </div>
          </div>
        ) : loading ? (
          <p className="text-sm text-muted-foreground">
            Loading sports data...
          </p>
        ) : size === "small" ? (
          <CompactSportsView
            events={compactEvents}
            teams={displayEnabledTeams}
            teamEventsById={displayTeamEventsById}
            selectedGameId={selectedGameId}
            onSelectGame={setSelectedGameId}
          />
        ) : size === "medium" ? (
          <div className="space-y-3">
            <MediumLiveGameView
              events={eligibleTodayEvents}
              teams={displayEnabledTeams}
              teamEventsById={displayTeamEventsById}
              selectedGameId={selectedGameId}
              onSelectGame={setSelectedGameId}
            />
            {config.viewMode === "all_games" ? (
              <AllGamesView
                events={displayTodayEvents.slice(0, sportsPolicy.eventLimit)}
                leaguesById={displayLeaguesById}
                showTime={config.showTime}
                showVenue={config.showVenue}
                showLiveStartTime={config.showLiveStartTime}
                fallbackEvents={fallbackEvents}
                showSportLabels={showSportLabels}
              />
            ) : (
              <MyTeamsView
                teams={displayEnabledTeams.slice(0, sportsPolicy.teamLimit)}
                teamEventsById={displayTeamEventsById}
                leaguesById={displayLeaguesById}
                showVenue={config.showVenue}
                showTime={config.showTime}
                showLiveStartTime={config.showLiveStartTime}
                viewMode={config.viewMode}
                showSportLabels={showSportLabels}
                showTeamCarousel={sportsPolicy.showTeamCarousel}
                hideTodayGameCards
              />
            )}
          </div>
        ) : size === "large" ? (
          <div className="space-y-3">
            <MediumLiveGameView
              events={eligibleTodayEvents}
              teams={displayEnabledTeams}
              teamEventsById={displayTeamEventsById}
              selectedGameId={selectedGameId}
              onSelectGame={setSelectedGameId}
            />
            {config.viewMode === "all_games" ? (
              <AllGamesView
                events={displayTodayEvents.slice(0, sportsPolicy.eventLimit)}
                leaguesById={displayLeaguesById}
                showTime={config.showTime}
                showVenue={config.showVenue}
                showLiveStartTime={config.showLiveStartTime}
                fallbackEvents={fallbackEvents}
                showSportLabels={showSportLabels}
              />
            ) : (
              <MyTeamsView
                teams={displayEnabledTeams.slice(0, sportsPolicy.teamLimit)}
                teamEventsById={displayTeamEventsById}
                leaguesById={displayLeaguesById}
                showVenue={config.showVenue}
                showTime={config.showTime}
                showLiveStartTime={config.showLiveStartTime}
                viewMode={config.viewMode}
                showSportLabels={showSportLabels}
                showTeamCarousel={sportsPolicy.showTeamCarousel}
                hideTodayGameCards
              />
            )}
          </div>
        ) : config.viewMode === "all_games" ? (
          <AllGamesView
            events={displayTodayEvents.slice(0, sportsPolicy.eventLimit)}
            leaguesById={displayLeaguesById}
            showTime={config.showTime}
            showVenue={config.showVenue}
            showLiveStartTime={config.showLiveStartTime}
            fallbackEvents={fallbackEvents}
            showSportLabels={showSportLabels}
          />
        ) : (
          <MyTeamsView
            teams={displayEnabledTeams.slice(0, sportsPolicy.teamLimit)}
            teamEventsById={displayTeamEventsById}
            leaguesById={displayLeaguesById}
            showVenue={config.showVenue}
            showTime={config.showTime}
            showLiveStartTime={config.showLiveStartTime}
            viewMode={config.viewMode}
            showSportLabels={showSportLabels}
            showTeamCarousel={sportsPolicy.showTeamCarousel}
          />
        )}
      </CardContent>
    </Card>
  );
}

export default SportsWidget;
