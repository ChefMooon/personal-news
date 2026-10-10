---
title: "Local Development Test Data - Implementation Plan"
status: COMPLETED
current_phase: 4 / 4
created: 2026-10-10
last_updated: 2026-10-10
---

# Overall Plan Completion Status

* **Final State:** COMPLETED
* **Total Phases Completed:** 4 / 4
* **Summary of Outcome:** All four phases and their acceptance criteria are complete. Typed feature fixtures and transactional seed/clear, automatic-polling guards, unpackaged developer controls, isolated UI coverage, database lifecycle guidance, and the contributor checklist are implemented and validated. No material unresolved risks or manual-validation attestations remain outstanding.
* **Final Validation Evidence:**
  - Phase 1: `npm test -- src/main/__tests__/dev-test-data.test.ts` passed (1 file, 5 tests); `npm run typecheck:node` and Prettier passed.
  - Phase 2: The exact five-file polling-focused test command passed (5 files, 22 tests); `npm run typecheck:node` and Prettier passed.
  - Phase 3: The required main test command passed (2 files, 11 tests); `npm run test:local-test-data` passed across Reddit Digest, Saved Posts, Weather, Sports, and YouTube, including fixture-only clear and isolated teardown; typecheck, Prettier, and `git diff --check` passed.
  - Phase 4: `npm test` passed (34 files, 207 tests); `npm run typecheck`, `npm run test:local-test-data`, `npm run test:dashboard-drag`, `npm run build`, and `npm run verify:production:win` passed. Packaged smoke initialized schema version 10 on a disposable database; `git diff --check` passed.
  - Packaged controls are conditionally hidden by the main-process status (`available: !app.isPackaged`), and both mutation handlers reject packaged calls; the unit test verifies the mutation callback is not invoked. The packaged smoke check verified startup but did not interactively open Settings. No plan item is labeled Manual Validation.
  - Initial harness attempts reported native ABI / uncertain process-termination failures and preserved isolated profiles per the runner's safety behavior. Successful reruns passed and cleaned up their own profiles. No production or persistent Development database was used.

# Specification & Overview

### 1. Scope & Objective
- **Goal:** Provide deterministic synthetic data for local development of Reddit Digest, Saved Posts, Weather, Sports, and YouTube, with an explicit way to seed and clear it from the unpackaged app.
- **In-Scope:** A shared fixture set; transactional, repeatable seed and fixture-only clear operations; a persistent fixture-active state; pausing automatic polling for fixture-backed sources while the state is active; an opt-in Settings action; isolated harness coverage; updates to the existing temporary-database documentation; and a documented, feature-owned path for adding fixtures when new features are added.
- **Out-of-Scope:** Seeding packaged production, automatic seeding at startup, using real Reddit/weather/sports/YouTube content, clearing non-fixture user data, disabling unrelated user scripts, blocking manually triggered refreshes, and adding schema migrations unless discovery proves existing storage insufficient.
- **User Decisions:** Automatic polling for fixture-backed sources pauses until fixtures are cleared. Manual Refresh actions remain available.

### 2. Technical Constraints & Architecture
- Database writes stay in the main process. The renderer uses the existing preload `window.api.invoke` bridge and shared IPC contracts; it must not access SQLite or Node APIs.
- Keep fixture records identifiable by stable, reserved IDs. Seed is idempotent; clear deletes only fixture-owned rows and never truncates whole application tables.
- Keep feature-specific fixture data and seed/clear logic behind a small typed contributor contract. A shared coordinator owns the active marker and transaction so adding a feature does not duplicate seed/clear safety behavior.
- Store the active-fixture marker in the existing settings key/value table if that supports the required persistence. Avoid a schema migration unless the inspected data model requires one.
- The marker must survive app restarts so automatic polling remains paused until the developer clears fixtures. Clearing removes the marker and resumes automatic polling under the user's existing source settings.
- Gate seed and clear operations in the main process to unpackaged runtimes and preserve the existing production-database path protections. Keep the controls available for the `dev` and `start` Development profile; the Playwright harness continues to use its per-run temporary database.
- Do not change the user's feature-enable flags, widget layout, tracked real teams/channels, or unrelated scripts. If no Weather default location is set, the fixture may be selected as the default; clear it only if it is still selected.
- Pause automatic/startup refreshes for Weather, Sports, YouTube, Saved Posts ntfy ingestion, and the bundled Reddit Digest script. Do not pause other user scripts or explicit manual refresh actions. Prevent an already-running automatic refresh from overwriting fixture rows after fixture mode is activated.

