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

2. Sync main branch.
```bash
git checkout main
git pull origin main
```

3. Confirm release notes are ready.
- Ensure `CHANGELOG.md` contains the matching version section.
- The release notes body must be sourced from that exact section (same headings/bullets style used in the `v1.3.1` release).

4. Update package versions.
```bash
npm version <version> --no-git-tag-version
```

5. Verify production build on Windows.
```bash
npm run verify:production:win
```

6. Commit release prep.
```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v<version>"
git push origin main
```

7. Create annotated tag with the computed `tagVersion`.
```bash
git tag -a <tagVersion> -m "Release <tagVersion>"
```

8. Push the tag to trigger release workflow.
```bash
git push origin <tagVersion>
```

9. Verify workflow completed for the tag.
- Watch `Release (Windows)` in GitHub Actions for the pushed tag.

10. Populate draft release notes from `CHANGELOG.md`.
- Extract the section for `version` from `CHANGELOG.md`:
  - Start at: `## [<version>] - ...`
  - End before the next `## [` heading (or end-of-file).
- Remove the section title line (`## [<version>] - ...`) from the extracted notes body.
- Keep the remaining markdown content exactly as-is (for example `### Added`, `### Changed`, `### Fixed`, bullet lists).
- Apply those notes to the release for `<tagVersion>` before publishing.

Use the helper command:
```bash
npm run release:notes -- <version> <channel>
```

Examples:
```bash
npm run release:notes -- 1.3.1 release
npm run release:notes -- 1.3.1 beta
```

11. Publish draft release.
- Open GitHub Releases, review title/notes/assets, and publish the draft.

12. Post-publish checks.
- Release is Published (not Draft).
- Installer asset exists.
- Optional quick install smoke test.

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
