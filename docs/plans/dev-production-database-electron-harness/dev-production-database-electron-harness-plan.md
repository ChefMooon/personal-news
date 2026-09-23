---
title: "Dev/Production Databases and Electron Harness - Implementation Plan"
status: IN_PROGRESS
current_phase: 3 / 3
created: 2026-09-23
last_updated: 2026-09-23
---

# Overall Plan Completion Status

* **Final State:** IN_PROGRESS
* **Total Phases Completed:** 2 / 3
* **Summary of Outcome:** Development and packaged production use separate data profiles; the interactive Playwright harness uses disposable per-session profiles, databases, loopback CDP, and retained diagnostics; agent and run documentation describes the supported workflows. Automated tests and packaged verification pass. The exact Phase 3 matrix combining two simultaneous harnesses with each app mode remains incompletely evidenced.

# Specification & Overview

### 1. Scope & Objective

- **Goal:** Keep development and harness data independent from the installed production app while giving agents a reusable way to inspect and interact with the real Electron UI.
- **In-Scope:**
  - Preserve the installed production app's current user-data profile and database path.
  - Give `npm run dev` and `npm run start` one fresh, persistent development profile/database. They are mutually exclusive because they share that profile.
  - Allow the installed production app to run independently alongside either development mode.
  - Give every interactive harness session its own temporary Electron profile and database, with diagnostics retained outside disposable data.
  - Build on the existing Playwright/CDP capability and dashboard drag scenario.
  - Update agent instructions and relevant storage/run documentation.
- **Out-of-Scope:**
  - Copying or migrating the existing production database into the new development profile.
  - Running `npm run dev` and `npm run start` simultaneously.
  - Adding an MCP server, persistent Playwright REPL, or a new automation framework.
  - Database schema changes unrelated to resolving the selected profile/database.

### 2. Technical Constraints & Architecture

- Database resolution currently honors `PERSONAL_NEWS_DB_PATH` and otherwise uses `{userData}/data.db` in `src/main/db/database.ts`. Preserve explicit alternate-path overrides, but fail closed if dev or harness mode resolves to the protected production database.
- Development/preview profile selection must happen before `app.requestSingleInstanceLock()` in `src/main/index.ts`.
- Use the existing Electron main/preload/renderer boundaries; renderer behavior must be driven through Playwright UI interaction, not direct Node access.
- Playwright and the Electron remote-debugging environment hook already exist. Reuse those rather than adding another browser automation framework.
- Harness profiles and databases are temporary, unique per session, and contained within a session-owned temporary directory. Stop and await the complete Electron process tree before cleanup; retain screenshots/logs outside the disposable profile.
- Remote debugging is enabled only for an explicit, unpackaged harness session, bound to loopback, and verified to belong to the process started by that session. Packaged production ignores harness debugging configuration. Do not permit broad remote origins unless required and explicitly constrained to the local harness.
- Harness startup must not depend on live credentials or uncontrolled network services. Keep any polling/updater suppression or fixture behavior scoped to harness mode.
- The source assessment is `docs/specs/dev-production-database-electron-harness.md`.
- Verify profile path behavior and Electron single-instance behavior on Windows, the current target environment, before treating concurrency as proven.

---

# Execution Plan & Handoffs

## Phase 1: Separate Development and Production Profiles

- **Status:** COMPLETED
- **Objective:** Route dev/preview and packaged production to independent, predictable Electron profiles and databases without moving or modifying existing production data.

### Tasks

