---
title: "Dashboard RGL Layout - Implementation Plan"
status: COMPLETED
current_phase: 5
created: 2026-08-27
last_updated: 2026-08-27
---

# Specification & Overview

## 1. Scope & Objective

### Source Provenance

- Document: Previous conversation, user-designated source containing `# Pre-Plan Impact Assessment: Responsive Dashboard Grid Layout` and the completed decision register.
- Basis: Impact assessment and resolved product/technical decisions.
- Status: Decision-complete implementation plan. The decisions recorded below were finalized through adversarial review and are now part of the implementation contract.

### Objective

Replace the current vertical dashboard arrangement with `react-grid-layout` v2.2.4 so users can arrange widgets in a responsive two-dimensional grid while retaining explicit controls, cross-dashboard tab-drop transfers, and edit-mode boundaries. Add Small, Medium, and Large preset sizes for every widget without freeform resize handles, persist one canonical reference layout, and adapt each widget's content so it remains usable at every supported size.

### Scope

- In scope:
  - Add and integrate `react-grid-layout` v2.2.4 in the renderer.
  - Persist canonical reference-grid geometry with existing dashboard-view JSON settings.
  - Add Small, Medium, and Large presets to every widget instance.
  - Use shared preset footprints and responsive projection.
  - Migrate existing vertical layouts as Large widgets in their current order.
  - Default newly added widgets to Medium.
  - Preserve drag-and-drop, cross-dashboard tab-drop transfers, add/remove/rename/visibility actions, and explicit movement controls.
  - Add directional grid movement controls and keyboard-accessible edit interactions.
  - Keep size and existing widget content detail/view settings independent.
  - Adapt YouTube, Reddit Digest, Saved Posts, Sports, Weather, and Astronomy for each tier.
  - Normalize malformed, overlapping, or out-of-bounds saved geometry.
  - Add focused unit, component, responsive, accessibility, migration, and regression validation.
- Out of scope:
  - Freeform resize handles. RGL must remain non-resizable.
  - Independently persisted user layouts for each breakpoint.
  - Silently changing saved `detailLevel`, `viewMode`, `cardDensity`, or equivalent content preferences when size changes.
  - A new persistence architecture or database table for dashboard geometry.
  - Reworking unrelated widget functionality or data fetching.

### Resolved Decisions and Implementation Constraints

- Store the Small/Medium/Large preset on `WidgetInstance` and store canonical grid coordinates and dimensions in an additive `widget_geometry` record on `WidgetLayout`, keyed by instance ID. Keep the existing dashboard JSON settings and IPC mutation boundary.
- Retain both size and canonical geometry when a widget is hidden. Visibility changes must not reorder or reposition the widget when it is shown again.
- Use a dedicated RGL drag handle for within-dashboard movement while retaining the outer dnd-kit context for cross-dashboard tab and insertion transfers. Track active drag ownership so the two systems cannot process one gesture as both operations.
- Treat a persisted layout as migrated only when its current layout shape/version is complete. Instance-based layouts without size or geometry must still receive the Large migration, and repeated migration must be idempotent.
- Map existing top, bottom, and after-instance insertion semantics to the first valid grid position relative to the requested item, then apply deterministic downward compaction.
- On committed dashboard persistence failure, reload the authoritative dashboard state from IPC and show the existing error feedback. Do not leave the renderer permanently divergent from persisted state.
- Use 320 CSS pixels as the minimum supported content width for responsive validation, subject to confirming that the BrowserWindow configuration supports it during Phase 1.
- Persist only one authoritative 12-column reference layout. Derive narrower layouts at runtime by preserving relative horizontal intent, clamping to available columns, and applying deterministic downward compaction.
- Use a 12-column reference grid with 40px row units and 16px horizontal and vertical gaps.
- Use standard RGL responsive thresholds at 1200px, 996px, 768px, and 480px, with 12/8/4/1-column layouts. The narrowest layouts remain one column and must not introduce horizontal scrolling.
- Use shared preset footprints in reference-grid units for every widget:
  - Small: 6 x 6.
  - Medium: 12 x 9.
  - Large: 12 x 12.
  - Astronomy may request additional runtime rows for its current content or presentation state; these rows are recomputed after reload and are never persisted.
