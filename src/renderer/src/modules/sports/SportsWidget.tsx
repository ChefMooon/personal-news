import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, RefreshCcw, RotateCcw, Settings2, X } from "lucide-react";
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
import { Button } from "../../components/ui/button";
import { useWidgetInstance } from "../../contexts/WidgetInstanceContext";
import {
  DEFAULT_SPORTS_VIEW_CONFIG,
  useSportsViewConfig,
} from "../../hooks/useSportsViewConfig";
import {
  ALL_SPORTS_ID,
  SUPPORTED_SPORTS,
  getSportLabel,
} from "../../../../shared/sports";
import { AllGamesView } from "./AllGamesView";
import { CompactSportsView } from "./CompactSportsView";
import { MediumLiveGameView } from "./MediumLiveGameView";
import { MyTeamsView } from "./MyTeamsView";
import { SportsSettingsPanel } from "./SportsSettingsPanel";
import { WidgetSizeControl } from "../../components/WidgetSizeControl";
import { getSportsContentPolicy } from "./sports-content-policy";
import { SportsMediumLayout } from "./SportsMediumLayout";
import { useSportsWidgetData } from "./useSportsWidgetData";
import { getGamePhase } from "./utils";

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
  const {
    todayEvents,
    teamEventsById,
    loading,
    refreshing,
    refreshError,
    refreshNow,
    leaguesById,
    enabledTeams,
    fallbackEvents,
    lastUpdatedLabel,
    compactEvents,
    eligibleTodayEvents,
  } = useSportsWidgetData(selectedSports);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [snapshotConfig, setSnapshotConfig] = useState(config);
  const [editContentHeight, setEditContentHeight] = useState<number | null>(
    null,
  );
  const cardContentRef = useRef<HTMLDivElement | null>(null);
  const previousSizeRef = useRef(size);
  const [contentWidth, setContentWidth] = useState<number | undefined>();

  useEffect(() => {
    const element = cardContentRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const nextWidth = Math.round(entry.contentRect.width);
      setContentWidth((current) =>
        current === nextWidth ? current : nextWidth,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (previousSizeRef.current === size) return;
    previousSizeRef.current = size;
    if (isEditing) setEditContentHeight(null);
  }, [isEditing, size]);

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

  const liveTodayCount = eligibleTodayEvents.filter(
    (event) =>
      getGamePhase(event) === "live" || getGamePhase(event) === "scheduled",
  ).length;
  const sportsPolicy = getSportsContentPolicy({
    size,
    viewMode: config.viewMode,
    liveGameCount: liveTodayCount,
    teamCount: enabledTeams.length,
    eventCount: eligibleTodayEvents.length,
    contentWidth,
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
    <Card className="flex h-full min-h-0 flex-col overflow-hidden">
      <CardHeader className="shrink-0 pb-3">
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
        className="!overflow-hidden flex min-h-0 flex-1 flex-col pt-0"
        style={
          isEditing && editContentHeight
            ? { height: editContentHeight, overflow: "hidden" }
            : { overflow: "hidden" }
        }
      >
        {refreshError && (
          <div
            className="mb-2 flex shrink-0 items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs"
            role="alert"
          >
            <span className="flex min-w-0 items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="truncate">
                Sports data update failed: {refreshError}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 px-2"
              onClick={() => void refreshNow()}
              disabled={refreshing}
            >
              Retry
            </Button>
          </div>
        )}
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
                  teams={enabledTeams}
                  teamEventsById={teamEventsById}
                  selectedGameId={selectedGameId}
                  onSelectGame={setSelectedGameId}
                />
              ) : size === "medium" || size === "large" ? (
                <div className="space-y-3">
                  <MediumLiveGameView
                    events={eligibleTodayEvents}
                    teams={enabledTeams}
                    teamEventsById={teamEventsById}
                    selectedGameId={selectedGameId}
                    onSelectGame={setSelectedGameId}
                  />
                  {config.viewMode === "all_games" ? (
                    <AllGamesView
                      events={todayEvents.slice(0, sportsPolicy.eventLimit)}
                      leaguesById={leaguesById}
                      showTime={config.showTime}
                      showVenue={config.showVenue}
                      showLiveStartTime={config.showLiveStartTime}
                      fallbackEvents={fallbackEvents}
                      showSportLabels={showSportLabels}
                    />
                  ) : (
                    <MyTeamsView
                      teams={enabledTeams.slice(0, sportsPolicy.teamLimit)}
                      teamEventsById={teamEventsById}
                      leaguesById={leaguesById}
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
                  events={todayEvents.slice(0, sportsPolicy.eventLimit)}
                  leaguesById={leaguesById}
                  showTime={config.showTime}
                  showVenue={config.showVenue}
                  showLiveStartTime={config.showLiveStartTime}
                  fallbackEvents={fallbackEvents}
                  showSportLabels={showSportLabels}
                />
              ) : (
                <MyTeamsView
                  teams={enabledTeams.slice(0, sportsPolicy.teamLimit)}
                  teamEventsById={teamEventsById}
                  leaguesById={leaguesById}
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
            teams={enabledTeams}
            teamEventsById={teamEventsById}
            selectedGameId={selectedGameId}
            onSelectGame={setSelectedGameId}
            fillAvailable
          />
        ) : size === "medium" ? (
          <SportsMediumLayout
            viewMode={config.viewMode}
            todayEvents={todayEvents}
            fallbackEvents={fallbackEvents}
            eligibleTodayEvents={eligibleTodayEvents}
            teams={enabledTeams}
            teamEventsById={teamEventsById}
            leaguesById={leaguesById}
            showTime={config.showTime}
            showVenue={config.showVenue}
            showLiveStartTime={config.showLiveStartTime}
            showSportLabels={showSportLabels}
            showTeamCarousel={sportsPolicy.showTeamCarousel}
            selectedGameId={selectedGameId}
            onSelectGame={setSelectedGameId}
          />
        ) : size === "large" ? (
          <div
            data-sports-layout="large"
            className="flex min-h-0 flex-1 flex-col gap-3"
          >
            <div className="shrink-0">
              <MediumLiveGameView
                events={eligibleTodayEvents}
                teams={enabledTeams}
                teamEventsById={teamEventsById}
                selectedGameId={selectedGameId}
                onSelectGame={setSelectedGameId}
              />
            </div>
            <div
              data-sports-content-viewport="large"
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {config.viewMode === "all_games" ? (
                <AllGamesView
                  events={todayEvents.slice(0, sportsPolicy.eventLimit)}
                  leaguesById={leaguesById}
                  showTime={config.showTime}
                  showVenue={config.showVenue}
                  showLiveStartTime={config.showLiveStartTime}
                  fallbackEvents={fallbackEvents}
                  fallbackEventLimit={Number.POSITIVE_INFINITY}
                  showSportLabels={showSportLabels}
                />
              ) : (
                <MyTeamsView
                  teams={enabledTeams.slice(0, sportsPolicy.teamLimit)}
                  teamEventsById={teamEventsById}
                  leaguesById={leaguesById}
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
          </div>
        ) : config.viewMode === "all_games" ? (
          <AllGamesView
            events={todayEvents.slice(0, sportsPolicy.eventLimit)}
            leaguesById={leaguesById}
            showTime={config.showTime}
            showVenue={config.showVenue}
            showLiveStartTime={config.showLiveStartTime}
            fallbackEvents={fallbackEvents}
            showSportLabels={showSportLabels}
          />
        ) : (
          <MyTeamsView
            teams={enabledTeams.slice(0, sportsPolicy.teamLimit)}
            teamEventsById={teamEventsById}
            leaguesById={leaguesById}
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
