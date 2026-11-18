// Self-test for the shared release scripts: node --test release-scripts.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { checkChangelog, validateV0 } from "./check-changelog.mjs";
import { checkVersions } from "./check-version-consistency.mjs";
import { verifyReleases } from "./verify-release-draft.mjs";
import { selectRuns } from "./wait-for-run.mjs";
import { compareVersions, expandPlaceholders, normalizeTag, patternToRegExp, slugFromRemote, validateConfig } from "./release-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const SHA = "a".repeat(40);

const electronConfig = {
  schema: 1, stack: "electron", productName: "Demo App", versionFiles: ["package.json", "package-lock.json"], releaseBranch: "main", releaseTitle: "{tag}",
  changelog: { file: "CHANGELOG.md", style: "user", format: "release-notes-md-v1" },
  platforms: { windows: { enabled: true, build: "ci", assets: ["{productName}-{version}-Setup-x64.exe", "{productName}-{version}-Setup-x64.exe.blockmap", "latest.yml"] }, macos: { enabled: false, build: "ci", assets: ["*.dmg"] } },
};

test("normalizeTag and compareVersions", () => {
  assert.deepEqual(normalizeTag("1.2.3"), { tag: "v1.2.3", version: "1.2.3", prerelease: false });
  assert.deepEqual(normalizeTag("v1.2.3-beta.1"), { tag: "v1.2.3-beta.1", version: "1.2.3-beta.1", prerelease: true });
  for (const bad of ["1.2", "v1.2.3.4", "01.2.3", "latest", "", "1.2.3-"]) assert.throws(() => normalizeTag(bad));
  assert.equal(compareVersions("1.2.3", "1.2.4"), -1);
  assert.equal(compareVersions("1.2.3", "1.2.3-beta.1"), 1);
  assert.equal(compareVersions("1.2.3-beta.2", "1.2.3-beta.10"), -1);
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
});

test("config validation catches the common mistakes", () => {
  assert.deepEqual(validateConfig(electronConfig), []);
  assert.ok(validateConfig({ ...electronConfig, stack: "flutter" }).length);
  assert.ok(validateConfig({ ...electronConfig, platforms: { windows: { enabled: false, build: "ci", assets: ["x"] } } }).some((p) => p.includes("enabled")));
  assert.ok(validateConfig({ ...electronConfig, platforms: { windows: { enabled: true, build: "local", assets: ["x"] } } }).some((p) => p.includes("script")));
});

test("placeholders, patterns and remotes", () => {
  assert.equal(expandPlaceholders("{productName}-{version}.exe", { productName: "Demo App", version: "1.0.0" }), "Demo App-1.0.0.exe");
  assert.ok(patternToRegExp("*.dmg").test("Demo.dmg"));
  assert.ok(!patternToRegExp("*.dmg").test("a/b.dmg"));
  assert.ok(!patternToRegExp("a.exe").test("aXexe"));
  assert.equal(slugFromRemote("https://github.com/ChefMooon/demo.git"), "ChefMooon/demo");
  assert.equal(slugFromRemote("git@github.com:ChefMooon/demo.git"), "ChefMooon/demo");
  assert.throws(() => slugFromRemote("https://gitlab.com/a/b.git"));
});

test("checkChangelog: valid, missing, invalid, and v0", () => {
  const ok = "# Changelog\n\n## [1.2.0] - 2026-11-17\n\n### Added\n\n- Added **fast** mode.\n";
  assert.equal(checkChangelog({ changelogText: ok, version: "1.2.0" }).ok, true);
  assert.equal(checkChangelog({ changelogText: ok, version: "1.3.0" }).missing, true);
  const bad = checkChangelog({ changelogText: ok.replace("**fast**", "`fast`<b>"), version: "1.2.0" });
  assert.equal(bad.ok, false);
  assert.match(bad.messages[0], /^CHANGELOG\.md:7: /);
  assert.equal(checkChangelog({ changelogText: ok, version: "1.2.0", format: "release-notes-md-v0" }).ok, false);
  assert.equal(validateV0("### Added\n\n- Plain bullet.").length, 0);
});

test("an entry marked Unreleased is reported distinctly, not as missing", () => {
  const text = "# Changelog\n\n## [1.2.0] - Unreleased\n\n### Added\n\n- One.\n";
  const result = checkChangelog({ changelogText: text, version: "1.2.0" });
  assert.equal(result.ok, false);
  assert.equal(result.unreleased, true);
  assert.equal(result.headingLine, 3);
  assert.match(result.messages[0], /Unreleased/);
});

