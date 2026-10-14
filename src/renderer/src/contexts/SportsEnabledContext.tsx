import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { IPC } from "../../../shared/ipc-types";

interface SportsEnabledContextValue {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
}

const SportsEnabledContext = createContext<SportsEnabledContextValue>({
  enabled: true,
  setEnabled: () => {},
});

export function SportsEnabledProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    const load = (): void => {
      window.api
        .invoke(IPC.SETTINGS_GET, "sports_enabled")
        .then((raw) => {
          setEnabledState(raw !== "false");
        })
        .catch((err) => {
          toast.error(
            err instanceof Error
              ? err.message
              : "Failed to load Sports feature flag.",
          );
        });
    };
    load();
    return window.api.on(IPC.DEV_TEST_DATA_UPDATED, load);
  }, []);

  const setEnabled = (value: boolean): void => {
    setEnabledState(value);
    window.api
      .invoke(IPC.SETTINGS_SET, "sports_enabled", String(value))
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to save Sports feature flag.",
        );
      });
  };

  return (
    <SportsEnabledContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </SportsEnabledContext.Provider>
  );
}

export function useSportsEnabled(): SportsEnabledContextValue {
  return useContext(SportsEnabledContext);
}