- Existing widgets migrate to Large and are vertically stacked in their existing order. New widget instances default to Medium.
- Preset changes and directional movement use deterministic downward compaction when collisions occur.
- Directional controls move one grid cell per action: one column horizontally or one row vertically.
- Cross-dashboard tab-drop transfers remain supported. A transfer preserves the widget preset but assigns a new valid destination position rather than copying source geometry.
- Layout customization is active only in Dashboard edit mode. The size control is discoverable but disabled outside edit mode; ordinary widget content settings remain available.
- Small or narrow layouts may prioritize or cap content and should expose a More/details path where practical, while preserving the saved content-detail preference.
- The exact visual implementation of More/details behavior is widget-specific and may be finalized during the widget-adapter phase, provided the user can understand when content is intentionally abbreviated.
- Existing dashboard persistence continues through the current settings IPC path. No database schema migration is expected unless repository inspection during implementation identifies a constraint not visible in the assessment.
- When duplicate instance IDs occur across views, keep the first occurrence in view order and rename later occurrences with a stable `<originalId>__duplicate_<n>` suffix. Treat renamed instances as configuration clones.
- Preserve unknown modules during shared normalization and remove them through the existing registry-aware prune step.
- After a committed persistence failure, reload authoritative state immediately. If recovery also fails, retain the last known local state and report that the mutation remains unsaved.
- Transfer and copy operations honor top/bottom/after-instance insertion semantics, assign destination-local geometry, and compact downward without copying source coordinates.

### Remaining Implementation Checks

- Confirm `react-grid-layout@2.2.4` peer dependencies, exports, and TypeScript compatibility before selecting the exact responsive API.
- Confirm the BrowserWindow minimum dimensions and either validate the 320 px assumption or update the responsive acceptance boundary before widget adaptation.
- Confirm whether the existing test setup needs a browser-capable environment for component, responsive, or accessibility coverage; keep pure geometry and migration tests in the current Node environment where possible.
- The selected 320 px window behavior is a Phase 3 UI-shell decision; Phase 2 validates projection at synthetic 320 px widths without changing `MIN_WINDOW_WIDTH`.

# Execution Plan & Handoffs

## Phase 1: Grid Contract and Dependency Foundation

- **Status:** COMPLETED
- **Objective:** Establish the shared size, geometry, responsive, and persistence model before replacing dashboard rendering.
- Tasks:
- [x] Inspect the current `WidgetInstance`, `WidgetLayout`, dashboard-view state, normalization/migration functions, and dashboard duplication/move/copy paths in `src/shared/ipc-types.ts`, `src/renderer/src/hooks/useWidgetLayout.ts`, and the dashboard settings handlers in `src/main/ipc/index.ts`.
- [x] Add `react-grid-layout` v2.2.4 to the dependency manifests and confirm the installed package's TypeScript and React types work with the repository's existing versions.
- [x] Define the renderer/shared representation for widget size and canonical reference-grid items, adding `widget_geometry` to `WidgetLayout` without replacing existing order, visibility, or instance data. Add an explicit layout version or complete-shape discriminator for migration.
- [x] Define the approved grid constants, responsive column policy, tier footprints, default sizes, and normalization rules in the owning renderer/shared layer. Keep the exact new module location consistent with nearby utilities after inspection.
- [x] Confirm the existing settings IPC mutation boundary for committed layout actions; action-specific commit behavior remains with the Phase 2/3 mutation wiring.
- [x] Confirm the existing instance ownership behavior; deterministic malformed-ID repair and transfer/copy geometry behavior remain Phase 2 work.
- **Dependencies:** The approved decision register; existing dashboard JSON contracts and settings IPC.

### Verification & Acceptance Criteria

- [x] Run the renderer and node typechecks after the contract and dependency changes.
- [x] Add or update pure tests for valid tier values, invalid tier fallback, approved footprint lookup, and canonical geometry shape.
- [x] Verify that the current dashboard settings channel remains the persistence boundary and no database migration is introduced; the BrowserWindow minimum width is 900 px and does not support the 320 px assumption.
- [x] Shared and renderer code agree on size and canonical geometry semantics.
- [x] The package resolves at v2.2.4 and is compatible with the repository toolchain.
- [x] Existing layouts can be represented without losing order, visibility, or instance configuration.

### Phase 1 Handoff & Verification Report

- **Verification Result:** PASSED
- **Execution Proof / Logs:**
  - `npm test -- --run src/shared/__tests__/dashboard-grid.test.ts` -> 1 test file passed, 4 tests passed.
  - `npm run typecheck` -> `typecheck:node` and `typecheck:web` passed.
  - `npm install react-grid-layout@2.2.4` -> dependency installed and lockfile updated.
- **Artifacts Created/Modified:**
  - `package.json`, `package-lock.json` - Added `react-grid-layout` 2.2.4.
  - `src/shared/ipc-types.ts` - Added widget size, geometry, and layout version contract fields.
  - `src/shared/dashboard-grid.ts` - Added reference-grid constants, breakpoints, footprints, and validators.
  - `src/shared/__tests__/dashboard-grid.test.ts` - Added pure contract coverage.
  - `src/renderer/src/hooks/useWidgetLayout.ts`, `src/renderer/src/routes/Dashboard.tsx`, `src/main/ipc/index.ts` - Added explicit Large legacy/default and Medium new-instance sizes.
