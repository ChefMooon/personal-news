---
name: release-update
description: 'Prepare and ship a Personal News release: changelog entry, version bump, checks, tag, CI build, draft verification, and an optional confirmed publish. Use when asked to release, cut a version, tag a release, or publish an update. Requires a version such as 1.2.0 or 1.2.0-beta.1.'
argument-hint: 'Version, for example 1.2.0 or 1.2.0-beta.1'
user-invocable: true
---

# Release update (Personal News)

Normalized release workflow for this Electron app. Generated from the `release-skill-maintenance` template; run its audit to detect drift instead of editing the shared steps by hand. Project-specific values live in `release.config.json`, not in this file.

The release ends as a **verified draft** with a link. Publishing is a separate confirmed step. Nothing is published without an explicit yes.

## Inputs

- `version`: `X.Y.Z` or `X.Y.Z-beta.N` (semver, optional leading `v`). If missing, ask with `vscode/askQuestions` (header `version`). It must be strictly greater than the version in `package.json`; re-ask until it is.
- The tag is always `vX.Y.Z[-pre.N]`. Prerelease versions create a prerelease draft.

Read `release.config.json` first. It defines the stack, the release branch, the version files, the checks, the platforms, and the expected assets. Stop and report any config problem; do not guess values.

## Hard rules

- Never force-push, delete, move or recreate a tag or release. Retry a failed build with `gh workflow run release.yml --repo OWNER/REPO --ref vX.Y.Z`.
- Never publish without an explicit "publish" answer in this run.
- Run every mutating `git` and `gh` command as its own command and check the exit code before the next one. A failed command is a hard stop until state is inspected.
- Never print, write or commit secrets or key material.
- Release metadata files (`release.config.json` `versionFiles`, `CHANGELOG.md`) may be dirty during preflight; any other change stops the release.

## Procedure

1. **Preflight.**
   - `git status --short --branch`; the branch must equal `releaseBranch` from the config, and the only changes allowed are the version files and the changelog. Ask before proceeding on any other branch or change.
   - Confirm `origin` is a GitHub remote; normalize it once to `OWNER/REPO` and use that slug for every `gh` call and URL.
   - `gh auth status` must pass.
   - `git fetch origin`; the local branch must not be behind `origin/<releaseBranch>`.
   - The tag must not exist locally (`git tag -l`) or remotely (`git ls-remote --tags origin`), and no release may already exist for it (`gh release view vX.Y.Z --repo OWNER/REPO` must fail).

2. **Changelog.** Run `node scripts/check-changelog.mjs --version X`.
   - Exit 0: continue.
   - Exit 3 (the entry exists but its heading says `Unreleased`): do not regenerate. Show the entry, ask the user to confirm using today's date (`vscode/askQuestions`, header `date`), change only that heading to `## [X.Y.Z] - YYYY-MM-DD`, and re-run the check.
   - Exit 2 (no entry) or 1 (violations): run `/update-changelog` for the version (`style` from the config, `format` `release-notes-md-v1`). It shows the generated entry and asks you to confirm or edit it; do not add a second prompt. Then re-run the check. If it still fails, feed the printed `CHANGELOG.md:<line>: <message>` lines back to `/update-changelog` once more; after two failed attempts, show the violations and ask the user how to proceed.
   - If the user declines the entry, stop without changing anything else.