### 3. Repository Evidence, Risks & Assumptions
- The earlier [Reddit-only assessment](../reddit-test-data/reddit-test-data-spec.md) established that Reddit Digest and Saved Posts already have storage tables and read IPC handlers. This plan expands that scope to the other requested sources and incorporates the user's decisions about seed/clear and polling.
- [001_initial.sql](../../../src/main/db/migrations/001_initial.sql) defines `reddit_digest_posts`, `saved_posts`, `yt_channels`, and `yt_videos`. Saved Posts FTS triggers track inserts, updates, and deletes; YouTube videos reference channels with cascade deletion.
- [002_weather.sql](../../../src/main/db/migrations/002_weather.sql) defines `weather_locations`, `weather_cache`, and `weather_alert_state`; [010_astronomy_cache.sql](../../../src/main/db/migrations/010_astronomy_cache.sql) adds location-linked cache data that must be considered when fixture locations are cleared.
- [003_sports.sql](../../../src/main/db/migrations/003_sports.sql) and [004_sports_team_cache.sql](../../../src/main/db/migrations/004_sports_team_cache.sql) define league, team, event, cache-meta, and opponent-cache records. [sports/cache.ts](../../../src/main/sources/sports/cache.ts) has upsert helpers and current-event queries used by the UI.
- [weather/index.ts](../../../src/main/sources/weather/index.ts), [sports/index.ts](../../../src/main/sources/sports/index.ts), and [youtube/index.ts](../../../src/main/sources/youtube/index.ts) start or schedule background refreshes outside the harness. Sports also has live-refresh timers. [reddit/index.ts](../../../src/main/sources/reddit/index.ts) schedules ntfy polling. [scripts/index.ts](../../../src/main/sources/scripts/index.ts) registers the bundled Reddit Digest script with [scheduler.ts](../../../src/main/sources/scripts/scheduler.ts), which also schedules user scripts; pause only the bundled digest job. Refresh mechanisms are feature-specific, and some source functions are shared by automatic and manual triggers, so Phase 2 must classify trigger origin and guard writes rather than only stop timers.
- [Settings.tsx](../../../src/renderer/src/routes/Settings.tsx) already has a General tab suitable for a developer-only test-data section. [ipc-types.ts](../../../src/shared/ipc-types.ts) and [main/ipc/index.ts](../../../src/main/ipc/index.ts) are the existing shared-contract and handler locations.
- [database-profile.ts](../../../src/main/db/database-profile.ts) enforces production-path protection and harness path containment. [HOW-TO-RUN.md](../../HOW-TO-RUN.md) already documents production, persistent Development, and temporary harness databases; [PLAYWRIGHT-HARNESS.md](../../../scripts/PLAYWRIGHT-HARNESS.md) describes fixture setup through IPC and cleanup callbacks.
- Existing tests use Vitest and in-memory `better-sqlite3` databases, as in [cache.foreign-key.test.ts](../../../src/main/sources/sports/__tests__/cache.foreign-key.test.ts). The UI harness is run through an npm script in [package.json](../../../package.json).
- **Assumptions:** The action belongs in Settings > General and is visible only when the main process reports an unpackaged runtime. The current `settings` table can hold the persistent fixture-active marker. Dashboard layout and feature enablement remain unchanged; local developers add or enable widgets through existing UI as needed. Synthetic IDs and data remain clearly distinguishable from real records. The fixture service uses the active main-process database connection selected by the existing profile resolver; it does not open or guess a database path.
- **Risks to verify:** Weather data is stored as JSON and its dashboard needs a selected location; sports reads join fixture events to enabled leagues/teams; YouTube videos require a channel; Saved Posts triggers must remain consistent. Automatic network work may already be in flight when the user seeds fixtures.
- **Implementation requirements:** Distinguish automatic work from explicit manual refreshes through shared source functions. Before an automatic operation persists fixture-backed application data, it must re-check the active-fixture marker at the write boundary and discard the result if fixture mode is active. Re-check before each persistence transaction if an operation has multiple write stages. Explicit manual refreshes remain available.
- **Open decisions:** None blocking.

---

# Execution Plan & Handoffs

