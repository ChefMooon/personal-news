---
title: "Astronomy Details Page - Implementation Plan"
plan_profile: FULL
status: COMPLETED
verification_status: PASSED
current_phase: 3 / 3
created: 2026-10-16
last_updated: 2026-10-17
---

# Overall Plan Completion Status

- **Total Phases Completed:** 3 / 3
- **Summary of Outcome:** C1-C3 are implemented. All mandatory phase checks and
  final integration validation passed for the current scope.

# Specification & Overview

### 1. Scope & Objective

- **Source:** [Astronomy details assessment](astronomy-details-page-spec.md),
  read completely; C1-C3, clarifications, impact findings, and discriminating
  checks define this plan's scope.
- **Goal:** Promote the existing Astronomy details page into a complete,
  location-aware view of the available snapshot, discoverable through gated
  sidebar navigation and relevant dashboard widgets.
- **In-Scope:** C1 full-data rendering and independent data-group states;
  C2 configurable MoonStar sidebar entry and global-feature route guard;
  C3 Astronomy Small/Medium and Weather Small/Medium/Large Details actions.
- **Out-of-Scope:** Backend, IPC channel/payload, preload, database, data-source,
  calculation, local visibility prediction, feature-toggle/data-retention changes,
  widget editing controls, and an Astronomy Large Details action.
- **Acceptance mapping:** C1 maps to Phase 1 and its ledger; C2 maps to Phase 2
  and its ledger; C3 maps to Phase 3 and its ledger. Cross-change gates and
  location propagation are exercised in Phases 2-3.
- **Completion criteria:** Execute all three phases, record actual changed
  artifacts, and pass every mandatory ledger check. Set lifecycle and verification
  fields independently; execution completion alone does not mean verification
  passed.

### 2. Technical Constraints & Architecture

- Reuse `/astronomy/details?locationId=...`, `useAstronomySnapshot`, existing
  Weather location resolution/time-format settings, display helpers, and
  `AstronomyDetailedPrimitives`; do not create a second route or data path.
- Use `AstronomySnapshot` in `src/shared/ipc-types.ts` as the field inventory,
  not a new schema. Display location/timezone, target/calculation timestamps,
  freshness, snapshot status, and each group's availability. Preserve meaningful
  null, empty, stale, and unavailable distinctions instead of inventing values.
- Global Astronomy enabled state gates the page and every navigation entry.
  Weather `showAstronomy` gates only that Weather instance's Astronomy section
  and action; it must not disable the standalone page or other entry points.
- The sidebar ID and normalization helpers live in shared code. Extending that
  existing sidebar configuration vocabulary is in scope; changing Astronomy IPC
  contracts or adding persistence migrations is not.
- Reuse Sidebar and Settings availability/order/hidden-state patterns. Existing
  normalization appends newly recognized IDs, making the new entry visible by
  default in older configurations unless hidden by the user.
- **Assumptions carried from source:** "All info" means all relevant existing
  snapshot data, not widget configuration. Dashboard is the disabled-route
  fallback. Query-based selection and existing default/invalid-location fallback
  semantics remain unchanged. Weather Details requires both global Astronomy
  enabled and instance `showAstronomy`.
- **Verified planning preflight:** The route already resolves location and renders
  detailed primitives; Astronomy Small/Medium already have effective-location
  navigation. Preserve and complete those paths rather than duplicate them.
  Package scripts provide renderer preview, browser matrix, focused Vitest, and
  typechecking commands.
- **Changing-checkout constraint:** The assessment reported a clean checkout at
  assessment time; planning found the source folder untracked. Treat that as a
  snapshot, not an enduring guarantee. Re-read affected files and applicable
  guidance before implementation; preserve unrelated work and do not switch
  branches or create a worktree. Planning changes only this dedicated artifact.
- **Risks:** Long data tables may overflow; compact buttons may crowd content;
  stale geometry may appear live; global events may imply unsupported local
  visibility; toggle transitions may leave an accessible shell; configuration
  filtering may erase preferences; default-only fixtures may hide location bugs.
  The phase ledgers explicitly test these risks.
- **Execution route:** Use `orchestrate-implementation` for distinct page,
  navigation/settings, and widget workstreams. Execute in the order below to keep
  route behavior stable before validating entry points; no discovery-only or
  validation-only phase is required.

