// CANONICAL declarations for release-notes-markdown.mjs. Copy unchanged.

export const FORMAT: "release-notes-md-v1";
export const LIMITS: Readonly<{
  maxLineLength: number;
  maxUrlLength: number;
  maxEntryLength: number;
  maxBullets: number;
}>;

export type Inline =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "link"; href: string; children: Inline[] };

export interface ListItem {
  inline: Inline[];
  children: { inline: Inline[] }[];
}

export type Block =
  | { type: "paragraph"; inline: Inline[] }
  | { type: "list"; items: ListItem[] };

export interface ReleaseNotesSection {
  heading: string | null;
  blocks: Block[];
}

export interface ReleaseNotes {
  sections: ReleaseNotesSection[];
}

export interface Violation {
  line: number;
  message: string;
}

export interface ParseResult {
  notes: ReleaseNotes;
  violations: Violation[];
  /** Renderers must use `notes` only when this is true. */
  valid: boolean;
}

export interface VersionSection {
  version: string;
  date: string;
  headingLine: number;
  bodyStartLine: number;
  body: string;
}

export function isRealIsoDate(value: string): boolean;
export function findVersionSection(changelog: string, version: string): VersionSection;
export function parseReleaseNotes(markdown: string, options?: { lineOffset?: number }): ParseResult;
export function validateReleaseNotes(markdown: string, options?: { lineOffset?: number }): Violation[];
export function formatViolations(violations: Violation[], file?: string): string[];
export function inlineToText(inline: Inline[]): string;
export function toPlainText(notes: ReleaseNotes): string;
