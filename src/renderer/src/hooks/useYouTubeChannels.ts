import { useState, useEffect, useCallback, useRef } from "react";
import { toast } from "sonner";
import type { YtChannel } from "../../../shared/ipc-types";
import { subscribeToYouTubeUpdated } from "./youtube-updated-subscription";

export function useYouTubeChannels(): {
  channels: YtChannel[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  retry: () => void;
} {
  const [channels, setChannels] = useState<YtChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const hasLoaded = useRef(false);

  const fetch = useCallback(() => {
    const id = ++requestId.current;
    setError(null);
    if (!hasLoaded.current) setLoading(true);
    else setRefreshing(true);
    window.api
      .invoke("youtube:getChannels")
      .then((data) => {
        if (id === requestId.current) {
          setChannels(data as YtChannel[]);
          hasLoaded.current = true;
        }
      })
      .catch((err) => {
        if (id === requestId.current) {
          const message =
            err instanceof Error
              ? err.message
              : "Failed to load YouTube channels.";
          setError(message);
          toast.error(message);
        }
      })
      .finally(() => {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      });
  }, []);

  useEffect(() => {
    fetch();

    // Subscribe to push updates from main process
    // Even though the poller is not active in the prototype, this wires the architecture
    const handler = (): void => {
      fetch();
    };
    return subscribeToYouTubeUpdated(handler);
  }, [fetch]);

  return { channels, loading, refreshing, error, retry: fetch };
}