### 3. Roles & Delegation

| Role | Agent or session | Model | Responsibility |
| --- | --- | --- | --- |
| Planner | Astronomy details plan session | GPT-6.1 Sol | Source mapping, plan authoring, and structural checks |
| Implementer | Luna phase 1, Luna phase 2, Luna phase 3 | GPT-6 Luna | Phase implementation, focused tests, and phase evidence |
| Validator | Orchestrating session | GPT-6 Luna | Independent phase handoff review, final diff review, and acceptance validation |

### 4. Decisions & Change Log

| Decision | Source and date | Supersedes | Affected scope or acceptance criteria |
| --- | --- | --- | --- |
| Hide navigation and guard direct visits when global Astronomy is off | Source user clarification; carried forward 2026-10-16 | None | C2; Phase 2 route and toggle checks |
| Reuse existing route; assume Dashboard redirect and snapshot-only meaning of "all info" | Source assumptions; carried forward 2026-10-16 | None | C1-C3; route, field inventory, and fallback checks |
| Use FULL profile with three ordered delivery phases | Planning decision, 2026-10-16 | None | Execution route and phase handoffs; no added product scope |

# Execution Plan & Handoffs

## Phase 1: Promote the Full-Data Astronomy Page

- **Status:** COMPLETED
- **Objective:** Deliver C1 using the existing snapshot and route, preserving
  location semantics and successful groups when other data is unavailable.
- **Exit Deliverable:** Full-data route with stable location behavior and recorded
  Phase 1 evidence for downstream navigation and widget integration.

### Tasks

- [x] Revalidate the source's affected renderer surfaces against the current
  checkout as implementation preflight. Inventory every snapshot field and map
  it to visible content or an explicitly justified non-display identity field.
- [x] Extend `AstronomyDetails.tsx`, `AstronomyPrimitives.tsx`, and existing display
  helpers only where needed. Show selected location/timezone, snapshot
  `forTimestamp`, `calculatedAt`, stale/status metadata, and per-group statuses.
- [x] Expose Moon phase/illumination/trend/synodic progress, distance, libration,
  next primary phase, perigee/apogee; horizon rise/set, altitude/azimuth and solar
  state; all supplied planets and their position, rise/set, magnitude,
  illumination/phase, orbital distance/ecliptic values and sky state; all supplied
  global-event families, labels, and times. Preserve global/not-local semantics.
- [x] Preserve existing location query resolution and Weather time formatting.
  Render loading, no saved location, no cached snapshot, stale, null values,
  empty groups, and partial/unavailable groups without suppressing usable groups.
- [x] Extend synthetic fixtures and focused browser assertions in the existing
  renderer harness for the added fields and adverse states. Keep shared widget
  renderings unchanged where detailed primitives are reused.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| C1 covers the supplied data rather than only the old summary | Mandatory | Reviewed visible field mapping against `AstronomySnapshot` and nested types; browser assertions verify Moon, horizon, planets, events, location/timezone, freshness and extended fields | PASSED — full-snapshot page presentation; renderer browser matrix passed |
| Calculation/freshness and global-event semantics are truthful | Mandatory | Fixture assertions distinguish target/calculation times and fresh/stale/group status; reviewed labels to confirm positions are calculated geometry and events make no local visibility claim | PASSED — stale/partial fixtures and explicit disclaimers; renderer browser matrix passed |
| Loading, missing location, missing snapshot, null/empty and partial groups remain usable | Mandatory | Browser cases cover each state; mixed-status snapshot asserts successful sections remain visible while unavailable/stale sections retain explicit status | PASSED — focused route scenarios in `scripts/test-renderer-browser.mjs` |
| Location selection and time formatting retain existing behavior | Mandatory | Browser cases use two saved locations with distinct timezones, explicit non-default query selection, no query, invalid query, no locations, and both 12h/24h formats | PASSED — `Pacific/Kiritimati` and default-location scenarios in renderer browser run |
| Responsive details and reused widget presentation do not regress | Mandatory | Ran `npm run test:renderer-browser`; checked no horizontal overflow at 620/840/1040/1240px; ran `npm run typecheck` | PASSED — browser matrix (6 dashboards × 3 sizes × 4 projections) and Node/web typechecks passed; screenshots in `artifacts/renderer-browser/2026-10-17T03-36-41.264Z/` |

