import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  MoonStar,
  RefreshCcw,
  RotateCcw,
  Settings2,
  X,
} from "lucide-react";
import { useWidgetInstance } from "../../contexts/WidgetInstanceContext";
import { useAstronomyEnabled } from "../../contexts/AstronomyEnabledContext";
import {
  DEFAULT_ASTRONOMY_VIEW_CONFIG,
  resolveAstronomyLocationId,
  shouldFallbackToWeatherDefault,
  useAstronomyConfig,
  type AstronomyViewConfig,
} from "../../hooks/useAstronomyConfig";
import { useAstronomySnapshot } from "../../hooks/useAstronomySnapshot";
import { useAstronomyStatus } from "../../hooks/useAstronomyStatus";
import { useNowMilliseconds } from "../../hooks/useNowMilliseconds";
import { useWeatherLocations } from "../../hooks/useWeatherLocations";
import { useWeatherSettings } from "../../hooks/useWeatherSettings";
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
import { WidgetSizeControl } from "../../components/WidgetSizeControl";
import { registerRendererModule } from "../registry";
import { IPC, type AstronomyRefreshResult } from "../../../../shared/ipc-types";
import { getAstronomyContentPolicy } from "./astronomy-content-policy";
import { AstronomySmall } from "./AstronomySmall";
import { AstronomyMedium } from "./AstronomyMedium";
import { AstronomyLarge } from "./AstronomyLarge";
import { AstronomySettingsPanel } from "./AstronomySettingsPanel";
import { formatCalculatedAt } from "./astronomy-display";

