import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractChangelogSection,
  getChangelogSectionLineOffset,
  parseReleaseNotesMarkdown,
  validateReleaseNotesMarkdown,
} from "../changelog-notes.mjs";

const SECTION_152 = `### Added

- Save links from across the web directly to Saved Posts, with previews where available.
- Improved saving X and Bluesky posts, including clearer post previews and duplicate handling.

### Fixed

- Reddit links can now be saved without API access.
- Fixed card header spacing and scrollbar shifts that could disrupt widget layouts.

### Security

- Strengthened app isolation and safeguards for requests made by content sources.`;

const CHANGELOG = `# Changelog

## [1.5.2] - 2026-01-01

${SECTION_152}

## [1.5.1] - 2025-12-01

### Fixed

- Older.

## [1.5.0] - 2025-11-01
`;

describe("extractChangelogSection", () => {
  it("finds a section and stops at the next version", () => {
    expect(extractChangelogSection(CHANGELOG, "1.5.2")).toBe(SECTION_152);
  });

  it("throws when missing", () => {
    expect(() => extractChangelogSection(CHANGELOG, "9.9.9")).toThrow(
      "CHANGELOG section for 9.9.9 not found.",
    );
  });

  it("throws when empty", () => {
    expect(() => extractChangelogSection(CHANGELOG, "1.5.0")).toThrow(
      "CHANGELOG section for 1.5.0 is empty.",
    );
  });

  it("handles CRLF input", () => {
    const crlf = CHANGELOG.replace(/\n/g, "\r\n");
    expect(extractChangelogSection(crlf, "1.5.2")).toBe(SECTION_152);
  });

  it("escapes the version in the header regex", () => {
    const text = "## [1x5x2] - 2026-01-01\n\n- nope\n";
    expect(() => extractChangelogSection(text, "1.5.2")).toThrow("not found");
  });
});

describe("validateReleaseNotesMarkdown", () => {
  it("accepts the 1.5.2 section", () => {
    expect(validateReleaseNotesMarkdown(SECTION_152)).toEqual([]);
  });

  it("allows underscores inside words", () => {
    expect(
      validateReleaseNotesMarkdown("### Fixed\n\n- Uses snake_case names."),
    ).toEqual([]);
  });

  it.each([
    ["backtick", "- Use `code` here."],
    ["bold", "- This is **bold** text."],
    ["italic star", "- This is *italic* text."],
    ["italic underscore", "- This is _italic_ text."],
    ["link", "- See [docs](https://example.com)."],
    ["bare url", "- See https://example.com now."],
    ["html tag", "- Use <b>tag</b> here."],
    ["star bullet", "* Star bullet."],
    ["nested bullet", "- Parent.\n  - Child."],
    ["numbered list", "1. First."],
    ["h2 line", "## Sub"],
    ["wrapped continuation", "- Long line\ncontinued here."],
  ])("rejects %s", (_name, body) => {
    const violations = validateReleaseNotesMarkdown(
      `### Fixed\n\n- Ok.\n${body}`,
    );
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/^line \d+: /);
  });

  it("rejects a bullet before any heading", () => {
    expect(
      validateReleaseNotesMarkdown("- Early.\n\n### Fixed\n\n- Ok."),
    ).toEqual(["line 1: bullet appears before any heading"]);
  });

  it("rejects a heading with no bullets", () => {
    expect(
      validateReleaseNotesMarkdown("### Added\n\n### Fixed\n\n- Ok."),
    ).toEqual(["line 1: heading has no bullets"]);
  });

  it("rejects a section with no bullets", () => {
    expect(validateReleaseNotesMarkdown("\n\n").length).toBeGreaterThan(0);
  });
});

describe("validateReleaseNotesMarkdown line numbers", () => {
  it("reports lines relative to CHANGELOG.md when given the section offset", () => {
    const broken = CHANGELOG.replace("- Save links", "- Save `links`");
    const section = extractChangelogSection(broken, "1.5.2");
    const offset = getChangelogSectionLineOffset(broken, "1.5.2");
    const fileLine = broken.split("\n").findIndex((line) => line.includes("`links`")) + 1;
    expect(validateReleaseNotesMarkdown(section, offset)).toEqual([
      `line ${fileLine}: contains a backtick`,
    ]);
    expect(fileLine).toBe(7);
  });

  it("returns 0 when the version is missing", () => {
    expect(getChangelogSectionLineOffset(CHANGELOG, "9.9.9")).toBe(0);
  });
});

describe("parseReleaseNotesMarkdown", () => {
  it("parses the 1.5.2 section", () => {
    const doc = parseReleaseNotesMarkdown(SECTION_152);
    expect(doc.sections.map((s) => [s.heading, s.items.length])).toEqual([
      ["Added", 2],
      ["Fixed", 2],
      ["Security", 1],
    ]);
  });

  it("creates a null-heading section for early bullets", () => {
    const doc = parseReleaseNotesMarkdown("- Early.\n\n### Fixed\n\n- Later.");
    expect(doc.sections).toEqual([
      { heading: null, items: ["Early."] },
      { heading: "Fixed", items: ["Later."] },
    ]);
  });

  it("drops empty sections and ignores unknown lines", () => {
    const doc = parseReleaseNotesMarkdown("### Empty\n\nstray\n### Real\n- One");
    expect(doc.sections).toEqual([{ heading: "Real", items: ["One"] }]);
  });
});

describe("repository CHANGELOG guard", () => {
  it("has a valid section for the package.json version", () => {
    const root = process.cwd();
    const pkg = JSON.parse(
      readFileSync(path.join(root, "package.json"), "utf8"),
    ) as { version: string };
    const changelog = readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
    const section = extractChangelogSection(changelog, pkg.version);
    expect(validateReleaseNotesMarkdown(section)).toEqual([]);
  });
});