### Scope & Diff Guardrails

- No snapshot contract expansion, new calculations, local visibility estimates,
  settings controls, main/preload/database changes, or duplicated details route.
- Inspect the diff for unintended changes to capped widgets or the existing
  uncapped Astronomy Large content.

### UI Validation

- **Viewport(s):** Existing browser harness 12-, 8-, 4-, and 1-column projections;
  exercise the standalone details page at the corresponding viewport widths.
- **Interactions/states:** Scroll through every data section, resolve locations,
  use Return, and exercise loading/missing/partial/stale states.
- **Requested measurements:** Document/page scroll width must not exceed client
  width; no clipped labels or inaccessible table content. No new performance
  threshold is specified.
- **Preview limitations/fallbacks:** Start with `npm run dev:renderer-browser` and
  use `npm run test:renderer-browser` for recorded checks. Mocked API fixtures do
  not prove native IPC or persistence; only escalate to isolated Electron harness
  validation if implementation crosses that boundary. Never use production data.

### Phase Record

- **Artifacts created/modified:** `src/renderer/src/routes/AstronomyDetails.tsx`,
  `src/renderer/src/modules/astronomy/AstronomyPrimitives.tsx`,
  `src/renderer/src/modules/astronomy/astronomy-display.ts`,
  `scripts/renderer-browser-shared.mjs`, `scripts/renderer-browser-api.mjs`,
  and `scripts/test-renderer-browser.mjs`.
- **Decisions/deviations:** None beyond the overview assumptions.
- **Evidence:** `npm run test:renderer-browser` passed;
  `npm run typecheck` passed; `git diff --check` passed. Plan owner reviewed the
  changed files and confirmed the implementation remains within Phase 1 scope.
- **Next-phase context:** Phase 2 consumes this route and its unchanged location
  contract. Keep `fullSnapshot` opt-in so existing Astronomy Large/widget
  presentation remains unchanged; use verified Phase 1 browser coverage as the
  baseline for the global feature gate and sidebar integration.

## Phase 2: Gate Route Access and Configurable Sidebar Navigation

- **Status:** COMPLETED
- **Objective:** Deliver C2 without erasing sidebar preferences or weakening the
  global Astronomy gate.
- **Dependencies:** Phase 1 route and location behavior.
- **Exit Deliverable:** Configurable gated MoonStar navigation and a route guard
  with tested disable/re-enable behavior for Phase 3 integration.

### Tasks

- [x] Add Astronomy to `CUSTOMIZABLE_SIDEBAR_ITEM_IDS` and existing Sidebar and
  Settings entry metadata/availability patterns. Use MoonStar and navigate to
  the existing route with its normal default-location resolution.
- [x] Preserve existing normalization compatibility: append the new ID to older
  orders without resetting prior order, hidden IDs, or collapsed state. Feature
  availability must not rewrite saved order or hidden state.
- [x] Guard direct route visits and already-open-page transitions when global
  Astronomy becomes disabled; redirect to Dashboard without retaining the
  details shell as an empty-data substitute. Follow the context's existing
  initialization/loading semantics to avoid premature redirect.
- [x] Add focused normalization/configuration tests and browser toggle scenarios,
  including re-enable with custom order and an explicitly hidden Astronomy item.
  Do not change the toggle's data-retention behavior.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| C2 Astronomy is configurable and discoverable when enabled | Mandatory | Browser actions verify MoonStar entry, Settings availability, show/hide/reorder controls, and navigation to the existing details route | PASSED — browser scenarios verified availability, Settings controls and default-location sidebar navigation |