## Phase 1: Build the fixture dataset and safe seed/clear service
- **Status:** COMPLETED
- **Objective:** Define representative, synthetic data and implement atomic, repeatable fixture seeding and fixture-only cleanup in the main process.
- **Dependencies:** None.

### Tasks
- [x] Inspect the latest migrations and data-read paths for all five feature areas. Confirm required rows, foreign keys, cascades, filters, and serialized Weather JSON shape before writing fixtures.
- [x] Define stable fixture-only IDs and typed sample records covering multiple Reddit weeks/subreddits and read states; Saved Posts tags/notes/body; Weather current/hourly/daily/alert states; Sports tracked teams and current/upcoming/completed events; and YouTube channels/videos with representative media and watch states.
- [x] Add the main-process fixture coordinator at `src/main/dev-test-data.ts` using the existing database connection. Define a small typed contributor contract and keep the Reddit Digest, Saved Posts, Weather, Sports, and YouTube fixture records and seed/clear logic in feature-specific modules under `src/main/dev-test-data/`. Register those contributors with the coordinator, which owns the shared transaction and active marker. Reuse existing Sports cache helpers where appropriate, preserve Saved Posts FTS triggers, and avoid touching shared cache metadata or unrelated user rows.
- [x] Make seeding transactional and idempotent. Make clearing transactional and restricted to the fixture IDs, including dependent Weather, Sports, YouTube, and Reddit rows.
- [x] Persist the active-fixture marker with the seeded rows. If the fixture Weather location must become the default to be visible, set it only when no default exists and clear it only if it still points to that fixture.
- [x] Add focused Vitest coverage at `src/main/__tests__/dev-test-data.test.ts` for repeated seed/clear, preservation of non-fixture sentinel rows, transaction rollback, foreign-key cleanup, Weather snapshot parsing, and Saved Posts FTS consistency.

### Verification & Acceptance Criteria
*All criteria must pass before advancing to the handoff report.*
- [x] **Automated Checks:** Run `npm test -- src/main/__tests__/dev-test-data.test.ts`.
- [x] **Functional Assertions:** Seeding twice produces the same fixture set with no duplicate rows; clearing twice is safe; a non-fixture row in each affected table survives clear; all fixture records are readable through existing module query paths.
- [x] **Functional Assertions:** Saved Posts search reflects seeded rows and no longer returns cleared rows; foreign-key-linked fixture rows are removed without deleting unrelated cache or application data.
- [x] **Functional Assertions:** A failed seed transaction leaves neither partial fixture rows nor an active-fixture marker.

### Plan Compliance Checklist
*Verify each item against the actual diff before claiming this phase complete. Do not mark the phase COMPLETED if any item fails.*
- [x] **Required Files:** `src/main/dev-test-data.ts`; feature-specific fixture contributor modules under `src/main/dev-test-data/`; `src/main/__tests__/dev-test-data.test.ts`; existing feature schemas and cache helpers inspected and reused.
- [x] **Boundaries:** No renderer-side database access, no whole-table deletes, no production seed data, no new dependency, and no migration unless the existing schema is proven insufficient and the scope is re-approved.
- [x] **Legacy Code Removed:** None. Existing feature read paths, ingest paths, FTS triggers, and user data remain in place.
- [x] **Acceptance Checks:** Confirm the focused tests and all functional assertions above were run.

### Phase 1 Handoff & Verification Report
- **Compliance Check:** PASSED
- **Verification Result:** PASSED
- **Execution Proof / Logs:**
  ```text
  $ npm test -- src/main/__tests__/dev-test-data.test.ts
  -> Test Files 1 passed (1); Tests 5 passed (5); exit code 0.

  $ npm run typecheck:node
  -> TypeScript check passed; exit code 0.

  $ npx prettier --check <Phase 1 TypeScript files>
  -> All matched files use Prettier code style; exit code 0.
  ```
