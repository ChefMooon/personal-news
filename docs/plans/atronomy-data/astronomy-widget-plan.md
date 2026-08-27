# Implementation Plan: Astronomy Dashboard Widget

## Source
- Document: `docs/plans/atronomy-data/astronomy-widget.md`
- Basis: specification

## Objective
Add an instance-configurable Astronomy dashboard widget that reuses saved Weather locations and the canonical backend `AstronomySnapshot`. The widget will provide a compact summary and an optional detailed geometry view, preserve stable partial/unavailable states, format all local times with the selected location's IANA timezone, and obey the app-level Astronomy gate without deleting existing widget instances or configuration.

## Scope
- In scope: renderer module registration; instance configuration and fallback; dedicated Astronomy snapshot/settings/status/update hooks; shared app-level feature-gate integration; Add Widget and Settings visibility; summary Moon/Horizon/Next phase/event views; detailed sky arc, lunar progress, seven-planet grid, and daily timetable; global event presentation; responsive and accessible behavior; existing inline widget settings/reset/height-locking behavior; focused renderer tests and final verification.
- Out of scope: Astronomy Engine calls; main-process caching, scheduling, database migration, or dedicated IPC implementation; Weather astronomy strip implementation except for reuse of its common gate and contracts; a second location database; local eclipse contact/visibility calculations; remote images/requests; conjunctions, oppositions, greatest elongations, solar noon, star charts, orbital visualization, telescope controls, historical browsing, and viewing recommendations.

## Assumptions and Open Decisions
- **Backend prerequisite:** The Astronomy backend plan completes its Phase 5 validation gate, including the canonical contracts and dedicated IPC. The widget reads through preload-backed `window.api` hooks and never imports Astronomy Engine or accesses Node APIs.
- **Shared feature gate:** The Weather plan establishes or reuses the renderer-facing app-level Astronomy `enabled` setting and its Settings ownership. This plan consumes that source of truth and must not create a duplicate setting. If the surface is missing, complete the smallest shared integration needed and document the ownership correction.
- **Repository integration:** Inspect the actual renderer module registry, dashboard composition, Add Widget picker, Settings optional-feature pattern, widget layout/config persistence, Weather location hook, and inline settings implementation before selecting concrete component boundaries.
- **Config fallback:** A widget stores `locationId` and `viewMode`; when the location is removed, use the existing Weather default location and persist the corrected instance configuration through the existing settings path. The exact persistence helper and no-location empty-state component are repository discoveries.
- **Presentation wording:** Use the backend's factual `skyState` and solar-state values. Exact stale-status wording and the final visual treatment for the static/interactive sky arc can follow existing UI conventions, but must not imply actual visibility or local viewing conditions.
- **Single-agent sequencing:** Execute this plan after the backend and Weather consumer plans in one working tree. Reuse shared helpers/contracts where available and avoid parallel or duplicate feature-gate implementations.

## Phases
### Phase 1: Module, Configuration, and Data Hooks
- **Goal:** Establish a deterministic, feature-gated widget module with instance-scoped configuration and correct backend data access before building views.
- **Tasks:**
	1. Inspect the renderer registry and neighboring self-registering widgets, dashboard module imports, widget instance layout/config persistence, Add Widget flow, Settings route, Weather location source, and inline settings/reset/height-locking patterns.
	2. Add the self-registering module under `src/renderer/src/modules/astronomy/` with explicit feature identifier, display name, and the repository's required module metadata. Import it from the dashboard composition path so registration is deterministic.
	3. Define instance defaults with `viewMode: "summary"` and an effective `locationId` based on the existing Weather default/location setup. Preserve instance separation and prevent changes from mutating Weather widget configuration.
	4. Add dedicated snapshot, settings, status, and update hooks using the Astronomy IPC channels. Handle loading, absent snapshots, partial/stale statuses, disabled responses, refresh state, and cleanup of every `window.api.on` subscription.
	5. Reuse or complete the shared app-level Astronomy gate. When disabled, hide the module from picker/settings surfaces, suppress existing instances and dedicated reads/refreshes, and retain configuration for re-enable.
	6. Implement location fallback: detect a removed configured location, select the existing Weather default, persist the corrected `locationId`, and use the established no-saved-locations empty state when no effective location exists.
	7. Add or update the inline settings shell for location and Summary/Detailed view controls, immediate persistence, reset-to-open, factory reset, Escape handling, refresh action, and edit-mode height locking.
