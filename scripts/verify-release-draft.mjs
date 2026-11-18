#!/usr/bin/env node
// CANONICAL: verify the GitHub release for a tag against release.config.json (and optionally the changelog notes).
// Usage: node scripts/verify-release-draft.mjs --repo OWNER/REPO --tag v1.2.3 [--expect draft|published] [--notes] [--platforms all|ci|local] [--config release.config.json]
// --platforms ci is for the workflow (checks only CI-built platforms; local assets are uploaded later). The skill uses the default, all.
// Prints one JSON result on stdout and human lines on stderr. Exit 0 only when every check passes.
// Needs GH_TOKEN or an authenticated gh. Never edits anything.

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { checkChangelog } from "./check-changelog.mjs";
import { expectedAssetPatterns, ghPaginate, loadConfig, normalizeTag, parseArgs, patternToRegExp, releaseTitle } from "./release-lib.mjs";

const eol = (text) => String(text ?? "").replace(/\r\n?/g, "\n");

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) count += 1;
  return count;
}

/** Pure check over already-fetched release data. */
export function verifyReleases({ releases, tag, version, prerelease = false, config, expect = "draft", expectedNotes, builds = "all" }) {
  const problems = [];
  const matches = releases.filter((release) => release.tag_name === tag);
  if (matches.length !== 1) {
    problems.push(`expected exactly one release for ${tag}; found ${matches.length}`);
    return { ok: false, problems, release: null };
  }
  const release = matches[0];
  const wantDraft = expect === "draft";
  if (Boolean(release.draft) !== wantDraft) problems.push(`release is ${release.draft ? "a draft" : "published"}, expected ${expect}`);
  const title = releaseTitle(config, { tag, version });
  if (release.name !== title) problems.push(`release title is "${release.name}", expected "${title}"`);
  if (Boolean(release.prerelease) !== prerelease) problems.push(`prerelease flag is ${Boolean(release.prerelease)}, expected ${prerelease}`);

  const assets = release.assets ?? [];
  const names = assets.map((asset) => asset.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length) problems.push(`duplicate asset names: ${[...new Set(duplicates)].join(", ")}`);
  const patterns = expectedAssetPatterns(config, { version, builds });
  for (const { platform, pattern } of patterns) {
    const re = patternToRegExp(pattern);
    const hits = names.filter((name) => re.test(name));
    if (hits.length === 0) problems.push(`missing asset for ${platform}: ${pattern}`);
    else if (hits.length > 1) problems.push(`more than one asset matches ${pattern}: ${hits.join(", ")}`);
  }
  for (const asset of assets) {
    if (!patterns.some(({ pattern }) => patternToRegExp(pattern).test(asset.name))) problems.push(`unexpected asset: ${asset.name}`);
    if (asset.state !== "uploaded") problems.push(`asset ${asset.name} is in state "${asset.state}", expected uploaded`);
    if (!(asset.size > 0)) problems.push(`asset ${asset.name} has size 0`);
  }
  if (expectedNotes !== undefined) {
    const body = eol(release.body);
    const expected = eol(expectedNotes).trim();
    const count = countOccurrences(body, expected);
    if (count !== 1) problems.push(`release notes contain the changelog entry ${count} times, expected exactly once`);
  }
  return { ok: problems.length === 0, problems, release };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2), { flags: ["notes"], values: ["repo", "tag", "expect", "config", "platforms"] });
    if (!args.repo || !args.tag) throw new Error("--repo and --tag are required.");
    if (args.expect && !["draft", "published"].includes(args.expect)) throw new Error("--expect must be draft or published.");
    if (args.platforms && !["all", "ci", "local"].includes(args.platforms)) throw new Error("--platforms must be all, ci or local.");
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const config = loadConfig(process.cwd(), args.config ?? "release.config.json");
  const { tag, version, prerelease } = normalizeTag(args.tag);
  let expectedNotes;
  if (args.notes) {
    const check = checkChangelog({
      changelogText: fs.readFileSync(path.resolve(process.cwd(), config.changelog.file), "utf8"),
      version,
      format: config.changelog.format,
      file: config.changelog.file,
    });
    if (!check.ok) {
      console.error(check.messages.join("\n"));
      process.exit(1);
    }
    expectedNotes = check.body;
  }
  const releases = ghPaginate(`repos/${args.repo}/releases?per_page=100`);
  const result = verifyReleases({ releases, tag, version, prerelease, config, expect: args.expect ?? "draft", expectedNotes, builds: args.platforms ?? "all" });
  const links = { editor: `https://github.com/${args.repo}/releases/edit/${tag}`, releases: `https://github.com/${args.repo}/releases` };
  for (const problem of result.problems) console.error(`FAIL ${problem}`);
  if (result.ok) console.error(`OK   ${tag}: ${result.release.assets.length} assets verified (${args.expect ?? "draft"})`);
  console.log(JSON.stringify({ ok: result.ok, tag, releaseId: result.release?.id ?? null, draft: result.release?.draft ?? null, problems: result.problems, links }));
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
