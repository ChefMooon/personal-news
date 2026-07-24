# How to Release (Tag-Triggered GitHub Action)

This is the step-by-step guide to publish a tagged GitHub release for this repo.

Use this guide together with [HOW-TO-RUN.md](HOW-TO-RUN.md): that document covers local setup, packaging, and the verified pre-release check, while this document covers the GitHub release handoff.

The release workflow is triggered only when you push a git tag that matches `v*.*.*` (example: `v1.3.1`).

## One-Time Context

- GitHub Action: `.github/workflows/release-tag.yml`
- Trigger: `push` on tags like `v1.3.1`
- Build/publish command used by CI: `npm run build:win -- --publish always`
- Current automated publish target: Windows installer artifacts
- Release note helper requirement: GitHub CLI (`gh`) must be installed and authenticated before running `npm run release:notes`

## Release Steps

1. Make sure you are on `main` and fully up to date:

```bash
git checkout main
git pull origin main
```

2. Choose the version you are releasing and keep that same version in every step below.

Example in this guide: `1.3.1` and tag `v1.3.1`.

3. Confirm `CHANGELOG.md` includes the matching version section and final notes.

4. Update app version in `package.json` and `package-lock.json` to the release version.

You can do it automatically:

```bash
npm version 1.3.1 --no-git-tag-version
```

**Note:** Run this command to update `package-lock.json`
```bash
npm install
```

5. Verify the release build locally (Windows):

```bash
npm run verify:production:win
```

6. Commit the release prep changes:

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore(release): v1.3.1"
git push origin main
```

7. Create the annotated release tag:

```bash
git tag -a v1.3.1 -m "Release v1.3.1"
```

8. Push the tag. This triggers the GitHub Action:

```bash
git push origin v1.3.1
```

9. Open GitHub Actions and watch the `Release (Windows)` workflow for that tag run.

10. Wait for the workflow to finish successfully.

11. Open GitHub Releases and find the new release for that tag.

12. Populate the GitHub release notes from the matching `CHANGELOG.md` section:

```bash
npm run release:notes -- 1.3.1 release
```

The helper strips the version heading, keeps the remaining markdown formatting intact, and applies those notes directly to the GitHub release for the matching tag.

13. Review the release entry and confirm the Windows installer asset is attached.

If the GitHub release is still in draft state, publish it.

This repository's release automation is currently centered on Windows artifacts.

## Quick Verification After Publishing

1. Confirm the release exists for the tag you pushed.
2. Confirm installer asset exists (example name: `Personal News-1.3.1-Setup-x64.exe`).
3. Download and install quickly to smoke-check startup.

## Common Mistakes

- Pushing commits without pushing the tag: no release workflow will run.
- Tag/version mismatch (`package.json` version and git tag do not match).
- Running `npm run release:notes` without GitHub CLI installed or authenticated.
- Forgetting to review the GitHub release entry after CI finishes.
- Reusing an existing tag name (delete/recreate carefully if needed).

## If You Need to Re-Run a Tag

Only do this if you understand the impact on release history.

```bash
git tag -d v1.3.1
git push origin :refs/tags/v1.3.1
git tag -a v1.3.1 -m "Release v1.3.1"
git push origin v1.3.1
```