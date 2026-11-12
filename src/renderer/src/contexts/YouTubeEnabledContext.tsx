import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { IPC } from "../../../shared/ipc-types";

interface YouTubeEnabledContextValue {
  enabled: boolean;
  loading: boolean;
  setEnabled: (value: boolean) => void;
}

const YouTubeEnabledContext = createContext<YouTubeEnabledContextValue>({
  enabled: true,
  loading: true,
  setEnabled: () => {},
});

export function YouTubeEnabledProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [enabled, setEnabledState] = useState(true);
  const [loading, setLoading] = useState(true);
  const loadGeneration = useRef(0);

  useEffect(() => {
    const load = (): void => {
      const generation = ++loadGeneration.current;
      setLoading(true);
      window.api
        .invoke(IPC.SETTINGS_GET, "youtube_enabled")
        .then((raw) => {
          if (generation !== loadGeneration.current) return;
          setEnabledState(raw !== "false");
        })
        .catch((err) => {
          if (generation !== loadGeneration.current) return;
          toast.error(
            err instanceof Error
              ? err.message
              : "Failed to load YouTube feature flag.",
          );
        })
        .finally(() => {
          if (generation === loadGeneration.current) setLoading(false);
        });
    };
    load();
    return window.api.on(IPC.DEV_TEST_DATA_UPDATED, load);
  }, []);

  const setEnabled = (value: boolean): void => {
    loadGeneration.current += 1;
    setLoading(false);
    setEnabledState(value);
    window.api
      .invoke(IPC.SETTINGS_SET, "youtube_enabled", String(value))
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to save YouTube feature flag.",
        );
      });
  };

  return (
    <YouTubeEnabledContext.Provider value={{ enabled, loading, setEnabled }}>
      {children}
    </YouTubeEnabledContext.Provider>
  );
}

export function useYouTubeEnabled(): YouTubeEnabledContextValue {
  return useContext(YouTubeEnabledContext);
}
