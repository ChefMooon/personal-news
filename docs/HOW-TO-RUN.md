# How to Run, Package, and Release

This guide reflects the current development, packaging, and Windows pre-release verification workflow used for the app today.

For the tag push and GitHub Releases process itself, use [HOW-TO-RELEASE.md](HOW-TO-RELEASE.md).

## Prerequisites

- **Node.js** v20+ (v24 also works)
- **npm** v9+
- **Windows 10+** (tested), macOS or Linux also supported
- Visual Studio Build Tools (Windows only — required for better-sqlite3 native rebuild)

## Setup

```bash
# Install dependencies (skips native scripts)
npm install --ignore-scripts

# Rebuild better-sqlite3 against Electron's Node version
./node_modules/.bin/electron-rebuild -f -w better-sqlite3

# Download the Electron binary (if not already present)
node node_modules/electron/install.js
```

If you cloned this repo fresh and just run `npm install` and it succeeds without errors, the steps above may not be needed — the postinstall hook handles it automatically.

## Start

```bash
npm run dev
```

## Build Windows Installer

```bash
npm run build:win -- --publish=never
```

Artifacts are written to `dist/` as an NSIS setup executable (x64).

This is the local packaging command. The automated GitHub release workflow uses `npm run build:win -- --publish always` after you push a matching tag.

## Quick Release Checklist

- Confirm the app version in `package.json` matches the release you want to ship
- Run `npm run verify:production:win`
- Update the matching `CHANGELOG.md` entry
- Create an annotated tag like `v1.3.1`
- Push the tag with `git push origin v1.3.1`
- Wait for the GitHub Actions release workflow to finish
- Run `npm run release:notes -- 1.3.1 release` if you need to apply changelog notes to the GitHub release
- Confirm the new GitHub Release and Windows installer asset were created

## Publish a New Release

Releases are published automatically from a git tag push. The workflow listens for tags that match `v*.*.*`, so a tag like `v1.3.1` will start the Windows release job.

This section is the short version. For the full step-by-step GitHub release procedure, use [HOW-TO-RELEASE.md](HOW-TO-RELEASE.md).

### Step 1: Update the version

Make sure the app version in `package.json` matches the release you want to publish. The installer and release assets use that version number in their file names.

If you want npm to update the version for you, use one of these commands:

```bash
npm version patch
npm version minor
npm version major
```

If you update the version manually, keep the new version consistent with the tag you plan to push.

### Step 2: Verify the release build locally

Run the Windows verification pipeline before publishing:

```bash
npm run verify:production:win
```

This confirms the app builds, packages, and boots in smoke-test mode with the expected migrations and native binaries.

### Step 3: Create the release tag

Create an annotated tag that matches the version you are shipping. For example, if the app version is `1.3.1`, create `v1.3.1`:

```bash
git tag -a v1.3.1 -m "Release v1.3.1"
```

### Step 4: Push the tag to GitHub

Push the tag to the remote repository:

```bash
git push origin v1.3.1
```

Pushing the tag is the release trigger. A normal commit push will not start the release workflow.

### Step 5: Wait for GitHub Actions to finish

The `Release (Windows)` workflow runs on `windows-latest`, installs dependencies with `npm ci`, then executes:

```bash
npm run build:win -- --publish always
```

That job uses `GH_TOKEN` from `secrets.GITHUB_TOKEN` and publishes the Windows installer artifacts to the GitHub release associated with the tag.

### Step 6: Check the published release

After the workflow completes, open the GitHub Releases page and confirm that:

- The new release exists for the tag you pushed
- The Windows installer asset was uploaded
- The release notes and asset version match the tag and `package.json`

If you use `npm run release:notes`, make sure GitHub CLI (`gh`) is installed and authenticated first.

If the workflow fails, inspect the Actions run for the tag push and rerun after fixing the build issue.

## Verify Production Build (Windows)

Use the automated verification pipeline to validate build output, packaging, and native module health:

```bash
npm run verify:production:win
```

This command performs all required checks:

- Runs `npm run build`
- Runs Windows packaging (`npm run build:win -- --publish=never`)
- Verifies expected artifacts in `dist/`
- Verifies bundled migrations exist in packaged resources
- Verifies `better-sqlite3` native binary exists in packaged output
- Launches packaged app smoke mode and validates DB initialization + schema migration state

Smoke results are written to `dist/smoke-test-report.json`.

This is the current verified Windows pre-release workflow for the repository. The Electron window opens automatically during smoke mode. No external services or API keys are required for the smoke test itself.

## What to Expect

`npm run dev` launches the full desktop app with the current dashboard, settings, Script Manager, Saved Posts, notifications preferences, and tray behavior controls. The packaged smoke test verifies that the built app starts, opens its database successfully, and applies bundled migrations in packaged mode.

## Known Limitations

The current workflow is verified for Windows packaging and release. macOS and Linux build commands exist in `package.json`, but this document does not claim equivalent published release artifacts or a verified release process for those targets yet.

Scheduled script runs and ntfy polling only occur while the desktop app is running.

Desktop notifications depend on Electron notification support on the host OS and are suppressed while the main window is focused.