- **Artifacts Created/Modified:**
  - `src/main/dev-test-data.ts` - Main-process transaction coordinator, active marker, and weather-default handling.
  - `src/main/dev-test-data/types.ts` - Typed feature contributor contract.
  - `src/main/dev-test-data/fixtures.ts` - Shared synthetic timestamp/date helpers.
  - `src/main/dev-test-data/reddit-digest.ts` - Reserved multi-week Reddit Digest fixture records and scoped cleanup.
  - `src/main/dev-test-data/saved-posts.ts` - Tagged/noted Saved Posts fixtures and trigger-preserving cleanup.
  - `src/main/dev-test-data/weather.ts` - Typed Weather location, current/hourly/daily/alert fixtures and dependent-row cleanup.
  - `src/main/dev-test-data/sports.ts` - Tracked teams and completed/live/upcoming events using existing cache helpers.
  - `src/main/dev-test-data/youtube.ts` - Channel/video, media, and watch-state fixtures with guarded dependent cleanup.
  - `src/main/__tests__/dev-test-data.test.ts` - Five focused tests for read visibility, idempotence, sentinel preservation, safe cascades, rollback, Weather parsing, and FTS.
  - `docs/plans/local-test-data/local-test-data-plan.md` - Phase 1 execution status and evidence.
- **Decisions & Deviations:** Used the existing `settings` table key `dev_test_data_active` with value `true`; clear deletes the marker in the same transaction. Weather's default is set only when unset and cleared only while it still references the fixture location. Clear refuses to proceed if non-fixture Sports rows or YouTube videos reference fixture-owned parents, preventing foreign-key cascades into user data. The fixture YouTube channel is ordered after existing channels and has notifications disabled so it does not change existing channel preferences. No schema, dependency-manifest, IPC, renderer, polling, or non-plan documentation changes were made. The initial test attempt found the installed `better-sqlite3` binary was built for a different Node module version; `npm rebuild better-sqlite3` corrected the local environment, with no manifest or lockfile change.
- **Next Phase Context:** Phase 2 remains NOT_STARTED. It can read `isDevTestDataActive()` or `DEV_TEST_DATA_ACTIVE_SETTING_KEY`; the marker is persisted across restarts and only removed by fixture clear. Fixture contributors and reserved IDs are registered centrally; the Phase 1 focused tests and main-process typecheck pass. Do not change polling or other Phase 2 paths as part of this handoff.

---

## Phase 2: Pause automatic polling while fixtures are active
- **Status:** COMPLETED
- **Objective:** Keep the persistent Development dataset stable across app startup and scheduled refreshes, without disrupting manual refreshes or unrelated user scripts.
- **Dependencies:** Phase 1 provides the persistent active-fixture marker and fixture-owned record IDs.

### Tasks
- [x] Inventory automatic, implicit, and explicit triggers for each affected feature. Include startup and interval/cron work, Sports live-refresh timers, and the bundled Reddit Digest script's startup, catch-up, and scheduled triggers; distinguish these from explicit user refreshes and manual script runs.
- [x] Check the active-fixture marker before automatic startup/scheduled work in Weather, Sports, YouTube, and Saved Posts ntfy polling. Gate only automatic execution of the bundled Reddit Digest script while fixtures are active; preserve unrelated user scripts and explicit manual runs.
- [x] Propagate trigger origin through source functions shared by automatic and manual paths. Immediately before each automatic persistence transaction that can change fixture-backed application data, re-check the active marker and discard the result if fixture mode became active while the request was in flight. Stopping a timer alone is not sufficient.
- [x] Ensure the marker is checked on every app startup. Clearing fixtures removes the marker and restores automatic polling according to current feature enablement and interval settings, without modifying those settings.
- [x] Add focused tests at `src/main/__tests__/dev-test-data-polling.test.ts` for active-mode startup and scheduled work, app restart, clearing/resume behavior, and isolation of unrelated scripts. Prove that an automatic request already in flight cannot persist fixture-backed results after activation, and that explicit manual refreshes remain available.

### Verification & Acceptance Criteria
*All criteria must pass before advancing to the handoff report.*
- [x] **Automated Checks:** Run `npm test -- src/main/__tests__/dev-test-data.test.ts src/main/__tests__/dev-test-data-polling.test.ts src/main/sources/weather/__tests__/forecast-utils.test.ts src/main/sources/sports/__tests__/cache.foreign-key.test.ts src/main/sources/reddit/__tests__/ntfy.test.ts`.
- [x] **Functional Assertions:** With the marker active, automatic/startup polling performs no network fetch or fixture-overwriting write for the fixture-backed sources.
- [x] **Functional Assertions:** An automatic request already in flight when fixture mode activates cannot persist fixture-backed results afterward; explicit manual refreshes remain available.
- [x] **Functional Assertions:** The pause survives an app restart; clearing the fixture marker restores normal automatic polling under existing settings.
- [x] **Functional Assertions:** Manual Refresh actions remain available, and user-authored scripts other than the bundled Reddit Digest script continue to run normally.

