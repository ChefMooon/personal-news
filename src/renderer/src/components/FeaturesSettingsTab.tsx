import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  FEATURE_MANIFEST,
  isFeatureId,
  type FeatureId,
  type FeatureManifestEntry,
} from "../../../shared/feature-manifest";
import {
  IPC,
  type IpcMutationResult,
  type OnboardingState,
} from "../../../shared/ipc-types";
import {
  getFeatureReadiness,
  loadReadinessSnapshot,
  type ReadinessSnapshot,
} from "../lib/onboardingReadiness";
import { useFeatureEnablement } from "../hooks/useFeatureEnablement";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";

export function shouldShowNeedsSetup(
  feature: FeatureManifestEntry,
  enabled: boolean,
  snapshot: ReadinessSnapshot | null,
): boolean {
  return (
    enabled &&
    feature.needsSetup &&
    feature.setupHint !== null &&
    snapshot !== null &&
    getFeatureReadiness(feature.id, snapshot) === "needs_setup"
  );
}

export function FeaturesSettingsTab(): React.ReactElement {
  const { isEnabled, setEnabled, youtubeLoading } = useFeatureEnablement();
  const [unseenFeatureIds, setUnseenFeatureIds] = useState<FeatureId[]>([]);
  const [readinessSnapshot, setReadinessSnapshot] =
    useState<ReadinessSnapshot | null>(null);
  const readinessActive = useRef(false);

  const refreshReadiness = useCallback((): void => {
    setReadinessSnapshot(null);
    void loadReadinessSnapshot()
      .then((snapshot) => {
        if (readinessActive.current) setReadinessSnapshot(snapshot);
      })
      .catch((error: unknown) => {
        if (!readinessActive.current) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load feature setup status.",
        );
      });
  }, []);

  useEffect(() => {
    readinessActive.current = true;
    refreshReadiness();
    return () => {
      readinessActive.current = false;
    };
  }, [refreshReadiness]);

  useEffect(() => {
    let active = true;
    let shownFeatureIds: FeatureId[] = [];

    void window.api
      .invoke(IPC.SETTINGS_GET_ONBOARDING_STATE)
      .then((result) => {
        const state = result as OnboardingState;
        const ids = [
          ...new Set(state.unseenFeatureIds.filter(isFeatureId)),
        ];
        if (!active) return;
        shownFeatureIds = ids;
        setUnseenFeatureIds(ids);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to load unseen features.",
        );
      });

    return () => {
      active = false;
      if (shownFeatureIds.length === 0) return;

      void window.api
        .invoke(IPC.SETTINGS_MARK_FEATURES_SEEN, shownFeatureIds)
        .then((result) => {
          const mutation = result as IpcMutationResult;
          if (!mutation.ok) {
            toast.error(mutation.error ?? "Failed to mark features as seen.");
          }
        })
        .catch((error: unknown) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to mark features as seen.",
          );
        });
    };
  }, []);

  return (
    <div className="max-w-2xl space-y-3 pb-8">
      {FEATURE_MANIFEST.map((feature) => {
        const enabled = isEnabled(feature.id);
        const needsSetup = shouldShowNeedsSetup(
          feature,
          enabled,
          readinessSnapshot,
        );

        return (
          <section
            key={feature.id}
            className="rounded-md border px-4 py-3"
            data-feature-id={feature.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-medium">{feature.displayName}</h3>
                  {needsSetup ? (
                    <Badge variant="outline">Needs setup</Badge>
                  ) : null}
                  {unseenFeatureIds.includes(feature.id) ? (
                    <Badge>New</Badge>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{feature.blurb}</p>
                {needsSetup ? (
                  <p className="text-xs text-muted-foreground">
                    {feature.setupHint}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {enabled ? (
                  <Link
                    className="text-sm underline-offset-4 hover:underline"
                    to={`/settings?tab=${feature.settingsTabId}`}
                  >
                    Open settings
                  </Link>
                ) : null}
                <span className="text-sm">Enable {feature.displayName}</span>
                <Switch
                  checked={enabled}
                  disabled={feature.id === "youtube" && youtubeLoading}
                  onCheckedChange={(checked) => {
                    setEnabled(feature.id, checked);
                    if (checked) refreshReadiness();
                  }}
                  aria-label={`Enable ${feature.displayName}`}
                />
              </div>
            </div>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Turning a feature off stops its background updates and hides it. Your
        data and settings are kept.
      </p>
    </div>
  );
}
