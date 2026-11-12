import React, { useState } from "react";
import { toast } from "sonner";
import { IPC } from "../../../../shared/ipc-types";
import { NtfyOnboardingWizard } from "../../modules/saved-posts/NtfyOnboardingWizard";
import { Button } from "../ui/button";

interface SavedPostsStepProps {
  onNext: () => void;
}

export function SavedPostsStep({
  onNext,
}: SavedPostsStepProps): React.ReactElement {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [topicSaved, setTopicSaved] = useState(false);

  const handleWizardClose = (): void => {
    setWizardOpen(false);
    window.api
      .invoke(IPC.SETTINGS_GET, "ntfy_topic")
      .then((topic) => {
        setTopicSaved(typeof topic === "string" && topic.trim().length > 0);
      })
      .catch((error: unknown) => {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to check Saved Posts setup.",
        );
      });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Save Reddit posts from your phone by sharing them to your private ntfy
        topic. Personal News will collect them as Saved Posts.
      </p>
      {topicSaved ? (
        <p className="text-sm text-muted-foreground">ntfy topic saved</p>
      ) : null}
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-background py-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setWizardOpen(true)}
        >
          Set up now
        </Button>
        <Button type="button" onClick={onNext}>
          Later
        </Button>
      </div>
      <NtfyOnboardingWizard
        isOpen={wizardOpen}
        onClose={handleWizardClose}
      />
    </div>
  );
}