### Plan Compliance Checklist
*Verify each item against the actual diff before claiming this phase complete. Do not mark the phase COMPLETED if any item fails.*
- [x] **Required Files:** Updated Weather, Sports, YouTube, Saved Posts ntfy, and bundled Reddit Digest paths; Sports cache transaction guard; `src/main/__tests__/dev-test-data-polling.test.ts`. Astronomy's automatic refresh was also guarded because Weather chains into its fixture-location cache.
- [x] **Boundaries:** Pause only automatic work for fixture-backed sources. Do not disable all scripts, alter user poll settings, block manual refresh, or change normal polling when the marker is absent.
- [x] **Legacy Code Removed:** No automatic path, including Sports live-refresh timers or bundled Reddit Digest catch-up, bypasses the active-fixture check; ordinary refresh behavior remains unchanged when fixtures are inactive.
- [x] **Acceptance Checks:** Confirm polling, restart, clear/resume, manual-refresh, in-flight-write, live-timer, and unrelated-script assertions were actually run.

### Phase 2 Handoff & Verification Report
- **Compliance Check:** PASSED
- **Verification Result:** PASSED
- **Execution Proof / Logs:**
  ```text
  $ npm test -- src/main/__tests__/dev-test-data.test.ts src/main/__tests__/dev-test-data-polling.test.ts src/main/sources/weather/__tests__/forecast-utils.test.ts src/main/sources/sports/__tests__/cache.foreign-key.test.ts src/main/sources/reddit/__tests__/ntfy.test.ts
  -> Test Files 5 passed (5); Tests 22 passed (22); exit code 0.

  $ npm run typecheck:node
  -> TypeScript check passed; exit code 0.

  $ npx prettier --check <Phase 2 TypeScript files>
  -> All matched files use Prettier code style; exit code 0.
  ```
- **Artifacts Created/Modified:**
  - `src/main/sources/weather/index.ts` - Separate automatic/manual refresh origin; check the marker at the Weather transaction boundary and before chained Astronomy refresh.
  - `src/main/sources/sports/index.ts` and `src/main/sources/sports/cache.ts` - Gate startup, scheduled, and live refreshes; re-check before asynchronous write stages and inside event persistence transactions.
  - `src/main/sources/youtube/index.ts` - Gate automatic startup/scheduled polls and check the marker inside thumbnail and video-write transactions.
  - `src/main/sources/reddit/index.ts`, `src/main/sources/reddit/ntfy.ts`, and `src/main/sources/reddit/dedupe.ts` - Pause only automatic ntfy ingestion, guarding dedupe, Saved Posts, and polling-state writes.
  - `src/main/sources/scripts/index.ts` - Skip automatic bundled Reddit Digest runs and re-check before its ingest transaction; manual runs and other scripts remain enabled.
  - `src/main/sources/astronomy/index.ts` - Guard automatic cache writes chained to Weather and Astronomy schedules for fixture locations.
  - `src/main/__tests__/dev-test-data-polling.test.ts` - Cover active startup/scheduled paths, simulated restart and clear/resume, explicit refreshes, Weather in-flight activation, Sports live-timer cancellation, and unrelated/bundled script behavior.
  - `docs/plans/local-test-data/local-test-data-plan.md` - Phase 2 checklist, status, and execution evidence.
- **Decisions & Deviations:** No scope deviation. Astronomy was guarded as a directly coupled Weather write path to the fixture-owned location; no user settings or unrelated scripts were changed. Existing unrelated untracked work was preserved.
- **Next Phase Context:** Phase 3 remains NOT_STARTED and was not begun. The persisted `dev_test_data_active` marker is read from the active DB; fixture clear removes it, and existing intervals/schedulers resume using unchanged settings. Continue with the Phase 3 IPC/settings controls and isolated harness only when requested.

---

## Phase 3: Add guarded developer controls and end-to-end coverage
- **Status:** COMPLETED
- **Objective:** Let developers opt in to seeding or clearing fixtures from the unpackaged app while keeping the operation inaccessible in packaged production.
- **Dependencies:** Phases 1 and 2.