function AstronomyWidget(): React.ReactElement {
  const {
    instanceId,
    label,
    size,
    editMode,
    onSizeChange,
    onRuntimeRowsChange,
  } = useWidgetInstance();
  const widgetTitle = label ?? "Astronomy";
  const navigate = useNavigate();
  const { enabled: featureEnabled } = useAstronomyEnabled();
  const { config, setConfig } = useAstronomyConfig(instanceId);
  const { locations, loading: locationsLoading } = useWeatherLocations();
  const { settings: weatherSettings, loading: settingsLoading } =
    useWeatherSettings();

  const effectiveLocationId = resolveAstronomyLocationId(
    config.locationId,
    locations,
    weatherSettings.defaultLocationId,
  );
  const selectedLocation =
    locations.find((location) => location.id === effectiveLocationId) ?? null;
  const timezone = selectedLocation?.timezone ?? null;

  const { snapshot, loading } = useAstronomySnapshot(
    effectiveLocationId,
    featureEnabled,
  );
  const { refetch: refetchStatus } = useAstronomyStatus(featureEnabled);

  const [isEditing, setIsEditing] = useState(false);
  const [snapshotConfig, setSnapshotConfig] =
    useState<AstronomyViewConfig | null>(null);
  const [editContentHeight, setEditContentHeight] = useState<number | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [disclosed, setDisclosed] = useState(false);
  const [contentWidth, setContentWidth] = useState<number | null>(null);
  const lastManualRefreshAt = useRef<number | null>(null);
  const cardContentRef = useRef<HTMLDivElement | null>(null);
  const contentViewportRef = useRef<HTMLDivElement | null>(null);
  const previousSizeRef = useRef(size);
  useEffect(() => {
    if (previousSizeRef.current === size) return;
    previousSizeRef.current = size;
    if (isEditing) setEditContentHeight(null);
  }, [isEditing, size]);

  const contentPolicy = getAstronomyContentPolicy({
    size,
    savedViewMode: config.viewMode,
    availableWidth: contentWidth,
    snapshot,
  });

  useEffect(() => {
    const content = contentViewportRef.current;
    if (!content) return;
    const updateWidth = (): void => {
      setContentWidth(content.getBoundingClientRect().width);
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(content);
    return () => observer.disconnect();
  }, [size, isEditing]);

  useEffect(() => {
    if (isEditing || !contentPolicy.measureRuntimeRows) {
      onRuntimeRowsChange(0);
      return;
    }

    const content = contentViewportRef.current;
    if (!content) return;

    const baselineRows = size === "medium" ? 8 : 12;
    const baselineContentHeight = baselineRows * 56 - 80;
    const updateRows = (): void => {
      const extraRows = Math.max(
        0,
        Math.ceil((content.scrollHeight - baselineContentHeight) / 56),
      );
      onRuntimeRowsChange(extraRows);
    };

    updateRows();
    const observer = new ResizeObserver(updateRows);
    observer.observe(content);
    return () => observer.disconnect();
  }, [
    contentPolicy.measureRuntimeRows,
    contentWidth,
    disclosed,
    isEditing,
    onRuntimeRowsChange,
    size,
    snapshot,
  ]);

  const nowMilliseconds = useNowMilliseconds(
    featureEnabled && snapshot != null,
  );
  const nowSeconds = Math.floor(nowMilliseconds / 1000);

  // Persist the corrected instance configuration when the configured location
  // was removed and a valid Weather default can replace it.
  useEffect(() => {
    if (!featureEnabled || locationsLoading || settingsLoading) return;
    if (
      !shouldFallbackToWeatherDefault(
        config.locationId,
        locations,
        weatherSettings.defaultLocationId,
      )
    ) {
      return;
    }
    setConfig({ ...config, locationId: weatherSettings.defaultLocationId });
  }, [
    featureEnabled,
    config,
    setConfig,
    locations,
    locationsLoading,
    settingsLoading,
    weatherSettings.defaultLocationId,
  ]);

  useEffect(() => {
    if (!isEditing) return;
    const handler = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isEditing]);

  const calculatedLabel = formatCalculatedAt(
    snapshot?.calculatedAt ?? null,
    timezone,
    weatherSettings.timeFormat,
  );

  const refreshNow = async (): Promise<void> => {
    if (!featureEnabled || !effectiveLocationId) return;
    const now = Date.now();
    if (
      lastManualRefreshAt.current != null &&
      now - lastManualRefreshAt.current < 60_000
    ) {
      const secsLeft = Math.ceil(
        (60_000 - (now - lastManualRefreshAt.current)) / 1000,
      );
      toast.warning(`Please wait ${secsLeft}s before refreshing again.`);
      return;
    }

    setRefreshing(true);
    lastManualRefreshAt.current = now;
    try {
      const result = (await window.api.invoke(
        IPC.ASTRONOMY_REFRESH,
        effectiveLocationId,
      )) as AstronomyRefreshResult;
      if (!result.ok) {
        toast.error(result.error ?? "Failed to refresh astronomy data.");
        return;
      }
      refetchStatus();
      toast.success(
        result.refreshedCount > 0
          ? "Astronomy data refreshed."
          : "No astronomy data was refreshed.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to refresh astronomy data.",
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
    setSnapshotConfig(null);
    setEditContentHeight(null);
  }

  function handleReset(): void {
    if (snapshotConfig) {
      setConfig(snapshotConfig);
    }
  }

  function handleFactoryReset(): void {
    setConfig(DEFAULT_ASTRONOMY_VIEW_CONFIG);
    setSnapshotConfig(DEFAULT_ASTRONOMY_VIEW_CONFIG);
  }

  const openDetails = (): void => {
    if (effectiveLocationId) {
      navigate(
        `/astronomy/details?locationId=${encodeURIComponent(effectiveLocationId)}`,
      );
    }
  };

  const preview = (
    <div
      ref={contentViewportRef}
      className="astronomy-content-viewport flex min-h-0 min-w-0 flex-1 flex-col space-y-3"
    >
      {!effectiveLocationId ? (
        <div className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
          No saved Weather location available. Save a location in Settings -
          Weather or choose one in this widget's settings.
        </div>
      ) : loading && !snapshot ? (
        <p className="text-sm text-muted-foreground">Loading astronomy...</p>
      ) : (
        <>
          {!snapshot && (
            <div className="rounded-md border border-dashed px-4 py-3 text-xs text-muted-foreground">
              No cached astronomy data for this location yet. Use the refresh
              action or wait for the next scheduled update.
            </div>
          )}
          {size === "small" ? (
            <AstronomySmall
              astronomy={snapshot}
              timezone={timezone}
              timeFormat={weatherSettings.timeFormat}
              nowSeconds={nowSeconds}
            />
          ) : size === "medium" ? (
            <AstronomyMedium
              astronomy={snapshot}
              timezone={timezone}
              timeFormat={weatherSettings.timeFormat}
              nowSeconds={nowSeconds}
              eventLimit={contentPolicy.eventLimit ?? 3}
              stacked={contentPolicy.stacked}
            />
          ) : (
            <AstronomyLarge
              astronomy={snapshot}
              timezone={timezone}
              timeFormat={weatherSettings.timeFormat}
              nowSeconds={nowSeconds}
              detailed={contentPolicy.effectiveViewMode === "detailed"}
            />
          )}
          {contentPolicy.detailsAvailable && (
            <div className="flex justify-end pt-1">
              <button
                type="button"
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setDisclosed(true);
                  openDetails();
                }}
                disabled={!effectiveLocationId}
              >
                {disclosed ? "Open full details" : "Details"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <Card className="flex min-h-0 flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MoonStar className="h-5 w-5 text-indigo-400" />
              {widgetTitle}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && (
              <>
                <p className="text-[11px] text-muted-foreground">
                  Calculated: {calculatedLabel ?? "Never"}
                </p>
                <button
                  type="button"
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  onClick={() => void refreshNow()}
                  disabled={refreshing || !effectiveLocationId}
                  aria-label="Refresh astronomy data"
                >
                  <RefreshCcw
                    className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
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
                  title="Reset to when you opened this"
                  aria-label="Reset settings"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
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
                        Reset all Astronomy widget settings to their defaults?
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
                  title="Close settings"
                  aria-label="Close settings"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Astronomy widget settings"
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
        className="astronomy-card-content flex min-h-0 flex-1 flex-col overflow-hidden"
        style={
          isEditing && editContentHeight
            ? { height: editContentHeight, overflow: "hidden" }
            : undefined
        }
      >
        <div className={isEditing ? "astronomy-card-edit" : undefined}>
          <div
            className={
              isEditing
                ? "astronomy-card-edit__preview"
                : "flex min-h-0 flex-1 flex-col"
            }
          >
            {preview}
          </div>
          {isEditing && (
            <div className="astronomy-card-edit__panel">
              <AstronomySettingsPanel
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
                defaultLocationId={weatherSettings.defaultLocationId}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

registerRendererModule({
  id: "astronomy",
  displayName: "Astronomy",
  widget: AstronomyWidget,
});

export default AstronomyWidget;
