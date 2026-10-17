import React, { useMemo } from "react";
import { ArrowLeft, MoonStar } from "lucide-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAstronomyEnabled } from "../contexts/AstronomyEnabledContext";
import { useAstronomySnapshot } from "../hooks/useAstronomySnapshot";
import { resolveAstronomyLocationId } from "../hooks/useAstronomyConfig";
import { useWeatherLocations } from "../hooks/useWeatherLocations";
import { useWeatherSettings } from "../hooks/useWeatherSettings";
import { useNowMilliseconds } from "../hooks/useNowMilliseconds";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { AstronomyDetailedPrimitives } from "../modules/astronomy/AstronomyPrimitives";

function locationLabel(location: {
  name: string;
  admin1: string | null;
  country: string | null;
}): string {
  return [location.name, location.admin1, location.country]
    .filter(Boolean)
    .join(", ");
}

export default function AstronomyDetails(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { enabled, loading: astronomyEnabledLoading } = useAstronomyEnabled();
  const { locations, loading: locationsLoading } = useWeatherLocations();
  const { settings, loading: settingsLoading } = useWeatherSettings();
  const requestedLocationId = searchParams.get("locationId");
  const locationId = useMemo(
    () =>
      resolveAstronomyLocationId(
        requestedLocationId,
        locations,
        settings.defaultLocationId,
      ),
    [locations, requestedLocationId, settings.defaultLocationId],
  );
  const location = locations.find((entry) => entry.id === locationId) ?? null;
  const { snapshot, loading } = useAstronomySnapshot(
    locationId,
    enabled && !astronomyEnabledLoading,
  );
  const nowMilliseconds = useNowMilliseconds(enabled && snapshot != null);

  if (astronomyEnabledLoading) {
    return <></>;
  }
  if (!enabled) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-w-0 w-full p-4 md:p-6">
      <Card className="min-w-0">
        <CardHeader className="border-b">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex min-w-0 items-center gap-2 text-lg">
              <MoonStar
                className="h-5 w-5 shrink-0 text-indigo-400"
                aria-hidden="true"
              />
              <span className="truncate">Astronomy details</span>
            </CardTitle>
            <button
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
              onClick={() => navigate(-1)}
              aria-label="Return to previous page"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Return
            </button>
          </div>
          <div className="min-w-0 space-y-1 text-sm text-muted-foreground">
            <p className="break-words">
              {location ? locationLabel(location) : "Weather default location"}
            </p>
            <p className="break-all text-xs">
              Timezone: {location?.timezone ?? "Unavailable"}
            </p>
          </div>
        </CardHeader>
        <CardContent className="min-w-0 pt-5">
          {locationsLoading || settingsLoading || loading ? (
            <p className="text-sm text-muted-foreground">
              Loading astronomy...
            </p>
          ) : !locationId ? (
            <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
              No saved Weather location is available.
            </p>
          ) : !snapshot ? (
            <p className="rounded-md border border-dashed px-4 py-5 text-sm text-muted-foreground">
              No cached astronomy data is available for this location yet.
            </p>
          ) : (
            <div className="min-w-0 overflow-y-auto">
              <AstronomyDetailedPrimitives
                astronomy={snapshot}
                timezone={location?.timezone ?? null}
                timeFormat={settings.timeFormat}
                nowSeconds={Math.floor(nowMilliseconds / 1000)}
                fullSnapshot
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
