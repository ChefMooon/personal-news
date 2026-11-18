// Canonical self-test for the parser, runnable with: node --test release-notes-markdown.test.mjs
// Projects with their own runner (Vitest) wrap runCase() from release-notes-markdown.corpus.mjs instead.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runCase } from "./release-notes-markdown.corpus.mjs";
import { findVersionSection, isRealIsoDate, parseReleaseNotes, formatViolations } from "./release-notes-markdown.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(join(here, "..", "fixtures", "release-notes-md-v1", "cases.json"), "utf8"));

for (const testCase of corpus.cases) {
  test(`corpus: ${testCase.id}`, () => {
    assert.deepEqual(runCase(testCase), []);
  });
}

test("corpus ids are unique and every case is well formed", () => {
  const ids = corpus.cases.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of corpus.cases) {
    assert.ok(c.input !== undefined || c.inputParts, `${c.id} has no input`);
    if (!c.valid) assert.ok(c.violations?.length, `${c.id} lists no violations`);
  }
});

test("parser never throws and stays fast on hostile input", () => {
  const nasty = ["*".repeat(100000), "[".repeat(50000), "`".repeat(50000), "<".repeat(50000), "- " + "a".repeat(1000000), "\u0000‮"];
  for (const input of nasty) {
    const started = Date.now();
    const result = parseReleaseNotes(input);
    assert.equal(result.valid, false);
    assert.ok(Date.now() - started < 2000, "parser took too long");
  }
});

test("findVersionSection locates the entry and its line numbers", () => {
  const changelog = "# Changelog\n\n## [1.2.0] - 2026-11-17\n\n### Added\n\n- One.\n\n## [1.1.0] - 2026-10-01\n\n### Fixed\n\n- Two.\n";
  const section = findVersionSection(changelog, "1.2.0");
  assert.equal(section.date, "2026-11-17");
  assert.equal(section.headingLine, 3);
  assert.equal(section.bodyStartLine, 4);
  const result = parseReleaseNotes(section.body, { lineOffset: section.bodyStartLine - 1 });
  assert.equal(result.valid, true);
});

test("violation line numbers use file lines when lineOffset is given", () => {
  const changelog = "# Changelog\n\n## [1.2.0] - 2026-11-17\n\n### Added\n\n- Bad <b>html</b>.\n";
  const section = findVersionSection(changelog, "1.2.0");
  const { violations } = parseReleaseNotes(section.body, { lineOffset: section.bodyStartLine - 1 });
  assert.match(formatViolations(violations)[0], /^CHANGELOG\.md:7: raw HTML/);
});

test("findVersionSection rejects missing, duplicate and impossible-date entries", () => {
  assert.throws(() => findVersionSection("## [1.0.0] - 2026-01-01\n- x", "2.0.0"), /no entry/);
  assert.throws(() => findVersionSection("## [1.0.0] - 2026-01-01\n\n## [1.0.0] - 2026-01-02\n", "1.0.0"), /2 entries/);
  assert.throws(() => findVersionSection("## [1.0.0] - 2026-02-30\n- x", "1.0.0"), /not a real/);
  assert.equal(isRealIsoDate("2024-02-29"), true);
  assert.equal(isRealIsoDate("2025-02-29"), false);
});

test("prerelease versions are matched literally", () => {
  const section = findVersionSection("## [1.2.0-beta.1] - 2026-11-17\n\n### Added\n\n- x.\n", "1.2.0-beta.1");
  assert.equal(section.version, "1.2.0-beta.1");
  assert.throws(() => findVersionSection("## [1.2.0-beta.1] - 2026-11-17\n", "1.2.0"), /no entry/);
});