- **Dependencies:** Backend plan Phase 5; Weather plan's shared renderer feature-gate ownership; existing registry, dashboard, settings, and location patterns.
- **Validation:** Run focused hook/config/registry tests for defaults, location fallback, disabled gating, IPC cleanup, persistence/reset behavior, and deterministic module registration. Typecheck the new module before adding complex view content.
- **Exit criteria:** The widget can be added/configured through existing infrastructure, obtains only normalized IPC data, and is completely suppressed by the app-level gate without losing instances or settings.

### Phase 2: Summary View and Presentation Helpers
- **Goal:** Deliver a compact scan-friendly default view with correct factual labels, timezone formatting, and live countdown behavior.
- **Tasks:**
	1. Add shared presentation helpers for nullable values, selected-location timezone timestamps, phase naming/glyph accessibility, event-family labels, stale/unavailable status, and countdown wording based on the current renderer clock.
	2. Implement the Moon summary with the local phase glyph driven by normalized `phaseAngle` and `illuminationPercent`, phase name, whole-number illumination, explicit Waxing/Waning text, synodic progress labels/accessibility text, and optional distance.
	3. Implement the Horizon summary with current Sun altitude and solar-state label, current Moon altitude when available, and the next available local-day rise/set item with localized time. Do not convert nulls into claims of absence or visibility.
	4. Implement the Next phase summary with canonical phase name, relative countdown, exact selected-timezone timestamp, and stable unavailable wording when absent.
	5. Implement a bounded chronological event summary containing only the backend-provided seasons, lunar eclipses, solar eclipses, and Mercury/Venus transit families. Show localized timestamps, family labels, and an explicit `Global` scope label without local visibility claims.
	6. Preserve the widget structure when the snapshot is absent or partial. Render successful groups independently, show stable `Unavailable` values, retain concise stale treatment, and avoid passive per-render toasts.
- **Dependencies:** Phase 1 data/config hooks and canonical snapshot; Weather plan's established timezone and shared feature-gate conventions where applicable.
- **Validation:** Run focused helper/component tests for phase and illumination presentation, timezone formatting in a non-system IANA zone, countdown minute/hour/day boundaries, event filtering/bounds, null fields, partial snapshots, and disabled/absent snapshot states.
- **Exit criteria:** Summary mode is the default, contains Moon/Horizon/Next phase/event information, and all relative/localized values are derived at render time from absolute snapshot data.

### Phase 3: Detailed Geometry, Lunar, Planet, and Timetable Views
- **Goal:** Expand the widget in Detailed mode while keeping it a dashboard surface with factual geometry and no horizontal scrolling.
- **Tasks:**
	1. Add a semantic Horizon and sky-arc section mapping the horizon at 0 degrees to zenith at 90 degrees. Plot current Sun and Moon positions from altitude/azimuth values and label the calculated solar state with text as well as any restrained visual bands.
	2. Provide a text-equivalent list for the plotted Sun/Moon positions and handle missing values independently so keyboard and screen-reader users receive the same factual information.
	3. Add Lunar detail and a stable 0-100 synodic progress indicator with milestone labels/ticks for New Moon, First Quarter, Full Moon, and Third Quarter. Show trend, illumination, distance, libration, apsis, and other available values with independent unavailable placeholders.
	4. Add a responsive Planet geometry grid with exactly Mercury, Venus, Mars, Jupiter, Saturn, Uranus, and Neptune. Show available magnitude, altitude/azimuth, illumination/phase, rise/set, and the backend-derived states `Daylight`, `Below horizon`, `Near horizon`, `Potentially visible`, or `Unknown`.
	5. Add the local-day timetable for Sunrise, Sunset, Moonrise, and Moonset. Format every time in the snapshot timezone and show `Unavailable` per missing event; keep calculated solar/geometry status factual.
	6. Add detailed event/milestone presentation using a wrapping grid or stacked list, no horizontal scrolling, and no more than the backend-provided five-per-family 365-day bound. Keep all eclipse/transit/season scope labels global.
