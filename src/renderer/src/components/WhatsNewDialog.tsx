import React from "react";
import { toast } from "sonner";
import { Button } from "./ui/button";
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
  const sections = notes?.sections ?? [];

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
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-sm">
          {sections.length === 0 ? (
            <p className="text-muted-foreground">
              Release notes are not available for this update.
            </p>
          ) : (
            sections.map((section, index) => (
              <div key={`${section.heading ?? ""}-${index}`}>
                {section.heading ? (
                  <h4 className="mb-1 font-medium">{section.heading}</h4>
                ) : null}
                <ul className="list-disc space-y-1 pl-5">
                  {section.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ul>
              </div>
            ))
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
