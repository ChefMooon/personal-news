import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  FEATURE_MANIFEST,
  type FeatureId,
} from "../../../../shared/feature-manifest";
import {
  IPC,
  type IpcMutationResult,
  type WhatsNewPayload,
} from "../../../../shared/ipc-types";
import {
  getFeatureReadiness,
  loadReadinessSnapshot,
  type ReadinessSnapshot,
} from "../../lib/onboardingReadiness";
import { Button } from "../ui/button";
import { WhatsNewDialog } from "../WhatsNewDialog";

interface FinishStepProps {
  selected: readonly FeatureId[];
  onFinished: () => void;
}

export function FinishStep({
  selected,
  onFinished,
}: FinishStepProps): React.ReactElement {
  const [snapshot, setSnapshot] = useState<ReadinessSnapshot | null>(null);
  const [readinessFailed, setReadinessFailed] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<WhatsNewPayload | null>(
    null,
  );
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const selectedIds = new Set(selected);

  useEffect(() => {
    let active = true;
    loadReadinessSnapshot()
      .then((result) => {
        if (active) setSnapshot(result);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setReadinessFailed(true);
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load feature setup status.",
        );
      });
    window.api
      .invoke(IPC.UPDATES_GET_CURRENT_RELEASE_NOTES)
      .then((result) => {
        if (active) setReleaseNotes(result as WhatsNewPayload | null);
      })
      .catch((error: unknown) => {
        if (!active) return;
        toast.error(
          error instanceof Error
            ? error.message
            : "Unable to load this version's release notes.",
        );
      });
    return () => {
      active = false;
    };
  }, []);

  const readyFeatures = FEATURE_MANIFEST.filter(
    (feature) =>
      selectedIds.has(feature.id) &&
      snapshot !== null &&
      getFeatureReadiness(feature.id, snapshot) === "ready",
  );
  const needsSetupFeatures = FEATURE_MANIFEST.filter(
    (feature) =>
      selectedIds.has(feature.id) &&
      snapshot !== null &&
      getFeatureReadiness(feature.id, snapshot) === "needs_setup",
  );
  const offFeatures = FEATURE_MANIFEST.filter(
    (feature) => !selectedIds.has(feature.id),
  );

  const finish = async (): Promise<void> => {
    if (finishing) return;
    setFinishing(true);
    try {
      const result = (await window.api.invoke(
        IPC.SETTINGS_COMPLETE_ONBOARDING,
      )) as IpcMutationResult;
      if (!result.ok) {
        toast.error(result.error ?? "Failed to complete onboarding.");
        return;
      }
      onFinished();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to complete onboarding.",
      );
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold">You're all set</h2>
      {snapshot ? (
        <div className="space-y-4">
          <section aria-labelledby="onboarding-ready-heading">
            <h3
              id="onboarding-ready-heading"
              className="text-sm font-semibold"
            >
              Ready
            </h3>
            {readyFeatures.length > 0 ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {readyFeatures.map((feature) => (
                  <li key={feature.id}>{feature.displayName}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">None yet.</p>
            )}
          </section>
          <section aria-labelledby="onboarding-needs-setup-heading">
            <h3
              id="onboarding-needs-setup-heading"
              className="text-sm font-semibold"
            >
              Needs setup
            </h3>
            {needsSetupFeatures.length > 0 ? (
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {needsSetupFeatures.map((feature) => (
                  <li key={feature.id}>
                    {feature.displayName} — Finish in Settings →{" "}
                    {feature.displayName}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">None.</p>
            )}
          </section>
        </div>
      ) : readinessFailed ? (
        <p className="text-sm text-muted-foreground">
          Unable to load setup status. You can still finish onboarding.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Checking setup status…</p>
      )}
      <section aria-labelledby="onboarding-off-heading">
        <h3 id="onboarding-off-heading" className="text-sm font-semibold">
          Off (turn on any time in Settings → Features)
        </h3>
        {offFeatures.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {offFeatures.map((feature) => (
              <li key={feature.id}>{feature.displayName}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">None.</p>
        )}
      </section>
      <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 bg-background py-2">
        {releaseNotes?.notes.sections.length ? (
          <Button
            variant="outline"
            onClick={() => setWhatsNewOpen(true)}
          >
            What's in this version
          </Button>
        ) : null}
        <Button onClick={() => void finish()} disabled={finishing}>
          Finish
        </Button>
      </div>
      {releaseNotes ? (
        <WhatsNewDialog
          open={whatsNewOpen}
          onOpenChange={setWhatsNewOpen}
          version={releaseNotes.version}
          notes={releaseNotes.notes}
          variant="installed"
        />
      ) : null}
    </div>
  );
}
