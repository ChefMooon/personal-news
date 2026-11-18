#!/usr/bin/env node
// CANONICAL: validate (and optionally print) the CHANGELOG entry for a release version.
// Usage: node scripts/check-changelog.mjs --version 1.2.3 [--print] [--json] [--file CHANGELOG.md] [--config release.config.json]
// Exit codes: 0 valid, 1 violations, 2 missing entry or bad usage, 3 entry exists but is marked "Unreleased" (set the date, do not regenerate). Violations print as CHANGELOG.md:<line>: <message>.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { findVersionSection, parseReleaseNotes, formatViolations } from "./release-notes-markdown.mjs";
import { loadConfig, normalizeTag, parseArgs } from "./release-lib.mjs";

// release-notes-md-v0: the previous strict subset (### headings and plain "- " bullets only).
export function validateV0(body, lineOffset = 0) {
  const violations = [];
  let heading = 0;
  let headingBullets = 0;
  let seenHeading = false;
  let bullets = 0;
  const rules = [[/`/, "contains a backtick"], [/\*\*|__/, "contains bold markers"], [/(^|\s)_[^_\s][^_]*_(\s|$)|\*[^*\s][^*]*\*/, "contains emphasis markers"], [/\[[^\]]*\]\([^)]*\)/, "contains a markdown link"], [/<[A-Za-z/]/, "contains an inline HTML tag"], [/https?:\/\//, "contains a bare URL"]];
  const close = () => {
    if (seenHeading && headingBullets === 0) violations.push({ line: heading, message: "heading has no bullets" });
  };
  body.split(/\r\n|\r|\n/).forEach((line, index) => {
    const no = index + 1 + lineOffset;
    if (line.trim() === "") return;
    let text;
    let m;
    if ((m = /^### (\S.*)$/.exec(line))) {
      close();
      seenHeading = true;
      heading = no;
      headingBullets = 0;
      text = m[1];
    } else if ((m = /^- (\S.*)$/.exec(line))) {
      if (!seenHeading) violations.push({ line: no, message: "bullet appears before any heading" });
      headingBullets += 1;
      bullets += 1;
      text = m[1];
    } else {
      violations.push({ line: no, message: 'unsupported syntax (only "### Heading" and "- bullet" lines are allowed)' });
      return;
    }
    for (const [pattern, message] of rules) if (pattern.test(text)) violations.push({ line: no, message });
  });
  close();
  if (bullets === 0) violations.push({ line: lineOffset + 1, message: "entry has no bullet" });
  return violations;
}

export function checkChangelog({ changelogText, version, format = "release-notes-md-v1", file = "CHANGELOG.md" }) {
  let section;
  try {
    section = findVersionSection(changelogText, version);
  } catch (error) {
    return { ok: false, missing: true, unreleased: error.code === "UNRELEASED", headingLine: error.headingLine, violations: [], messages: [error.message], body: "" };
  }
  const offset = section.bodyStartLine - 1;
  const violations = format === "release-notes-md-v0" ? validateV0(section.body, offset) : parseReleaseNotes(section.body, { lineOffset: offset }).violations;
  return { ok: violations.length === 0, missing: false, violations, messages: formatViolations(violations, file), body: section.body.trim(), date: section.date, section };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { flags: ["print", "json"], values: ["version", "file", "config"] });
    if (!args.version) throw new Error("--version is required.");
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  let config = null;
  try {
    config = loadConfig(process.cwd(), args.config ?? "release.config.json");
  } catch (error) {
    if (args.config) {
      console.error(error.message);
      process.exit(2);
    }
  }
  const file = args.file ?? config?.changelog.file ?? "CHANGELOG.md";
  const format = config?.changelog.format ?? "release-notes-md-v1";
  const { version } = normalizeTag(args.version);
  const text = fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
  const result = checkChangelog({ changelogText: text, version, format, file });
  if (args.json) {
    console.log(JSON.stringify({ ok: result.ok, missing: result.missing, unreleased: Boolean(result.unreleased), format, messages: result.messages, violations: result.violations }));
  } else if (!result.ok) {
    console.error(result.messages.join("\n"));
  } else if (args.print) {
    console.log(result.body);
  } else {
    console.log(`${file}: entry for ${version} is valid (${format}).`);
  }
  process.exit(result.ok ? 0 : result.unreleased ? 3 : result.missing ? 2 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