test("checkVersions reads and writes package, lock, tauri, cargo and regex files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rel-"));
  fs.mkdirSync(path.join(dir, "src-tauri", "tests"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), '{\n  "name": "demo",\n  "version": "1.0.0"\n}\n');
  fs.writeFileSync(path.join(dir, "package-lock.json"), '{\n  "name": "demo",\n  "version": "1.0.0",\n  "packages": {\n    "": {\n      "name": "demo",\n      "version": "1.0.0"\n    }\n  }\n}\n');
  fs.writeFileSync(path.join(dir, "src-tauri", "tauri.conf.json"), '{\n  "productName": "demo",\n  "version": "1.0.0"\n}\n');
  fs.writeFileSync(path.join(dir, "src-tauri", "Cargo.toml"), '[package]\nname = "demo-app"\nversion = "1.0.0"\n\n[dependencies]\nserde = "1"\n');
  fs.writeFileSync(path.join(dir, "src-tauri", "Cargo.lock"), '[[package]]\nname = "serde"\nversion = "1.0.1"\n\n[[package]]\nname = "demo-app"\nversion = "1.0.0"\n');
  fs.writeFileSync(path.join(dir, "src-tauri", "tests", "t.rs"), 'const CURRENT: &str = "1.0.0";\n');
  const entries = ["package.json", "package-lock.json", "src-tauri/tauri.conf.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock", { path: "src-tauri/tests/t.rs", pattern: 'CURRENT: &str = "([^"]+)"' }];
  assert.ok(checkVersions({ root: dir, entries, version: "1.0.0" }).every((r) => r.ok));
  const mismatch = checkVersions({ root: dir, entries, version: "1.1.0" });
  assert.ok(mismatch.every((r) => !r.ok));
  const written = checkVersions({ root: dir, entries, version: "1.1.0", write: true });
  assert.ok(written.every((r) => r.ok), JSON.stringify(written));
  assert.ok(fs.readFileSync(path.join(dir, "src-tauri", "Cargo.lock"), "utf8").includes('name = "serde"\nversion = "1.0.1"'), "other crates untouched");
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "package-lock.json"), "utf8")).packages[""].version, "1.1.0");
  assert.ok(checkVersions({ root: dir, entries: ["missing.json"], version: "1.1.0" })[0].error);
});

const asset = (name, extra = {}) => ({ name, state: "uploaded", size: 10, ...extra });
const goodRelease = () => ({ id: 1, tag_name: "v1.2.0", name: "v1.2.0", draft: true, prerelease: false, body: "### Added\n\n- One.", assets: [asset("Demo App-1.2.0-Setup-x64.exe"), asset("Demo App-1.2.0-Setup-x64.exe.blockmap"), asset("latest.yml")] });
const verify = (release, extra = {}) => verifyReleases({ releases: [release], tag: "v1.2.0", version: "1.2.0", config: electronConfig, ...extra });

test("verifyReleases accepts a good draft and rejects each kind of problem", () => {
  assert.equal(verify(goodRelease()).ok, true);
  assert.equal(verify(goodRelease(), { expectedNotes: "### Added\n\n- One." }).ok, true);
  const cases = [
    [{ ...goodRelease(), draft: false }, /expected draft/],
    [{ ...goodRelease(), name: "other" }, /title/],
    [{ ...goodRelease(), prerelease: true }, /prerelease/],
    [{ ...goodRelease(), assets: goodRelease().assets.slice(0, 2) }, /missing asset/],
    [{ ...goodRelease(), assets: [...goodRelease().assets, asset("latest.yml")] }, /duplicate/],
    [{ ...goodRelease(), assets: [...goodRelease().assets, asset("evil.exe")] }, /unexpected asset/],
    [{ ...goodRelease(), assets: [asset("Demo App-1.2.0-Setup-x64.exe", { state: "starter" }), ...goodRelease().assets.slice(1)] }, /state/],
    [{ ...goodRelease(), assets: [asset("Demo App-1.2.0-Setup-x64.exe", { size: 0 }), ...goodRelease().assets.slice(1)] }, /size 0/],
  ];
  for (const [release, pattern] of cases) assert.match(verify(release).problems.join("\n"), pattern);
  assert.match(verifyReleases({ releases: [], tag: "v1.2.0", version: "1.2.0", config: electronConfig }).problems[0], /found 0/);
  assert.match(verifyReleases({ releases: [goodRelease(), goodRelease()], tag: "v1.2.0", version: "1.2.0", config: electronConfig }).problems[0], /found 2/);
  assert.match(verify({ ...goodRelease(), body: "other" }, { expectedNotes: "### Added\n\n- One." }).problems.join(), /0 times/);
  assert.match(verify({ ...goodRelease(), body: "### Added\n\n- One.\n### Added\n\n- One." }, { expectedNotes: "### Added\n\n- One." }).problems.join(), /2 times/);
  assert.equal(verify({ ...goodRelease(), draft: false }, { expect: "published" }).ok, true);
});

