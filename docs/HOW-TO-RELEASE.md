# How to Release

Use the repository `/release-update` skill for an end-to-end release. It reads
[`release.config.json`](../release.config.json), checks the version and
changelog, runs the configured verification commands, creates and pushes the
annotated tag, waits for CI, verifies the GitHub draft, and asks before
publishing. Follow its checkpoints and stop on any failed check.

This guide summarizes the handoff and points to the project configuration.
For local setup, packaging, and Windows production verification, see
[`HOW-TO-RUN.md`](HOW-TO-RUN.md).

## Release configuration

[`release.config.json`](../release.config.json) is the source of truth for the
release branch, version files, changelog format, verification commands,
platforms, asset patterns, and draft title. Keep it aligned with
`package.json`, `package-lock.json`, `CHANGELOG.md`, and
`.github/workflows/release.yml`.

Release notes are validated in the `release-notes-md-v1` format. The prepare
job puts the matching changelog entry into the GitHub draft, and the app also
uses the bundled changelog for its in-app What's New display. Add and validate
the changelog entry before starting the release.

## Release flow

1. Confirm the configured release branch is current and the working tree has
   only the release metadata changes permitted by the skill.
2. Add the changelog entry and set the version consistently in
   `package.json` and `package-lock.json`. A prerelease uses a `-beta.N`
   version, for example `2.0.0-beta.1`.
3. Run every command in the `verify` list in `release.config.json`, in order.
   The skill stops if any check fails.
4. Commit and push the release metadata to the configured branch. The skill
   creates an annotated `vX.Y.Z` or `vX.Y.Z-beta.N` tag at the verified commit
   and pushes it. Pushing the tag starts `.github/workflows/release.yml`.
5. Wait for the workflow run matching that tag and commit. CI prepares one
   GitHub draft, builds the enabled CI platforms into it, and verifies the
   resulting draft and assets.
6. Review the verified draft at the link provided by the skill. The release
   remains unpublished until you explicitly choose to publish it.

If a build fails, fix the cause and retry the workflow on the existing tag:

```bash
gh workflow run release.yml --repo OWNER/REPO --ref vX.Y.Z
```

Do not delete, move, or recreate a tag or release to retry. The skill waits
for the retry run and verifies the existing draft again.

## Adding macOS or Linux

Use the **Add macOS or Linux later** checklist in the shared
`C:\Users\justi\.claude\skills\release-skill-maintenance\references\release.config.md`
reference. Update the platform configuration, workflow build and verification
dependencies, and Electron build targets together. Confirm asset patterns
against a real build, then run the release audit before enabling that platform.