3. **Bump versions.** `node scripts/check-version-consistency.mjs --version X --write`, then run it again without `--write`; it must exit 0. Review `git diff --stat`; only version files and the changelog may differ.
4. **Local checks.** Run each command in the config's `verify` list, one at a time, from the repo root. Stop on the first failure and report the command and the relevant output. Do not commit, tag or push after a failure.
5. **Commit.** Stage only the version files and `CHANGELOG.md` by name, then commit with exactly `chore(release): vX.Y.Z`. If the metadata is already committed on the release branch, do not create an empty commit.
6. **Push the branch.** `git push origin <releaseBranch>`. Verify `git ls-remote origin refs/heads/<releaseBranch>` equals `git rev-parse HEAD`. Save that full SHA.
7. **Tag.** `git tag -a vX.Y.Z -m "Release vX.Y.Z"` at that SHA, then `git push origin vX.Y.Z`. Verify the remote peeled tag (`git ls-remote origin "refs/tags/vX.Y.Z^{}"`) equals the saved SHA. Record a UTC timestamp just before the push (`since`).
8. **CI build.** The tag push starts `.github/workflows/release.yml`. In one non-interactive command wait for it:
   `node scripts/wait-for-run.mjs --repo OWNER/REPO --workflow release.yml --sha FULL_SHA --tag vX.Y.Z --event push --since SINCE_UTC`
   It prints one JSON line. Success requires `status` `completed` and `conclusion` `success` for the matching SHA and tag. Do not poll in chat. On failure, cancellation, ambiguity or timeout: stop, report the run URL and what failed, and say the draft remains for a retry (`gh workflow run release.yml --repo OWNER/REPO --ref vX.Y.Z`, then wait again with `--event workflow_dispatch`).
   **All-local repos (no enabled platform has `"build": "ci"`, and there is no `release.yml`):** skip the wait. Instead, after the tag push, run `node scripts/release-prepare.mjs --tag vX.Y.Z --repo OWNER/REPO` once. It performs the same gate the CI prepare job does (tag matches the version files, the entry is valid, the tagged commit is on `origin/<releaseBranch>`, at most one release) and finds or creates the single draft the local scripts upload into. Stop on any non-zero exit.
9. **Local platforms.** For each platform in the config with `"build": "local"`, run its `script` with the tag, and re-run step 10 afterwards. The script uploads into the existing draft (it never creates one), records `git rev-parse HEAD` before building, and refuses to upload if `HEAD` changed. Step 10 verifies every enabled platform (the default `--platforms all`).
10. **Verify the draft.** `node scripts/verify-release-draft.mjs --repo OWNER/REPO --tag vX.Y.Z --expect draft --notes`. It must exit 0: exactly one release, still a draft, exact title, prerelease flag correct, every expected asset present once and uploaded with a size above zero, no unknown assets, and the changelog entry present exactly once in the notes. On failure report each `FAIL` line and stop.
11. **Hand off.** Show the primary link `https://github.com/OWNER/REPO/releases/edit/vX.Y.Z` and the fallback `https://github.com/OWNER/REPO/releases`. Never show an `untagged-*` URL. Say plainly that the release is an unpublished draft.
12. **Publish (optional).** Ask with `vscode/askQuestions` (header `publish`): `Publish now` or `Leave as draft`. Only on `Publish now`: `gh release edit vX.Y.Z --repo OWNER/REPO --draft=false` (do not change the prerelease flag), then re-run step 10 with `--expect published`. Report the published URL.
13. **Post-release.** Suggest installing the build and launching it, checking the update path, and, for a published stable release, that existing installs see the update.

## Resume

If the run is interrupted, resume from the first incomplete step after inspecting real state (local and remote commits, tag, release, workflow run). Keep these checkpoint values in the summary: repo slug, tag, release SHA, run ID and URL, release ID, completed step, next step. Never recreate a release or tag and never select a run by recency.

## Completion criteria

- Every version file and the tag agree; the changelog entry is valid.
- The workflow run for the tagged SHA succeeded.
- The draft verifies (or the published release verifies, when published).
- The user has the draft link, and has chosen to publish or to leave it.
## Electron notes

- electron-builder must keep `releaseType: draft` in `package.json` `build.publish`, so it uploads into the draft the workflow's prepare job created.
- Installer names come from `build.win.artifactName`; the config's `assets` patterns must match them exactly (`{productName}-{version}-Setup-x64.exe`, its `.blockmap`, and `latest.yml`).
- Notes reach the draft body from the prepare job; in-app "What's new" uses the bundled `CHANGELOG.md`, so the format check protects both.

## Files this skill depends on

- `release.config.json`, `.github/workflows/release.yml`
- `scripts/`: `release-lib.mjs`, `release-notes-markdown.mjs`, `check-changelog.mjs`, `extract-release-notes.mjs`, `check-version-consistency.mjs`, `release-prepare.mjs`, `verify-release-draft.mjs`, `wait-for-run.mjs` (identical in every project; do not edit per project)