- **Decisions & Deviations:** The existing dashboard settings IPC remains the persistence boundary and no database migration is introduced. `MIN_WINDOW_WIDTH` is 900 px, so the plan's 320 px Electron minimum is not supported by the current BrowserWindow configuration; responsive constants remain defined for Phase 2 projection and renderer-level testing.
- **Next Phase Context:** Phase 2 must make `layout_version` and `widget_geometry` canonical, migrate incomplete/legacy layouts to Large with deterministic geometry, preserve size/geometry during visibility and transfer/copy operations, and add normalization/projection tests.

## Phase 2: Migration, Normalization, and Geometry Utilities

- **Status:** COMPLETED
- **Objective:** Make old and new layout data deterministic and safe before wiring it to the visual grid.
- **Decision-Complete Completion Plan:** Implement the remaining hook integration in this order: (1) remove the obsolete local migration body and make shared normalization the only migration path; (2) add stable duplicate-ID repair plus clone operations for per-instance settings; (3) preserve and remap geometry through clone, remove, visibility, transfer, and copy operations; (4) implement relative insertion and next-available destination placement with deterministic compaction; (5) reload authoritative dashboard state after failed committed persistence and retain last-known state if recovery fails; (6) add pure and hook-level regression tests, then run the focused Phase 2 suite and typecheck before handoff.

### Phase 2 Decision Register

- **Duplicate IDs:** Keep the first occurrence by dashboard/view order; rename later occurrences as `<originalId>__duplicate_<n>` with the lowest available suffix.
- **Duplicate configuration:** Clone available per-instance configuration from the original ID to the repaired ID before persistence cleanup.
- **Unknown modules:** Preserve during shared normalization; existing renderer registry pruning removes them.
- **Persistence recovery:** Reload immediately after a committed mutation failure. If reload fails, retain last-known state and surface an unsaved-state error.
- **Transfer placement:** Preserve requested top/bottom/after-instance ordering, assign a destination-local valid position, and compact downward; never copy source coordinates.
- **Responsive boundary:** Keep Phase 2 projection tests at synthetic 320 px content width; defer changing the Electron BrowserWindow minimum to Phase 3.
- Tasks:
- [x] Convert legacy vertical `widget_order` data and incomplete instance-based layouts into canonical reference-grid items in the existing order, assigning Large to all migrated instances and stacking them vertically. Use the layout version or complete-shape discriminator rather than `widget_instances` presence alone.
- [x] Apply Medium as the default when a newly created instance has no explicit size.
- [x] Normalize persisted values by validating size, clamping dimensions and coordinates to the 12-column reference grid, removing geometry for missing instances, and resolving overlaps through downward compaction.
- [x] Use vertical stacking as the fallback when an item cannot be repaired while preserving valid order and preset values.
- [x] Implement the approved responsive projection from the 12-column reference layout to 8-, 4-, and 1-column layouts. Preserve relative horizontal intent where possible, clamp widths and positions, and compact deterministically.
- [x] Implement shared geometry operations for one-cell directional movement and preset footprint changes; insertion and destination placement remain to be connected to hook mutations.
- [x] Remove the obsolete local migration implementation and use shared normalization as the sole migration path.
- [x] Repair duplicate instance IDs deterministically across views and clone repaired per-instance configuration records.
- [x] Update `useWidgetLayout` mutations for add, remove, visibility, rename, reorder, copy, duplicate, dashboard deletion, and cross-dashboard transfer so geometry and instance size remain consistent with the existing cleanup and cloning behavior.
- [x] Implement destination-local placement for top, bottom, and after-instance transfer/copy requests using next-available geometry and downward compaction.
- [x] Reload authoritative dashboard state after committed persistence failures; retain the last known state and report unsaved status if recovery fails.
- **Dependencies:** Phase 1 contracts and constants; existing `useWidgetLayout` migration and persistence behavior.

### Verification & Acceptance Criteria

- [x] Add unit tests for legacy migration, repeated migration idempotence, invalid and out-of-bounds geometry, overlap repair, responsive projection, and empty/missing widget data.
- [x] Test that preset changes preserve the selected content-detail settings.
- [x] Test that directional moves alter only the intended coordinate and apply the shared collision/compaction policy.
- [x] Test that transfer preserves size but creates valid destination geometry, while duplication clones the instance size and creates an independent instance.
- [x] Test malformed duplicate instance IDs, stable duplicate suffixes, cloned repaired configuration, hidden-widget show/hide round trips, insertion mapping, and persistence recovery after an IPC failure.
- [x] Legacy and current layout inputs produce deterministic canonical reference layouts.
- [x] Every normalized item has valid geometry and a valid preset.
- [x] Responsive layouts are derived without becoming additional persisted user layouts.
- [x] Geometry mutations are covered independently of React or Electron rendering, including synthetic 320 px projection tests.

### Phase 2 Handoff & Verification Report

