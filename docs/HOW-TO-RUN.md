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

## Unit Tests

```bash
npm test
npm run test:watch
# Forward Vitest arguments, for example a file filter:
npm test -- src/main/__tests__/dev-test-data.test.ts
```

These commands launch Vitest using the installed development Electron binary
with `ELECTRON_RUN_AS_NODE=1`. Vitest and its workers use Electron's embedded
Node runtime, so they can load the same Electron-built `better-sqlite3` binary
as the app. The launcher sets this environment variable only for the test
process; it does not change your shell or normal app startup. Existing Electron
mocks still apply: this mode runs Node tests without launching an app window.

Complete the Setup steps before running tests. If the driver was rebuilt for
standalone Node, run `npx electron-rebuild -f -w better-sqlite3` to restore the
Electron binary. You no longer need to alternate native rebuilds between unit
tests and app runs. Use the npm test commands above instead of invoking Vitest
directly through standalone Node. When upgrading Electron or Vitest, verify
that Electron's embedded Node version satisfies Vitest's runtime requirements.

## App Data Profiles and UI Harness

The installed, packaged app continues to use its existing Electron `userData`
profile and `{userData}/data.db` (on Windows,
`%APPDATA%\Personal News\data.db`). `npm run dev` and `npm run start` use the
same persistent development profile at
`{appData}/<appName> Development/data.db` (on Windows,
`%APPDATA%\Personal News Development\data.db`). They are mutually exclusive:
starting one while the other holds the shared single-instance lock focuses that
instance. Either development mode can run alongside packaged production.

Use the isolated interactive scenario with:

```bash
npm run test:dashboard-drag
```

Each Electron harness run gets a unique OS temporary root containing its own Electron
`user-data/` profile and `harness.db`; it does not reuse development or
production data. Run logs and available failure screenshots are kept outside
that temporary profile under
`artifacts/electron-harness/<scenario>-<uuid>/`. The runner removes the profile
only after confirming the Electron process tree has exited. If termination
cannot be confirmed, it fails and preserves the profile. To author another
scenario, use the Playwright pattern in
[`scripts/PLAYWRIGHT-HARNESS.md`](../scripts/PLAYWRIGHT-HARNESS.md).

For renderer-only changes, use the standalone browser workflows described in
[`scripts/PLAYWRIGHT-HARNESS.md`](../scripts/PLAYWRIGHT-HARNESS.md):
`npm run dev:renderer-browser` starts a persistent localhost preview at
`http://127.0.0.1:4175/` for direct or Playwright interaction with HMR. It uses
the same fixture content as Electron across six feature-specific dashboard
pages, each with Small, Medium, and Large fixture widget instances.
`npm run test:renderer-browser` runs the headless Playwright Chromium matrix,
verifying all six dashboard pages at 12-, 8-, 4-, and 1-column projections,
then smoke-checking the standalone YouTube, Reddit Digest, Saved Posts, Sports,
and Settings routes, all Settings tabs, and Astronomy details. It saves
screenshots and diagnostics. Both
modes use synthetic fixtures and a mocked `window.api`, without Electron or a
database. Add or adapt a focused automated browser scenario when a renderer-only
change falls outside this matrix. Use Electron scenarios for changes crossing
IPC, persistence, preload/security, or main-process boundaries, and for
materially broader or complex integration cases.

`PERSONAL_NEWS_DB_PATH` explicitly overrides the database file. Packaged mode
supports this override for isolated smoke tests; dev and harness reject a
resolved path that aliases the protected production database before SQLite
opens. Harness mode also requires the selected profile and database to be
inside its unique temporary root. Do not point tests at the live production
database or use it for test writes.

Harness-only CDP is bound to `127.0.0.1`; packaged production ignores the
harness debugging configuration. Harness mode suppresses automatic source
polling and user-script startup so scenarios do not rely on live credentials or
uncontrolled polling. Normal dev/preview and packaged startup are unchanged.

### Developer Test Data

The first normal unpackaged `dev` or `start` session automatically seeds
synthetic test data into the shared persistent Development database; no
Settings setup is required. Later startups preserve the data exactly as you
left it, including edits, read/watched states, and deleted examples. Clear is
respected across restarts and does not trigger another automatic seed.
Settings > General > Developer Test Data provides these actions:

- **Seed test data:** initialize an inactive fixture set.
- **Update test data:** apply current definitions and dates, including new
  examples, while keeping existing notes, tags, read/watched states, and
  ordering. Missing examples are restored by this explicit action.
- **Reset test data:** confirm and restore the original fixture examples.
- **Clear test data:** confirm and remove fixture-owned data, including
  retired fixture IDs, and restore the preferences saved before seeding.

The status shows the applied fixture version and whether an update is
available. Updates are explicit; restarting does not apply a new version.
The Playwright harness is excluded from automatic seeding and starts with a
blank database so its UI scenario can exercise the Seed action. Packaged builds
do not seed fixtures or expose the controls, and the main-process mutation
handlers reject fixture changes when the app is packaged.

