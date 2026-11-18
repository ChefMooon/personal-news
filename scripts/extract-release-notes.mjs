#!/usr/bin/env node
// CANONICAL: validate the entry, then write its body (no version heading) to stdout or a file.
// Replaces project-specific PowerShell extractors. Usage:
//   node scripts/extract-release-notes.mjs --version 1.2.3 [--out release-notes.md] [--config release.config.json]
// Exit codes match check-changelog.mjs. Nothing is written when the entry is invalid.

import fs from "node:fs";
import path from "node:path";
import { checkChangelog } from "./check-changelog.mjs";
import { loadConfig, normalizeTag, parseArgs } from "./release-lib.mjs";

let args;
try {
  args = parseArgs(process.argv.slice(2), { flags: [], values: ["version", "out", "file", "config"] });
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
const { version } = normalizeTag(args.version);
const result = checkChangelog({
  changelogText: fs.readFileSync(path.resolve(process.cwd(), file), "utf8"),
  version,
  format: config?.changelog.format ?? "release-notes-md-v1",
  file,
});
if (!result.ok) {
  console.error(result.messages.join("\n"));
  process.exit(result.unreleased ? 3 : result.missing ? 2 : 1);
}
const notes = `${result.body}\n`;
if (args.out) fs.writeFileSync(path.resolve(process.cwd(), args.out), notes, "utf8");
else process.stdout.write(notes);
