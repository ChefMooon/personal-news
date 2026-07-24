import { useState, useEffect } from "react";
import { toast } from "sonner";
import type { NtfyStaleness } from "../../../shared/ipc-types";
import { IPC } from "../../../shared/ipc-types";

export function useNtfyStaleness(): NtfyStaleness & {
  loading: boolean;
  refetch: () => void;
} {
  const [data, setData] = useState<NtfyStaleness>({
    lastPolledAt: null,
    isStale: false,
    topicConfigured: false,
    summary: null,
  });
  const [loading, setLoading] = useState(true);

  const fetch = (): void => {
    setLoading(true);
    window.api
      .invoke(IPC.REDDIT_GET_NTFY_STALENESS)
      .then((result) => {
        setData(result as NtfyStaleness);
      })
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to load ntfy staleness status.",
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetch();
  }, []);

  useEffect(() => {
    const listener = (): void => {
      fetch();
    };
    return window.api.on(IPC.REDDIT_NTFY_INGEST_COMPLETE, listener);
  }, []);

  return { ...data, loading, refetch: fetch };
}