test("verifyReleases can check only CI-built platforms", () => {
  const mixed = { ...electronConfig, platforms: { ...electronConfig.platforms, macos: { enabled: true, build: "local", script: "npm run release:mac", assets: ["*.dmg"] } } };
  const release = goodRelease();
  const all = verifyReleases({ releases: [release], tag: "v1.2.0", version: "1.2.0", config: mixed });
  assert.match(all.problems.join(), /missing asset for macos/);
  const ci = verifyReleases({ releases: [release], tag: "v1.2.0", version: "1.2.0", config: mixed, builds: "ci" });
  assert.equal(ci.ok, true, ci.problems.join());
});

test("selectRuns matches by sha, tag, event and time, never by recency", () => {
  const run = (over) => ({ id: 1, head_sha: SHA, head_branch: "v1.2.0", event: "push", created_at: "2026-11-17T10:00:00Z", path: ".github/workflows/release.yml", ...over });
  const criteria = { sha: SHA, tag: "v1.2.0", event: "push", since: "2026-11-17T09:00:00Z", workflow: "release.yml" };
  assert.equal(selectRuns([run({})], criteria).length, 1);
  assert.equal(selectRuns([run({ head_sha: "b".repeat(40) })], criteria).length, 0);
  assert.equal(selectRuns([run({ head_branch: "v1.2.1" })], criteria).length, 0);
  assert.equal(selectRuns([run({ event: "workflow_dispatch" })], criteria).length, 0);
  assert.equal(selectRuns([run({ created_at: "2026-11-17T08:00:00Z" })], criteria).length, 0);
  assert.equal(selectRuns([run({ path: ".github/workflows/other.yml" })], criteria).length, 0);
  assert.equal(selectRuns([run({ id: 1 }), run({ id: 2 })], criteria).length, 2);
});

test("CLI scripts run and report exit codes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "relcli-"));
  fs.writeFileSync(path.join(dir, "release.config.json"), JSON.stringify(electronConfig));
  fs.writeFileSync(path.join(dir, "CHANGELOG.md"), "# Changelog\n\n## [1.2.0] - 2026-11-17\n\n### Added\n\n- Added a thing.\n");
  const run = (script, argv) => spawnSync(process.execPath, [path.join(here, script), ...argv], { cwd: dir, encoding: "utf8" });
  assert.equal(run("check-changelog.mjs", ["--version", "1.2.0"]).status, 0);
  assert.equal(run("check-changelog.mjs", ["--version", "9.9.9"]).status, 2);
  assert.equal(run("check-changelog.mjs", []).status, 2);
  const printed = run("check-changelog.mjs", ["--version", "v1.2.0", "--print"]);
  assert.equal(printed.stdout.trim(), "### Added\n\n- Added a thing.");
  const out = path.join(dir, "notes.md");
  assert.equal(run("extract-release-notes.mjs", ["--version", "1.2.0", "--out", "notes.md"]).status, 0);
  assert.equal(fs.readFileSync(out, "utf8"), "### Added\n\n- Added a thing.\n");
  assert.equal(run("extract-release-notes.mjs", ["--version", "9.9.9", "--out", "x.md"]).status, 2);
  assert.ok(!fs.existsSync(path.join(dir, "x.md")), "nothing written for an invalid entry");
  fs.writeFileSync(path.join(dir, "package.json"), '{ "version": "1.2.0" }');
  fs.writeFileSync(path.join(dir, "package-lock.json"), '{ "version": "1.2.0", "packages": { "": { "version": "1.2.0" } } }');
  assert.equal(run("check-version-consistency.mjs", ["--version", "1.2.0"]).status, 0);
  assert.equal(run("check-version-consistency.mjs", ["--version", "1.3.0"]).status, 1);
  assert.equal(run("wait-for-run.mjs", ["--repo", "a/b", "--sha", "short", "--tag", "v1"]).status, 2);
});
