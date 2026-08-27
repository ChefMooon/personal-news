# Implementation Plan: Weather Widget Astronomy Additions

## Source
- Document: `docs/plans/atronomy-data/weather-widget-additions.md`
- Basis: specification

## Objective
Extend the existing Weather widget with a compact, factual Astronomy strip that consumes the backend-owned nullable `AstronomySnapshot`, while making `Display mode` the only forecast-scope control. The implementation must preserve the existing Weather workflow and settings behavior, keep all location-dependent times in the selected IANA timezone, tolerate missing or partial Astronomy data, and suppress the strip and Astronomy-triggered work when the app-level Astronomy feature is disabled.

## Scope
- In scope: Weather snapshot consumption; the instance-scoped `showAstronomy` configuration and defaults; legacy `forecastView`/`showSunTimes` compatibility handling; the three-card Moon/Horizon/Next phase strip; local phase glyph and factual labels; timezone formatting and live countdowns; forecast-control cleanup; Weather settings/reset behavior; shared renderer feature-gate/settings integration needed by Weather; Astronomy update re-reads; responsive/accessibility behavior; focused Weather tests and renderer validation.
- Out of scope: Astronomy Engine calls; Astronomy cache schema, scheduler, main-process calculation, or dedicated Astronomy IPC implementation; the standalone Astronomy dashboard widget; a second location store; remote astronomy assets or requests; full planet/eclipses/calendar views; local eclipse visibility; and any deferred astronomy fields.

## Assumptions and Open Decisions
- **Backend prerequisite:** The Astronomy backend plan completes its Phase 5 validation gate first. This plan consumes the canonical `AstronomySnapshot` and does not calculate astronomy values in the renderer.
- **Shared renderer gate ownership:** If the repository does not already have an app-level optional-feature context and Settings surface for Astronomy, establish that common surface in this plan because Weather must prove the gate. The later standalone widget plan reuses it rather than creating a second setting or context. If the surface already exists, inspect and reuse it.
- **Existing Weather patterns:** Discover the concrete config merge, reset-to-open, factory-reset, time-format, update-subscription, and settings-panel patterns before editing. Preserve current public behavior and use repository-native primitives.
- **Legacy configuration:** Stored `forecastView` and `showSunTimes` values may exist. They are read-tolerated but must not be restored into active behavior; missing `showAstronomy` merges to `true`.
- **Time semantics:** The existing Weather time-format preference applies to display, while the snapshot's selected location timezone is authoritative. The renderer derives countdowns from the current clock and does not persist them.
- **Single-agent sequencing:** Execute this plan after the backend plan and before the standalone Astronomy widget plan. Keep the common app-level gate/settings ownership in one place so the later plan only consumes it.

## Phases
### Phase 1: Weather Contract and Configuration Compatibility
- **Goal:** Make Weather configuration and snapshot consumption ready for Astronomy without changing the rendered Weather experience prematurely.
- **Tasks:**
	1. Inspect `WeatherWidget.tsx`, `WeatherSettingsPanel.tsx`, `useWeatherConfig.ts`, the shared `WeatherViewConfig`/`WeatherSnapshot` contracts, existing feature context, and focused tests. Identify the exact current forecast branches, standalone sun-time row, config merge path, reset snapshots, and update event behavior.
	2. Update the shared Weather contract to consume the backend's required nullable `astronomy` field and remove obsolete active `forecastView`/`showSunTimes` fields only in a way that still tolerates legacy stored objects.
	3. Add `showAstronomy: true` to the default and merge behavior. Ensure missing stored values default to enabled, legacy values are ignored, and no legacy field can recreate the removed forecast or sun-time controls.
	4. Establish or reuse the app-level Astronomy `enabled` state and Settings integration using the existing optional-feature pattern. Ensure the gate is available to Weather rendering, Weather-triggered refresh decisions, and the later standalone widget without duplicating persistence or state ownership.
	5. Add or update configuration tests for legacy fields, defaulting, immediate persistence input, reset-to-open, factory reset, and preservation of unrelated Weather settings.
- **Dependencies:** Backend plan Phase 5; existing Weather config and feature/settings patterns.
- **Validation:** Run focused config/contract tests and the narrow renderer typecheck for the touched files. Confirm legacy configuration loads without restoring obsolete behavior.
- **Exit criteria:** Weather has a stable active config shape with `showAstronomy` enabled by default, legacy fields are harmless, and the app-level gate has one reusable renderer-facing source of truth.