- [x] Inspect Electron's supported user-data path configuration and the current startup ordering; determine how to select a profile before the single-instance lock.
- [x] Determine a reliable packaged-versus-dev/preview mode predicate for both `npm run dev` and `npm run start`; record how each resolves its profile before implementation.
- [x] Implement one persistent development profile shared by `npm run dev` and `npm run start`; leave the packaged production profile/database at its existing location.
- [x] Preserve `PERSONAL_NEWS_DB_PATH` for explicit alternate databases, while detecting and rejecting a dev/harness path that resolves to the packaged production database. Keep the packaged smoke test's temporary override working.
- [x] Fail startup with a clear error if profile/path selection fails or would fall back to the protected production database; never silently use production as a dev fallback.
- [x] Resolve and compare protected paths before opening SQLite, normalizing case and path aliases as supported by the platform; do not log credentials or database contents in path errors.
- [x] Ensure the new development profile initializes a fresh database through existing migrations; do not copy data from the existing production database.
- [x] Add focused tests for mode-to-profile/database resolution, alternate override behavior, production-path rejection in dev/harness, and the unchanged packaged default. Follow existing Vitest conventions and keep the resolver testable without launching Electron where practical.

### Verification & Acceptance Criteria

*All criteria must pass before advancing to the handoff report.*

- [x] **Automated Checks:** `npm run typecheck` and `npm test` pass.
- [x] **Functional Assertions:** Resolver tests confirm dev and preview share the same persistent development profile/database; packaged production resolves to the unchanged user-data default; alternate overrides work; a dev/harness override to the protected production DB is rejected before database open. Packaged smoke testing with an explicit disposable override initialized schema version 10. The dev UI opened using the new profile.
- [x] **Concurrency Assertions:** The user verified packaged production remains open while `npm run dev` runs, and separately while `npm run start` runs. When dev was still open, preview focused the existing dev instance, confirming dev and preview share the profile/lock as designed. After dev was stopped, preview opened independently alongside packaged production.
- [x] **Data Safety:** The explicit packaged smoke test used a disposable DB. The user confirmed packaged production was unaffected while dev and preview ran. Resolver tests reject development/harness requests to the production DB before SQLite opens. No write-based verification used the live production database.

### Plan Compliance Checklist

*Verify each item against the actual diff before claiming this phase complete. Do not mark the phase COMPLETED if any item fails.*

- [x] **Required Files:** `src/main/index.ts`; `src/main/db/database.ts`; a focused database/profile-resolution test under `src/main/db/`.
- [x] **Boundaries:** Keep production's current profile/database path; do not alter migrations or copy production data; apply the selected profile before the existing single-instance lock; reject only the protected production path in dev/harness while allowing other explicit paths.
- [x] **Legacy Code Removed:** Replace any dev/preview path that falls through to the production profile while leaving the packaged production default intact.
- [x] **Acceptance Checks:** Automated checks and the explicit-override packaged smoke test passed. The user confirmed packaged/dev and packaged/preview concurrency on Windows; packaged production remained unaffected.

### Phase 1 Handoff & Verification Report

*Filled out by the executing agent upon phase completion.*

- **Compliance Check:** PASSED
- **Verification Result:** PASSED — automated checks, packaged smoke test, and user-verified Windows concurrency/data-safety checks.
- **Execution Proof / Logs:**
```text
PASS: npm run typecheck
PASS: npm test — 31 test files, 193 tests passed
PASS: npx prettier --check on changed TypeScript and git diff --check
PASS: npm run build:unpack — Windows unpacked app built
PASS: packaged --smoke-test with PERSONAL_NEWS_DB_PATH set to a disposable project-local file — packaged=true, exit code 0, schema version 10
PASS (user-verified): packaged production remained running alongside npm run dev.
PASS (user-verified): npm run start initially focused the already-running dev instance, as both modes share the development profile/lock. After dev was stopped, preview opened independently while packaged production remained running; production was unaffected.
```

