import type { ReleaseNotesDocument } from "../../shared/ipc-types";
import {
  LIMITS,
  findVersionSection,
  formatViolations,
  parseReleaseNotes,
} from "../../shared/release-notes-markdown.mjs";
import { BUNDLED_CHANGELOG } from "./bundled-changelog";

type BundledNotesLookup =
  | { kind: "missing"; error: string }
  | { kind: "valid"; notes: ReleaseNotesDocument }
  | { kind: "invalid"; fallbackText: string; violations: string[] };

export function lookupBundledNotes(version: string): BundledNotesLookup {
  try {
    const section = findVersionSection(BUNDLED_CHANGELOG, version);
    const result = parseReleaseNotes(section.body, {
      lineOffset: section.bodyStartLine - 1,
    });
    if (result.valid) {
      return { kind: "valid", notes: result.notes };
    }
    return {
      kind: "invalid",
      fallbackText: section.body.trim().slice(0, LIMITS.maxEntryLength),
      violations: formatViolations(result.violations),
    };
  } catch (error) {
    return { kind: "missing", error: error instanceof Error ? error.message : String(error) };
  }
}

export function readBundledNotes(version: string): ReleaseNotesDocument | null {
  const result = lookupBundledNotes(version);
  if (result.kind === "valid") {
    return result.notes;
  }
  if (result.kind === "invalid") {
    console.warn(
      `[WhatsNew] Invalid changelog entry for ${version}:`,
      result.violations,
    );
    return { sections: [], fallbackText: result.fallbackText };
  }
  console.warn(`[WhatsNew] No usable changelog entry for ${version}: ${result.error}`);
  return null;
}

export function readValidBundledNotes(
  version: string,
): ReleaseNotesDocument | null {
  const result = lookupBundledNotes(version);
  return result.kind === "valid" ? result.notes : null;
}
