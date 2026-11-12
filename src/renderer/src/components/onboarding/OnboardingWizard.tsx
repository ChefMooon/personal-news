import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  FEATURE_MANIFEST,
  isSelectedByDefault,
  type FeatureId,
} from "../../../../shared/feature-manifest";
import {
  IPC,
  type AstronomySettings,
  type IpcMutationResult,
} from "../../../../shared/ipc-types";
import { planOnboardingSteps } from "../../../../shared/onboarding-steps";
import { useFeatureEnablement } from "../../hooks/useFeatureEnablement";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FinishStep } from "./FinishStep";
import {
  getDefaultOnboardingSelection,
  PickFeaturesStep,
} from "./PickFeaturesStep";
import { LocationStep } from "./LocationStep";
import { RedditDigestStep } from "./RedditDigestStep";
import { SavedPostsStep } from "./SavedPostsStep";
import { SportsStep } from "./SportsStep";
import { YouTubeStep } from "./YouTubeStep";

interface OnboardingWizardProps {
  onFinished: () => void;
}

export function OnboardingWizard({
  onFinished,
}: OnboardingWizardProps): React.ReactElement {
  const { setEnabled } = useFeatureEnablement();
  const [selected, setSelected] = useState<FeatureId[]>(
    getDefaultOnboardingSelection,
  );
  const [selectionLoaded, setSelectionLoaded] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [skipping, setSkipping] = useState(false);
  const steps = useMemo(() => planOnboardingSteps(selected), [selected]);
  const currentStep = steps[stepIndex] ?? steps[steps.length - 1];

  useEffect(() => {
    let active = true;
    const loadSelection = async (): Promise<void> => {
      try {
        const savedFeatures = await Promise.all(
          FEATURE_MANIFEST.map(async (feature) => {
            if (feature.storage.kind === "setting") {
              const raw = await window.api.invoke(
                IPC.SETTINGS_GET,
                feature.storage.key,
              );
              return {
                id: feature.id,
                enabled:
                  raw === null
                    ? isSelectedByDefault(feature)
                    : raw !== "false",
                persisted: raw !== null,
              };
            }

            const data = await window.api.invoke(IPC.ASTRONOMY_GET_SETTINGS);
            const settings = data as Partial<AstronomySettings> | null;
            return {
              id: feature.id,
              enabled:
                typeof settings?.enabled === "boolean"
                  ? settings.enabled
                  : isSelectedByDefault(feature),
              persisted: false,
            };
          }),
        );
        if (!active) return;

        if (
          savedFeatures.some(
            (feature) => feature.id !== "astronomy" && feature.persisted,
          )
        ) {
          setSelected(
            savedFeatures
              .filter((feature) => feature.enabled)
              .map(({ id }) => id),
          );
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to restore onboarding feature selection.",
        );
      } finally {
        if (active) setSelectionLoaded(true);
      }
    };

    void loadSelection();
    return () => {
      active = false;
    };
  }, []);

  const applySelection = (): void => {
    for (const feature of FEATURE_MANIFEST) {
      setEnabled(feature.id, selected.includes(feature.id));
    }
  };

  const completeOnboarding = async (): Promise<void> => {
    if (skipping) return;
    setSkipping(true);
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
      setSkipping(false);
    }
  };

  const advance = (): void => {
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  };

  const handleContinueFromPick = (): void => {
    applySelection();
    advance();
  };

  const handleSkipSetup = (): void => {
    applySelection();
    void completeOnboarding();
  };

  const preventDismissal = (event: Event): void => {
    event.preventDefault();
  };

  let stepContent: React.ReactNode;
  if (currentStep.id === "pick") {
    stepContent = (
      <PickFeaturesStep
        selected={selected}
        onSelectionChange={(id, checked) => {
          setSelected((current) =>
            checked
              ? current.includes(id)
                ? current
                : [...current, id]
              : current.filter((value) => value !== id),
          );
        }}
      />
    );
  } else if (currentStep.id === "finish") {
    stepContent = (
      <FinishStep selected={selected} onFinished={onFinished} />
    );
  } else if (currentStep.id === "location") {
    stepContent = (
      <LocationStep featureIds={currentStep.featureIds} onNext={advance} />
    );
  } else if (currentStep.id === "sports") {
    stepContent = <SportsStep onNext={advance} />;
  } else if (currentStep.id === "reddit_digest") {
    stepContent = <RedditDigestStep onNext={advance} />;
  } else if (currentStep.id === "youtube") {
    stepContent = <YouTubeStep onNext={advance} />;
  } else {
    stepContent = <SavedPostsStep onNext={advance} />;
  }

  return (
    <Dialog open>
      <DialogContent
        className="sm:max-w-xl [&>button.absolute]:hidden max-h-[calc(100vh-2rem)] overflow-y-auto"
        onEscapeKeyDown={preventDismissal}
        onInteractOutside={preventDismissal}
      >
        <DialogHeader>
          <DialogTitle>Welcome to Personal News</DialogTitle>
          <DialogDescription>
            {selectionLoaded
              ? `Step ${stepIndex + 1} of ${steps.length}`
              : "Loading saved feature selection…"}
          </DialogDescription>
        </DialogHeader>
        {selectionLoaded ? (
          <>
            <div>{stepContent}</div>
            {currentStep.id === "pick" ? (
              <DialogFooter className="sticky bottom-0 z-10 gap-2 bg-background py-2 sm:gap-0">
                <Button
                  variant="ghost"
                  onClick={handleSkipSetup}
                  disabled={skipping}
                >
                  Skip setup
                </Button>
                <Button onClick={handleContinueFromPick}>Continue</Button>
              </DialogFooter>
            ) : null}
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