* **Artifacts Created/Modified:**
* `src/main/db/database-profile.ts` - Pure profile resolution, Windows-safe protected-path comparison, and safe errors.
* `src/main/db/database.ts` - Resolve explicit/default DB paths through the profile guard before directory creation or SQLite open.
* `src/main/index.ts` - Select unpackaged development userData synchronously before the single-instance lock.
* `src/main/db/__tests__/database-profile.test.ts` - Coverage for dev/preview parity, packaged default, overrides, Windows path aliases, and safe rejection.
* **Decisions & Deviations:** Both `npm run dev` and `npm run start` are unpackaged (`app.isPackaged === false`) and resolve to `%APPDATA%/<app name> Development`; packaged startup does not change Electron's userData path. No production data is copied. The user verified packaged production concurrency with both development commands and confirmed production was unaffected. Dev and preview remain mutually exclusive because they intentionally share one profile and Electron single-instance lock.
* **Next Phase Context:** Phase 2 must create a unique temporary `userData` profile per harness session before lock acquisition. Current unpackaged startup selects the shared development profile, so the harness needs an explicit, harness-only profile selection path; a temporary database override alone is insufficient. Keep artifacts outside the disposable profile and retain the existing production smoke-test override behavior.

---

## Phase 2: Create the Isolated Interactive Playwright Harness

* **Status:** COMPLETED
* **Objective:** Give agents reusable Playwright support for inspecting and interacting with a real Electron session without touching production or persistent dev data.

### Tasks

* [x] Extract common Electron launch/attach/cleanup behavior from `scripts/test-dashboard-drag.mjs` into a shared helper under `scripts/`, following the repository's existing Node ESM conventions.
* [x] Have each harness session create one unique temporary root and select a profile and database contained within it before Electron startup and lock acquisition. Validate that neither resolved path matches dev or production.
* [x] Replace the fixed debugging port with a loopback-only, collision-safe endpoint. Verify the connected CDP target is the session's launched app; fail closed rather than attaching to an unrelated app if the endpoint is occupied or mismatched.
* [x] Keep remote debugging disabled outside explicit unpackaged harness runs, even if an environment variable is inherited by packaged production. Replace or constrain the current wildcard remote-origin allowance; verify no LAN-accessible debugging endpoint is opened.
* [x] Capture renderer console errors, uncaught page errors, and failure screenshots/logs in an artifact location outside the temporary profile.
* [x] Ensure normal and failure paths stop the Electron process tree, await confirmed process exit, and only then delete the exact session-owned temporary root. On timeout/termination failure, report the error and preserve the profile rather than deleting live state.
* [x] Refactor `scripts/test-dashboard-drag.mjs` to use the shared helper while retaining its dashboard assertions and state safety.
* [x] Seed a deterministic dashboard fixture with at least two views and enough vertically overflowing widgets for the existing scroll and cross-dashboard transfer assertions. Use the existing dashboard settings IPC only for fixture setup; continue to exercise the actual user interactions through Playwright.
* [x] Provide a documented pattern for agents to author task-specific Playwright scripts that inspect and interact through user-visible controls, using IPC only where appropriate for setup or state observation.
* [x] Inspect normal source-module and updater startup effects. Add harness-only suppression or deterministic stubs for external polling/updater work needed to keep scenarios offline and credential-free; do not change normal app behavior.

### Verification & Acceptance Criteria

* [x] **Automated Checks:** `npm run test:dashboard-drag` passes using an isolated harness profile/database; `node --check` and focused ESLint checks pass for the shared helper and scenario; `npm run typecheck` passes if TypeScript sources are touched.
* [x] **Functional Assertions:** An agent-authored scenario can inspect the running Electron UI, use semantic locators to interact with it, and capture page/console errors and screenshots on failure.
* [x] **Fixture Assertions:** A fresh harness profile is seeded with the dashboard preconditions required by the drag/transfer scenario; the scenario fails clearly if required fixture setup does not complete.
* [x] **Isolation Assertions:** Each harness run has a unique profile/database under its own temporary root; parallel sessions do not share profiles, databases, or CDP endpoints; no resolved test path equals production or dev.
* [x] **Security Assertions:** CDP is loopback-only, enabled only for harness runs, and attached to the session-owned app; broad remote origins are not enabled unless proven necessary and constrained.
* [x] **Network Assertions:** Harness scenarios run without production credentials or uncontrolled network polling; any explicitly network-dependent test is separately identified.
* [x] **Lifecycle Assertions:** A failed scenario still stops and awaits its Electron process tree before cleanup; timeout or kill failure preserves the profile and reports failure; diagnostic artifacts remain available.