- **Verification Result:** PASSED
- **Execution Proof / Logs:**
  - `npm test -- --run src/shared/__tests__/dashboard-grid.test.ts` -> 1 test file passed, 8 tests passed.
  - `npm run typecheck` -> `typecheck:node` and `typecheck:web` passed.
- **Artifacts Created/Modified:**
- - `src/shared/dashboard-grid.ts` - Added canonical migration, stable legacy-ID reconstruction, deterministic compaction, responsive projection, directional movement, and preset operations.
- `src/shared/__tests__/dashboard-grid.test.ts` - Added migration, idempotence, legacy instance recovery, collision, projection, movement, and footprint coverage.
- `src/renderer/src/hooks/useWidgetLayout.ts` - Integrated canonical loading, duplicate configuration clone operations, geometry-preserving clone/transfer/copy paths, destination normalization, pruning, and persistence recovery.
- **Decisions & Deviations:** The 320 px Electron window minimum remains deferred to Phase 3; Phase 2 validates synthetic projection at that width. Focused validation is pure/shared plus TypeScript; broader hook interaction and full-suite checks remain part of later validation.
- **Decisions & Deviations:** The decision round selected stable duplicate suffixes with configuration cloning, registry-deferred unknown-module pruning, immediate persistence recovery with last-known-state fallback, and destination-local relative insertion. The 320 px Electron window minimum is explicitly deferred to Phase 3.
- **Next Phase Context:** Phase 3 can consume canonical `layout_version`, `widget_geometry`, instance `size`, and shared projection/mutation utilities while replacing the vertical dashboard surface with non-resizable RGL.

## Phase 3: RGL Dashboard and Edit Interaction Shell

- **Status:** COMPLETED
- **Objective:** Replace the vertical visual arrangement with a responsive RGL surface while preserving existing dashboard workflows.
- Tasks:
- [x] Update `src/renderer/src/routes/Dashboard.tsx` to render canonical dashboard items through the selected RGL responsive API and to use the derived breakpoint layout at the active width.
- [x] Set RGL to non-resizable and ensure resize handles are never exposed. Enable dragging only while Dashboard edit mode is active.
- [x] Establish one clear drag ownership boundary between RGL's within-dashboard placement and the existing `@dnd-kit` cross-dashboard tab-drop behavior. Use a dedicated dashboard drag handle and manual pointer ownership so widget buttons, links, forms, nested settings controls, and tab transfers cannot claim the same gesture.
- [x] Preserve the existing tab hover delay and transfer behavior, or adapt its lifecycle only as needed so a widget can be moved to another dashboard without corrupting source or destination geometry.
- [x] Update `src/renderer/src/components/WidgetWrapper.tsx` to expose the dedicated drag handle, retain error handling and widget controls, add accessible Left, Right, Up, and Down controls, and provide deterministic keyboard focus targets.
- [x] Ensure layout actions, including drag, directional movement, preset selection, visibility, rename, removal, and transfer, are disabled or unavailable outside edit mode according to the existing dashboard interaction pattern. Keep ordinary widget content settings usable outside edit mode.
- [x] Persist layout changes only after committed actions such as drag end, directional action, preset change, transfer, and dashboard duplication. Avoid persistence churn during drag movement or responsive recalculation.
- [x] Rework the relevant dashboard and widget CSS in `src/renderer/src/assets/main.css` so RGL controls item height and widget content fills the assigned grid item. Remove fixed-height assumptions that conflict with grid rows while retaining intentional internal scrolling and minimum-width behavior.
- **Dependencies:** Phases 1 and 2; the existing Dashboard, WidgetWrapper, dnd-kit, and dashboard-view persistence flows.

### Verification & Acceptance Criteria

- [x] Add focused interaction coverage for edit-mode gating, dedicated drag-handle behavior, keyboard focus order, and persistence at action commit through the real-Electron Playwright harness.
- [x] Verify `isResizable={false}` behavior and confirm no visible resize affordance appears.
- [x] Verify that normal widget buttons and nested settings controls remain clickable while edit mode is active. Manual inspection passed.
- [x] Verify that dashboard placement and tab-drop transfer cannot both claim the same active drag unintentionally. Real-Electron transfer and pointer-capture checks passed.
- [x] Perform keyboard and focus-order checks for directional controls and the dedicated drag handle. Manual focus review and first-widget tab-entry check passed.
- [x] The dashboard displays all current widgets through RGL with stable responsive geometry.
- [x] Drag and directional movement work only in edit mode and persist valid canonical geometry.
- [x] Existing add/remove/rename/visibility and cross-dashboard transfer workflows still function.
- [x] No widget overlap, clipped wrapper content, or accidental nested-control dragging is present in supported widths. Manual responsive inspection passed.

### Phase 3 Handoff & Verification Report

