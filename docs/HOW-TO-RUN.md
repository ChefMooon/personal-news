# How to Run the Prototype

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

## Quick Release Checklist

- Confirm the app version in `package.json` matches the release you want to ship
- Run `npm run verify:production:win`
- Create an annotated tag like `v1.2.3`
- Push the tag with `git push origin v1.2.3`
- Wait for the GitHub Actions release workflow to finish
- Confirm the new GitHub Release and Windows installer asset were created

## Publish a New Release

Releases are published automatically from a git tag push. The workflow listens for tags that match `v*.*.*`, so a tag like `v1.2.3` will start the Windows release job.

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

Create an annotated tag that matches the version you are shipping. For example, if the app version is `1.2.3`, create `v1.2.3`:

```bash
git tag -a v1.2.3 -m "Release v1.2.3"
```

### Step 4: Push the tag to GitHub

Push the tag to the remote repository:

```bash
git push origin v1.2.3
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

The Electron window opens automatically. No external services, network connections, or API keys are required to explore the seeded dashboard data — Script Manager reads local Python scripts from the configured **Script Home Directory**.

## What to Expect

The app opens a 1280x800 window (minimum 900x600) with a collapsible sidebar on the left and the main content on the right. The **Dashboard** loads by default showing three widgets: the YouTube widget (two seeded channels with video carousels and one upcoming stream), the Reddit Digest widget (empty until the digest script runs, with sort and layout controls), and the Saved Posts widget (three seeded saved posts). Clicking "Edit Layout" enables drag-and-drop reordering of widgets and eye-icon visibility toggles. The **Script Manager** route reads Python scripts from the configured **Script Home Directory** and lets you open that folder or jump to the Scripts settings tab. The **Settings** screen has working tabs: API Keys (no-op save), YouTube (channel enable toggles update local state only), Reddit Digest (first subreddit auto-registers the bundled script on a weekly Monday 09:00 schedule), and Appearance (System/Light/Dark theme switcher that actually applies). Links in video cards and post rows open your default browser.

## Known Limitations

The following are intentionally not implemented in this prototype:

- YouTube RSS polling — no actual RSS fetches; all video data is seeded in the database
- YouTube Data API v3 calls — no HTTP calls to YouTube; API key field is a no-op
- ntfy.sh polling — no ntfy ingestion; saved posts are seeded statically
- Saved Posts full-page view — the `/saved-posts` route is a placeholder
- ntfy onboarding flow — not present
- Script execution — the Script Manager executes configured Python scripts, but it is still limited to scripts registered from the home directory
- node-cron scheduling — no cron jobs; scripts are display-only
- safeStorage for API key — the key input does not persist anything
- Tag management — not implemented
- FTS5 search — not implemented
- Custom theme creation — only System/Light/Dark built-ins work
- electron-builder packaging — Windows NSIS (x64) installer is configured; macOS and Linux targets are still pending
- Window management / tray icon — single window only
- Per-channel enabled toggle persistence — toggle updates local React state only
- Channel add flow — Add button logs to console only
