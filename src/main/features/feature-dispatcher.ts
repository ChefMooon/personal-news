import { FEATURE_IDS, type FeatureId } from "../../shared/feature-manifest";

export type FeatureEnabledHook = (enabled: boolean) => void;

const featureHooks = new Map<FeatureId, FeatureEnabledHook>();

export function registerFeatureHook(
  id: FeatureId,
  hook: FeatureEnabledHook,
): void {
  if (featureHooks.has(id)) {
    throw new Error(`Feature hook already registered: ${id}`);
  }
  featureHooks.set(id, hook);
}

export function dispatchFeatureEnabledChange(
  id: FeatureId,
  enabled: boolean,
  previousEnabled: boolean,
): boolean {
  if (enabled === previousEnabled) {
    return false;
  }

  const hook = featureHooks.get(id);
  if (hook) {
    try {
      hook(enabled);
    } catch (error) {
      console.error(`[Features] Hook for ${id} failed:`, error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to ${enabled ? "enable" : "disable"} ${id}: ${message}`,
        { cause: error },
      );
    }
  }
  return true;
}

export function dispatchFeatureEnabledChangeWithRollback(
  id: FeatureId,
  enabled: boolean,
  previousEnabled: boolean,
  rollback: () => void,
): boolean {
  try {
    return dispatchFeatureEnabledChange(id, enabled, previousEnabled);
  } catch (error) {
    rollback();
    throw error;
  }
}

export function assertAllFeatureHooksRegistered(): void {
  const missingIds = FEATURE_IDS.filter((id) => !featureHooks.has(id));
  if (missingIds.length > 0) {
    throw new Error(`Feature hooks not registered: ${missingIds.join(", ")}`);
  }
}

export function clearFeatureHooks(): void {
  featureHooks.clear();
}