### Phase 2: Astronomy Strip and Forecast-Control Rendering
- **Goal:** Render the specified three-card Astronomy strip and make `Display mode` the sole forecast-scope control.
- **Tasks:**
	1. Add a local phase glyph/helper driven by normalized phase angle and illumination, with an accessible name containing phase and illumination and decorative geometry hidden from duplicate screen-reader output.
	2. Add the strip after current conditions and any alert banner, before configured forecast content, with exactly the `Moon`, `Horizon`, and `Next phase` cards. Gate the whole section on both the app-level Astronomy setting and `config.showAstronomy`.
	3. Implement the Moon card with phase name, whole-number illumination, explicit Waxing/Waning text and paired direction icon, plus stable unavailable values when Moon data is missing.
	4. Implement the combined Horizon card with Sunrise, Sunset, Moonrise, Moonset, and the calculated solar-state label. Format every event through the selected snapshot IANA timezone, show individual unavailable placeholders for `null`, and do not render the former standalone sun-time row.
	5. Implement the Next phase card with canonical phase name, current-clock countdown using sensible minute/hour/day singular/plural boundaries, and localized exact timestamp. Keep the card present with `Next phase unavailable` when the event is absent.
	6. Remove the in-card `All`/`Hourly`/`Daily` forecast-scope control and all `forecastView` render branching. Render `current_all` as DailyForecast followed by HourlyTimeline while preserving the existing hourly metric control and other display modes.
	7. Keep the existing loading, no-location, no-cache, stale, alert, refresh, header, detail-level, and widget action behavior intact. Do not flash an Astronomy layout before the Weather snapshot exists.
- **Dependencies:** Phase 1 config/contracts and the backend snapshot shape; existing Weather presentation components and time-format preference.
- **Validation:** Run focused component/helper tests for phase boundaries, null fields, timezone formatting, countdown boundaries, all display modes, and absence of the old forecast control/sun-time row. Use the repository's renderer test environment rather than introducing a new framework.
- **Exit criteria:** The normal Weather render matches the three-card layout, forecast content follows only `Display mode`, and unavailable Astronomy data never hides valid Weather content.

### Phase 3: Settings, Gating, Updates, and Accessible Responsive Behavior
- **Goal:** Complete instance-scoped controls and feature lifecycle behavior without regressions in the existing Weather editing workflow.
- **Tasks:**
	1. Add `Show astronomy` to the Weather settings panel's Sections group as an immediate-persisting switch. Keep it independent from location, forecast, alert, hourly metric, and refresh settings.
	2. Ensure reset-to-open captures/restores `showAstronomy`, factory reset restores `true`, Escape and close handling remain unchanged, and edit-mode height locking still works while the strip is present or absent.
	3. Apply the app-level gate over every Weather instance: disabled hides the strip and prevents Weather-triggered Astronomy refresh/enrichment work; re-enable restores the retained instance choice and cached data. Do not delete cache or widget configuration.
	4. Subscribe to the existing Astronomy update signal or the deliberately deduplicated Weather update path so Astronomy-only changes cause Weather consumers to re-read the enriched snapshot. Return cleanup functions and avoid duplicate listeners.
	5. Render partial/stale/unavailable group states independently. Preserve successful Moon/Horizon/next-phase fields when another group is missing, retain the existing Weather stale treatment, and avoid repeated toasts for passive unavailable data.
	6. Implement responsive grid tracks that wrap the three bounded cards without horizontal scrolling. Preserve normal reading order, semantic `Astronomy` and card headings, keyboard access, descriptive labels, text-equivalent state wording, and non-color-only direction/state indicators.
	7. Surface setting persistence failures using the existing Weather error behavior while keeping the in-memory change, and keep calculation details in main-process logs rather than renderer toasts.
- **Dependencies:** Phase 2 rendered strip; backend update/enrichment behavior; existing widget settings and feature context.
- **Validation:** Test enable/disable transitions, retained instance settings, update subscription cleanup, partial/stale snapshots, persistence failure behavior, narrow layouts, keyboard interaction, and accessible unavailable/state text. Verify no horizontal overflow in the widget at representative narrow widths.
- **Exit criteria:** Weather settings and feature gating work immediately and across reload/reset flows, updates stay current without listener leaks, and the strip remains usable and accessible at narrow widths.

