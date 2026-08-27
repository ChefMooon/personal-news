# Implementation Plan: Astronomy Backend

## Source
- Document: `docs/plans/atronomy-data/astronomy-backend.md`
- Basis: specification

## Objective
Build one main-process Astronomy module that calculates, normalizes, caches, schedules, and exposes local astronomy data for saved Weather locations. The module will provide the shared `AstronomySnapshot` contract to both the Weather astronomy strip and the standalone Astronomy widget, while isolating Astronomy failures from valid Weather data and preserving partial or stale group data according to the specification.

## Scope
- In scope: the exact-pinned local `astronomy-engine` dependency; shared Astronomy contracts and IPC types; the dedicated main-process module; normalized Moon, Horizon, Planet, and Global Event calculations; one-row-per-location SQLite caching; settings and scheduling; location lifecycle handling; dedicated IPC; Weather enrichment and Weather-triggered refresh; failure isolation; focused backend and integration tests; the required typecheck, build, and Windows production verification gate.
- Out of scope: the Weather renderer astronomy strip; the standalone Astronomy renderer widget; Weather widget instance configuration such as `showAstronomy`; legacy Weather renderer configuration migration; remote astronomy services, credentials, images, a second location store, raw-vector persistence, local eclipse visibility, and deferred event families.

## Assumptions and Open Decisions
- **Candidate dependency:** `astronomy-engine` version `2.1.19` is the previously researched candidate, not an unchecked implementation fact. Verify the released version, package exports, TypeScript declarations, and Electron/electron-vite bundling before coding against it.
- **Repository integration:** Existing `DataSourceModule`, source registration, database migration runner, Weather cache shape, settings store, IPC registration, and lifecycle wiring must be inspected before implementation. Where the current repository differs from the document's suggested file split, preserve the existing boundary while keeping calculation, cache, and orchestration responsibilities separate.
- **Astronomy Engine API coverage:** Confirm the exact calls and return shapes for libration, apsis, planet illumination/magnitude/coordinates, local rise/set, eclipses, seasons, and Mercury/Venus transits before finalizing adapter code.
- **Migration shape:** Decide during implementation whether the cache migration uses only the specified scalar columns and JSON payload or also stores an internal payload schema/version. This must not change the one-row-per-location behavior.
- **Timezone conversion:** Verify a DST-aware conversion from an IANA local date to UTC using the supported Node runtime and the project's available dependencies. Do not silently use the machine timezone.
- **Initialization order:** Complete all module references and cross-module hooks before asynchronous startup refresh begins. The implementation must not depend on incidental source registration order.
- **Single-agent sequencing:** Execute phases in order in one working tree. Do not begin either renderer plan until the Phase 5 backend gate has passed and the shared contract is stable.

## Phases
### Phase 1: Dependency and Shared Contract
- **Goal:** Establish a verified library boundary and the shared, renderer-safe data and IPC vocabulary before calculation or persistence code is added.
- **Tasks:**
	1. Inspect the current package metadata, lockfile, source registry, Weather contracts/cache, IPC/preload bridge, settings store, database migration runner, and test conventions. Record the concrete integration points discovered rather than assuming the suggested paths.
	2. Verify the reviewed `astronomy-engine` release, import form, declarations, supported APIs, and main-process bundle behavior. Pin the dependency exactly and update the lockfile only after the verification succeeds.
	3. Add the normalized Astronomy types to `src/shared/ipc-types.ts`, including group names and statuses, the snapshot envelope, Moon/Horizon/Planet/Event values, settings, status, refresh result, and update-event contracts. Keep provider-specific return types out of shared code.
	4. Add the Astronomy IPC channel constants and payload/response types required for snapshot reads, refresh, settings, status, and update events.
	5. Add pure utility tests for phase buckets and wraparound, illumination/trend normalization, solar-state boundaries, timestamp precision, enum values, and any shared validation helpers introduced in this phase.
- **Dependencies:** None beyond the source specification and the existing repository.
- **Validation:** Run the focused shared/utility tests; typecheck the affected shared and main-facing contracts; perform a minimal import/bundle smoke check for the pinned dependency.
- **Exit criteria:** The exact dependency and shared contract are verified, the lockfile is consistent, and deterministic utility tests define the boundary behavior needed by later phases.

