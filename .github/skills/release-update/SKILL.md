---
name: release-update
description: 'Prepare and publish app releases for this workspace from docs/HOW-TO-RELEASE.md. Use when asked to release, cut a version, tag a release, or publish an update. Requires a version number and supports release, alpha, or beta tag/message variants.'
argument-hint: 'Version and optional channel (release|alpha|beta), e.g. 1.2.0 release or 1.2.0 beta'
---

# Release Update Workflow

Use this skill to run the repository's release process documented in [docs/HOW-TO-RELEASE.md](../../../docs/HOW-TO-RELEASE.md).

## Inputs

Required:
- `version`: semantic version without `v` prefix (example: `1.2.0`)

Optional:
- `channel`: `release` (default), `alpha`, or `beta`

If `version` is missing, ask the user with `vscode/askQuestions` before taking release actions.

Before proceeding, read the current version from `package.json` and ensure the requested `version` is strictly greater than the current version.
If it is not greater, use `vscode/askQuestions` to request a new version and re-validate until a valid version is provided.

Suggested askQuestions prompts:
- Header: `version`
- Question: `What version should be released? (example: 1.2.0)`
- Header: `channel`
- Question: `Which channel should be used?`
- Options: `release` (recommended), `alpha`, `beta`

Suggested re-prompt when version is not greater than current:
- Header: `version`
- Question: `The provided version is not greater than the current package.json version (<currentVersion>). Enter a higher semantic version (x.y.z).`

## Tag and Message Rules

1. Compute `tagVersion`:
- `release`: `v<version>`
- `alpha`: `v<version>-alpha`
- `beta`: `v<version>-beta`

2. Annotated tag message must follow naming convention:
- `Release <tagVersion>`
- Examples:
  - `Release v1.2.0`
  - `Release v1.2.0-alpha`
  - `Release v1.2.0-beta`

## Procedure

1. Validate and normalize inputs.
- If channel omitted, set channel to `release`.
- Read `currentVersion` from `package.json`.
- Confirm the candidate `version` looks like semver (`x.y.z`).
- Compare `version` to `currentVersion` using semantic version comparison.
- If `version` is missing, invalid, or not strictly greater than `currentVersion`, ask with `vscode/askQuestions` and repeat validation.

2. Run the release preflight before changing or syncing anything.
- Confirm the current branch is `main`.
- Check `git status --short`; if any changes are present, stop and ask the user to commit or stash them. Do not checkout, pull, or modify a dirty worktree.
- Confirm the remote is available and `main` can be fast-forwarded from `origin/main`.
- Compute `tagVersion` and check both local and remote tags. If the tag already exists, stop and ask; never delete or recreate it unless the user explicitly requests a rerun.

3. Sync main branch.
```bash
git checkout main
git pull origin main
```

4. Confirm release notes are ready.
- Ensure `CHANGELOG.md` contains the matching version section.
- The release notes body must be sourced from that exact section (same headings/bullets style used in the `v1.3.1` release).

5. Update package versions.
```bash
npm version <version> --no-git-tag-version
```

6. Verify production build on Windows.
```bash
npm run verify:production:win
```

7. Commit release prep.
```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v<version>"
git push origin main
```

8. Create annotated tag with the computed `tagVersion`.
```bash
git tag -a <tagVersion> -m "Release <tagVersion>"
```

9. Push the tag to trigger release workflow.
```bash
git push origin <tagVersion>
```

10. Verify workflow completed for the tag.
- Record the run ID and URL for the run triggered by `<tagVersion>`.
- Prefer machine-readable polling with `gh run list` or `gh run view` and JSON fields for `status` and `conclusion`.
- Poll at a bounded interval until the run is complete. Continue only when `status` is `completed` and `conclusion` is `success`.
- If GitHub CLI output is not capture-safe, use the authenticated GitHub REST API for `actions/runs` and poll the same fields. If the run fails, times out, or cannot be identified, stop with the run URL, status, and the exact next resume step; do not edit notes or publish.

11. Verify the draft release before changing its notes.
- Confirm a GitHub release exists for `<tagVersion>`, is still a draft, and has the expected Windows installer asset.
- If the release is missing, published unexpectedly, or lacks the installer, stop with a checkpoint and do not apply notes.

12. Populate draft release notes from `CHANGELOG.md`.
- Extract the section for `version` from `CHANGELOG.md`:
  - Start at: `## [<version>] - ...`
  - End before the next `## [` heading (or end-of-file).
- Remove the section title line (`## [<version>] - ...`) from the extracted notes body.
- Keep the remaining markdown content exactly as-is (for example `### Added`, `### Changed`, `### Fixed`, bullet lists).
- Require that the section exists and has non-empty content.
- First run the helper with `--dry-run` and inspect the extracted notes. Apply the same notes only after the dry-run matches the requested section.
- Apply those notes to the draft release for `<tagVersion>` before publishing.

Use the helper command:
```bash
npm run release:notes -- <version> <channel>
```

Examples:
```bash
npm run release:notes -- 1.3.1 release
npm run release:notes -- 1.3.1 beta
```

13. Publish draft release.
- Review the title, notes, and assets after the notes update.
- Ask the user for explicit confirmation immediately before publishing. Do not publish without confirmation.
- After confirmation, publish the draft through the repository's GitHub release workflow or the authenticated GitHub CLI.

14. Post-publish checks.
- Release is Published (not Draft).
- Installer asset exists.
- Optional quick install smoke test.

## Failure and Resume Rules

- Treat each numbered procedure step as a checkpoint. If a command fails, stop at that step and report the command, relevant output, and whether any remote mutation completed.
- Do not repeat commit, tag, notes, or publish actions automatically after a failure. Resume only after checking the current branch, commit, tag, release, and draft state.
- The re-run procedure below is an exception only when the user explicitly asks to re-run an existing tag.

## Re-run Existing Tag (Use With Care)

Only if user explicitly asks to re-run a tag:
```bash
git tag -d <tagVersion>
git push origin :refs/tags/<tagVersion>
git tag -a <tagVersion> -m "Release <tagVersion>"
git push origin <tagVersion>
```

## Completion Criteria

- Version in `package.json` and `package-lock.json` matches input version.
- `CHANGELOG.md` has final notes for that version.
- Release notes body for `<tagVersion>` matches the corresponding `CHANGELOG.md` section content and formatting.
- Tag exists remotely with correct naming and message.
- GitHub Action run succeeded for the tag.
- Draft release published with installer attached.

## Example Prompts

- `/release-update 1.3.0`
- `/release-update 1.3.1 beta`
- `Release an update using version 2.0.0 and alpha channel.`
