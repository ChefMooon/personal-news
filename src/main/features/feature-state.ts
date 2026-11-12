import {
  DEFAULT_ASTRONOMY_SETTINGS,
  normalizeAstronomySettings,
} from "../../shared/ipc-types";
import {
  getFeatureEntry,
  isFeatureFlagValueEnabled,
  type FeatureId,
} from "../../shared/feature-manifest";
import { getSetting } from "../settings/store";

export function isFeatureEnabled(id: FeatureId): boolean {
  const entry = getFeatureEntry(id);
  const { storage } = entry;

  if (storage.kind === "setting") {
    return isFeatureFlagValueEnabled(getSetting(storage.key), entry);
  }

  const raw = getSetting(storage.key);
  if (raw === null) return DEFAULT_ASTRONOMY_SETTINGS.enabled;

  try {
    return normalizeAstronomySettings(JSON.parse(raw)).enabled;
  } catch {
    return DEFAULT_ASTRONOMY_SETTINGS.enabled;
  }
}