### Tasks
- [x] Add shared IPC channel constants and typed responses in `src/shared/ipc-types.ts`; register main-process seed, clear, and status handlers in `src/main/ipc/index.ts`.
- [x] Enforce the unpackaged-runtime check in the main process for every mutation. Preserve `resolveDatabaseProfile` production protections; reject attempts to seed or clear packaged production data.
- [x] Add a developer-only test-data section to the General tab in `src/renderer/src/routes/Settings.tsx`. Show whether fixtures are active, provide explicit Seed and Clear actions, confirm before clearing, and explain that automatic polling pauses while fixtures are active but manual refresh remains available and may fetch live source data.
- [x] Keep errors visible through the existing toast/error patterns and prevent duplicate in-flight actions. After mutation, emit existing feature update events so widgets and routes reload through their current hooks.
- [x] Add `scripts/test-local-test-data.mjs` and an npm script named `test:local-test-data` following the existing harness pattern. Use the Settings controls for user-visible actions, IPC only for deterministic observation/setup, and the isolated harness profile for all writes.
- [x] In the harness scenario, seed and verify Reddit Digest, Saved Posts, Weather, Sports, and YouTube data; clear through the UI; confirm fixture-only removal and clean scenario teardown.

### Verification & Acceptance Criteria
*All criteria must pass before advancing to the handoff report.*
- [x] **Automated Checks:** Run `npm test -- src/main/__tests__/dev-test-data.test.ts src/main/__tests__/dev-test-data-polling.test.ts` and `npm run test:local-test-data`.
- [x] **Functional Assertions:** Controls are available in unpackaged `dev` and `start` Development modes and hidden in packaged mode; direct packaged IPC mutation attempts are rejected by the main process.
- [x] **Functional Assertions:** Seed and clear produce clear success/error feedback, update visible source data, and leave non-fixture rows and unrelated settings unchanged.
- [x] **Functional Assertions:** The harness demonstrates all five seeded feature surfaces without using live credentials or changing either persistent Development or production databases.

### Plan Compliance Checklist
*Verify each item against the actual diff before claiming this phase complete. Do not mark the phase COMPLETED if any item fails.*
- [x] **Required Files:** `src/shared/ipc-types.ts`, `src/main/ipc/index.ts`, `src/renderer/src/routes/Settings.tsx`, `scripts/test-local-test-data.mjs`, and its npm script in `package.json`.
- [x] **Boundaries:** Renderer actions use IPC only; main-process guards remain authoritative; packaged production cannot mutate fixtures; Clear never calls existing whole-cache delete operations.
- [x] **Legacy Code Removed:** Keep `YOUTUBE_CLEAR_VIDEOS_CACHE` and other existing user data-clear actions distinct; do not repurpose them for fixture cleanup.
- [x] **Acceptance Checks:** Confirm the controls, production guard, all five data surfaces, error feedback, and cleanup behavior were exercised.

### Phase 3 Handoff & Verification Report
- **Compliance Check:** PASSED
- **Verification Result:** PASSED
- **Execution Proof / Logs:**
  ```text
  $ npm test -- src/main/__tests__/dev-test-data.test.ts src/main/__tests__/dev-test-data-polling.test.ts
  -> Test Files 2 passed (2); Tests 11 passed (11); exit code 0.

  $ npm run test:local-test-data
  -> Scenario "local-test-data" passed. Settings reported inactive, the UI Seed
     action activated fixture mode, all five read surfaces contained their
     synthetic fixture records, the UI Clear confirmation cleared all five
     fixture surfaces, the unrelated sentinel setting remained unchanged, and
     the runner confirmed Electron exit and removed the isolated profile.

  $ npm run typecheck
  -> Node and renderer TypeScript checks passed; exit code 0.

  $ npx prettier --check src/shared/ipc-types.ts src/main/dev-test-data.ts src/main/ipc/index.ts src/main/__tests__/dev-test-data.test.ts src/renderer/src/routes/Settings.tsx scripts/test-local-test-data.mjs package.json
  -> All matched files use Prettier code style; exit code 0.

  $ git diff --check
  -> No whitespace errors; exit code 0.
  ```