### Plan Compliance Checklist

*Verify each item against the actual diff before claiming this phase complete. Do not mark the phase COMPLETED if any item fails.*

* [x] **Required Files:** The shared Electron Playwright helper under `scripts/`; `scripts/test-dashboard-drag.mjs`; harness-specific startup/profile and fixture code in the owning main-process modules; focused helper tests where practical.
* [x] **Boundaries:** Use the existing Playwright dependency and CDP hook; do not add MCP/REPL infrastructure; do not connect the harness to production or the persistent dev profile; do not enable harness-only network/debug behavior in ordinary app launches.
* [x] **Legacy Code Removed:** Remove duplicated lifecycle/diagnostic code from `scripts/test-dashboard-drag.mjs` once the shared helper owns it; remove the fixed-port assumption and unsafe wildcard remote-origin behavior.
* [x] **Acceptance Checks:** Run the dashboard scenario and verify profile isolation, concurrency, cleanup, and artifact retention against the criteria above.

### Phase 2 Handoff & Verification Report

* **Compliance Check:** PASSED
* **Verification Result:** PASSED
* **Execution Proof / Logs:**
```text
PASS: npm run typecheck
PASS: npx vitest run src/main/db/__tests__/database-profile.test.ts — 1 file, 7 tests passed
PASS: node --check scripts/electron-playwright-harness.mjs and scripts/test-dashboard-drag.mjs
PASS: focused npx eslint over the helper, scenario, and touched main-process files
PASS: npm run test:dashboard-drag (implementer and orchestrator rerun) — isolated profile/database; deterministic two-view fixture; scroll, drag, persistence, focus, and transfer assertions passed
PASS: two concurrent harness sessions — unique temporary roots, profiles, databases, and loopback CDP ports; both process trees exited and profiles were removed
PASS: orchestrator verified parallel run records — ports 59012 and 59013, distinct temporary roots/databases, `processTreeExited: true`, and both roots absent after cleanup
PASS: intentional scenario failure and renderer console-error probes — failure screenshots and run.json logs retained; isolated profiles removed only after confirmed process-tree exit
PASS: observed DevTools URLs bound to 127.0.0.1; startup logs confirmed YouTube, Reddit, scripts, and sports startup work was suppressed in harness mode
```

* **Artifacts Created/Modified:**
* `scripts/electron-playwright-harness.mjs` - Shared isolated launch, ownership-verified CDP attach, diagnostics, process-tree termination, and safe cleanup.
* `scripts/test-dashboard-drag.mjs` - Reuses the shared runner, seeds/restores a deterministic dashboard fixture through settings IPC, and retains the interaction assertions.
* `scripts/PLAYWRIGHT-HARNESS.md` - Documents the scenario-authoring pattern and artifact lifecycle.
* `src/main/index.ts` - Selects the explicit harness profile before the single-instance lock; validates startup paths; gates loopback CDP and adds a per-run renderer ownership token.
* `src/main/db/database-profile.ts`, `src/main/db/database.ts`, `src/main/db/__tests__/database-profile.test.ts` - Validate harness profile/database containment and reject production or persistent-development aliases before opening the DB.
* `src/main/harness-mode.ts`, `src/main/sources/{youtube,reddit,weather,astronomy,sports,scripts}/index.ts` - Limit automatic polling and user-script startup to ordinary app runs.

