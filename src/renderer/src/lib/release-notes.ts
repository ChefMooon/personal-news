import { toast } from "sonner";
import type { ReleaseNotesDocument } from "../../../shared/ipc-types";
import { IPC } from "../../../shared/ipc-types";

export function getSafeExternalHref(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length > 2048 ||
    /[\s\u0000-\u001f\u007f"'<>]/.test(value)
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function hasReleaseNotesContent(
  notes: ReleaseNotesDocument | null | undefined,
): boolean {
  if (!notes || typeof notes !== "object") return false;
  if (typeof notes.fallbackText === "string" && notes.fallbackText.length > 0) {
    return true;
  }
  if (!Array.isArray(notes.sections)) return false;
  return notes.sections.some(
    (section) =>
      !!section &&
      typeof section === "object" &&
      Array.isArray(section.blocks) &&
      section.blocks.length > 0,
  );
}

export function openReleaseNotesLink(href: string): void {
  window.api.invoke(IPC.SHELL_OPEN_EXTERNAL, href).catch((err: unknown) => {
    toast.error(
      err instanceof Error ? err.message : "Unable to open the link.",
    );
  });
}