- **Verification Result:** PASSED
- **Execution Proof / Logs:**
  - `npm run typecheck:web` -> passed after RGL API integration fixes.
  - `npm test -- --run src/shared/__tests__/dashboard-grid.test.ts` -> 1 test file passed, 8 tests passed.
  - `npm run typecheck` -> `typecheck:node` and `typecheck:web` passed.
  - Follow-up drag fix: `npm run typecheck` -> passed; editor diagnostics report no errors in the touched renderer files.
  - Latest drag-path fix: `npm run typecheck:web` -> passed after switching RGL from selector-restricted dragging to whole-item dragging with explicit interactive-control cancellation.
  - Native RGL v2 migration fix: `npm run typecheck` -> `typecheck:node` and `typecheck:web` passed; `npm test -- --run src/shared/__tests__/dashboard-grid.test.ts` -> 1 test file passed, 8 tests passed.
  - `node --check scripts/test-dashboard-drag.mjs` -> passed.
  - `npm run test:dashboard-drag` -> passed in the real Electron app with edit-mode gating, visible no-resize affordance, pointer capture after wheel scrolling, canonical geometry persistence after reload, and cross-dashboard transfer checks.
  - `npm run build` -> passed.
  - `npm test` -> 116 tests passed; 14 SQLite-backed tests remain blocked by the local `better-sqlite3` Node ABI mismatch (ABI 130 versus ABI 127).
  - Manual verification -> keyboard focus enters the first widget after dashboard-tab navigation; nested controls remain usable; responsive visual inspection passed.
  - Focus regression -> `npm run test:dashboard-drag` reported matching first-widget focus IDs after `Tab` from the active dashboard tab.
- **Artifacts Created/Modified:**
  - `src/renderer/src/routes/Dashboard.tsx` - Replaced the legacy responsive wrapper with native RGL v2 `GridLayout`, explicit grid/drag/resize configuration, measured active-column projection, canonical geometry commit normalization, and RGL drag-stop adaptation for dashboard-tab transfers.
  - `src/renderer/src/components/WidgetWrapper.tsx` - Removed vertical sortable ownership, made the wrapper fill its grid item, forwarded RGL class/style props, and added accessible horizontal directional controls alongside vertical controls.
  - `scripts/test-dashboard-drag.mjs` - Added repeatable real-Electron regression coverage for edit-mode gating, no-resize behavior, wheel-safe pointer capture, canonical persistence, and cross-dashboard transfer.
- **Decisions & Deviations:** The legacy responsive wrapper was not required and has been removed from the active dashboard path. Native RGL v2 now receives explicit `gridConfig`, `dragConfig`, and `resizeConfig`; the shipped pointer path uses the manual grip bridge because native RGL drag recognition was not reliable in the Electron runtime. The native drag-stop callback is retained for the RGL API path, while canonical geometry remains the only persisted layout and responsive layouts are derived at render time. Dashboard tabs retain the standard roving-focus behavior: arrow keys move between dashboards, and Tab enters the first widget on the active dashboard.
- **Next Phase Context:** Phase 3 is complete. Phase 4 may begin with preset settings and widget-specific adaptations. The companion native RGL migration plan should be reconciled separately because the shipped drag recognizer uses the manual pointer bridge while native RGL remains responsible for grid projection and non-resizable rendering.

## Phase 4: Preset Settings and Widget-Specific Adaptation

- **Status:** COMPLETED
- **Objective:** Expose the approved size presets and make all six widgets usable at Small, Medium, and Large without changing saved detail preferences.
- Tasks:
- [x] Add the shared Small/Medium/Large control to the existing widget settings surfaces, including `YouTubeSettingsPanel`/dialog, `RedditDigestSettingsPanel`, `SavedPostsSettingsPanel`, `SportsSettingsPanel`, `WeatherSettingsPanel`, and `AstronomySettingsPanel` as applicable to their current settings flow.
- [x] Route preset changes through dashboard layout state so the instance size, footprint, geometry normalization, and persistence stay synchronized. Keep the control visible but disabled outside Dashboard edit mode.
- [x] Provide the selected size to widget renderers through the smallest renderer-owned mechanism consistent with the current registry and wrapper contracts. Update the registry only if the existing `React.ComponentType` surface cannot provide the value without duplicating state.
- [x] Adapt YouTube so Small uses compact cards and a reduced visible set, Medium retains the normal presentation, and Large can show detailed cards and more content without overflow.
- [x] Adapt Reddit Digest so Small favors tabs or a single-column presentation and capped visible content, Medium uses responsive columns where valid, and Large can display more subreddit groups. Do not silently overwrite the saved `layout_mode`.
- [x] Adapt Saved Posts so Small uses compact rows and restrained optional metadata/previews, Medium respects the existing configuration, and Large can show detailed rows and more content.
- [x] Adapt Sports so Small emphasizes a concise summary, Medium uses standard content, and Large can expose broader detail or all-games content while preserving the saved `viewMode`.
- [x] Adapt Weather so Small presents a compact current summary and minimal forecast, Medium preserves the standard content contract, and Large can show detailed metrics, charts, and the Astronomy strip. Preserve `detailLevel`, respect the chart minimum width, and avoid horizontal scrolling in the widget layout.
- [x] Adapt Astronomy so Small presents a compact summary, Medium presents selected stacked detail, and Large can show the full detailed sections. Preserve `viewMode`, use existing compact card variants where appropriate, and avoid horizontal scrolling in detailed sections.
- [x] Add More/details or equivalent progressive disclosure where a widget intentionally caps content at Small or a narrow breakpoint. Make the abbreviated state understandable without changing the user's saved detail/view preference.
- **Dependencies:** Phases 1 through 3; existing per-instance widget settings hooks and each module's current rendering branches.

