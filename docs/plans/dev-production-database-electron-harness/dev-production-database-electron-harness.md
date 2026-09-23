# Pre-Plan Impact Assessment: Dev/Production Databases and Electron Harness

## Decision Summary

- **Overall disposition:** Ready for implementation planning, subject to implementation-time verification of Electron profile and single-instance behavior.
- **Confidence:** High that the existing database override supports path separation; medium on the complete profile/concurrency behavior until exercised.
- **Scope assessed:** Separate persistent development data from installed production data, provide disposable isolated data for the interactive Electron harness, and document the workflows for future agents.

## Proposed Changes

### C1: Separate development and production data

- **Intended outcome:** Development and preview runs cannot modify the installed production app's database or profile.
- **In scope:** Preserve the existing production profile and database path; use a fresh, persistent development profile and database for `npm run dev` and `npm run start`; allow the installed production app to run at the same time as either development mode.
- **Out of scope:** Automatically copying or migrating existing production data into the development profile; running `npm run dev` and `npm run start` simultaneously.
- **Dependencies:** Profile selection must happen before the existing single-instance lock is acquired; explicit `PERSONAL_NEWS_DB_PATH` overrides must continue to work.
- **Open assumptions:** Development and preview share one profile, so only one of those modes runs at a time. Confirm Electron instance-lock behavior during implementation.

### C2: Isolate interactive Electron harness sessions

- **Intended outcome:** Agents can interact with the real app UI without modifying production or persistent development data.
- **In scope:** Agent-authored Playwright scripts using a shared runner; each harness session receives its own temporary Electron profile and database; harness sessions can run alongside development or production.
- **Out of scope:** An MCP server, persistent Playwright REPL, or reusable production data.
- **Dependencies:** Playwright is already installed. Harness startup must set the isolated profile/database before the app acquires its single-instance lock. Session cleanup must wait until Electron exits.
- **Open assumptions:** Screenshots and diagnostic logs should be retained outside temporary profile cleanup. Fixture setup should be deterministic and avoid depending on live services.

### C3: Document agent workflow and database modes

- **Intended outcome:** Future agents know which app mode and validation command to use, and how to interact with the Electron UI safely.
- **In scope:** Update `.github/copilot-instructions.md` and the storage/run documentation to describe production, development/preview, and disposable harness profiles.
- **Out of scope:** Unrelated instruction or documentation cleanup.

## Clarifications

- **Asked and answered:** Development starts with a fresh database; the existing production database remains untouched; no automatic copy is made.
- **Asked and answered:** `npm run start` uses the development profile/database.
- **Asked and answered:** Development/preview and installed production must run independently. `npm run dev` and `npm run start` share one persistent development profile and are not required to run simultaneously.
- **Asked and answered:** Each harness session uses a separate temporary full profile and database.
- **Assumptions used:** The existing packaged app path is the production path to preserve. The existing environment override remains the explicit database-path override for smoke tests and harness sessions.

## Current-State Evidence

- `src/main/db/database.ts` resolves `PERSONAL_NEWS_DB_PATH` first and otherwise uses `{userData}/data.db`.
- `src/main/index.ts` acquires an Electron single-instance lock during startup.
- `scripts/verify-production-build.mjs` supplies a temporary `PERSONAL_NEWS_DB_PATH` to its packaged smoke test.
- `scripts/test-dashboard-drag.mjs` launches the dev app through Playwright/CDP, currently uses a fixed debugging port, and saves/restores dashboard state. It is a feature scenario rather than a reusable isolated harness.
- `package.json` defines `npm run dev` as `electron-vite dev`, `npm run start` as `electron-vite preview`, and includes Playwright and `npm run test:dashboard-drag`.
- `docs/tech-notes.md` and `docs/architecture/overview.md` document one database under Electron's user-data directory; they do not yet describe separate modes.

## Impact Findings

### C1: Separate development and production data

- **Classification:** Beneficial with conditions.
- **Positive impact:** Prevents development writes and migrations from affecting production, while preserving existing production data in place.
- **Negative impact or unintended consequence:** The new development profile starts empty. Dev and preview share state and therefore cannot both own the same profile concurrently.
- **Affected surfaces:** Database path resolution, startup/profile selection, focused tests, and storage documentation.
- **Dependencies and interactions:** Preserve production's current default path; select development profile before the single-instance lock; retain explicit database override precedence.
- **Confidence and rationale:** High for DB-path feasibility due to the existing override; medium for simultaneous process behavior until validated.
- **Discriminating check:** Verify `npm run dev` and `npm run start` resolve to the same fresh dev database; verify packaged production resolves to the existing path; run development and packaged production concurrently and confirm neither redirects to or modifies the other's database.
- **Recommendation:** Proceed without copying data; leave the production path unchanged.

### C2: Isolate interactive harness sessions

- **Classification:** Beneficial with conditions.
- **Positive impact:** Enables realistic UI inspection with disposable app state and no reliance on production/development databases.
- **Negative impact or unintended consequence:** A fresh profile may produce empty screens; nondeterministic live services can make scenarios flaky; cleanup must not remove the profile before the app has exited.
- **Affected surfaces:** Shared Playwright runner, dashboard drag scenario, test fixtures, process lifecycle, and artifact handling.
- **Dependencies and interactions:** Each session needs a unique temporary profile/database and a debugging endpoint; diagnostics should survive profile cleanup.
- **Confidence and rationale:** High that the current Playwright/CDP dependency and launch path can be reused; implementation details for unique profile and robust process cleanup require verification.
- **Discriminating check:** Run the dashboard scenario against a disposable profile while a packaged app is open; assert the test DB path is isolated, state is cleaned after exit, and failure screenshots/logs remain available.
- **Recommendation:** Proceed by extracting common lifecycle/diagnostic behavior from the scenario script.

### C3: Document agent workflow and database modes

- **Classification:** Beneficial.
- **Positive impact:** Makes the harness and data-safety boundaries discoverable and repeatable for future agents.
- **Negative impact or unintended consequence:** Instructions can drift if documented commands or paths change.
- **Affected surfaces:** `.github/copilot-instructions.md`, `docs/tech-notes.md`, and `docs/architecture/overview.md`.
- **Dependencies and interactions:** Document only after the implementation's actual commands and profile behavior are verified.
- **Confidence and rationale:** High; the repository already has concise instructions and storage documentation to update.
- **Discriminating check:** Review the final docs against the implemented commands and verify the documented harness command passes.
- **Recommendation:** Proceed after implementation behavior is settled.

## Cross-Change Considerations

- Establish database/profile mode selection before building the shared harness, so harness sessions cannot accidentally inherit the development or production profile.
- Preserve the production user-data location and database file; do not migrate or copy it.
- Keep the existing explicit database-path override available for production smoke tests and disposable harness runs.
- Test dev/preview and production concurrency. Test harness concurrency with each other and with both app modes.
- Keep temporary profile cleanup separate from retained screenshots, logs, and other diagnostic artifacts.

## Handoff Options

1. **Continue pre-planning:** Reopen decisions only if implementation discovery contradicts Electron profile/lock assumptions.
2. **Hand off to the planning agent:** Plan profile/database routing, isolated Playwright runner, dashboard scenario migration, concurrency/cleanup validation, and documentation updates using the decisions and constraints in this assessment.