- **Dependencies:** Phase 2 summary helpers and view; backend fields for Horizon, Moon, Planets, and Global Events; existing responsive widget primitives.
- **Validation:** Run focused rendering tests for Summary/Detailed mode, all seven planet entries, nullable optional planet/lunar fields, sky-arc text equivalents, local-day timetable formatting, event-family scope labels, partial groups, and narrow-width wrapping without horizontal overflow.
- **Exit criteria:** Detailed mode includes the required arc, lunar progress, planet grid, timetable, and event sections, and no UI wording implies real-world visibility or viewing suitability.

### Phase 4: Dashboard Integration, Accessibility, and Interaction Regression
- **Goal:** Finish user-facing integration and ensure the new module behaves like existing widgets across picker, dashboard, settings, gating, and keyboard workflows.
- **Tasks:**
	1. Add Astronomy to the Add Widget picker only while app-level Astronomy is enabled. Suppress existing Astronomy instances in dashboard composition while disabled, without deleting their layout/configuration.
	2. Add or reuse the app-level Astronomy Settings surface and status/read behavior, ensuring it remains hidden or gated consistently with the picker and dedicated snapshot reads.
	3. Verify each widget instance independently retains its location and view mode through reload, immediate setting persistence, reset-to-open, factory reset, and configured-location deletion fallback.
	4. Preserve existing widget refresh, header/action controls, keyboard access, Escape handling, edit-mode height locking, and status handling. Make refresh failures keep the previous snapshot and expose concise status while main process logging retains detail.
	5. Apply semantic headings and normal reading order for the widget and each detailed section. Pair icons with visible text, give the phase glyph a complete accessible name, announce unavailable values explicitly, and keep derived states distinguishable without color alone.
	6. Verify stable grid tracks and wrapping at narrow widths for all sections, labels, values, status text, and planet entries. Do not introduce horizontal scrolling or overlapping content.
	7. Verify refresh/update subscriptions are cleanup-safe and that Astronomy-only updates re-read the selected snapshot without duplicate listeners.
- **Dependencies:** Phases 1 through 3; shared feature gate/settings surface; existing dashboard and widget interaction patterns.
- **Validation:** Run integration and accessibility-focused tests for picker/settings gating, retained instances, keyboard controls, reset/fallback flows, refresh failure, subscriptions, and responsive layout. Use the repository's available renderer test/browser validation tools without adding a new framework.
- **Exit criteria:** The widget is discoverable and suppressible exactly as specified, interactions remain compatible with existing widgets, and desktop/narrow layouts are readable and non-overlapping.

### Phase 5: Final Widget Verification
- **Goal:** Confirm the standalone widget meets its acceptance criteria and does not drift from the shared backend or Weather consumer contract.
- **Tasks:**
	1. Run all focused Astronomy renderer tests for registration, configuration, fallback, summary/detail content, phase glyph accessibility, timezone formatting, countdowns, partial/unavailable/stale data, global event scope, gating, reset, and update cleanup.
	2. Verify the app-level disabled state hides the picker entry, settings access, and existing widget instances; dedicated reads/refreshes are suppressed; re-enable restores retained instances, locations, and view modes.
	3. Verify each of the seven planets is rendered in Detailed mode even when optional fields are unavailable, and verify no UI uses `Visible Sky`, `Naked-eye`, or comparable real-world visibility wording.
	4. Verify summary and detail sections wrap or stack without horizontal scroll, with semantic headings, text equivalents, and stable placeholders.
	5. Run `npm run typecheck` and `npm run build`. Run `npm run verify:production:win` if the module, shared contracts, preload-facing integration, or package resources changed since the backend production gate.
	6. Compare the final renderer behavior against the canonical backend contract and the Weather strip's shared feature gate, timestamp, status, and event vocabulary. Record any genuine contract mismatch rather than adding a renderer workaround.