* **Decisions & Deviations:** Harness mode is selected only by the launcher's explicit environment values and is ignored for packaged apps; the existing `PERSONAL_NEWS_DB_PATH` override remains unchanged for packaged smoke tests. CDP binds to `127.0.0.1`, uses an ephemeral port and a random renderer token, and has no wildcard remote-origin grant. Source polling and user-home script loading are skipped only in harness mode; ordinary dev/preview and packaged startup behavior is unchanged. The first Windows cleanup attempt encountered a transient `EBUSY` on Chromium's session-storage lock; bounded retry was added, and subsequent scenario, concurrent-session, and failure-path runs cleaned their profiles successfully. No production/dev database was used. Full Vitest and packaged verification were not run because they are outside this phase and the user's packaged app is running.
* **Next Phase Context:** Phase 3 must document `npm run test:dashboard-drag`, the scenario pattern in `scripts/PLAYWRIGHT-HARNESS.md`, and retained artifacts under `artifacts/electron-harness/<scenario>-<uuid>/`. The temporary profile is removed after process exit; a termination failure preserves it and reports its path. The orchestrator independently reran the dashboard scenario, typecheck, profile tests, syntax checks, and focused ESLint. The full Vitest suite is currently blocked by the Node/Electron `better-sqlite3` ABI mismatch while the packaged app is running; do not stop it or alter the production profile to work around this. Phase 3 is now active.

---

## Phase 3: Document Modes and Verify End-to-End Behavior

* **Status:** IN_PROGRESS
* **Objective:** Make the database/profile behavior and harness workflow discoverable, then verify the full development, production, and harness matrix.

### Tasks

* [x] Update `.github/copilot-instructions.md` with when and how to use the interactive Electron harness, how to choose validation scope, the production-path guard, and the rule to keep production data out of tests.
* [x] Update `docs/tech-notes.md`, `docs/architecture/overview.md`, and `docs/HOW-TO-RUN.md` to describe the production, dev/preview, and disposable harness profiles/databases, safe override behavior, and cleanup/artifact behavior.
* [x] Verify docs and instructions use the actual commands, paths, and artifact locations implemented in earlier phases.
* [x] Run the Windows production verification workflow to confirm packaging and the packaged smoke test still use its explicit isolated database and preserve the production default path.
* [ ] Perform the concurrency matrix: packaged production with dev; packaged production with preview; and two independent harness sessions alongside each app mode. Use disposable packaged-mode data for write assertions, never the live production DB.

### Verification & Acceptance Criteria

* [x] **Automated Checks:** `npm run typecheck`, `npm test -- --reporter=dot`, and `npm run verify:production:win` pass; `npm run test:dashboard-drag` passes after restoring the Electron-native module ABI. Focused syntax, lint, profile, documentation-link, and diff checks pass.
* [x] **Functional Assertions:** Phase 1 and 2 evidence confirms packaged production retains its original profile/database, dev and preview share the persistent development profile, and harness sessions are isolated and disposable.
* [ ] **Concurrency Assertions:** The user verified packaged production alongside dev and preview separately, and two concurrent harness runs proved unique roots/databases/CDP ports and clean process exit while a Vite renderer server was active. The recorded evidence does not unambiguously establish two concurrent harness sessions alongside each of dev, preview, and packaged production together; complete that exact matrix before marking this criterion passed. Dev and preview are not required to run together.
* [x] **Data Safety Assertions:** Phase 1 and 2 evidence confirms no verification step used the live production database and dev/harness requests resolving to it fail before opening it.
* [x] **Documentation Assertions:** The instructions and docs link to the existing harness scenario and authoring guide, and describe how to run or write isolated inspection scripts without production or dev data.

### Plan Compliance Checklist

*Verify each item against the actual diff before claiming this phase complete. Do not mark the phase COMPLETED if any item fails.*

* [x] **Required Files:** `.github/copilot-instructions.md`; `docs/tech-notes.md`; `docs/architecture/overview.md`; `docs/HOW-TO-RUN.md`; `scripts/PLAYWRIGHT-HARNESS.md`.
* [x] **Boundaries:** Documentation reflects implemented behavior, preserves production's existing path, distinguishes persistent development and temporary harness locations, and describes override guards and loopback-only CDP.
* [x] **Legacy Code Removed:** Replaced the single-database description in the storage and run documentation with the production, development/preview, and harness profiles.
* [ ] **Acceptance Checks:** Automated tests and the Windows production verification workflow pass; the complete Windows concurrency matrix remains pending.

### Phase 3 Handoff & Verification Report

