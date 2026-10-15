import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IPC, type WeatherSnapshot } from "../../../shared/ipc-types";

export function useWeatherSnapshot(locationId: string | null): {
  snapshot: WeatherSnapshot | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [result, setResult] = useState<{
    locationId: string;
    snapshot: WeatherSnapshot | null;
  } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [errorState, setErrorState] = useState<{
    locationId: string;
    message: string;
  } | null>(null);
  const requestId = useRef(0);
  const hasSnapshot = locationId != null && result?.locationId === locationId;
  const snapshot = hasSnapshot ? result.snapshot : null;
  const error = errorState?.locationId === locationId ? errorState.message : null;
  const loading = locationId != null && !hasSnapshot && !error;
  const refreshing = locationId != null && hasSnapshot && fetching;

  const refetch = useCallback(() => {
    const id = ++requestId.current;
    if (!locationId) {
      setFetching(false);
      setErrorState(null);
      return;
    }

    setFetching(true);
    setErrorState(null);
    window.api
      .invoke(IPC.WEATHER_GET_SNAPSHOT, locationId)
      .then((data) => {
        if (id === requestId.current) {
          setResult({
            locationId,
            snapshot: (data as WeatherSnapshot | null) ?? null,
          });
        }
      })
      .catch((err) => {
        if (id === requestId.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to load weather data.";
          setErrorState({ locationId, message });
          toast.error(message);
        }
      })
      .finally(() => {
        if (id === requestId.current) setFetching(false);
      });
  }, [locationId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    return window.api.on(IPC.WEATHER_UPDATED, () => {
      refetch();
    });
  }, [refetch]);

  useEffect(() => {
    return window.api.on(IPC.ASTRONOMY_UPDATED, (event) => {
      const locationIds = (event as { locationIds?: string[] }).locationIds;
      if (
        !locationIds ||
        locationId == null ||
        locationIds.includes(locationId)
      ) {
        refetch();
      }
    });
  }, [locationId, refetch]);

  return { snapshot, loading, refreshing, error, refetch };
}
