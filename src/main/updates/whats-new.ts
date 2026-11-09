import { app } from "electron";
import type {
  IpcMutationResult,
  ReleaseNotesDocument,
  WhatsNewPayload,
} from "../../shared/ipc-types";
import {
  extractChangelogSection,
  parseReleaseNotesMarkdown,
} from "../../shared/changelog-notes.mjs";
import { isElectronHarnessRun } from "../harness-mode";
import { getSetting, setSetting } from "../settings/store";
import { BUNDLED_CHANGELOG } from "./bundled-changelog";
import { decideWhatsNew } from "./release-notes";

export const WHATS_NEW_LAST_SEEN_KEY = "whats_new_last_seen_version";

export type WhatsNewMode = "off" | "normal" | "preview";

export function resolveWhatsNewMode(options: {
  isPackaged: boolean;
  harness: boolean;
  previewEnv: string | undefined;
}): WhatsNewMode {
  if (options.isPackaged || options.harness) {
    return "normal";
  }
  return options.previewEnv === "1" ? "preview" : "off";
}

function currentMode(): WhatsNewMode {
  return resolveWhatsNewMode({
    isPackaged: app.isPackaged,
    harness: isElectronHarnessRun(),
    previewEnv: process.env.PERSONAL_NEWS_WHATS_NEW_PREVIEW,
  });
}

function readBundledNotes(version: string): ReleaseNotesDocument | null {
  try {
    const section = extractChangelogSection(BUNDLED_CHANGELOG, version);
    const notes = parseReleaseNotesMarkdown(section);
    return notes.sections.length > 0 ? notes : null;
  } catch (error) {
    console.warn(
      `[WhatsNew] No usable changelog entry for ${version}:`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export function hasBundledWhatsNewEntry(version: string): boolean {
  return readBundledNotes(version) !== null;
}

export function getPendingWhatsNew(): WhatsNewPayload | null {
  const mode = currentMode();
  if (mode === "off") {
    return null;
  }

  const current = app.getVersion();
  if (mode === "preview") {
    const notes = readBundledNotes(current);
    return notes ? { version: current, notes } : null;
  }

  const decision = decideWhatsNew(getSetting(WHATS_NEW_LAST_SEEN_KEY), current);
  if (decision === "seed") {
    setSetting(WHATS_NEW_LAST_SEEN_KEY, current);
    return null;
  }
  if (decision === "none") {
    return null;
  }

  const notes = readBundledNotes(current);
  if (!notes) {
    // Mark as seen so a missing entry does not retry on every launch.
    setSetting(WHATS_NEW_LAST_SEEN_KEY, current);
    return null;
  }
  return { version: current, notes };
}

export function acknowledgeWhatsNew(version: unknown): IpcMutationResult {
  const current = app.getVersion();
  if (typeof version !== "string" || version !== current) {
    return { ok: false, error: "Version does not match the running app." };
  }
  if (currentMode() !== "normal") {
    return { ok: true, error: null };
  }
  const decision = decideWhatsNew(getSetting(WHATS_NEW_LAST_SEEN_KEY), current);
  if (decision === "show" || decision === "seed") {
    setSetting(WHATS_NEW_LAST_SEEN_KEY, current);
  }
  return { ok: true, error: null };
}