* **Compliance Check:** PENDING — required documentation files and scope boundaries verified; the exact concurrency acceptance check remains incomplete.
* **Verification Result:** PARTIAL — typecheck, full Vitest, packaged Windows verification, harness scenario, profile tests, syntax/lint, documentation links, and data-safety checks passed. The specified concurrency matrix is not fully evidenced.
* **Execution Proof / Logs:**
```text
PASS: npm run typecheck
PASS: npm test -- --reporter=dot — 31 files, 195 tests passed after rebuilding better-sqlite3 for Node ABI 127
PASS: npx electron-rebuild --force --which-module better-sqlite3 --version 33.4.11 — restored Electron ABI 130
PASS: npm run verify:production:win — Windows packaging and disposable packaged smoke DB initialized schema version 10
PASS: prettier --check docs/HOW-TO-RUN.md scripts/PLAYWRIGHT-HARNESS.md
PASS: relative Markdown links resolve in all updated documentation
PASS: git diff --check
PASS: npm run test:dashboard-drag — rerun after restoring Electron ABI; isolated profile, fixture, interactions, and cleanup passed
PASS: focused node --check, ESLint, React hook-order lint, and profile tests
PASS: parallel harness runs — distinct temporary roots, profiles, databases, and CDP ports; process trees exited; roots removed
PASS: intentional harness failure probe — diagnostics retained and disposable profile removed only after confirmed process-tree exit
PASS: user-verified Windows concurrency — packaged production alongside dev and separately alongside preview; production data unaffected
PARTIAL: concurrency evidence establishes parallel harness isolation while a Vite renderer server was active, but not the specifically required harness-pair combination with every app mode
BASELINE FORMAT WARNINGS: Prettier --check warns for .github/copilot-instructions.md, docs/tech-notes.md, and docs/architecture/overview.md; each file also fails Prettier against its pre-change HEAD version. Existing repository Markdown formatting was preserved.
```

* **Artifacts Created/Modified:**
* `.github/copilot-instructions.md` - Agent guidance for selecting validation, using the isolated Playwright harness, and protecting production data.
* `docs/tech-notes.md` - Profile/database mode matrix, override guard, and harness cleanup/artifact behavior.
* `docs/architecture/overview.md` - Storage/security behavior for all three modes and loopback CDP.
* `docs/HOW-TO-RUN.md` - Commands and operating guidance for the shared development profile and disposable UI harness.
* `scripts/PLAYWRIGHT-HARNESS.md` - Exact artifact path, ownership-checked loopback CDP, harness-only suppression, and safe lifecycle.
* `docs/plans/dev-production-database-electron-harness/dev-production-database-electron-harness-plan.md` - Phase 3 execution state and evidence; the remaining concurrency acceptance is explicitly pending.
* **Decisions & Deviations:** Documentation matches the implemented behavior. The full Vitest suite and packaged Windows verification passed after closing app instances and rebuilding `better-sqlite3` for the relevant Node/Electron ABIs. No live production database was used. The manually verified packaged/dev and packaged/preview pairings, plus parallel harness isolation, do not conclusively establish two harness sessions alongside every app mode.
* **Next Phase Context:** There is no later phase. Explicitly verify two concurrent harness sessions alongside dev, preview, and packaged production using isolated data, then update the concurrency evidence and mark Phase 3 complete. Keep the overall plan `IN_PROGRESS` until that acceptance criterion passes.
* **Decisions & Deviations:** Documentation was checked against the implemented profile selection, harness startup/cleanup, and package scripts. The test runner required switching `better-sqlite3` between Node ABI 127 and Electron ABI 130; both rebuilds completed after the app instances were closed. No production database was used. Concurrency checks verified the user-facing packaged/dev and packaged/preview pairings, plus parallel harness isolation, but the exact pairings of two harness sessions alongside every app mode are not sufficiently recorded to certify the criterion.
* **Next Phase Context:** There is no later phase. Complete and record the missing Windows concurrency pairings—two harness sessions alongside dev, preview, and packaged production—using isolated data, then mark Phase 3 and the overall plan complete. The implementation report must reflect this outstanding acceptance criterion.

---