### Phase 2: Cache, Settings, and Module Lifecycle
- **Goal:** Provide durable per-location storage and a non-overlapping module lifecycle that can run only when the Astronomy feature is enabled.
- **Tasks:**
	1. Add the next numbered database migration under `src/main/db/migrations/` for the one-row-per-location `astronomy_cache` table, its foreign key cascade, and the calculated-at index. Register it in `src/main/db/database.ts` using the repository's explicit migration map/versioning rules.
	2. Implement prepared cache reads, upserts, status reads, partial-group preservation, unavailable-row insertion, stale marking, and observer-change invalidation. Preserve valid `null` no-event fields as successful data and never overwrite prior usable group data because a later group failed.
	3. Implement normalized Astronomy settings with `enabled: true` and a 60-minute default, default merging, malformed-value fallback, and clamping to 15 through 1440 minutes using the existing settings persistence pattern.
	4. Add the dedicated main-process module under the existing source-module boundary. Implement initialization, database reference ownership, startup refresh scheduling, one timer, shutdown cleanup, late-result prevention, and concise logging with the required `[Astronomy]` prefix.
	5. Add location lifecycle hooks for save, removal, coordinate changes, and timezone changes. Reuse saved Weather locations and the Weather default-location behavior; do not add a second location store.
	6. Implement refresh coordination and request coalescing so repeated requests for one location reuse in-flight work, broader requests await or enqueue missing work, batches do not overlap, and shutdown invalidates active work.
- **Dependencies:** Phase 1 shared types, verified package boundary, and discovered database/source lifecycle conventions.
- **Validation:** Run migration/version tests; test complete, partial, stale, unavailable, null-event, cascade, observer-change, settings-clamping, enable/disable, startup/shutdown, coalescing, and no-overlap behavior with focused fakes or fixtures.
- **Exit criteria:** A location can be represented durably even after failure, settings and scheduling obey the feature gate, and lifecycle behavior is deterministic without renderer dependencies.

### Phase 3: Calculation Adapter and Normalization
- **Goal:** Calculate every agreed astronomy group at one captured UTC anchor and normalize all results into the shared contract with field- and group-level failure isolation.
- **Tasks:**
	1. Implement observer validation for finite latitude/longitude values and the zero-meter observer elevation. Invalid locations must fail independently and must not stop other locations.
	2. Implement the Moon group: phase angle and eight deterministic names, illumination percentage, waxing/waning trend, synodic progress, distance, libration, next primary phase, and optional apsis values. Preserve independent `null` optional fields.
	3. Implement the local-day Horizon group using the selected location's IANA timezone and a DST-aware local-day interval. Calculate Sun/Moon rise and set, current altitudes/azimuths, and inclusive solar-state thresholds. Treat no-rise/no-set as `null`, not an exception.
	4. Implement all seven Planet entries with altitude/azimuth, local-day rise/set, apparent magnitude, illumination, phase/coordinate fields, and the ordered factual `skyState` rules. Preserve stable entries and nullable optional fields for every supported body.
	5. Implement bounded, chronologically sorted global events in the next 365 days, with no more than five events per family, covering seasons, lunar eclipses, solar eclipses, and Mercury/Venus transits only. Keep scope global and local visibility `null`.
	6. Capture one `forTimestamp` for each run according to the Weather-triggered, standalone-refresh, or no-Weather-snapshot rules. Store a separate integer `calculatedAt` for successful normalized output, and reject invalid numeric/date values before persistence.
	7. Expose group results in a form the module can merge with prior cache values: fresh groups replace prior values, failed groups become stale or unavailable as appropriate, and overall status becomes complete, partial, or unavailable according to the specified semantics.
- **Dependencies:** Phase 1 shared contracts and verified Astronomy Engine APIs; Phase 2 cache/module orchestration and timezone/migration decisions.
- **Validation:** Run pure calculation tests for all phase/solar/planet boundaries, timezones and DST, null rise/set results, event bounds, numeric normalization, and per-group failure isolation. Compare representative normalized results against fixed expected values without asserting provider-specific objects.
- **Exit criteria:** A complete or partial normalized snapshot can be produced for a valid saved location, all seven planets and required event families are represented, and invalid or missing data cannot leak into SQLite or IPC.

### Phase 4: IPC and Weather Enrichment
- **Goal:** Connect the module to the existing Electron boundary and Weather refresh flow without making Weather dependent on Astronomy success.
- **Tasks:**
	1. Register the module through the existing main-process source registry and complete all initialization references before starting asynchronous startup work.
	2. Register handlers in `src/main/ipc/index.ts` for dedicated snapshot reads, one/all-location refresh, settings get/set, status, and update events. Enforce unknown-location and feature-disabled request behavior exactly as specified, including the requested `refreshedCount` semantics.
	3. Emit `ASTRONOMY_UPDATED` after successful or partial batches and after cache/location changes that affect subscribers. Return concise operational status and keep detailed errors in main-process logs.
	4. Update the Weather main-process path so a successful Weather cache write triggers Astronomy for that location with the Weather current timestamp when enabled, while Astronomy failure does not reject or roll back the Weather refresh.
	5. Enrich `WEATHER_GET_SNAPSHOT` results with `astronomy: AstronomySnapshot | null`, retaining valid current, hourly, daily, alert, and stale data when the cache is absent or unavailable.
	6. Ensure Astronomy timer/manual updates give Weather consumers a re-read signal through the repository's existing update flow or a deliberately deduplicated Astronomy subscription path, without introducing listener leaks or duplicate updates.
