import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DEFAULT_ASTRONOMY_SETTINGS,
  IPC,
  type AstronomySettings,
} from "../../../shared/ipc-types";

interface AstronomyEnabledContextValue {
  enabled: boolean;
  setEnabled: (value: boolean) => void;
}

const AstronomyEnabledContext = createContext<AstronomyEnabledContextValue>({
  enabled: DEFAULT_ASTRONOMY_SETTINGS.enabled,
  setEnabled: () => {},
});

/**
 * App-level Astronomy feature gate. The main-process Astronomy module owns
 * persistence (`astronomy_settings_json`); this context only reads and writes
 * it through the dedicated Astronomy settings IPC so both renderer surfaces
 * (Weather astronomy strip and the standalone Astronomy widget) share one
 * source of truth.
 */
export function AstronomyEnabledProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [enabled, setEnabledState] = useState<boolean>(
    DEFAULT_ASTRONOMY_SETTINGS.enabled,
  );

  useEffect(() => {
    window.api
      .invoke(IPC.ASTRONOMY_GET_SETTINGS)
      .then((data) => {
        const settings = data as Partial<AstronomySettings> | null;
        if (settings && typeof settings.enabled === "boolean") {
          setEnabledState(settings.enabled);
        }
      })
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to load Astronomy setting.",
        );
      });
  }, []);

  const setEnabled = (value: boolean): void => {
    setEnabledState(value);
    window.api
      .invoke(IPC.ASTRONOMY_SET_SETTINGS, { enabled: value })
      .then((data) => {
        const settings = data as Partial<AstronomySettings> | null;
        if (settings && typeof settings.enabled === "boolean") {
          setEnabledState(settings.enabled);
        }
      })
      .catch(() => {
        setEnabledState(!value);
        toast.error("Failed to save the Astronomy setting.");
      });
  };

  return (
    <AstronomyEnabledContext.Provider value={{ enabled, setEnabled }}>
      {children}
    </AstronomyEnabledContext.Provider>
  );
}

export function useAstronomyEnabled(): AstronomyEnabledContextValue {
  return useContext(AstronomyEnabledContext);
}
