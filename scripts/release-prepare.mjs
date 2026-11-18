#!/usr/bin/env node
// CANONICAL: CI "prepare" gate. Verifies the tag, then finds or creates the ONE draft release for it.
// Usage (in the workflow's prepare job, after checkout with fetch-depth: 0):
//   node scripts/release-prepare.mjs --tag "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY"
// Needs GH_TOKEN. Checks: valid tag, tag version equals every versionFiles entry, the changelog entry is valid,
// the tagged commit is an ancestor of origin/<releaseBranch>, at most one release exists for the tag.
// Writes release_id, release_tag, version, prerelease to $GITHUB_OUTPUT when set. Never publishes or deletes.

import fs from "node:fs";
import path from "node:path";
import { appendFileSync } from "node:fs";
import { checkChangelog } from "./check-changelog.mjs";
import { checkVersions } from "./check-version-consistency.mjs";
import { ghJson, ghPaginate, loadConfig, normalizeTag, parseArgs, releaseTitle, runCommand } from "./release-lib.mjs";

const fail = (message) => {
  console.error(`::error::${message}`);
  process.exit(1);
};

let args;
try {
  args = parseArgs(process.argv.slice(2), { values: ["tag", "repo", "config"] });
  if (!args.tag || !args.repo) throw new Error("--tag and --repo are required.");
} catch (error) {
  fail(error.message);
}

const config = loadConfig(process.cwd(), args.config ?? "release.config.json");
let parsed;
try {
  parsed = normalizeTag(args.tag);
} catch (error) {
  fail(error.message);
}
if (args.tag !== parsed.tag) fail(`tag "${args.tag}" must be written exactly as ${parsed.tag}.`);
const { tag, version, prerelease } = parsed;

const versionResults = checkVersions({ entries: config.versionFiles, version, cargoPackage: config.cargoPackage });
const badVersions = versionResults.filter((r) => !r.ok);
if (badVersions.length) fail(`version files do not match ${version}: ${badVersions.map((r) => `${r.file} (${r.error ?? r.found.join(",")})`).join("; ")}`);

const changelog = checkChangelog({
  changelogText: fs.readFileSync(path.resolve(process.cwd(), config.changelog.file), "utf8"),
  version,
  format: config.changelog.format,
  file: config.changelog.file,
});
if (!changelog.ok) fail(changelog.messages.join(" | "));

const head = runCommand("git", ["rev-parse", "HEAD"]).stdout.trim();
const tagged = runCommand("git", ["rev-parse", `${tag}^{commit}`]);
if (tagged.status !== 0 || tagged.stdout.trim() !== head) fail(`checkout ${head} does not match the commit tag ${tag} points to.`);
const fetch = runCommand("git", ["fetch", "--no-tags", "origin", config.releaseBranch]);
if (fetch.status !== 0) fail(`could not fetch origin/${config.releaseBranch}: ${fetch.stderr.trim()}`);
const ancestor = runCommand("git", ["merge-base", "--is-ancestor", head, `origin/${config.releaseBranch}`]);
if (ancestor.status !== 0) fail(`tagged commit ${head} is not on origin/${config.releaseBranch}.`);

const releases = ghPaginate(`repos/${args.repo}/releases?per_page=100`).filter((release) => release.tag_name === tag);
if (releases.length > 1) fail(`found ${releases.length} releases for ${tag}; resolve the duplicates manually.`);
let release = releases[0];
if (release) {
  if (!release.draft) fail(`release ${tag} is already published; refusing to touch it.`);
  console.log(`Using existing draft release ${release.id} for ${tag}.`);
} else {
  const body = JSON.stringify({ tag_name: tag, target_commitish: head, name: releaseTitle(config, { tag, version }), body: `${changelog.body}\n`, draft: true, prerelease });
  const created = runCommand("gh", ["api", "--method", "POST", `repos/${args.repo}/releases`, "--input", "-"], { input: body });
  if (created.status !== 0) fail(`could not create the draft: ${created.stderr.trim() || created.stdout.trim()}`);
  release = JSON.parse(created.stdout);
  console.log(`Created draft release ${release.id} for ${tag}.`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `release_id=${release.id}\nrelease_tag=${tag}\nversion=${version}\nprerelease=${prerelease}\n`);
}
console.log(JSON.stringify({ releaseId: release.id, tag, version, prerelease }));
