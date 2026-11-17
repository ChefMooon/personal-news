// CANONICAL: release-notes-md-v1 parser and validator.
// Source of truth: ~/.claude/skills/release-skill-maintenance/templates/copilot/scripts/
// Copy unchanged into each project; the audit compares hashes. Do not edit per project.
// Spec: references/release-notes-markdown.md. No dependencies; runs on Node 20+ and in browsers.

export const FORMAT = "release-notes-md-v1";

export const LIMITS = Object.freeze({
  maxLineLength: 500,
  maxUrlLength: 2048,
  maxEntryLength: 8000,
  maxBullets: 60,
});

const FORBIDDEN_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isRealIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/**
 * Find the entry headed "## [VERSION] - YYYY-MM-DD". Throws a plain Error when it is missing,
 * duplicated or has an invalid date. `bodyStartLine` is the 1-based file line of the first body line.
 */
export function findVersionSection(changelog, version) {
  const text = String(changelog).replace(/^﻿/, "");
  const lines = text.split(/\r\n|\r|\n/);
  const headingPattern = new RegExp(`^## \\[${escapeRegExp(version)}\\] - (\\S+)\\s*$`);
  const matches = [];
  lines.forEach((line, index) => {
    const match = headingPattern.exec(line);
    if (match) matches.push({ index, date: match[1] });
  });
  if (matches.length === 0) {
    throw new Error(`CHANGELOG.md has no entry headed "## [${version}] - YYYY-MM-DD".`);
  }
  if (matches.length > 1) {
    throw new Error(`CHANGELOG.md has ${matches.length} entries for [${version}]; expected exactly one.`);
  }
  const { index, date } = matches[0];
  if (/^unreleased$/i.test(date)) {
    const error = new Error(`CHANGELOG.md:${index + 1}: the entry for [${version}] is still marked "Unreleased"; replace it with the release date (YYYY-MM-DD).`);
    error.code = "UNRELEASED";
    error.headingLine = index + 1;
    throw error;
  }
  if (!isRealIsoDate(date)) {
    throw new Error(`CHANGELOG.md:${index + 1}: "${date}" is not a real YYYY-MM-DD date.`);
  }
  let end = lines.length;
  for (let i = index + 1; i < lines.length; i += 1) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return {
    version,
    date,
    headingLine: index + 1,
    bodyStartLine: index + 2,
    body: lines.slice(index + 1, end).join("\n"),
  };
}

function checkUrl(url, line, violations) {
  if (url.length > LIMITS.maxUrlLength) {
    violations.push({ line, message: `link URL is longer than ${LIMITS.maxUrlLength} characters` });
    return false;
  }
  if (/\s/.test(url) || /["'<>]/.test(url)) {
    violations.push({ line, message: "link titles and spaces or quotes in URLs are not supported" });
    return false;
  }
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url);
  if (!scheme) {
    violations.push({ line, message: "link must be an absolute https URL" });
    return false;
  }
  if (scheme[1].toLowerCase() !== "https") {
    violations.push({ line, message: `only https links are allowed (found "${scheme[1].toLowerCase()}:")` });
    return false;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    violations.push({ line, message: "link is not a valid https URL" });
    return false;
  }
  if (!parsed.hostname) {
    violations.push({ line, message: "link is not a valid https URL" });
    return false;
  }
  if (parsed.username || parsed.password) {
    violations.push({ line, message: "links must not contain credentials" });
    return false;
  }
  return true;
}

function isSpace(char) {
  return char === undefined || /\s/.test(char);
}

/** Find the closing "`" index, or -1. */
function findCodeEnd(text, from) {
  return text.indexOf("`", from);
}

function findItalicEnd(text, from) {
  for (let k = from; k < text.length; k += 1) {
    const ch = text[k];
    if (ch === "`") {
      const end = findCodeEnd(text, k + 1);
      if (end === -1) return -1;
      k = end;
    } else if (ch === "*" && text[k + 1] === "*") {
      k += 1; // skip an inner bold marker
    } else if (ch === "*" && !isSpace(text[k - 1]) && k > from) {
      return k;
    }
  }
  return -1;
}

function findBoldEnd(text, from) {
  for (let k = from; k < text.length - 1; k += 1) {
    const ch = text[k];
    if (ch === "`") {
      const end = findCodeEnd(text, k + 1);
      if (end === -1) return -1;
      k = end;
    } else if (ch === "*" && text[k + 1] === "*" && !isSpace(text[k - 1]) && k > from) {
      return k;
    }
  }
  return -1;
}