- **Artifacts Created/Modified:**
  - `src/shared/ipc-types.ts` - Typed status response and seed/clear/status channel constants.
  - `src/main/dev-test-data.ts` - Authoritative packaged-runtime mutation guard.
  - `src/main/ipc/index.ts` - Status, seed, and clear handlers; each mutation checks `app.isPackaged`, and successful writes emit Reddit, Weather, Sports, and YouTube update events.
  - `src/main/__tests__/dev-test-data.test.ts` - Packaged mutation-handler guard assertion alongside Phase 1 service coverage.
  - `src/renderer/src/routes/Settings.tsx` - Developer-only General settings, active status, explicit actions, confirmation, visible action errors, and in-flight action protection. Existing cache-clear controls remain separate.
  - `scripts/test-local-test-data.mjs` - Isolated UI scenario using semantic Settings actions and IPC only for status/data observation and an unrelated-setting sentinel.
  - `package.json` - `test:local-test-data` command.
  - `docs/plans/local-test-data/local-test-data-plan.md` - Phase 3 completion and verification evidence.
- **Decisions & Deviations:** Packaged UI exposure is driven by the main-process status (`available: !app.isPackaged`); both mutation handlers independently check the authoritative packaged flag before touching the database. The registered mutation callback's unit assertion verifies packaged calls throw before running the mutation; the harness exercises the unpackaged Settings path. Renderer mutation failures are caught into both a visible `role="alert"` message and a toast; the harness exercised successful actions, not a forced renderer-side failure. A packaged artifact was not launched in this phase; Phase 4 retains the packaged build/smoke verification. The initial harness attempt exposed a native `better-sqlite3` ABI mismatch; rebuilding for Electron enabled the successful harness run, then rebuilding for Node restored the ABI required by the passing Vitest run. An intermediate harness assertion was corrected to match the existing Sports IPC response (`teamId` and `{last,next}`). No dependencies, lockfiles, database schemas, cache-clear operations, persistent Development data, or production data were changed. The runner preserved one isolated profile on the initial failed startup because it could not confirm process-tree termination; the successful run confirmed process exit and removed its own temporary profile.
- **Next Phase Context:** Phase 4 remains NOT_STARTED and is the only remaining phase. Documentation and packaged build/smoke verification are explicitly deferred there. Phase 3 leaves existing source polling, feature enablement, user settings, and cache-clear behavior intact; the harness uses only its isolated per-run profile.

---

## Phase 4: Document database lifecycles and complete validation
- **Status:** COMPLETED
- **Objective:** Make the persistent Development database, isolated temporary harness database, fixture controls, and polling behavior easy to understand and verify.
- **Dependencies:** Phases 1-3.

### Tasks
- [x] Update the existing App Data Profiles and UI Harness section in `docs/HOW-TO-RUN.md` to distinguish packaged production, the shared persistent `dev`/`start` Development profile, and each isolated harness run.
- [x] Document how the developer Seed and Clear actions work, which database they target, the fixture-only cleanup guarantee, the persisted active-fixture state, automatic-poll pause/resume behavior, and the continued availability of manual refresh.
- [x] Add an "Adding fixtures for a new feature" checklist to `docs/HOW-TO-RUN.md`: create a feature-specific contributor module and register it with the coordinator; inspect the feature's read path, required related rows/settings, and display defaults; use reserved fixture IDs; implement idempotent seed and fixture-only clear within the coordinator's transaction; preserve user settings and unrelated rows; gate every automatic refresh path while retaining explicit manual refresh; add contributor tests for visibility, repeat seed/clear, rollback, and non-fixture preservation; and extend the isolated UI harness to verify the new feature.
- [x] Update `scripts/PLAYWRIGHT-HARNESS.md` with the fixture scenario pattern, the use of semantic Playwright locators for user-visible actions, IPC-only setup/observation, and temporary-profile cleanup/artifact behavior. Do not create a duplicate temporary-database guide unless review finds the existing documents insufficient.
- [x] Run the focused fixture-service and polling tests, the full Vitest suite, type checking, the new harness scenario, and the existing dashboard-drag harness scenario.
- [x] Build the application and verify the packaged UI does not expose working seed/clear mutations; verify docs refer to current commands and database paths.

