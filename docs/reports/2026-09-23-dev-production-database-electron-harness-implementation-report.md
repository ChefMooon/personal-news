# Dev/Production Database and Electron Harness Implementation Report

## Goal and scope

Implement the plan in
[`docs/plans/dev-production-database-electron-harness/dev-production-database-electron-harness-plan.md`](../plans/dev-production-database-electron-harness/dev-production-database-electron-harness-plan.md):
separate development and production data, add a disposable interactive
Playwright harness, and document the supported workflows.

The core implementation and automated verification are complete. The plan
remains in progress because the exact Phase 3 concurrency matrix—two concurrent
harness sessions alongside each app mode—has not been fully evidenced.

## Plan and execution order

The plan has three sequential phases:

1. **Separate development and production profiles** — complete.
2. **Create the isolated interactive Playwright harness** — complete after
   Phase 1 validation.
3. **Document modes and verify end-to-end behavior** — documentation, automated
   tests, and Windows packaged verification are complete; the exact concurrency
   matrix is still outstanding.

No phases ran in parallel. Each phase was delegated sequentially to a
general-purpose implementation subagent using GPT-6 Luna, the orchestrator's
model. The orchestrator independently reviewed and validated the phase
deliverables.

## Changes by phase

### Phase 1: Separate development and production profiles

- Added `src/main/db/database-profile.ts` to select a shared persistent
  development profile/database for unpackaged dev and preview, preserve the
  packaged default, honor explicit database overrides, and reject a development
  or harness path resolving to the protected production database.
- Added
  `src/main/db/__tests__/database-profile.test.ts` for dev/preview parity,
  packaged defaults, alternate overrides, Windows path aliases, and protected
  path rejection.
- Updated `src/main/db/database.ts` to apply the profile guard before creating
  directories or opening SQLite.
- Updated `src/main/index.ts` to select unpackaged user data before acquiring
  Electron's single-instance lock.
- The user verified packaged production running alongside `npm run dev` and,
  separately, `npm run start`. Preview focused the existing dev instance when
  dev was open, consistent with both unpackaged modes sharing one profile and
  lock. Production remained unaffected.
- No production data was copied or used for test writes.

### Phase 2: Isolated interactive Playwright harness

- Added `scripts/electron-playwright-harness.mjs` for per-run temporary
  profiles/databases, loopback-only CDP, ownership verification, diagnostics,
  process-tree termination, and cleanup after confirmed exit.
- Refactored `scripts/test-dashboard-drag.mjs` to use the shared harness and a
  deterministic dashboard fixture.
- Added harness-only startup suppression to avoid external polling and
  user-script execution without changing ordinary app behavior.
- Added `scripts/PLAYWRIGHT-HARNESS.md` with instructions for authoring
  UI-driven scenarios and handling retained artifacts.
- Parallel harness runs used distinct temporary roots, profiles, databases,
  and CDP ports; both process trees exited and their temporary roots were
  removed. Failure-path probes retained diagnostic artifacts and removed the
  isolated profile only after process exit was confirmed.

### Phase 3: Documentation and end-to-end verification

- Updated `.github/copilot-instructions.md`, `docs/tech-notes.md`,
  `docs/architecture/overview.md`, and `docs/HOW-TO-RUN.md` to describe the
  production, dev/preview, and harness modes and their data-safety boundaries.
- Ran the Windows production verification workflow with its disposable smoke
  database; the packaged smoke test initialized schema version 10.
- Completed typecheck, full Vitest, focused harness checks, and the dashboard
  harness scenario.
- Fixed a directly observed Saved Posts renderer crash: a `useCallback` hook
  was below a conditional early return, causing React's “Rendered fewer hooks
  than expected” error. The hook now runs before that return.

## Validation and evidence

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed. |
| `npm test -- --reporter=dot` | Passed: 31 files, 195 tests. The native module was rebuilt for Node ABI 127 for this run. |
| `npm run verify:production:win` | Passed: packaged Windows verification used a disposable database and initialized schema version 10. |
| `npm run test:dashboard-drag` | Passed after restoring `better-sqlite3` to Electron ABI 130. |
| Database profile tests | Passed, including protected production-path rejection. |
| Harness syntax and focused ESLint checks | Passed. |
| Saved Posts hook-order lint and focused tests | Passed; the user manually confirmed the crash fix. |
| Harness parallelism and cleanup | Passed: distinct roots/databases/CDP ports, process-tree exit confirmation, and cleanup; intentional failure preserved diagnostics. |
| Documentation links and `git diff --check` | Passed. |
| Windows packaged production + dev | User verified the pairing; production remained unaffected. |
| Windows packaged production + preview | User verified separately; production remained unaffected. |

The full concurrency criterion also requires two independent harness sessions
alongside each app mode. Parallel harness records establish distinct resources
and include an active Vite renderer server, but do not unambiguously document
the specific harness-pair combinations with dev, preview, and packaged
production. That criterion is therefore not marked passed.

Three updated Markdown files have Prettier warnings that also occur when
checking their pre-change versions. Their existing formatting was preserved
rather than reformatting unrelated content.

## Native module ABI note

This Windows environment uses different `better-sqlite3` ABIs for Node 22
(127) and Electron 33.4.11 (130). The full Vitest suite passed after a
Node-targeted rebuild; `npx electron-rebuild --force --which-module
better-sqlite3 --version 33.4.11` restored the Electron-targeted binary before
the harness run. The packaged app was closed before rebuilding and production
verification. No production database was used.

## Final status and remaining work

**Implementation status: core work complete; Phase 3 acceptance remains in
progress.** Profile separation, harness isolation, documentation, automated
tests, packaged smoke verification, and user-verified packaged/dev and
packaged/preview concurrency are complete. Do not mark the plan complete until
the outstanding two-harness concurrency pairings are explicitly verified and
recorded. No commit was created.