- **Dependencies:** Phases 1 through 3; existing preload invoke/on wrapper and Weather refresh/cache implementation.
- **Validation:** Run IPC and Weather integration tests for one/all refresh, unknown locations, disabled settings, snapshot reads, status redaction, update subscriptions, enriched snapshots, Weather success with Astronomy failure, and Astronomy-only update propagation.
- **Exit criteria:** Both renderer surfaces can consume the same snapshot through the existing preload boundary, Weather remains valid when Astronomy fails, and all feature-gated operations behave consistently.

### Phase 5: Backend Validation Gate
- **Goal:** Prove the backend is ready for renderer implementation and catch packaging or lifecycle regressions before either consumer is built.
- **Tasks:**
	1. Run the complete focused Astronomy unit, cache, lifecycle, IPC, and Weather integration suites and repair only backend-scope failures.
	2. Verify migration discovery, foreign-key behavior, bundled migration resources, and the highest schema version in the packaged application.
	3. Run `npm run typecheck` and `npm run build`.
	4. Run the applicable Windows production verification command, `npm run verify:production:win`, because the dependency, main-process bundle, migration, and packaged resources changed.
	5. Review the shared contract against both renderer specifications and record any remaining implementation check before handing the workspace to the Weather plan.
- **Dependencies:** All prior phases.
- **Validation:** The commands and focused tests above must pass; inspect packaged output only as needed to verify the migration and main-process dependency are included.
- **Exit criteria:** The backend acceptance criteria are met, the production verification passes, and renderer work can proceed without inventing a second Astronomy data path.

## Cross-Phase Dependencies
- The shared contracts and exact dependency boundary in Phase 1 are prerequisites for cache and calculator work.
- Cache/lifecycle behavior must be in place before the calculator can preserve prior group data or support scheduled/manual refreshes.
- The calculator must be complete before IPC and Weather enrichment are wired, so handlers do not expose provisional provider objects.
- The Phase 5 validation gate must pass before either renderer plan starts.
- The Weather plan and Astronomy widget plan must reuse `AstronomySnapshot`, the same app-level `enabled` setting, saved Weather locations, and the same timestamp semantics. They must not add renderer-side calculations, direct database access, or a second location store.

## Risks and Mitigations
- **Astronomy Engine APIs differ from the brief:** verify the pinned package before adapter design; isolate provider calls behind `calculator.ts` or the repository-equivalent adapter and normalize at its boundary.
- **DST or timezone conversion is wrong:** test multiple IANA zones and a DST transition, and reject use of the host timezone in local-day calculations.
- **A partial failure erases valid data:** write group-aware merge/upsert tests before integrating scheduling and preserve prior successful group payloads.
- **Weather refresh becomes coupled to Astronomy reliability:** keep the Astronomy call after Weather persistence, catch/log calculation failures, and test Weather success independently.
- **Concurrent refreshes race or write late after shutdown:** centralize coalescing, batch identity, and cancellation/invalidated-run checks in the module lifecycle.
- **Migration or native dependency packaging fails on Windows:** run the production verification gate before renderer work and keep migration registration explicit.
- **Renderer contracts drift:** compare the final shared interfaces with both consumer specifications during Phase 5 and treat the gate as blocking.

## Final Validation
- Verify the dedicated module uses saved Weather locations, zero elevation, one cache row per location, and no astronomy network request or second location store.
- Verify startup, default 60-minute polling, clamped settings, manual one/all refresh, enable/disable behavior, shutdown cleanup, no overlapping batches, and location invalidation.
- Verify Moon, local-day Horizon, seven Planet, and bounded global-event groups, including null optional fields and global-only event scope.
- Verify Unix-second timestamps, selected-location IANA timezone support, one captured calculation anchor, and renderer-derived countdown compatibility.
- Verify complete, partial, stale, and unavailable status semantics plus preservation of successful data through later failures.
- Verify `WeatherSnapshot.astronomy` is nullable at runtime and Weather remains usable when Astronomy is absent or fails.
- Verify `npm run typecheck`, `npm run build`, and `npm run verify:production:win` pass before frontend implementation begins.

## Completion Criteria
- One initialized and shutdown-safe main-process Astronomy module owns calculations, cache, settings, scheduling, and IPC-facing operations.
- The normalized shared contract is provider-independent and supports both planned renderer surfaces.
- Focused backend and Weather integration tests pass, including failure isolation and update propagation.
- The migration and exact dependency are included in production packaging.
- The Phase 5 validation gate is green and the remaining checks are documented for the renderer plans without adding hidden scope.
