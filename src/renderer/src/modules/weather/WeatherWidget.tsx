import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CloudSun, RefreshCcw, RotateCcw, Settings2, X } from "lucide-react";
import { useWidgetInstance } from "../../contexts/WidgetInstanceContext";
import { useAstronomyEnabled } from "../../contexts/AstronomyEnabledContext";
import {
  DEFAULT_WEATHER_VIEW_CONFIG,
  useWeatherConfig,
} from "../../hooks/useWeatherConfig";
import { useWeatherLocations } from "../../hooks/useWeatherLocations";
import { useWeatherSettings } from "../../hooks/useWeatherSettings";
import { useWeatherSnapshot } from "../../hooks/useWeatherSnapshot";
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
import { WeatherSettingsPanel } from "./WeatherSettingsPanel";
import { WidgetSizeControl } from "../../components/WidgetSizeControl";
import { WeatherSmall } from "./WeatherSmall";
import { WeatherMedium } from "./WeatherMedium";
import { WeatherLarge } from "./WeatherLarge";
import { getWeatherContentPolicy } from "./weather-content-policy";
import { registerRendererModule } from "../registry";
import type { WeatherViewConfig } from "../../../../shared/ipc-types";
import { IPC, type IpcMutationResult } from "../../../../shared/ipc-types";

function formatLastSynced(
  timestamp: number | null,
  timeFormat: string,
): string {
  if (timestamp == null) return "Never";
  return new Date(timestamp * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: timeFormat === "system" ? undefined : timeFormat === "12h",
  });
}

function WeatherWidget(): React.ReactElement {
  const { instanceId, label, size, editMode, onSizeChange } =
    useWidgetInstance();
  const { config, setConfig } = useWeatherConfig(instanceId);
  const { enabled: astronomyFeatureEnabled } = useAstronomyEnabled();
  const { locations, search, saveLocation } = useWeatherLocations();
  const { settings } = useWeatherSettings();
  const effectiveLocationId = config.locationId ?? settings.defaultLocationId;
  const { snapshot, loading } = useWeatherSnapshot(effectiveLocationId);
  const [isEditing, setIsEditing] = useState(false);
  const [snapshotConfig, setSnapshotConfig] =
    useState<WeatherViewConfig | null>(null);
  const [editContentHeight, setEditContentHeight] = useState<number | null>(
    null,
  );
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [contentWidth, setContentWidth] = useState<number | undefined>();
  const lastManualRefreshAt = useRef<number | null>(null);
  const cardContentRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setAlertDismissed(false);
  }, [snapshot?.fetchedAt]);
  useEffect(() => {
    const element = cardContentRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setContentWidth(entry.contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!isEditing) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing]);
  const astronomyVisible = astronomyFeatureEnabled && config.showAstronomy;
  const alertsEnabled = Boolean(
    settings.showAlertsInWidgets && config.showAlerts,
  );
  const policy = getWeatherContentPolicy(
    size,
    config,
    astronomyVisible,
    Boolean(snapshot?.alerts.length && alertsEnabled),
    contentWidth,
  );
  const updateHourlyMetric = (
    hourlyMetric: WeatherViewConfig["hourlyMetric"],
  ): void => setConfig({ ...config, hourlyMetric });
  const refreshNow = async (): Promise<void> => {
    const now = Date.now();
    if (
      lastManualRefreshAt.current != null &&
      now - lastManualRefreshAt.current < 60_000
    ) {
      toast.warning(
        `Please wait ${Math.ceil((60_000 - (now - lastManualRefreshAt.current)) / 1000)}s before refreshing again.`,
      );
      return;
    }
    setRefreshing(true);
    lastManualRefreshAt.current = now;
    try {
      const result = (await window.api.invoke(
        IPC.WEATHER_REFRESH,
        effectiveLocationId,
      )) as IpcMutationResult;
      if (!result.ok)
        toast.error(result.error ?? "Failed to refresh weather data.");
      else toast.success("Weather data refreshed.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to refresh weather data.",
      );
    } finally {
      setRefreshing(false);
    }
  };
  const handleOpenEdit = (): void => {
    const height = cardContentRef.current?.getBoundingClientRect().height;
    if (height && height > 0) setEditContentHeight(height);
    setSnapshotConfig(config);
    setIsEditing(true);
  };
  const handleClose = (): void => {
    setIsEditing(false);
    setSnapshotConfig(null);
    setEditContentHeight(null);
  };
  const handleReset = (): void => {
    if (snapshotConfig) setConfig(snapshotConfig);
  };
  const handleFactoryReset = (): void => {
    setConfig(DEFAULT_WEATHER_VIEW_CONFIG);
    setSnapshotConfig(DEFAULT_WEATHER_VIEW_CONFIG);
  };
  const layoutProps = snapshot
    ? {
        snapshot,
        config,
        settings,
        policy,
        alertDismissed,
        onDismissAlert: () => setAlertDismissed(true),
        onMetricChange: updateHourlyMetric,
      }
    : null;
  const preview = !effectiveLocationId ? (
    <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
      Choose a location in widget settings, or set a default location in
      Settings - Weather.
    </div>
  ) : loading ? (
    <p className="text-sm text-muted-foreground">Loading weather...</p>
  ) : !layoutProps ? (
    <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
      No weather data cached yet. Use Settings - Weather to refresh now, or wait
      for the next scheduled update.
    </div>
  ) : size === "small" ? (
    <WeatherSmall {...layoutProps} />
  ) : size === "medium" ? (
    <WeatherMedium {...layoutProps} />
  ) : (
    <WeatherLarge {...layoutProps} />
  );
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-2 text-base">
            <CloudSun className="h-5 w-5 shrink-0 text-sky-500" />
            {label ?? "Weather"}
          </CardTitle>
          <div className="flex shrink-0 items-center gap-2">
            {!isEditing && (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Updated:{" "}
                  {formatLastSynced(
                    snapshot?.fetchedAt ?? null,
                    settings.timeFormat,
                  )}
                </p>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => void refreshNow()}
                  disabled={refreshing}
                  aria-label="Refresh weather data"
                >
                  <RefreshCcw
                    className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                  />
                </button>
              </>
            )}
            {isEditing ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={handleReset}
                  aria-label="Reset settings"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      aria-label="Restore default settings"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Restore Defaults</AlertDialogTitle>
                      <AlertDialogDescription>
                        Reset all Weather widget settings to their defaults?
                        This cannot be undone.
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
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={handleClose}
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Weather widget settings"
                onClick={handleOpenEdit}
              >
                <Settings2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent
        ref={cardContentRef}
        style={
          isEditing && editContentHeight
            ? { height: editContentHeight, overflow: "hidden" }
            : undefined
        }
      >
        <div className={isEditing ? "weather-card-edit" : undefined}>
          <div className={isEditing ? "weather-card-edit__preview" : undefined}>
            {preview}
          </div>
          {isEditing && (
            <div className="weather-card-edit__panel">
              <WeatherSettingsPanel
                config={config}
                onChange={setConfig}
                sizeControl={
                  <WidgetSizeControl
                    size={size}
                    editMode={editMode}
                    onChange={onSizeChange}
                  />
                }
                locations={locations}
                defaultLocationId={settings.defaultLocationId}
                settings={settings}
                onSearch={search}
                onSaveLocation={saveLocation}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

registerRendererModule({
  id: "weather",
  displayName: "Weather",
  widget: WeatherWidget,
});
export default WeatherWidget;