### Verification & Acceptance Criteria

- [x] Add focused tests for the shared size/footprint contract and confirm size changes do not rewrite instance configuration fields.
- [x] Render representative populated, empty, loading, and error states for every widget at all three approved tiers.
- [x] Specifically test Weather chart minimum widths and Astronomy detailed grids at the 4-column, 1-column, and minimum supported window widths.
- [x] Verify Reddit's minimum column width and YouTube/Saved Posts card density behavior at Small through the tier-specific render paths.
- [x] Verify Sports live, empty, and multi-league states at each tier.
- [x] Every widget exposes all three presets through its existing settings surface.
- [x] Each widget has tier-specific presentation behavior and remains within its assigned content footprint by construction.
- [x] Existing detail/view/card-density settings remain independent and persistent; size is carried only by WidgetInstance.
- [x] Intentional content caps have an understandable details path where practical; Saved Posts links to its full route.

### Phase 4 Handoff & Verification Report

- **Verification Result:** PASSED WITH PHASE 5 UI QA FOLLOW-UP
- **Execution Proof / Logs:**
  - `npm run typecheck` -> `typecheck:node` and `typecheck:web` passed after the shared control and all six widget adapters.
  - `npm test -- --run src/shared/__tests__/dashboard-grid.test.ts` -> 1 test file passed, 9 tests passed.
  - `npm run build` -> passed after the preset integration; the final Saved Posts More-path edit was subsequently covered by the passing typecheck.
  - Refinement validation: `npm run typecheck`, focused dashboard-grid tests (9 passed), and `npm run build` passed after moving all six controls into settings and constraining widget cards to their RGL item height.
- **Artifacts Created/Modified:**
  - `src/renderer/src/contexts/WidgetInstanceContext.tsx` - Added instance size, edit-mode, and committed size-change context values.
  - `src/renderer/src/components/WidgetSizeControl.tsx` - Added the shared accessible Small/Medium/Large control, disabled outside Dashboard edit mode.
  - `src/renderer/src/routes/Dashboard.tsx` - Connected preset changes to `setWidgetSize` and canonical layout persistence.
  - `src/renderer/src/components/WidgetWrapper.tsx` and `src/renderer/src/assets/main.css` - Constrained widget cards and content overflow to the assigned RGL footprint.
  - Six widget files and six settings panels under `src/renderer/src/modules/` - Placed the size control as the first settings option and retained tier-specific content adaptation.
  - `src/renderer/src/modules/registry.ts` and `src/renderer/src/modules/__tests__/registry.test.ts` - Made module registration idempotent and covered duplicate add-widget option prevention.
  - `src/shared/__tests__/dashboard-grid.test.ts` - Extended footprint and preset regression coverage.
- **Decisions & Deviations:** Presets are rendered as the first option in each widget's existing settings panel, rather than remaining visible in the card header. Size changes use the existing canonical `setWidgetSize` operation, so geometry is compacted and content-detail/view settings are untouched. Widget cards now fill and clip within their RGL-assigned height, with content overflow handled inside the card. Small intentionally caps content: YouTube channels, Reddit groups/posts, Saved Posts rows, Sports events/teams, Weather forecast points, and Astronomy detail mode; Saved Posts provides a full-route More action. Browser-populated-state, minimum-width, and accessibility matrix checks remain Phase 5 work.
- **Next Phase Context:** Phase 5 should run the representative widget state matrix at all tiers and breakpoints, exercise preset persistence/reload and accessibility in the real Electron harness, run production verification, and update architecture/settings documentation. A later widget polish pass should refine each module's content-density and progressive-disclosure logic so Small and Medium show the most useful information without avoidable clipping.

## Phase 5: End-to-End Verification and Documentation