- **Dependencies:** All prior phases and the backend validation gate.
- **Validation:** Focused tests plus the repository typecheck/build and applicable Windows production verification. Perform a final source-level review for forbidden imports, Node API access, second location storage, local visibility claims, and obsolete deferred scope.
- **Exit criteria:** The standalone widget's acceptance criteria pass, shared contracts remain aligned, and the implementation is ready for normal release validation.

## Cross-Phase Dependencies
- The backend plan must finish first because it owns the only calculation, cache, and dedicated IPC path.
- The Weather plan establishes or reuses the common renderer-facing Astronomy gate/settings ownership. The standalone widget must reuse it for picker visibility, dashboard suppression, Settings access, reads, and refresh behavior.
- Configuration and data hooks must precede summary/detail rendering so views can represent absent, partial, stale, and disabled states consistently.
- Summary helpers should be shared by Detailed mode where practical, especially timezone formatting, phase glyph accessibility, unavailable labels, event scope, and countdown derivation.
- Detailed mode must remain a widget-sized responsive surface, not grow into a separate planetarium or calendar feature.

## Risks and Mitigations
- **The widget creates a second location source:** reuse saved Weather locations and default-location resolution, and test location deletion/fallback persistence.
- **Disabled feature still reads or calculates:** apply the gate at picker, dashboard, settings, hook/read, refresh, and calculation-trigger boundaries; test disabled and re-enabled transitions.
- **Countdowns become stale:** derive relative text from current renderer time and absolute event timestamps; never cache rendered countdown strings.
- **Global events are presented as local visibility:** retain the explicit `Global` label and omit/invalidate local visibility claims in all event views.
- **Partial snapshots collapse the entire widget:** render groups and fields independently and keep stable placeholders for null/unavailable values.
- **Responsive detail content overflows:** use wrapping grids/stacked sections, stable tracks, minimum widths, and narrow-layout tests without horizontal scrolling.
- **Accessibility is lost in the visual arc/glyph:** pair visual elements with semantic text equivalents and test accessible names, reading order, and keyboard reachability.
- **Existing widget interaction behavior regresses:** reuse the inline settings and widget action patterns, then test reset, Escape, refresh, height lock, and failure states.
- **Provider semantics leak into the UI:** keep normalization in the backend and render only shared factual labels and fields.

## Final Validation
- Confirm the module is deterministically registered and visible in Add Widget only when app-level Astronomy is enabled.
- Confirm each instance selects and retains one saved Weather location, falls back to the Weather default when removed, and keeps its own Summary/Detailed configuration through reload and reset flows.
- Confirm Summary mode includes Moon, Horizon, Next phase, and bounded global event information with selected-timezone timestamps and live countdowns.
- Confirm Detailed mode includes the sky arc and text equivalent, lunar detail/progress, all seven planets, local-day timetable, and bounded event presentation.
- Confirm all unavailable/null/partial/stale states retain surrounding content and use explicit factual placeholders/statuses.
- Confirm no renderer code imports Astronomy Engine, accesses Node APIs, calculates astronomy values independently, or maintains another location store.
- Confirm global events are labeled global and the planet grid uses only factual geometry states, never real-world visibility recommendations.
- Confirm semantic headings, accessible phase glyph naming, text equivalents, keyboard controls, visible directional/state text, stable grid tracks, and no horizontal overflow.
- Confirm existing widget refresh, reset, factory reset, Escape, inline height locking, and update subscription cleanup continue to work.
- Confirm focused tests, `npm run typecheck`, `npm run build`, and applicable Windows production verification pass.

## Completion Criteria
- The self-registering Astronomy module is available through existing dashboard/widget infrastructure and is fully controlled by the app-level feature gate.
- Summary and Detailed views cover the agreed first-release data without adding deferred functionality or visibility claims.
- Instance configuration, location fallback, status handling, timezone formatting, countdowns, responsive behavior, and accessibility satisfy the source acceptance criteria.
- Focused renderer tests pass and the final build/typecheck/production verification evidence is recorded.
- The implementation reuses the backend contract and shared renderer feature gate with no duplicate persistence or data path.