function parseInline(text, line, violations, ctx) {
  const out = [];
  let buffer = "";

  const flush = () => {
    if (buffer === "") return;
    if (/https?:\/\//i.test(buffer)) {
      violations.push({ line, message: "bare URL; write it as [text](https://...)" });
    }
    out.push({ type: "text", value: buffer });
    buffer = "";
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (ch === "`") {
      const end = findCodeEnd(text, i + 1);
      if (end === -1 || end === i + 1) {
        violations.push({ line, message: "unbalanced or empty code marker (`)" });
        buffer += ch;
        continue;
      }
      flush();
      out.push({ type: "code", value: text.slice(i + 1, end) });
      i = end;
      continue;
    }

    if (ch === "!" && text[i + 1] === "[") {
      violations.push({ line, message: "images are not supported" });
      buffer += "![";
      i += 1;
      continue;
    }

    if (ch === "[") {
      const close = text.indexOf("]", i + 1);
      if (close === -1 || text[close + 1] !== "(") {
        buffer += ch; // literal bracket, for example "[WIP]"
        continue;
      }
      const urlEnd = text.indexOf(")", close + 2);
      if (urlEnd === -1) {
        violations.push({ line, message: "unbalanced link; missing closing )" });
        buffer += ch;
        continue;
      }
      const label = text.slice(i + 1, close);
      const url = text.slice(close + 2, urlEnd);
      if (ctx.inLink) {
        violations.push({ line, message: "links cannot be nested" });
      }
      if (label.trim() === "") {
        violations.push({ line, message: "link text is empty" });
      }
      checkUrl(url, line, violations);
      flush();
      const children = parseInline(label, line, violations, { ...ctx, inLink: true });
      out.push({ type: "link", href: url, children });
      i = urlEnd;
      continue;
    }

    if (ch === "*") {
      if (text.startsWith("***", i)) {
        violations.push({ line, message: "'***' is not supported; use ** for bold and * for italic separately" });
        buffer += "***";
        i += 2;
        continue;
      }
      if (text[i + 1] === "*") {
        if (isSpace(text[i + 2])) {
          buffer += "**"; // literal, not an opener
          i += 1;
          continue;
        }
        const end = findBoldEnd(text, i + 2);
        if (end === -1) {
          violations.push({ line, message: "unbalanced bold marker (**)" });
          buffer += "**";
          i += 1;
          continue;
        }
        if (ctx.inBold) {
          violations.push({ line, message: "bold cannot be nested inside bold" });
        }
        flush();
        out.push({
          type: "bold",
          children: parseInline(text.slice(i + 2, end), line, violations, { ...ctx, inBold: true }),
        });
        i = end + 1;
        continue;
      }
      if (isSpace(text[i + 1])) {
        buffer += ch; // literal asterisk, for example "2 * 3"
        continue;
      }
      const end = findItalicEnd(text, i + 1);
      if (end === -1) {
        violations.push({ line, message: "unbalanced italic marker (*)" });
        buffer += ch;
        continue;
      }
      if (ctx.inItalic) {
        violations.push({ line, message: "italic cannot be nested inside italic" });
      }
      flush();
      out.push({
        type: "italic",
        children: parseInline(text.slice(i + 1, end), line, violations, { ...ctx, inItalic: true }),
      });
      i = end;
      continue;
    }

    if (ch === "_") {
      if (text[i + 1] === "_") {
        violations.push({ line, message: "use ** for bold, not __" });
        buffer += "__";
        i += 1;
        continue;
      }
      const boundary = i === 0 || /\s/.test(text[i - 1]);
      if (boundary && !isSpace(text[i + 1])) {
        const close = text.indexOf("_", i + 1);
        if (close > i + 1 && !isSpace(text[close - 1]) && (close + 1 === text.length || /[\s.,;:!?)]/.test(text[close + 1]))) {
          violations.push({ line, message: "use * for italic, not _" });
        }
      }
      buffer += ch;
      continue;
    }

    if (ch === "<" && /^<[A-Za-z/!?]/.test(text.slice(i, i + 2))) {
      violations.push({ line, message: "raw HTML is not supported" });
      buffer += ch;
      continue;
    }

    buffer += ch;
  }
  flush();
  return out;
}

/**
 * Parse the body of one changelog entry (the lines after the version heading).
 * `lineOffset` is added to 1-based body line numbers so violations point at file lines.
 * Returns `{ notes, violations, valid }`. Renderers must use `notes` only when `valid` is true.
 */
