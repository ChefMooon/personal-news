import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { IPC, type IpcMutationResult } from "../../../../shared/ipc-types";

interface LocationRefreshError {
  locationId: string;
  message: string;
}

export function useWeatherRefresh(locationId: string | null): {
  refreshing: boolean;
  error: string | null;
  refreshNow: () => Promise<void>;
} {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] =
    useState<LocationRefreshError | null>(null);
  const lastManualRefreshAt = useRef<number | null>(null);
  const error =
    locationId != null && refreshError?.locationId === locationId
      ? refreshError.message
      : null;

  const refreshNow = useCallback(async (): Promise<void> => {
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
        locationId,
      )) as IpcMutationResult;
      if (!result.ok) {
        const message = result.error ?? "Failed to refresh weather data.";
        setRefreshError({ locationId: locationId ?? "", message });
        toast.error(message);
      } else {
        setRefreshError(null);
        toast.success("Weather data refreshed.");
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to refresh weather data.";
      setRefreshError({ locationId: locationId ?? "", message });
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  }, [locationId]);

  return { refreshing, error, refreshNow };
}
