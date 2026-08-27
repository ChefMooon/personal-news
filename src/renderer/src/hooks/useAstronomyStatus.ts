import { useCallback, useEffect, useState } from "react";
import { IPC, type AstronomyStatus } from "../../../shared/ipc-types";

/**
 * Dedicated Astronomy status hook. Returns null while the app-level feature is
 * disabled; failures surface as a null status without toasts because passive
 * status data must not spam the user.
 */
export function useAstronomyStatus(enabled: boolean): {
  status: AstronomyStatus | null;
  refetch: () => void;
} {
  const [status, setStatus] = useState<AstronomyStatus | null>(null);

  const refetch = useCallback(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    window.api
      .invoke(IPC.ASTRONOMY_GET_STATUS)
      .then((data) => {
        setStatus((data as AstronomyStatus | null) ?? null);
      })
      .catch(() => {
        setStatus(null);
      });
  }, [enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { status, refetch };
}