### Phase 4: Focused Regression and Integration Validation
- **Goal:** Prove the Weather enhancement satisfies the source acceptance criteria while preserving existing Weather behavior.
- **Tasks:**
	1. Run the complete focused Weather test set, including config migration, phase/glyph helpers, timezone/countdown formatting, partial/unavailable rendering, app-level gating, update propagation, forecast modes, and null rise/set cases.
	2. Verify the `current_all` path renders both daily and hourly sections in the required order and that the in-card forecast-scope control is absent.
	3. Verify the old standalone sunrise/sunset row is absent and `showSunTimes` cannot create duplicate or contradictory visibility behavior.
	4. Verify valid Weather current conditions, forecasts, alerts, and stale status remain available when Astronomy is absent or calculation failed.
	5. Run `npm run typecheck` and `npm run build` after renderer and shared-contract changes. If the backend package/migration gate was not run immediately before this plan, repeat `npm run verify:production:win` before handing off to the standalone widget plan.
	6. Review the result against the standalone widget's expected shared feature gate and contract, documenting only concrete integration gaps for the next plan.
- **Dependencies:** Phases 1 through 3 and the backend validation gate.
- **Validation:** Focused tests plus `npm run typecheck`, `npm run build`, and the applicable Windows production verification. Inspect the final diff to confirm the Weather plan did not add backend-owned cache or calculation logic.
- **Exit criteria:** All Weather-specific acceptance criteria pass, existing Weather workflows remain intact, and the standalone widget can reuse the same Astronomy setting, snapshot vocabulary, location source, and update behavior.

## Cross-Phase Dependencies
- Backend completion is a hard prerequisite; the renderer must consume normalized snapshots through existing IPC-backed Weather data and never import Astronomy Engine or Node APIs.
- Configuration compatibility must be complete before render branching is removed, so legacy persisted settings cannot reintroduce obsolete controls.
- The app-level Astronomy gate must be shared by Weather and the later standalone widget. It controls visibility and calculation triggering; `showAstronomy` remains instance-scoped.
- The Weather plan owns the first renderer integration of the common gate/settings surface only when no existing optional-feature pattern can be reused. The standalone widget plan must extend or consume that surface, not create a parallel setting.
- Astronomy-only updates must invalidate or refresh the Weather renderer's enriched snapshot without making Weather network refresh depend on Astronomy success.

## Risks and Mitigations
- **Legacy configs restore removed behavior:** normalize/merge only supported active fields and test stored objects containing both obsolete fields.
- **Countdown freezes at fetch time:** store/use only absolute event timestamps and derive wording from the current renderer clock; test minute, hour, and day boundaries.
- **Host timezone leaks into display:** centralize timezone-aware formatting and test with a non-system IANA timezone.
- **Missing astronomy data breaks Weather:** keep the section structurally present when enabled and render stable placeholders per field/group; test `astronomy: null` and partial snapshots.
- **The app-level gate is bypassed:** apply it to Weather rendering and Weather-triggered Astronomy work, then test disabled/re-enabled transitions with retained config/cache.
- **Astronomy updates create stale Weather data or listener leaks:** use one cleanup-returning subscription path and test update propagation and unsubscription.
- **Small widget widths cause overflow:** use bounded wrapping grid tracks and verify narrow rendering without horizontal scrolling.
- **Settings regressions affect existing editing flows:** preserve reset snapshots, factory defaults, Escape, refresh, alert, metric, and height-lock tests.

## Final Validation
- Confirm the Weather widget has no in-card forecast-scope segmented control and that `Display mode` alone controls current/hourly/daily/all content.
- Confirm `current_all` renders DailyForecast followed by HourlyTimeline, while the existing hourly metric control remains available.
- Confirm the Astronomy section has exactly Moon, Horizon, and Next phase cards, appears in the required position, and wraps without horizontal scrolling.
- Confirm Moon phase glyph/name/illumination/trend, combined horizon times/solar state, and next-phase countdown/exact time use stable placeholders and the selected IANA timezone as required.
- Confirm `showAstronomy` defaults true, persists immediately, restores through reset and factory reset, and does not alter unrelated Weather settings.
- Confirm the app-level Astronomy gate suppresses the strip and Weather-triggered calculations while retaining cache/configuration, then restores the retained instance choice on re-enable.
- Confirm partial, stale, absent, null rise/set, no-location, loading, and calculation-failure states preserve valid Weather content and do not spam toasts.
- Confirm accessible names, semantic headings, keyboard controls, text equivalents, and factual wording do not imply real-world sky visibility.
- Confirm focused tests, `npm run typecheck`, `npm run build`, and the applicable production verification pass.

## Completion Criteria
- The Weather renderer consumes the canonical backend snapshot without adding a second data path or astronomy calculation layer.
- The three-card strip, forecast cleanup, configuration compatibility, feature gate, update handling, and settings/reset behavior satisfy the source acceptance criteria.
- Focused Weather tests cover the specified rendering, formatting, migration, gating, update, and regression cases.
- The verified result is ready for the standalone Astronomy widget plan to reuse the shared gate, location source, timestamp rules, and backend contract.