### Verification & Acceptance Criteria
*All criteria must pass before advancing to the handoff report.*
- [x] **Automated Checks:** `npm test`, `npm run typecheck`, `npm run test:local-test-data`, `npm run test:dashboard-drag`, and `npm run build` all pass.
- [x] **Functional Assertions:** Documentation accurately describes the shared Development profile, per-run temporary harness profile, production separation, cleanup guarantees, active-fixture behavior, safe seed/clear workflow, and the complete procedure for adding a feature's fixtures.
- [x] **Functional Assertions:** The test-data flow is repeatable and self-contained; no test writes to the live production database; a failed harness run preserves its profile only under the existing runner's documented termination-failure behavior.

### Plan Compliance Checklist
*Verify each item against the actual diff before claiming this phase complete. Do not mark the phase COMPLETED if any item fails.*
- [x] **Required Files:** Update `docs/HOW-TO-RUN.md` with the fixture extension checklist and `scripts/PLAYWRIGHT-HARNESS.md`; update feature code/tests only where earlier phases require it.
- [x] **Boundaries:** Prefer extending the existing profile/harness guidance; do not add a parallel guide or duplicate the full database-profile documentation.
- [x] **Legacy Code Removed:** Remove no existing user data or documentation sections; retain production-profile and temporary-profile safety instructions.
- [x] **Acceptance Checks:** Confirm all commands passed and review documentation statements against current implementation behavior.

### Phase 4 Handoff & Verification Report
- **Compliance Check:** PASSED
- **Verification Result:** PASSED
- **Execution Proof / Logs:**
  ```text
  $ npm test
  -> Test Files 34 passed (34); Tests 207 passed (207); exit code 0.

  $ npm run typecheck
  -> Node and web TypeScript checks passed; exit code 0.

  $ npm test -- src/main/__tests__/dev-test-data.test.ts src/main/__tests__/dev-test-data-polling.test.ts
  -> Test Files 2 passed (2); Tests 11 passed (11); exit code 0.

  $ npm run test:local-test-data
  -> Passed. Settings began inactive; UI seeding activated fixtures visible in
     Reddit Digest, Saved Posts, Weather, Sports, and YouTube; UI clear removed
     fixture records and preserved the unrelated sentinel setting. Electron
     exited and the successful run's isolated profile was removed.

  $ npm run test:dashboard-drag
  -> Exit code 0; isolated harness runner completed successfully.

  $ npm run build
  -> Node/web typechecks and Electron main, preload, and renderer production
     builds passed; exit code 0.

  $ npm run verify:production:win
  -> Windows packaging and packaged smoke test passed. Migrations 001-010
     initialized at schema version 10 using a disposable APPDATA/database;
     temporary smoke profile removed.

  $ git diff --check
  -> No whitespace errors; exit code 0.
  ```
- **Artifacts Created/Modified:**
  - `docs/HOW-TO-RUN.md` - Extended the existing database-profile guidance with fixture ownership, marker persistence, polling behavior, and the new-feature checklist.
  - `scripts/PLAYWRIGHT-HARNESS.md` - Documented the isolated fixture UI flow, locator/IPC boundary, and profile/artifact cleanup behavior.
  - `docs/plans/local-test-data/local-test-data-plan.md` - Recorded Phase 4 completion and exact validation evidence.
- **Decisions & Deviations:** No feature-code changes or extra database guide were needed. Confirmed the current paths against `src/main/index.ts` and `src/main/db/database-profile.ts`: normal `dev`/`start` share `{appData}/<appName> Development/data.db`, packaged mode uses `{userData}/data.db`, and each harness gets a temporary-root `harness.db` selected by `PERSONAL_NEWS_DB_PATH`. Packaged Settings exposure is disabled by the main-process status (`available: !app.isPackaged`); both mutation handlers independently reject packaged mutations, covered by the handler unit assertion that the mutation callback is not called. The Windows production verification confirms the packaged app starts with a disposable database; it does not itself exercise the Settings UI. The first fixture-harness attempt failed because `better-sqlite3` was built for Node rather than Electron and the runner could not confirm process-tree termination; the runner preserved that isolated profile as designed. After `npx electron-rebuild -f -w better-sqlite3`, the fixture harness passed and removed its profile. `npm rebuild better-sqlite3` restored the Node ABI for the focused tests. The preserved failure profile was not manually touched. No persistent Development or production database was selected or written.
- **Next Phase Context:** All four implementation phases are complete; the final-validation handoff is ready. Review this completion evidence and the documentation diff. Any preserved temp profile from the failed initial harness run remains subject to the runner's termination-failure behavior and is not an app data profile.