| Global-off hides entry and guards direct and active-page access | Mandatory | Browser cases disable Astronomy before a direct URL visit and while on details; assert Dashboard redirect, no details shell, no sidebar entry, and no bypass from a location query; verify enabled initialization does not redirect incorrectly | PASSED — direct and active-page guard, disabled initialization and delayed enabled initialization scenarios passed |
| Old sidebar configurations upgrade without preference loss | Mandatory | Tested `normalizeSidebarConfig` with an older order, hidden IDs and collapsed state using `npm test -- src/shared/__tests__/sidebar-config.test.ts` | PASSED — 1 test passed; existing order, hidden IDs and collapsed state retained and missing entries appended |
| Off/on preserves order and explicit hidden choice | Mandatory | Browser tests capture non-default order/hidden state, disable/re-enable globally, and compare configuration; visible entries return in their configured position, explicitly hidden Astronomy stays hidden, and Settings availability recovers | PASSED — custom order and hidden choice retained across off/on and direct-route guard scenarios |
| Navigation changes preserve type and browser behavior | Mandatory | Ran `npm run typecheck` and `npm run test:renderer-browser`; reviewed diff for preference-clearing writes or changes to toggle/data retention | PASSED — Node/web typecheck and browser matrix passed; no preference rewrite or data-retention change introduced |

### Scope & Diff Guardrails

- Shared changes are limited to the existing sidebar ID/configuration vocabulary
  and directly related tests; no IPC channel/payload or database migration.
- Do not persist a filtered available-item list over user preferences or treat
  Weather `showAstronomy` as page authorization.

### UI Validation

- **Viewport(s):** Existing browser matrix widths, with expanded/collapsed sidebar
  states and the Settings sidebar controls.
- **Interactions/states:** Enable/disable, direct visit, disable while viewing,
  re-enable, reorder, hide, and restore entry.
- **Requested measurements:** No clipped sidebar label or Settings control;
  disabled page is replaced by Dashboard rather than remaining visible.
- **Preview limitations/fallbacks:** Mocked settings cover renderer transitions,
  not durable native storage. If the change affects real persistence beyond the
  existing shared normalization, validate an isolated Electron profile before
  claiming persistence behavior; do not use the production database.

### Phase Record

- **Artifacts created/modified:** `src/shared/ipc-types.ts`,
  `src/shared/__tests__/sidebar-config.test.ts`,
  `src/renderer/src/contexts/AstronomyEnabledContext.tsx`,
  `src/renderer/src/components/Sidebar.tsx`,
  `src/renderer/src/routes/Settings.tsx`,
  `src/renderer/src/routes/AstronomyDetails.tsx`,
  `src/renderer/src/main.tsx`, `scripts/renderer-browser-api.mjs`, and
  `scripts/test-renderer-browser.mjs`.
- **Decisions/deviations:** Dashboard fallback remains the source assumption.
- **Evidence:** `npm test -- src/shared/__tests__/sidebar-config.test.ts` passed
  (1 file, 1 test); `npm run test:renderer-browser` passed;
  `npm run typecheck` passed; `git diff --check` passed. Plan owner reviewed the
  Phase 2 diff and reran these checks.
- **Next-phase context:** Phase 3 must use this global gate for every widget
  action while keeping Weather's per-instance gate independent. The browser
  preview accepts deep route paths for direct-navigation checks; Electron
  continues to use its existing MemoryRouter behavior.

## Phase 3: Complete Location-Aware Widget Entry Points

- **Status:** COMPLETED
- **Objective:** Deliver C3 and verify all entry paths use the originating
  widget's effective location under the correct gates.
- **Dependencies:** Phase 1 full-data route; Phase 2 global route/access gate.

### Tasks

- [x] Preserve and complete Astronomy Small/Medium Details behavior in
  `AstronomyWidget.tsx` and its content policy; reuse the existing effective
  location and encoded query. Do not add an Astronomy Large button.
- [x] Add a shared location-aware Weather Details action through
  `WeatherAstronomy.tsx` and the owning Weather widget/layout props as needed,
  covering Small, Medium, and Large without independently deriving a different
  default. Retain the existing Astronomy section gates.
- [x] Ensure Weather actions require global enabled AND that instance's
  `showAstronomy`; global-off suppresses every Astronomy entry point. Preserve
  existing no-effective-location behavior rather than navigate to an unrelated
  location. Keep buttons keyboard-operable and avoid dashboard drag conflicts.
- [x] Extend browser fixtures/cases with at least two distinct locations and
  per-instance Weather settings. Assert query ID and destination content for all
  five required size/action combinations, including default/fallback resolution.
- [x] Run the integrated browser matrix, focused applicable tests through
  `npm test -- <actual file-or-filter>`, and `npm run typecheck`. Record concrete
  commands and evidence in this ledger; review the final diff against C1-C3 and
  all phase guardrails before updating overall completion/verification fields.