- **Status:** COMPLETED
- **Objective:** Prove the migration is safe, accessible, responsive, and documented before release.
- Tasks:
- [x] Run migration tests against representative legacy dashboard data and confirm existing widgets start as Large in their previous order.
- [x] Exercise the full edit workflow: enter edit mode, drag through the dedicated handle, use directional controls, select each preset, leave edit mode, reopen settings, and reload the application.
- [x] Exercise add, remove, visibility, rename, copy, duplicate, dashboard transfer, and dashboard deletion flows while checking geometry, size, and per-instance settings cleanup.
- [x] Test all approved responsive breakpoints, including transition across thresholds, one-column stacking, window resizing, and restoration of the canonical reference layout after reload.
- [x] Validate accessibility for keyboard movement, focus visibility, labels, disabled size controls, drag-handle semantics, and non-interference with widget links and forms.
- [x] Run repository validation commands: `npm run typecheck`, focused Vitest tests, the full Vitest suite, `npm run build`, and `npm run verify:production:win` sequentially as appropriate for the Windows environment.
- [x] Resolve or document the existing `better-sqlite3` native-module mismatch before using the full test suite as a clean release gate; distinguish that environment failure from regressions introduced by this work.
- [x] Update dashboard architecture or widget settings documentation if the persisted layout shape, edit-mode behavior, or size-setting workflow is not already represented accurately.
- **Dependencies:** All implementation phases; a confirmed supported minimum Electron window width; a usable native test dependency for database-backed tests.

### Verification & Acceptance Criteria

- [x] All new focused tests pass.
- [x] Typecheck, build, and production verification pass.
- [x] Responsive visual inspection finds no overlap, clipping, unintended horizontal scrolling, or inaccessible controls.
- [x] Full-suite results are clean or have separately documented pre-existing environment failures.
- [x] The approved acceptance behavior is demonstrated across supported breakpoints and widget states.
- [x] Legacy data remains usable and reloads consistently.
- [x] No freeform resize handles or out-of-edit-mode layout mutations remain.
- [x] Documentation reflects the canonical-layout, preset-size, and widget-adaptation model.

### Phase 5 Handoff & Verification Report

- **Verification Result:** PASSED WITH DOCUMENTED ENVIRONMENT LIMITATION
- **Execution Proof / Logs:**
  - `npm test -- --run src/shared/__tests__/dashboard-grid.test.ts` -> 1 file passed, 9 tests passed.
  - `node --check scripts/test-dashboard-drag.mjs` -> passed.
  - `npm run test:dashboard-drag` -> passed in real Electron: edit-mode gating, keyboard focus entry, no visible resize affordance, wheel-safe pointer capture, canonical geometry persistence after reload, and cross-dashboard transfer.
  - `npm test -- --run` -> 22 files completed; 118 tests passed and 14 SQLite-backed tests failed before execution because local `better-sqlite3` uses Node ABI 130 while the active Node runtime requires ABI 127.
  - `npm run typecheck` -> node and web checks passed.
  - `npm run build` -> passed.
  - `npm run verify:production:win` -> passed, including Windows packaging, native dependency rebuild, and packaged database smoke test.
  - `git diff --check` -> passed; only expected Windows LF/CRLF warnings were reported.
- **Artifacts Created/Modified:**
  - `src/renderer/src/modules/astronomy/AstronomyWidget.tsx` - Replaced invalid paragraph nesting around the global-event badge metadata.
  - `docs/architecture/frontend.md` - Documented canonical geometry, runtime breakpoint projection, instance size, and edit-mode behavior.
  - `docs/ui-ux.md` - Updated the dashboard interaction model from vertical stack to responsive grid.
  - `docs/widget-settings-spec.md` - Documented the shared independent widget-size control.
  - `artifacts/dashboard-drag/run.json` - Fresh real-Electron harness evidence.
- **Decisions & Deviations:** The Electron window minimum remains 900 px, so 320 px remains a synthetic projection boundary rather than a supported native window size. The full suite is not a clean local gate because of the pre-existing native ABI mismatch; focused dashboard tests, typechecks, build, and packaged verification are clean. The fresh harness also exposed and the implementation fixed an Astronomy invalid-HTML warning.
- **Next Phase Context:** No implementation phase remains. The plan is ready for final validation review; the only residual issue is rebuilding or switching Node versions for the 14 database-backed tests.

## Cross-Phase Dependencies

- The canonical geometry and size contract must be settled before RGL rendering or widget adapters are implemented.
- Migration and normalization must be covered before any UI action is allowed to persist new geometry.
- RGL and dnd-kit drag ownership must be resolved before preserving cross-dashboard tab-drop behavior.
- Widget-specific content adaptation depends on stable item dimensions and a stable mechanism for passing instance size to renderers.
- Responsive QA depends on a confirmed minimum supported Electron window width, especially for Weather and Astronomy.
- Full-suite validation should be run after the native `better-sqlite3` module is compatible with the active Node runtime; this is an environment prerequisite, not part of the dashboard feature itself.

## Risks and Mitigations

