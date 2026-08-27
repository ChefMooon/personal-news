# Implementation Report: Astronomy Dashboard Widget

## Goal and Scope
- Goal: Instance-configurable Astronomy dashboard widget per `docs/plans/atronomy-data/astronomy-widget-plan.md`, consuming the canonical backend `AstronomySnapshot` and saved Weather locations.
- In scope: self-registering module, instance config (`locationId`, `viewMode`), dedicated snapshot/settings/status/update hooks, app-level gate reuse, Summary + Detailed views, responsive/accessibility behavior, inline settings/reset/height-locking, focused tests, verification.
- Out of scope: astronomy-engine calls, main-process cache/scheduling/IPC changes, second location store, local visibility claims, deferred event families.

## Phase Checklist
1. Module, Configuration, and Data Hooks - completed
	- `modules/astronomy/AstronomyWidget.tsx` registers `{ id: "astronomy", displayName: "Astronomy" }`; imported in `Dashboard.tsx`.
	- `hooks/useAstronomyConfig.ts`: defaults (`viewMode: "summary"`, `locationId: null`), normalization, immediate persistence under `astronomy_view_config:${instanceId}`, pure location resolution/fallback helpers.
	- `hooks/useAstronomySnapshot.ts` (dedicated read + cleanup-returning `ASTRONOMY_UPDATED` subscription, gated on enabled), `hooks/useAstronomyStatus.ts`, `hooks/useNowMilliseconds.ts`. Settings gate reused from existing `AstronomyEnabledContext` (no duplicate setting).
2. Summary View and Presentation Helpers - completed
	- `modules/astronomy/astronomy-display.ts` reuses Weather strip helpers (phase names, solar state, timezone formatting, countdowns) and adds event-family labels, factual planet states (`Daylight`/`Below horizon`/`Near horizon`/`Potentially visible`/`Unknown` derived from backend `skyState`+altitude), canonical seven-planet ordering, bounded upcoming-event sorting, synodic milestone labels, sky-arc positioning.
	- Summary view: Moon (glyph accessibility incl. illumination, trend icon + text, synodic progress), Horizon (Sun/Moon altitude, solar-state badge, next rise/set in location timezone), Next phase (countdown from current clock + exact localized time), bounded global event list with explicit `Global` badges.
3. Detailed Geometry, Lunar, Planet, and Timetable Views - completed
	- Sky arc SVG (horizon→zenith) with aria-hidden visuals + text-equivalent Sun/Moon altitude/azimuth list + explanatory geometry-only note; lunar detail with 0–100 progress indicator (ticks/labels New Moon/First Quarter/Full Moon/Third Quarter, accessible name), distance/libration/apsis placeholders; planet grid renders exactly Mercury–Neptune with independent unavailable fields; local-day timetable (Sunrise/Sunset/Moonrise/Moonset) in snapshot timezone with per-row statuses; milestones/events wrapping grid ≤5-per-family bound, global scope labels only.
4. Dashboard Integration, Accessibility, and Interaction Regression - completed
	- Picker entry + dashboard instances gated on `useAstronomyEnabled()` (instances retained when disabled); `MODULE_META.astronomy` added; inline settings panel (location select incl. app-default sentinel, Summary/Detailed mode) with immediate persistence, reset-to-open, factory reset confirm, Escape handling, edit-mode height locking via new `.astronomy-card-edit*` CSS; removed-location fallback persists the Weather default; refresh action throttled 60s keeps previous snapshot on failure; no passive toasts.
5. Final Widget Verification - completed
	- Focused tests 29/29 (config normalization/fallback, planet states incl. forbidden-wording guard, canonical ordering, event bounds/sorting, milestone wraparound, numeric formatting, next rise/set selection, sky-arc mapping, tz-guarded calculated-at stamp).
	- Full suite 122/122 (20 files); `npm run typecheck` clean; `npm run build` succeeded; `npm run verify:production:win` passed (packaged smoke test, schema v10); ESLint clean on touched files.

## Notes
- The actual backend `AstronomySnapshot` does not embed location name/timezone metadata (unlike the spec assumption), so display name/timezone resolve through the existing `useWeatherLocations` store - no second location lookup or store was added.
- Time-format preference is honored from Weather settings while all timestamps render in the selected location's IANA timezone; invalid/absent zones render `Unavailable` rather than leaking the host zone.
- better-sqlite3 ABI note from the backend report still applies: rebuilt for system Node to run vitest (122/122), then restored for Electron (`npx electron-rebuild -f -w better-sqlite3`) so `verify:production:win` passes.

## Status
complete
