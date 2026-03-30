# How to Release (Tag-Triggered GitHub Action)

This is a step-by-step guide to publish a release for this repo.

The release workflow is triggered only when you push a git tag that matches `v*.*.*` (example: `v1.1.0`).

## One-Time Context

- GitHub Action: `.github/workflows/release-tag.yml`
- Trigger: `push` on tags like `v1.1.0`
- Build/publish command used by CI: `npm run build:win -- --publish always`

## Release Steps (v1.1.0)

1. Make sure you are on `main` and fully up to date:

```bash
git checkout main
git pull origin main
```

2. Confirm `CHANGELOG.md` includes the `1.1.0` section and final notes.

3. Update app version in `package.json` to `1.1.0`.

You can do it automatically:

```bash
npm version 1.1.0 --no-git-tag-version
```

4. Verify release build locally (Windows):

```bash
npm run verify:production:win
```

5. Commit the release prep changes:

```bash
git add package.json CHANGELOG.md
git commit -m "chore(release): v1.1.0"
git push origin main
```

6. Create the annotated release tag:

```bash
git tag -a v1.1.0 -m "Release v1.1.0"
```

7. Push the tag (this triggers the GitHub Action):

```bash
git push origin v1.1.0
```

8. Open GitHub Actions and watch the `Release (Windows)` workflow for the `v1.1.0` tag run.

9. Wait for the workflow to finish successfully.

10. Open GitHub Releases and find the new release for `v1.1.0`.

11. Publish the draft release:

- Open the release entry
- Review title and notes
- Confirm the Windows installer asset is attached
- Click **Publish release**

The release is not public until you publish this draft.

## Quick Verification After Publishing

1. Confirm the release is marked as Published (not Draft).
2. Confirm installer asset exists (example name: `Personal News-1.1.0-Setup-x64.exe`).
3. Download and install quickly to smoke-check startup.

## Common Mistakes

- Pushing commits without pushing the tag: no release workflow will run.
- Tag/version mismatch (`package.json` is `1.1.0` but tag is different).
- Forgetting to publish the draft release after CI finishes.
- Reusing an existing tag name (delete/recreate carefully if needed).

## If You Need to Re-Run v1.1.0 Tag

Only do this if you understand the impact on release history.

```bash
git tag -d v1.1.0
git push origin :refs/tags/v1.1.0
git tag -a v1.1.0 -m "Release v1.1.0"
git push origin v1.1.0
```