### Outcome & Evidence Ledger

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| C3 all five required actions preserve originating location | Mandatory | Browser-click Astronomy Small/Medium and Weather Small/Medium/Large Details; assert decoded `locationId`, page location/timezone, and location-specific data for each | PASSED — browser scenarios verified both Astronomy sizes and all three Weather sizes with location-specific destination content |
| Effective-location fallback remains coherent | Mandatory | Test explicit, default-backed, invalid/removed, and no-effective-location configurations; confirm destination uses the existing resolver and missing locations do not expose unrelated details | PASSED — Weather Medium default was used; invalid and no-default configurations exposed no Details link |
| Global and Weather-instance gates remain distinct | Mandatory | Browser truth table: global on/showAstronomy on shows Weather action; per-instance off hides only that Weather section/action while page/sidebar/Astronomy links remain; global off hides all entries and guards route | PASSED — per-instance isolation and global-off behavior verified across Weather widget sizes |
| Compact content remains usable; Astronomy Large is unchanged | Mandatory | Matrix assertions/screenshots verify Small/Medium Astronomy and all Weather sizes have reachable buttons without overflow/clipping; verify keyboard activation, grid drag cancellation for anchors, no Large action, and retained uncapped content | PASSED — browser matrix assertions verified keyboard activation, button reachability, anchor drag cancellation, and all Astronomy Large planets without a Details action |
| C1-C3 integration and scope are complete | Mandatory | Ran `npm run test:renderer-browser`, `npm run typecheck`, and focused tests for sidebar config, Astronomy content policy, and Weather config; reviewed final diff and phase evidence against C1-C3 | PASSED — browser matrix passed; Node/web typecheck passed; 3 focused test files and 12 tests passed; no backend/IPC/database changes |

### Scope & Diff Guardrails

- Prefer the existing shared Weather Astronomy rendering path; avoid three
  independent navigation implementations or new location calculations.
- Preserve widget settings/data, Astronomy Large, backend/IPC/database boundaries,
  and unrelated work. Only implementation evidence can justify closing tasks.

### UI Validation

- **Viewport(s):** All three fixture sizes at 12-, 8-, 4-, and 1-column projections,
  with focused assertions on the five required entry points.
- **Interactions/states:** Mouse/keyboard Details activation, explicit/default/
  removed locations, global-off, per-instance section-off, and toggle restoration.
- **Requested measurements:** No horizontal overflow or clipped/unreachable
  Details action; the Weather Astronomy icon action is in the top-right header
  immediately left of Settings; destination identity equals the originating
  effective location.
- **Preview limitations/fallbacks:** Browser fixtures must vary locations and gates;
  a default-only smoke test is insufficient. If actual integration changes
  warrant Electron coverage, use the isolated focused
  `npm run test:local-test-data -- --widget astronomy` and Weather equivalent;
  record the reason and results rather than treating browser mocks as native proof.

### Phase Record

- **Artifacts created/modified:** `src/renderer/src/modules/astronomy/AstronomyWidget.tsx`,
  `src/renderer/src/modules/astronomy/__tests__/astronomy-content-policy.test.ts`,
  `src/renderer/src/modules/weather/WeatherWidget.tsx`,
  `src/renderer/src/modules/weather/WeatherAstronomy.tsx`,
  `scripts/renderer-browser-api.mjs`,
  `scripts/renderer-browser-shared.mjs`, and
  `scripts/test-renderer-browser.mjs`.
- **Decisions/deviations:** Details actions use semantic links. The Weather action
  uses a MoonStar icon with the accessible label "Astronomy" and sits immediately
  left of the Settings control. The browser preview supports direct-path route
  checks while Electron retains its existing MemoryRouter; see Phase 2 record.
- **Evidence:** Final `npm run test:renderer-browser` passed (6 dashboards × 3
  sizes × 4 projections; artifacts:
  `artifacts/renderer-browser/2026-10-17T04-37-14.186Z/`); `npm run typecheck`
  passed; focused sidebar config, Astronomy content policy, and Weather config
  tests passed (3 files, 12 tests); Prettier and `git diff --check` passed. The
  browser matrix asserts the Weather Astronomy action's order relative to
  Settings. Plan owner reviewed the final changed files and confirmed the
  implementation stays within scope.
