import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCase } from "../release-notes-markdown.corpus.mjs";
import {
  findVersionSection,
  formatViolations,
  isRealIsoDate,
  parseReleaseNotes,
} from "../release-notes-markdown.mjs";

const casesPath = fileURLToPath(
  new URL("./fixtures/release-notes-md-v1/cases.json", import.meta.url),
);
const cases = JSON.parse(readFileSync(casesPath, "utf8")).cases;

for (const testCase of cases) {
  it(`corpus: ${testCase.id}`, () => {
    expect(runCase(testCase)).toEqual([]);
  });
}

describe("release-notes-md-v1 conformance", () => {
  it("has unique ids and violations for every invalid case", () => {
    const ids = cases.map((testCase: { id: string }) => testCase.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const testCase of cases) {
      expect(testCase.input !== undefined || testCase.inputParts).toBeTruthy();
      if (!testCase.valid) {
        expect(testCase.violations?.length, testCase.id).toBeGreaterThan(0);
      }
    }
  });

  it("rejects hostile inputs promptly", () => {
    const hostile = [
      "*".repeat(100000),
      "[".repeat(50000),
      "`".repeat(50000),
      "<".repeat(50000),
      `- ${"a".repeat(1000000)}`,
      "\u0000\u202e",
    ];

    for (const input of hostile) {
      const started = Date.now();
      expect(parseReleaseNotes(input).valid).toBe(false);
      expect(Date.now() - started).toBeLessThan(2000);
    }
  });

  it("finds version sections with correct line offsets", () => {
    const changelog =
      "# Changelog\n\n## [1.2.0] - 2026-11-17\n\n### Added\n\n- One.\n\n## [1.1.0] - 2026-10-01\n\n### Fixed\n\n- Two.\n";
    const section = findVersionSection(changelog, "1.2.0");
    expect(section).toMatchObject({
      date: "2026-11-17",
      headingLine: 3,
      bodyStartLine: 4,
    });
    expect(
      parseReleaseNotes(section.body, {
        lineOffset: section.bodyStartLine - 1,
      }).valid,
    ).toBe(true);
  });

  it("formats violations with CHANGELOG.md line numbers", () => {
    const changelog =
      "# Changelog\n\n## [1.2.0] - 2026-11-17\n\n### Added\n\n- Bad <b>html</b>.\n";
    const section = findVersionSection(changelog, "1.2.0");
    const result = parseReleaseNotes(section.body, {
      lineOffset: section.bodyStartLine - 1,
    });
    expect(formatViolations(result.violations)[0]).toMatch(
      /^CHANGELOG\.md:7: raw HTML/,
    );
  });

  it("rejects missing, duplicate, and impossible-date entries", () => {
    expect(() =>
      findVersionSection("## [1.0.0] - 2026-01-01\n- x", "2.0.0"),
    ).toThrow(/no entry/);
    expect(() =>
      findVersionSection(
        "## [1.0.0] - 2026-01-01\n\n## [1.0.0] - 2026-01-02\n",
        "1.0.0",
      ),
    ).toThrow(/2 entries/);
    expect(() =>
      findVersionSection("## [1.0.0] - 2026-02-30\n- x", "1.0.0"),
    ).toThrow(/not a real/);
    expect(isRealIsoDate("2024-02-29")).toBe(true);
    expect(isRealIsoDate("2025-02-29")).toBe(false);
  });

  it("matches prerelease versions literally", () => {
    const section = findVersionSection(
      "## [1.2.0-beta.1] - 2026-11-17\n\n### Added\n\n- x.\n",
      "1.2.0-beta.1",
    );
    expect(section.version).toBe("1.2.0-beta.1");
    expect(() =>
      findVersionSection("## [1.2.0-beta.1] - 2026-11-17\n", "1.2.0"),
    ).toThrow(/no entry/);
  });
});

describe("repository CHANGELOG guard", () => {
  it("has valid release notes for the package version", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      version: string;
    };
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const section = findVersionSection(changelog, pkg.version);
    expect(
      parseReleaseNotes(section.body, {
        lineOffset: section.bodyStartLine - 1,
      }).valid,
    ).toBe(true);
  });
});

describe("canonical file hashes", () => {
  it("matches the frozen source hashes", () => {
    const expected = new Map([
      [
        "../release-notes-markdown.mjs",
        "4873c9967ed669085f3a23b33c97d877bb90489aa78a0607fbaa136b28a67c32",
      ],
      [
        "../release-notes-markdown.d.mts",
        "96b6b2be9d4384f6f8c06d5d028ecc604503f27792dc515f780eb3fa8a920f3e",
      ],
      [
        "../release-notes-markdown.corpus.mjs",
        "8c672fab613dadd85f3240183fecf9351440bae0f3eab040b68993de70a1846e",
      ],
      [
        "./fixtures/release-notes-md-v1/cases.json",
        "dd1b53d30cb373eaf136dacd979a4d5f0ea3025087a8c38f034eb5ccd5c15ae6",
      ],
    ]);

    for (const [relativePath, hash] of expected) {
      const filePath = fileURLToPath(new URL(relativePath, import.meta.url));
      const content = readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
      expect(createHash("sha256").update(content).digest("hex"), relativePath).toBe(
        hash,
      );
    }
  });
});



