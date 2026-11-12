import {
  FEATURES_SEEN_KEY,
  ONBOARDING_COMPLETED_KEY,
} from "../db/onboarding-baseline";
import { getSetting, setSetting } from "../settings/store";
import {
  FEATURE_IDS,
  isFeatureId,
} from "../../shared/feature-manifest";
import type {
  IpcMutationResult,
  OnboardingState,
} from "../../shared/ipc-types";

export type OnboardingMode = "enabled" | "disabled";

let onboardingMode: OnboardingMode = "disabled";

export function resolveOnboardingMode(options: {
  isPackaged: boolean;
  optIn: string | undefined;
}): OnboardingMode {
  return options.isPackaged || options.optIn === "1" ? "enabled" : "disabled";
}

export function initializeOnboardingState(options: {
  mode: OnboardingMode;
  wasFreshProfile: boolean;
}): void {
  onboardingMode = options.mode;

  if (!options.wasFreshProfile) return;

  if (options.mode === "disabled") {
    setSetting(ONBOARDING_COMPLETED_KEY, "true");
    return;
  }

  setSetting("youtube_enabled", "false");
  setSetting("saved_posts_enabled", "false");
}

export function isOnboardingRequired(): boolean {
  return (
    onboardingMode === "enabled" &&
    getSetting(ONBOARDING_COMPLETED_KEY) !== "true"
  );
}

function readSeenFeatureIds(): Set<string> | null {
  const raw = getSetting(FEATURES_SEEN_KEY);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return null;
  }
}

export function getOnboardingState(): OnboardingState {
  const seenFeatureIds = readSeenFeatureIds();
  return {
    required: isOnboardingRequired(),
    unseenFeatureIds:
      seenFeatureIds === null
        ? []
        : FEATURE_IDS.filter((id) => !seenFeatureIds.has(id)),
  };
}

export function completeOnboarding(): IpcMutationResult {
  setSetting(ONBOARDING_COMPLETED_KEY, "true");
  setSetting(FEATURES_SEEN_KEY, JSON.stringify([...FEATURE_IDS]));
  return { ok: true, error: null };
}

export function markFeaturesSeen(ids: unknown): IpcMutationResult {
  if (!Array.isArray(ids)) {
    return { ok: false, error: "Feature ids must be an array." };
  }

  const seenFeatureIds = readSeenFeatureIds() ?? new Set<string>();
  for (const id of ids) {
    if (typeof id === "string" && isFeatureId(id)) {
      seenFeatureIds.add(id);
    }
  }
  setSetting(FEATURES_SEEN_KEY, JSON.stringify([...seenFeatureIds]));
  return { ok: true, error: null };
}
