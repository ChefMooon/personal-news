import React from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { ReleaseNotesView } from "./ReleaseNotesView";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  FULL_CHANGELOG_URL,
  IPC,
  type ReleaseNotesDocument,
} from "../../../shared/ipc-types";
import { hasReleaseNotesContent } from "../lib/release-notes";

interface WhatsNewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  version: string;
  notes: ReleaseNotesDocument | null;
  variant: "incoming" | "installed";
}

export function WhatsNewDialog({
  open,
  onOpenChange,
  version,
  notes,
  variant,
}: WhatsNewDialogProps): React.ReactElement {
  const openFullChangelog = (): void => {
    window.api
      .invoke(IPC.SHELL_OPEN_EXTERNAL, FULL_CHANGELOG_URL)
      .catch((err: unknown) => {
        toast.error(
          err instanceof Error ? err.message : "Unable to open the changelog.",
        );
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>What's new in {version}</DialogTitle>
          <DialogDescription>
            {variant === "incoming"
              ? "Included in the update that is ready to install."
              : `You are now on version ${version}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-1 text-sm">
          {hasReleaseNotesContent(notes) ? (
            <ReleaseNotesView notes={notes!} />
          ) : (
            <p className="text-muted-foreground">
              Release notes are not available for this update.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={openFullChangelog}>
            View full changelog
          </Button>
          <Button onClick={() => onOpenChange(false)}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
