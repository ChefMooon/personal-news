function sectionHeaderPatternFor(version) {
  return new RegExp(
    `^## \\[${version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\] - `,
  );
}

/**
 * Number of CHANGELOG.md lines before the first line of the section that
 * extractChangelogSection returns (the section is trimmed, so blank lines
 * after the header are skipped). Add it to section-relative line numbers.
 */
export function getChangelogSectionLineOffset(changelogContent, version) {
  const lines = changelogContent.split(/\r?\n/);
  const pattern = sectionHeaderPatternFor(version);
  const startIndex = lines.findIndex((line) => pattern.test(line));
  if (startIndex < 0) return 0;
  let offset = startIndex + 1;
  while (offset < lines.length && lines[offset].trim() === "") offset += 1;
  return offset;
}

export function extractChangelogSection(changelogContent, version) {
  const lines = changelogContent.split(/\r?\n/);
  const sectionHeaderPattern = sectionHeaderPatternFor(version);
  const startIndex = lines.findIndex((line) => sectionHeaderPattern.test(line));

  if (startIndex < 0) {
    throw new Error(`CHANGELOG section for ${version} not found.`);
  }

  const endIndex = lines.findIndex(
    (line, index) => index > startIndex && /^## \[/.test(line),
  );
  const sectionLines = lines.slice(
    startIndex + 1,
    endIndex >= 0 ? endIndex : lines.length,
  );
  const notes = sectionLines.join("\n").trim();

  if (!notes) {
    throw new Error(`CHANGELOG section for ${version} is empty.`);
  }

  return notes;
}

const INLINE_RULES = [
  [/`/, "contains a backtick"],
  [/\*\*|__/, "contains bold markers"],
  [/(^|\s)_[^_\s][^_]*_(\s|$)|\*[^*\s][^*]*\*/, "contains emphasis markers"],
  [/\[[^\]]*\]\([^)]*\)/, "contains a markdown link"],
  [/<[A-Za-z/]/, "contains an inline HTML tag"],
  [/https?:\/\//, "contains a bare URL"],
];

export function validateReleaseNotesMarkdown(section, lineOffset = 0) {
  const violations = [];
  const lines = section.split(/\r?\n/);
  let seenHeading = false;
  let currentHeadingLine = 0;
  let currentHeadingBullets = 0;
  let totalBullets = 0;

  const closeHeading = () => {
    if (seenHeading && currentHeadingBullets === 0) {
      violations.push(`line ${currentHeadingLine}: heading has no bullets`);
    }
  };

  lines.forEach((line, index) => {
    const lineNo = index + 1 + lineOffset;
    if (line.trim() === "") return;

    let text;
    const headingMatch = /^### (\S.*)$/.exec(line);
    const bulletMatch = /^- (\S.*)$/.exec(line);
    if (headingMatch) {
      closeHeading();
      seenHeading = true;
      currentHeadingLine = lineNo;
      currentHeadingBullets = 0;
      text = headingMatch[1];
    } else if (bulletMatch) {
      if (!seenHeading) {
        violations.push(`line ${lineNo}: bullet appears before any heading`);
      }
      currentHeadingBullets += 1;
      totalBullets += 1;
      text = bulletMatch[1];
    } else {
      violations.push(
        `line ${lineNo}: unsupported syntax (only "### Heading" and "- bullet" lines are allowed)`,
      );
      return;
    }

    for (const [pattern, message] of INLINE_RULES) {
      if (pattern.test(text)) {
        violations.push(`line ${lineNo}: ${message}`);
      }
    }
  });

  closeHeading();
  if (totalBullets === 0) {
    violations.push("section contains no bullets");
  }
  return violations;
}

export function parseReleaseNotesMarkdown(section) {
  const sections = [];
  let current = null;

  for (const rawLine of section.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("### ")) {
      current = { heading: line.slice(4).trim(), items: [] };
      sections.push(current);
    } else if (line.startsWith("- ")) {
      if (!current) {
        current = { heading: null, items: [] };
        sections.push(current);
      }
      const item = line.slice(2).trim();
      if (item) current.items.push(item);
    }
  }

  return { sections: sections.filter((s) => s.items.length > 0) };
}