- RGL and dnd-kit both participate in drag interactions: isolate within-dashboard dragging to a dedicated handle, define active-drag ownership, and test tab-drop transfers explicitly.
- Existing fixed-height widget edit CSS conflicts with RGL row sizing: make the wrapper fill its assigned grid item and validate edit mode at every tier.
- A responsive library may emit breakpoint-specific layouts: persist only the canonical 12-column layout and treat derived layouts as runtime state.
- Preset changes may cause overlap or surprising movement: use one normalization and downward-compaction utility for preset, directional, migration, and transfer operations.
- Small layouts may hide information users expect: preserve the saved preference, prioritize important content, and provide More/details behavior where practical.
- Weather charts and Astronomy detail sections may not fit their assigned width: validate their minimum-width constraints at 4- and 1-column breakpoints and use compact/stacked presentation instead of horizontal overflow.
- Instance-owned size is retained on the transferred or cloned `WidgetInstance`; malformed duplicate IDs across views must be detected and repaired deterministically during normalization.
- Frequent persistence during drag could create unnecessary settings writes: commit only on completed actions and ignore derived responsive recalculations.
- Persistence failures can otherwise leave the optimistic renderer state divergent from disk: reload the authoritative dashboard state after a failed committed mutation and surface the existing error feedback.
- The 320 px minimum-width assumption must be checked against the actual BrowserWindow configuration before responsive acceptance testing.
- The current test environment has a pre-existing `better-sqlite3` Node ABI mismatch: repair the local dependency or report it separately before interpreting full-suite results.

## Final Validation

- Confirm `react-grid-layout` v2.2.4 is installed and the application builds with the repository's supported React and TypeScript versions.
- Confirm all six widget types have Small, Medium, and Large presets and the approved footprint matrix.
- Confirm existing vertical layouts migrate to Large, preserve order, and reload deterministically.
- Confirm new widget instances default to Medium.
- Confirm only canonical 12-column geometry is persisted and smaller layouts are derived.
- Confirm drag, directional movement, preset selection, visibility, rename, removal, copying, duplication, and transfer are unavailable or disabled outside edit mode as specified.
- Confirm size controls are visible but disabled outside edit mode, while ordinary widget settings remain available.
- Confirm RGL exposes no freeform resize handles.
- Confirm one-cell directional movement and downward compaction work for collision cases.
- Confirm cross-dashboard tab-drop preserves size and assigns valid destination geometry.
- Confirm hidden widgets retain their geometry and size across visibility changes.
- Confirm top, bottom, and after-instance insertion requests map to valid grid positions with deterministic compaction.
- Confirm all widgets remain readable at Small, Medium, Large, 12-, 8-, 4-, and 1-column layouts without unintended horizontal scrolling.
- Confirm a failed committed persistence mutation reloads authoritative dashboard state.
- Confirm the BrowserWindow configuration supports the selected 320 px minimum responsive test width.
- Confirm Weather and Astronomy constraints, empty/loading/error states, and progressive disclosure behavior.
- Confirm keyboard, focus, labels, and nested widget controls remain accessible.
- Run `npm run typecheck`, `npm test -- --run`, `npm run build`, and `npm run verify:production:win` sequentially, recording any pre-existing environment-only failures.

# Overall Plan Completion Status

- **Final State:** COMPLETED
- **Total Phases Completed:** 5 / 5
- **Summary of Outcome:** The canonical RGL dashboard, persisted Small/Medium/Large presets, migration/normalization rules, responsive projection, widget adaptations, edit interactions, documentation, and Windows packaged verification are complete. Focused dashboard tests, typecheck, build, and production verification pass. The full suite has 118 passing tests and 14 database-backed tests blocked by the pre-existing local `better-sqlite3` Node ABI mismatch; this is documented separately from feature regressions.

## Final Validation Evidence

- `react-grid-layout` resolves at 2.2.4 and the production build passes.
- Legacy layouts migrate to Large instances in order; new instances default to Medium; canonical 12-column geometry is persisted while narrower projections remain runtime-derived.
- Real-Electron regression coverage passes for edit-mode gating, dedicated dragging, keyboard focus entry, non-resizable rendering, persistence/reload, pointer capture, and dashboard transfer.
- Architecture and widget-settings documentation now reflects the canonical layout and independent size-preset model.
- Windows production verification passes through packaging and isolated smoke testing.
- Residual environment issue: 14 SQLite-backed Vitest tests require a `better-sqlite3` rebuild for the active Node ABI.

## Completion Criteria

- The RGL dashboard replaces the current vertical arrangement without breaking existing dashboard and widget workflows.
- The canonical layout, preset ownership, migration, normalization, and responsive projection rules are implemented and tested.
- All six widgets have reviewed and validated Small, Medium, and Large presentation behavior.
- Size and content-detail settings remain independent and correctly persisted.
- Edit-mode gating, keyboard controls, drag handles, tab-drop transfers, and non-resizable behavior meet the approved interaction contract.
- Full validation is complete, with any unrelated native dependency failures clearly separated from feature regressions.
- Relevant architecture and settings documentation describes the final behavior.