Seeding and clearing run transactionally. Seed uses reserved fixture IDs and
can be repeated; Clear removes only fixture-owned rows and the active marker,
not whole tables or unrelated user data. The active marker is stored in the
selected database, so fixture mode remains active across app restarts. Saved
Posts, Reddit Digest, Sports, Weather, and Astronomy are enabled when the
fixture set is initialized or reset so their examples are visible. Clear
restores their previous enabled flags, including an originally unset flag.
Astronomy restores only its enabled flag and keeps unrelated JSON settings
edits. Update initializes newly introduced flags without overriding flags
already captured for this fixture session. While active,
automatic polling and startup refreshes for Weather, Sports, YouTube, Saved
Posts ntfy ingestion, and the bundled Reddit Digest script are paused;
unrelated user scripts are not. Clearing fixtures removes the active marker
and allows those jobs to resume under the existing source settings. Explicit
manual refresh remains available and may replace fixture-backed content with
live source data.

The dashboard Saved Posts widget displays locally saved records even before
mobile ntfy is configured. It shows the mobile-saving setup prompt only when
there are no local posts to display. The fixture set contains six synthetic
Saved Posts, each with a note, ten Reddit Digest posts, and four synthetic
YouTube channels: one with fifteen videos and three with five videos each.
Sports examples use synthetic Baseball and Basketball leagues and teams. The
live Basketball game shares the live Baseball game's generated date and time,
with a synthetic 62–58 score. Fixture game details are read locally, including
sport-specific live progress; fixture standings are empty and do not call the
live provider. The Sports preset selects All Sports so both fixtures appear on
Seed and Reset. The first explicit Seed/Update also upgrades the three preset
configs that exactly match the former factory Baseball defaults to All Sports.
Changed fields and custom widgets are preserved, and a per-profile migration
marker preserves later intentional Baseball selections on future Updates.
Restarting does not run this upgrade. Astronomy has a cached synthetic
snapshot with Moon, horizon, planet, and event groups for Fixture City.

### Widget preset dashboards

Seeding adds six dashboard pages: YouTube, Reddit Digest, Saved Posts, Sports,
Weather, and Astronomy. Each contains labeled Small, Medium, and Large
instances with explicit fixture filters. Existing dashboard pages remain in
place. Edit `src/main/dev-test-data/definitions/dashboard-presets.ts` to change
the example pages or widget configurations; grid dimensions come from the
shared dashboard footprint helpers.

Update preserves existing preset layout and configuration edits and adds
missing presets. Reset restores fixture page layouts and widget configurations
to their defaults. Clear removes fixture instances even if you moved them to
another page, plus their configuration keys. Custom widgets added to a fixture
page are moved to a surviving dashboard page when the fixture page is removed.
Other widgets and their configuration remain intact.

Run `npm run test:local-test-data` to exercise the controls and inspect all
three sizes on each preset at the 12-, 8-, 4-, and 1-column grid projections.
Screenshots and run diagnostics are saved under
`artifacts/electron-harness/local-test-data-<uuid>/`.

### Adding fixtures for a new feature

When a new feature needs local fixture data:

1. Edit or add a typed builder in `src/main/dev-test-data/definitions/`.
   Define stable IDs and named cases there; keep SQL and JSON storage encoding
   in the contributor modules. Builders receive one `FixtureContext` captured
   by the coordinator; use its timestamp/date/week helpers instead of reading
   the clock separately for each record.
2. For a new feature, add its contributor and register it with the shared
   coordinator. Register its owned tables and mutable interaction fields in
   `src/main/dev-test-data/ownership.ts`; keep transactions in the coordinator.
3. Inspect the feature's read path, required related rows and settings, and
   display defaults so seeded records are visible through the existing UI.
4. Use the reserved `pn_dev_fixture_` ID namespace exclusively for fixtures.
   Bump `DEV_TEST_DATA_VERSION` in `src/main/dev-test-data.ts` when changing
   definitions. Use Update in an
   existing development profile to apply the new set.
5. Implement repeatable seeding and fixture-only cleanup through the
   coordinator's transaction. Preserve unrelated rows and user settings.
6. Gate every automatic refresh or ingestion path while fixtures are active,
   including writes from work already in flight; retain explicit manual
   refreshes.
7. Add contributor tests for read visibility, rollover, update/reset behavior,
   retired-ID cleanup, rollback, and preservation of non-fixture data. Use a
   fixed `FixtureContext` for deterministic builder assertions.
8. Extend the isolated UI harness to verify the feature using its real visible
   surface and confirm teardown leaves no fixture state behind.

## Build Windows Installer

```bash
npm run build:win -- --publish=never
```

Artifacts are written to `dist/` as an NSIS setup executable (x64).

The Windows build embeds `resources/icon.ico` into the packaged executable and
shortcuts. Code signing is separate: an unsigned build can show the correct
icon, but may produce SmartScreen or reputation warnings.

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
It also checks that generated icon assets are current and that the packaged ICO
contains the expected Windows sizes.

After installing a new build, test from a clean install location. Remove old
desktop or Start Menu shortcuts and unpin the previous taskbar shortcut before
checking the executable, shortcuts, and running taskbar button. Windows can
cache icon associations, so an old pinned shortcut is not evidence that the new
installer contains the wrong artwork.

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
