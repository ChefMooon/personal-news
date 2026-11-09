import type {
  ReleaseNotesDocument,
  ReleaseNotesSection,
} from "../../shared/ipc-types";
import { parseReleaseNotesMarkdown } from "../../shared/changelog-notes.mjs";

const TOKEN_PATTERN = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>|([^<]+)/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function codePointToString(code: number, fallback: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
    return fallback;
  }
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

// Single pass, so "&amp;lt;" decodes to "&lt;" and never to "<".
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return codePointToString(parseInt(body.slice(2), 16), match);
    }
    if (body.startsWith("#")) {
      return codePointToString(parseInt(body.slice(1), 10), match);
    }
    return NAMED_ENTITIES[body] ?? match;
  });
}

function cleanText(text: string): string {
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

export function parseReleaseNotesHtml(html: string): ReleaseNotesDocument | null {
  const sections: ReleaseNotesSection[] = [];
  let current: ReleaseNotesSection | null = null;
  let mode: "h3" | "li" | null = null;
  let buffer = "";
  let skipDepth = 0;

  const flush = (): void => {
    const text = cleanText(buffer);
    if (mode === "h3") {
      current = { heading: text || null, items: [] };
      sections.push(current);
    } else if (mode === "li" && text) {
      if (!current) {
        current = { heading: null, items: [] };
        sections.push(current);
      }
      current.items.push(text);
    }
    buffer = "";
    mode = null;
  };

  for (const match of html.replace(/<!--[\s\S]*?-->/g, "").matchAll(TOKEN_PATTERN)) {
    const [, closing, rawName, text] = match;
    if (rawName === undefined) {
      if (skipDepth === 0 && mode !== null) {
        buffer += text;
      }
      continue;
    }

    const name = rawName.toLowerCase();
    if (name === "script" || name === "style") {
      skipDepth = Math.max(0, skipDepth + (closing ? -1 : 1));
      continue;
    }
    if (skipDepth > 0) {
      continue;
    }
    if (name === "h3" || name === "li") {
      flush();
      if (!closing) {
        mode = name;
      }
    } else if (
      mode !== null &&
      (name === "br" || name === "p" || name === "div")
    ) {
      buffer += " ";
    }
  }
  flush();

  const filled = sections.filter((section) => section.items.length > 0);
  return filled.length > 0 ? { sections: filled } : null;
}

export function parseUpdaterReleaseNotes(input: unknown): ReleaseNotesDocument | null {
  const parseText = (text: string): ReleaseNotesSection[] => {
    if (!text.trim()) {
      return [];
    }
    if (!/<(h3|ul|li)\b/i.test(text) && text.includes("### ")) {
      return parseReleaseNotesMarkdown(text).sections;
    }
    return parseReleaseNotesHtml(text)?.sections ?? [];
  };

  let sections: ReleaseNotesSection[] = [];
  if (typeof input === "string") {
    sections = parseText(input);
  } else if (Array.isArray(input)) {
    for (const entry of input) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const note = (entry as { note?: unknown }).note;
      if (typeof note === "string") {
        sections.push(...parseText(note));
      }
    }
  }
  return sections.length > 0 ? { sections } : null;
}

export function compareVersions(a: string, b: string): number | null {
  const parse = (value: string): number[] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim().split("-")[0]);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
  };
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) {
    return null;
  }
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] > right[i] ? 1 : -1;
    }
  }
  return 0;
}

export function decideWhatsNew(
  lastSeen: string | null,
  current: string,
): "seed" | "show" | "none" {
  if (compareVersions(current, current) === null) {
    return "none";
  }
  if (!lastSeen) {
    return "seed";
  }
  const result = compareVersions(current, lastSeen);
  if (result === null) {
    return "seed";
  }
  return result > 0 ? "show" : "none";
}
