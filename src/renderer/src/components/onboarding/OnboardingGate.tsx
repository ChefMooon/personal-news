import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { IPC, type OnboardingState } from "../../../../shared/ipc-types";
import { OnboardingWizard } from "./OnboardingWizard";

export function OnboardingGate(): React.ReactElement | null {
  const [required, setRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    window.api
      .invoke(IPC.SETTINGS_GET_ONBOARDING_STATE)
      .then((result) => {
        const state = result as OnboardingState;
        if (active) setRequired(state.required);
      })
      .catch((error: unknown) => {
        console.error("Failed to load onboarding state:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load onboarding state.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  if (!required) return null;
  return <OnboardingWizard onFinished={() => setRequired(false)} />;
}
