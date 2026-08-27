# Implementation Report: Astronomy Backend

## Goal and Scope
- Goal: Main-process Astronomy module (calculation, cache, scheduling, IPC) per `docs/plans/atronomy-data/astronomy-backend-plan.md`.
- In scope: pinned astronomy-engine dep, shared contracts, main module, SQLite cache, settings/scheduling, IPC, Weather enrichment, tests, validation gate.
- Out of scope: renderer Weather strip, standalone Astronomy widget, remote services, second location store.

## Phase Checklist
1. Dependency and Shared Contract - pending
	- Acceptance: verified pinned dep; shared Astronomy types + IPC channels; utility tests.
	- Validation: focused shared/utility tests + typecheck.
2. Cache, Settings, Module Lifecycle - pending
	- Acceptance: migration, cache ops, settings clamping, module lifecycle, coalescing.
	- Validation: focused cache/lifecycle tests.
3. Calculation Adapter and Normalization - pending
	- Acceptance: Moon/Horizon/Planet/Event groups normalized with failure isolation.
	- Validation: pure calculation tests.
4. IPC and Weather Enrichment - pending
	- Acceptance: handlers registered, ASTRONOMY_UPDATED events, Weather enrichment.
	- Validation: IPC + Weather integration tests.
5. Backend Validation Gate - pending
	- Acceptance: all suites pass; migrations packaged.
	- Validation: typecheck, build, verify:production:win.

## Phase Results
1. Dependency and Shared Contract - completed
	- Changes: verified `astronomy-engine@2.1.19` (already pinned, API surface confirmed: MoonPhase, Illumination, Libration, Horizon/Equator, SearchRiseSet, Seasons, SearchLunarEclipse/SearchGlobalSolarEclipse, SearchTransit, Apsis); added Astronomy IPC channels + normalized types/settings helpers to `src/shared/ipc-types.ts`; added `src/shared/astronomy-utils.ts` + 9 passing utility tests.
	- Validation: `npx vitest run src/shared/__tests__/astronomy-utils.test.ts` - 9 passed.
2. Cache, Settings, Module Lifecycle - completed
	- Changes: migration `010_astronomy_cache.sql` (one-row-per-location, FK cascade, calculated_at index) registered as version 10 in `database.ts`; `cache.ts` with group-aware merge/upsert preserving prior fresh data; settings with 15–1440 clamping; `index.ts` module lifecycle (timer, coalescing via in-flight map, shutdown invalidation, location hooks); `weather/locations.ts` shared read-only location reader to avoid circular imports.
	- Validation: cache tests 5/5 passed (`npx vitest run src/main/sources/astronomy`). Note: rebuilt better-sqlite3 for system Node ABI to run tests.
3. Calculation Adapter and Normalization - completed
	- Changes: `calculator.ts` using verified astronomy-engine APIs (Observer zero elevation, Moon group incl. libration/apsides, DST-aware local-day horizon via Intl offset convergence, 7 planets with ordered skyState rules, bounded/sorted global events ≤5 per family, per-group failure isolation).
	- Validation: calculator tests 6/6 passed incl. DST timezone, southern hemisphere, invalid-coordinate isolation.
4. IPC and Weather Enrichment - completed
	- Changes: module registered in `src/main/index.ts` after WeatherModule; handlers for snapshot/refresh/refresh-all/settings/status in `src/main/ipc/index.ts`; `WeatherSnapshot.astronomy` nullable field added and enriched from cache with failure isolation; Weather save/remove hooks call astronomy lifecycle; post-Weather-persist refresh triggers astronomy without coupling failures; preload bridge is channel-generic (no change needed).
	- Validation: module lifecycle tests 7/7 passed (unknown location, disabled gate, clamping, malformed settings fallback, refresh+cache, coalescing, shutdown).
5. Backend Validation Gate - completed
	- Changes: none beyond repairs above.
	- Validation: full suite 69/69 tests passed (15 files); `npm run typecheck` clean; `npm run build` succeeded; `npm run verify:production:win` passed with migration 010 applied (schema version 10) and better-sqlite3 packaged for Electron ABI.

## Final Validation
- `npm test` - 69/69 passed
- `npm run typecheck` - pass
- `npm run build` - pass
- `npm run verify:production:win` - pass (packaged smoke test OK, schema v10)

## Remaining Issues
- Pre-existing working-tree damage to `src/shared/ipc-types.ts` (83 lines of Ntfy/SavedPosts/Digest view types missing vs HEAD) was discovered and restored from HEAD during Phase 2; unrelated to astronomy but required for a green typecheck.
- better-sqlite3 must be rebuilt for Electron (`npx electron-rebuild -f -w better-sqlite3`) after running tests under system Node, or `verify:production:win` fails on ABI mismatch.

## Status
complete
