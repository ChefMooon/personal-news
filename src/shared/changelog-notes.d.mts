import type { ReleaseNotesDocument } from "./ipc-types";

export function extractChangelogSection(
  changelog: string,
  version: string,
): string;
export function getChangelogSectionLineOffset(
  changelog: string,
  version: string,
): number;
export function validateReleaseNotesMarkdown(
  section: string,
  lineOffset?: number,
): string[];
export function parseReleaseNotesMarkdown(section: string): ReleaseNotesDocument;