export function parseReleaseNotes(markdown, { lineOffset = 0 } = {}) {
  const violations = [];
  const source = String(markdown ?? "").replace(/^﻿/, "");
  const lines = source.split(/\r\n|\r|\n/);
  const sections = [];
  let section = null;
  let sectionLine = 0;
  let list = null;
  let lastItem = null;
  let previous = null; // "heading" | "paragraph" | "bullet" | "nested" | null
  let bulletCount = 0;

  const report = (line, message) => violations.push({ line, message });
  const closeSection = () => {
    if (section && section.heading !== null && section.blocks.length === 0) {
      report(sectionLine, "heading has no content");
    }
  };
  const ensureSection = (line, message) => {
    if (!section) {
      report(line, message);
      section = { heading: null, blocks: [] };
      sectionLine = line;
      sections.push(section);
    }
  };

  if (source.trim() === "") {
    report(lineOffset + 1, "entry is empty");
    return { notes: { sections }, violations, valid: false };
  }
  if (source.length > LIMITS.maxEntryLength) {
    report(lineOffset + 1, `entry is longer than ${LIMITS.maxEntryLength} characters`);
  }

  lines.forEach((line, index) => {
    const no = index + 1 + lineOffset;

    if (line.trim() === "") {
      previous = null;
      return;
    }
    if (FORBIDDEN_CHARS.test(line)) {
      report(no, "contains control or bidirectional override characters");
      return;
    }
    if (line.length > LIMITS.maxLineLength) {
      report(no, `line is longer than ${LIMITS.maxLineLength} characters`);
      return;
    }
    if (line.startsWith("\t")) {
      report(no, "tab indentation is not allowed; nested bullets use exactly two spaces");
      return;
    }

    const indent = /^ */.exec(line)[0].length;
    if (indent > 0) {
      const trimmed = line.slice(indent);
      if (indent === 2 && /^- \S/.test(trimmed)) {
        if (!lastItem) {
          report(no, "nested bullet has no parent bullet");
          return;
        }
        lastItem.children.push({ inline: parseInline(trimmed.slice(2), no, violations, {}) });
        bulletCount += 1;
        previous = "nested";
        return;
      }
      if (/^[-*+] /.test(trimmed)) {
        report(no, "nesting deeper than one level, or wrong indentation (nested bullets use exactly two spaces)");
      } else {
        report(no, "unexpected indentation; wrapped lines are not allowed, keep each paragraph and bullet on one line");
      }
      return;
    }

    let match;
    if ((match = /^### (\S.*)$/.exec(line))) {
      closeSection();
      const heading = match[1].trimEnd();
      if (/[`*[\]<>]/.test(heading)) {
        report(no, "heading must be plain text");
      }
      section = { heading, blocks: [] };
      sectionLine = no;
      sections.push(section);
      list = null;
      lastItem = null;
      previous = "heading";
      return;
    }
    if (/^#{1,6}(\s|$)/.test(line)) {
      report(no, "only '### ' headings are allowed inside a release entry");
      return;
    }
    if (/^(```|~~~)/.test(line)) {
      report(no, "code fences are not supported");
      return;
    }
    if (/^>/.test(line)) {
      report(no, "blockquotes are not supported");
      return;
    }
    if (/^\|/.test(line)) {
      report(no, "tables are not supported");
      return;
    }
    if (/^\d+[.)]\s/.test(line)) {
      report(no, "numbered lists are not supported; use '- ' bullets");
      return;
    }
    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) {
      report(no, "horizontal rules are not supported");
      return;
    }
    if (/^[*+]\s/.test(line)) {
      report(no, "use '- ' for bullets");
      return;
    }
    if (/^-(\s*)$/.test(line)) {
      report(no, "empty bullet");
      return;
    }
    if ((match = /^- (\S.*)$/.exec(line))) {
      ensureSection(no, "content before the first '### ' heading");
      if (!list) {
        list = { type: "list", items: [] };
        section.blocks.push(list);
      }
      lastItem = { inline: parseInline(match[1], no, violations, {}), children: [] };
      list.items.push(lastItem);
      bulletCount += 1;
      previous = "bullet";
      return;
    }

    // paragraph
    if (previous === "paragraph" || previous === "bullet" || previous === "nested") {
      report(no, "wrapped line: keep each paragraph and bullet on one line (separate paragraphs with a blank line)");
      return;
    }
    ensureSection(no, "content before the first '### ' heading");
    section.blocks.push({ type: "paragraph", inline: parseInline(line, no, violations, {}) });
    list = null;
    lastItem = null;
    previous = "paragraph";
  });

  closeSection();
  if (bulletCount === 0) {
    report(lineOffset + 1, "entry has no bullet; add at least one '- ' bullet");
  }
  if (bulletCount > LIMITS.maxBullets) {
    report(lineOffset + 1, `entry has ${bulletCount} bullets; the limit is ${LIMITS.maxBullets}`);
  }

  return { notes: { sections }, violations, valid: violations.length === 0 };
}

/** Violations only, with file line numbers. */
export function validateReleaseNotes(markdown, options) {
  return parseReleaseNotes(markdown, options).violations;
}

export function formatViolations(violations, file = "CHANGELOG.md") {
  return violations.map((violation) => `${file}:${violation.line}: ${violation.message}`);
}

export function inlineToText(inline) {
  return inline
    .map((node) => {
      if (node.type === "text" || node.type === "code") return node.value;
      return inlineToText(node.children);
    })
    .join("");
}

/** Plain-text projection used by tests, fallbacks and accessible names. */
export function toPlainText(notes) {
  return notes.sections
    .map((section) => {
      const lines = [];
      if (section.heading) lines.push(section.heading);
      for (const block of section.blocks) {
        if (block.type === "paragraph") {
          lines.push(inlineToText(block.inline));
        } else {
          for (const item of block.items) {
            lines.push(`- ${inlineToText(item.inline)}`);
            for (const child of item.children) lines.push(`  - ${inlineToText(child.inline)}`);
          }
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
