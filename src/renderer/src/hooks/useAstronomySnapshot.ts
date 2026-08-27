import { useCallback, useEffect, useState } from "react";
import { IPC, type AstronomySnapshot } from "../../../shared/ipc-types";

/**
 * Dedicated Astronomy snapshot hook. Reads only through the Astronomy IPC
 * channels; when the app-level feature is disabled no read or subscription is
 * made and the snapshot reads as null. Refresh failures keep the previous
 * snapshot while detailed errors stay in main-process logs.
 */
export function useAstronomySnapshot(
  locationId: string | null,
  enabled: boolean,
): {
  snapshot: AstronomySnapshot | null;
  loading: boolean;
  refetch: () => void;
} {
  const [snapshot, setSnapshot] = useState<AstronomySnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(() => {
    if (!enabled || !locationId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    window.api
      .invoke(IPC.ASTRONOMY_GET_SNAPSHOT, locationId)
      .then((data) => {
        setSnapshot((data as AstronomySnapshot | null) ?? null);
      })
      .catch(() => {
        // Keep the previous snapshot; main process retains detailed errors.
      })
      .finally(() => {
        setLoading(false);
      });
  }, [locationId, enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;
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
  }, [enabled, locationId, refetch]);

  return { snapshot, loading, refetch };
}
