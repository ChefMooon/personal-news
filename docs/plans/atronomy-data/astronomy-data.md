# Pre-Plan Impact Assessment: Local Astronomy Data

**Project:** personal-news  
**Research target:** [Astronomy Engine JavaScript source](https://github.com/cosinekitty/astronomy/tree/master/source/js)  
**Research snapshot:** The repository `master` source and package metadata were inspected on 2026-08-14. The package metadata reported `astronomy-engine` version `2.1.19`; pin the dependency to a reviewed version when implementation begins.

## Decision Summary

- Overall disposition: continue pre-planning for frontend scope, then hand off a split implementation to the planning agent.
- Confidence: medium-high for library fit and repository integration points; medium for the first-release product scope.
- Scope assessed: use Astronomy Engine for local calculations, expose moon phase in the Weather widget, and add a new Astronomy dashboard widget. This assessment does not implement application code or choose a final visual layout.
- Main recommendation: use Astronomy Engine as a local calculation library in the main-process/shared data path. It needs no API key, network request, or external astronomy service. Reuse the existing saved weather locations as observer locations.
- Recommended first release: add a compact moon summary to Weather and make the new Astronomy widget focus on current sky state plus a small number of next events. Defer a full astronomy calendar, raw orbital vectors, provider-style interpretation, and advanced visualization until the core data model is proven.

## Proposed Changes

### C1: Use Astronomy Engine as a local calculation source

- Intended outcome: calculate astronomy values locally for the Sun, Moon, planets, observer horizon, and astronomical events without sending location data to a third party.
- In scope: add the `astronomy-engine` package, use its typed JavaScript API, normalize its results into app-owned contracts, and define the supported date/time and observer behavior.
- Out of scope: an astronomy web API, user API keys, cloud synchronization, astronomy images, weather/cloud-cover data, astrology interpretations, or a full planetarium renderer.
- Dependencies: the main process or a shared pure calculation layer, the existing TypeScript/Vite/Electron build, and a location with latitude and longitude. Elevation is optional for the first version and can default to `0` meters because `WeatherLocation` currently has no elevation field.
- Open assumptions:
  - The application should preserve its current rule that data sources do not send user data to external services.
  - Astronomy Engine's `master` source is a research reference; implementation should pin and verify a package release rather than depend on an unpinned remote source.
  - Astronomy values are calculations, not observations. The widget should not claim that a body is visible when cloud cover, daylight, horizon obstructions, or local conditions have not been evaluated.

### C2: Add moon phase data to the Weather widget

- Intended outcome: show useful lunar context next to weather information for the selected weather location.
- In scope: current phase, illumination, waxing or waning state, and a small number of next lunar events. Location-specific moonrise/moonset can be included if the first UI needs it.
- Out of scope: replacing Open-Meteo, changing the weather forecast contract, moon-specific notifications, zodiac content, provider-generated interpretations, or raw third-party SVG content.
- Dependencies: the existing `WeatherLocation`, `WeatherSnapshot`, `WEATHER_UPDATED` event, Weather widget config pattern, and a decision about whether astronomy is always part of Weather or has its own feature toggle.
- Open assumptions:
  - Basic phase is supplemental and must remain available even if a future astronomy calculation fails for a different event.
  - Current phase can be calculated at snapshot load or weather refresh time; countdown text such as “rises in 2 hours” should be calculated in the renderer from a timestamp rather than requiring frequent recalculation in the main process.
  - Astronomy data should not make a valid weather response disappear.

### C3: Add a new Astronomy dashboard widget

- Intended outcome: provide a focused astronomy view with more than the compact phase summary in Weather.
- In scope: a new self-registering, instance-configurable dashboard widget that selects a saved location and displays a deliberately bounded set of astronomy facts and events.
- Out of scope: a dedicated full-page planetarium, interactive star charts, telescope control, orbital simulation UI, historical data browsing, or a complete astronomy calendar in the first slice.
- Dependencies: C1, shared access to saved weather locations, the renderer module registry, the dashboard widget picker, per-instance settings persistence, and a decision about feature gating.
- Open assumptions:
  - Multiple Astronomy widget instances should be able to use different saved locations, matching the existing widget settings model.
  - If no saved location exists, the widget should show a setup state that directs the user to the existing Weather location management flow, unless the feature is intentionally made independent.
  - A standalone Astronomy widget is desirable, but it may initially share Weather locations and settings rather than creating a second location database.

## Clarifications

- Asked and answered: none. The user requested source exploration and frontend design input, so these questions do not block the impact assessment.
- Still needed before an implementation plan:
  - Should Astronomy be independently enabled, or should it be visible only while the Weather feature is enabled?
  - Should Astronomy reuse Weather's saved locations and default location, or have its own location list and default?
  - Which first-release groups matter most: current sky, daily rise/set, lunar events, seasonal events, planet visibility, or eclipses?
  - Should the Astronomy widget show one selected location or a compact multi-location comparison?
  - Should event dates be shown only for the next few days, or should the widget include a longer event horizon such as the next month or year?
  - Is the product intentionally limited to factual astronomy, excluding zodiac and interpretive content?
- Assumptions used for this assessment:
  - The app remains a desktop Electron dashboard with local SQLite and main-process ownership of data access.
  - Existing saved weather locations are the first observer-location source.
  - The first UI should be information-dense and non-intrusive, consistent with [ui-ux.md](../ui-ux.md).
  - The library is used as a deterministic calculation dependency, not as a remote data provider.

## Current-State Evidence

- [package.json](../../package.json): the project currently has no `astronomy-engine` dependency. The application targets Node 20+, Electron 33, TypeScript 5.6, Vite 5, and Vitest, which are compatible targets for a reviewed package dependency but still require an import/build smoke test.
- [src/main/sources/weather/index.ts](../../src/main/sources/weather/index.ts): Open-Meteo forecast and air-quality requests are owned by the main process. `fetchForecast()` already receives each saved location's latitude, longitude, and IANA timezone; `refreshLocation()` persists the result and `getSnapshot()` reconstructs the renderer contract.
- [src/main/db/migrations/002_weather.sql](../../src/main/db/migrations/002_weather.sql): Weather locations persist latitude, longitude, timezone, and timestamps. `weather_cache` stores weather JSON per location. No astronomy table or astronomy field exists.
- [src/shared/ipc-types.ts](../../src/shared/ipc-types.ts): `WeatherLocation` already has the observer coordinates needed by Astronomy Engine. `WeatherSnapshot` currently contains current conditions, hourly data, daily data, air quality, and alerts, but no moon or astronomy contract.
- [src/renderer/src/hooks/useWeatherSnapshot.ts](../../src/renderer/src/hooks/useWeatherSnapshot.ts): Weather data is loaded through `IPC.WEATHER_GET_SNAPSHOT` and refreshed when `IPC.WEATHER_UPDATED` fires. A moon field added to the normalized snapshot could use the existing renderer update path without direct renderer network access.
- [src/renderer/src/modules/weather/WeatherWidget.tsx](../../src/renderer/src/modules/weather/WeatherWidget.tsx): The widget already renders sunrise and sunset in a compact row and has a natural adjacent location for moon phase, illumination, and moonrise/moonset. It follows the inline settings pattern and freezes content height while editing.
- [src/renderer/src/modules/weather/WeatherSettingsPanel.tsx](../../src/renderer/src/modules/weather/WeatherSettingsPanel.tsx) and [src/renderer/src/hooks/useWeatherConfig.ts](../../src/renderer/src/hooks/useWeatherConfig.ts): Weather widget settings are instance-scoped and persisted immediately through the generic settings IPC channel. New moon visibility controls should follow this existing pattern if the user wants them configurable.
- [src/renderer/src/modules/registry.ts](../../src/renderer/src/modules/registry.ts): Renderer widgets self-register with an ID and display name. A new Astronomy widget can fit the existing module boundary.
- [src/renderer/src/routes/Dashboard.tsx](../../src/renderer/src/routes/Dashboard.tsx): Dashboard imports trigger module registration, and the existing layout system supports multiple widget instances, ordering, visibility, and cross-dashboard moves/copies.
- [src/renderer/src/components/AddWidgetModal.tsx](../../src/renderer/src/components/AddWidgetModal.tsx): The widget picker is driven by the registry and contains explicit feature checks for optional modules. A new Astronomy module needs a picker entry and either a new feature context or an intentional reuse of the Weather gate.
- [src/renderer/src/routes/Settings.tsx](../../src/renderer/src/routes/Settings.tsx) and [src/renderer/src/contexts/WeatherEnabledContext.tsx](../../src/renderer/src/contexts/WeatherEnabledContext.tsx): Optional features are hidden from Settings and the dashboard picker when disabled. This establishes the existing feature-gating pattern but does not decide whether Astronomy is a sub-feature of Weather.
- [docs/data-sources.md](../data-sources.md): The application documentation says sources write to local SQLite and the app itself sends no data to an external service. A local Astronomy Engine integration preserves that boundary; an external astronomy API would not.
- [docs/widget-settings-spec.md](../widget-settings-spec.md): Configurable widgets must use an inline settings panel, height locking, reset/factory-reset controls, instance-scoped settings, and a dedicated config hook. The new widget should be designed against this contract.
- [src/main/sources/registry.ts](../../src/main/sources/registry.ts): Main-process data sources initialize through a small `DataSourceModule` interface. A standalone Astronomy module is architecturally possible, but a pure calculation helper may be simpler because Astronomy Engine has no polling or remote lifecycle of its own.
- [src/main/sources/weather/**tests**/forecast-utils.test.ts](../../src/main/sources/weather/__tests__/forecast-utils.test.ts): Focused Vitest coverage exists for weather mapping and time-series utilities. There is no current astronomy calculation, date-formatting, observer, or weather-snapshot contract test.
- Unknown: no dependency-install or production-build probe has been run for `astronomy-engine` in this workspace. The package export map and type declaration were verified from the requested repository, but compatibility with the current lockfile and Electron bundling still needs a cheap implementation-time check.

## Astronomy Engine Capability Inventory

Astronomy Engine is a calculation library. It does not fetch sky images, weather, satellite observations, or cloud forecasts. It accepts a date and, for local horizon calculations, an `Observer` containing latitude, longitude, and height.

### Core data groups

| Data group                         | Relevant API                                                                                            | Data available                                                                                                                                          | Location-dependent                                                              | Frontend value                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Current Moon phase                 | `MoonPhase(date)`                                                                                       | Phase angle from 0 to 360 degrees. Convention: 0 new, 90 first quarter, 180 full, 270 third quarter.                                                    | No; it is geocentric.                                                           | Phase label, waxing/waning state, progress indicator, accessible description.                                 |
| Moon illumination and distance     | `Illumination(Body.Moon, date)`                                                                         | Visual magnitude, phase angle, illuminated fraction, heliocentric/geocentric distance, and vectors.                                                     | Mostly no for the basic values.                                                 | Illumination percentage, distance, and a compact phase summary.                                               |
| Moon geometry and libration        | `Libration(date)`, `EclipticGeoMoon(date)`                                                              | Ecliptic latitude/longitude, Earth-Moon distance, apparent diameter, libration angles, and spherical coordinates.                                       | Geocentric for the core result.                                                 | Advanced detail only; raw coordinates are not a good default dashboard display.                               |
| Moon quarter events                | `SearchMoonQuarter(date)`, `NextMoonQuarter(...)`                                                       | Event type 0 new, 1 first quarter, 2 full, 3 third quarter, with `AstroTime`.                                                                           | No for the global event time.                                                   | Next phase, recent/next quarter timeline, “Full moon in ...” label.                                           |
| Arbitrary Moon phases              | `SearchMoonPhase(targetLon, dateStart, limitDays)`                                                      | Time when a requested phase angle occurs, or `null` when outside the search window.                                                                     | No for the phase event.                                                         | Custom phase/event lookup if the UI needs it; probably not v1.                                                |
| Moon perigee/apogee                | `SearchLunarApsis(date)`, `NextLunarApsis(...)`                                                         | Perigee or apogee kind, event time, distance in AU and kilometers.                                                                                      | No for the event itself.                                                        | Optional “closest/farthest Moon” event card.                                                                  |
| Moon rise/set and altitude         | `SearchRiseSet(Body.Moon, observer, direction, date, limitDays)`, `SearchAltitude(...)`, `Horizon(...)` | Rise/set times, altitude, azimuth, and horizontal coordinates. Rise/set may return `null`.                                                              | Yes.                                                                            | Moonrise, moonset, current altitude/azimuth, and a night-sky timeline.                                        |
| Sun position and daily sky         | `Equator`, `Horizon`, `SunPosition`, `SearchRiseSet`, `SearchAltitude`                                  | Right ascension, declination, distance, azimuth, altitude, sunrise/sunset, and altitude crossings.                                                      | Position and rise/set are location-dependent.                                   | Civil/nautical/astronomical twilight, solar altitude, and a combined Sun/Moon day-night strip.                |
| Seasons                            | `Seasons(year)`                                                                                         | March equinox, June solstice, September equinox, and December solstice.                                                                                 | Global event times; local display timezone varies.                              | Next seasonal milestone or an annual event strip.                                                             |
| Lunar eclipses                     | `SearchLunarEclipse(date)`, `NextLunarEclipse(...)`                                                     | Eclipse kind, peak time, obscuration, and penumbral/partial/total durations.                                                                            | Global event; local visibility is not fully represented by the global result.   | Upcoming eclipse card with clear “global event” labeling.                                                     |
| Solar eclipses                     | `SearchGlobalSolarEclipse(date)`, `SearchLocalSolarEclipse(date, observer)`                             | Global kind/peak/distance and, for local search, partial/total contact events, peak, obscuration, and local geometry.                                   | Local solar eclipse results are location-dependent.                             | “Visible from this location” event details, only after exact visibility semantics are confirmed in UI design. |
| Planet positions                   | `GeoVector`, `HelioVector`, `Equator`, `Horizon`, `Ecliptic`, `EclipticLongitude`                       | Position vectors, right ascension, declination, ecliptic coordinates, distance, altitude, and azimuth for supported bodies.                             | Horizon values are location-dependent.                                          | Selected-planet cards or a compact “visible planets” list.                                                    |
| Planet illumination and visibility | `Illumination`, `Elongation`, `SearchMaxElongation`, `SearchRelativeLongitude`, `SearchPeakMagnitude`   | Visual magnitude, phase angle, angular separation from the Sun, elongation events, conjunction/opposition searches, and peak magnitude where supported. | Visibility and horizon are location-dependent; event geometry is generally not. | “Best planet to look for” style facts, but avoid claiming actual visibility without more checks.              |
| Planet rise/set and culmination    | `SearchRiseSet`, `SearchHourAngle`, `SearchAltitude`                                                    | Rise, set, altitude crossings, and culmination/hour-angle events for the Sun, Moon, planets, and defined stars.                                         | Yes.                                                                            | A daily sky timetable for a selected body.                                                                    |
| Mercury/Venus transits             | `SearchTransit`, `NextTransit`                                                                          | Transit start, peak, finish, and separation.                                                                                                            | Global event geometry; local viewing still needs daylight/visibility context.   | Rare-event calendar item, not a core widget metric.                                                           |
| Constellations and sidereal time   | `Constellation(ra, dec)`, `SiderealTime(date)`                                                          | Constellation symbol/name for an equatorial point and Greenwich apparent sidereal time.                                                                 | Sidereal time interpretation for an observer needs longitude.                   | “Moon is in ...” or sky-orientation detail, but likely advanced.                                              |
| Jupiter moons                      | `JupiterMoons(date)`                                                                                    | Positions and geometry for the Galilean moons.                                                                                                          | Observer rendering/visibility is a separate concern.                            | A future specialized detail view, not v1.                                                                     |

### How the JavaScript API is used

The official package metadata exposes CommonJS, ESM, and TypeScript declarations. The source README states that the library supports browser and Node.js use and is available as the npm package `astronomy-engine`. The core usage shape is:

```ts
import * as Astronomy from "astronomy-engine";

const observer = new Astronomy.Observer(latitude, longitude, 0);
const now = new Date();
const phaseAngle = Astronomy.MoonPhase(now);
const illumination = Astronomy.Illumination(Astronomy.Body.Moon, now);
const moonrise = Astronomy.SearchRiseSet(
  Astronomy.Body.Moon,
  observer,
  +1,
  now,
  1,
);
const nextQuarter = Astronomy.SearchMoonQuarter(now);
```

The app would still need to normalize `AstroTime` values to the shared timestamp shape and format them in the selected location timezone. The library's `Observer` accepts latitude, longitude, and height; the existing weather location model supplies the first two and can use zero elevation initially.

### Important calculation boundaries

- `MoonPhase` is an angle, not a human-readable phase name. The app needs a deterministic mapping for names such as New Moon, Waxing Crescent, First Quarter, and Waning Gibbous.
- The quarter result identifies only the four canonical quarters. Intermediate phase names and waxing/waning labels are application presentation logic.
- `SearchRiseSet` and related searches can return `null` when the event does not occur within the requested search window. This is normal near the poles and for bodies that remain above or below the horizon.
- `SearchRiseSet` includes a standard atmospheric-refraction correction, but the documentation notes that real refraction varies with temperature, pressure, and humidity. The UI should present rise/set as calculated times, not guarantees.
- Event times are calculated in universal time. The app must format them with the selected location's IANA timezone rather than assuming the computer's local timezone when the observer is elsewhere.
- Astronomy Engine does not know whether clouds, haze, buildings, trees, or light pollution block the sky. A “visible” or “good viewing” label would need additional weather and product rules and should be treated as a derived heuristic.
- The package is MIT licensed according to its source package metadata. It is still necessary to review the exact pinned release and include it in the normal dependency/license process.

## Impact Findings

### C1: Use Astronomy Engine as a local calculation source

- Classification: beneficial with conditions
- Positive impact:
  - Strong fit with the application's local-first data-source rule. No astronomy API key, request quota, remote uptime dependency, or location upload is required.
  - The library already exposes typed ESM/CommonJS entry points and TypeScript declarations, which fits the current TypeScript/Electron toolchain.
  - The same calculation engine can support both the small Weather moon summary and a richer Astronomy widget without duplicating formulas.
- Negative impact or unintended consequence:
  - The package is a computation engine, not a ready-made UI data feed. Phase names, display grouping, timezone conversion, null handling, and visibility wording remain app responsibilities.
  - A large API surface can tempt the product into an overly broad planetarium feature. Raw vectors, libration, Jupiter moons, and rare events have high complexity relative to their dashboard value.
  - If calculations are performed independently in Weather and Astronomy code, small differences in time or timezone handling could produce inconsistent values.
- Affected surfaces: `package.json`, a main/shared astronomy calculation boundary, shared TypeScript contracts, weather snapshot handling, new widget code, and focused Vitest tests.
- Dependencies and interactions: C1 must define one normalized calculation vocabulary and one timestamp/timezone convention before C2 and C3 are finalized. A standalone main data-source module is optional; the library itself does not need a poller or database lifecycle.
- Confidence and rationale: high for no-key/local integration and the available data. Medium for the exact dependency placement because the workspace has not yet run a package-install and Electron bundle probe.
- Discriminating check: add the reviewed package version in a disposable branch or local dependency change, import one typed function from the main-process build, run `npm run typecheck`, and run `npm run build`. If the package cannot be bundled cleanly, isolate the calculation layer or use its generated ESM entry point rather than redesigning the feature around a remote API.
- Recommendation: proceed, with a pinned version, a single normalization boundary, and an explicit rule that calculated astronomy is supplemental and factual.

### C2: Add Moon phase to the Weather widget

- Classification: beneficial with conditions
- Positive impact:
  - The Weather widget already has the selected location, sunrise/sunset row, stale state, refresh action, and inline settings panel needed for a compact lunar summary.
  - Basic phase, illumination, waxing/waning state, and next-quarter time are useful daily context and can be computed locally without increasing weather API traffic.
  - The current `WeatherSnapshot` and `WEATHER_UPDATED` path can carry a normalized optional moon value without exposing Node APIs to the renderer.
- Negative impact or unintended consequence:
  - Adding too many lunar controls to Weather could make the card noisy and weaken the product distinction between weather and astronomy.
  - Treating a phase calculation as a weather observation could create misleading freshness or stale indicators. The astronomy calculation timestamp should be separate from the Open-Meteo fetch timestamp if it is persisted.
  - If local astronomy calculations are cached only when weather refreshes, a manually selected future event or a long-running dashboard may show stale countdown text unless the renderer derives remaining time from event timestamps.
- Affected surfaces: `WeatherSnapshot` and related shared types, weather calculation/cache or snapshot assembly, `WeatherWidget.tsx`, `WeatherSettingsPanel.tsx`, `useWeatherSnapshot`, and weather utility tests. A schema migration is not automatically required if deterministic values are computed on snapshot read or held inside the existing JSON cache with an explicit calculation timestamp.
- Dependencies and interactions: C1; a decision on whether astronomy is always enabled with Weather; a normalized timezone strategy; and a first-release field set. Moon calculation failure must not reject Open-Meteo weather or remove a valid cached weather snapshot.
- Confidence and rationale: medium-high. The repository already provides the location and rendering boundaries, but the correct persistence choice depends on whether the UI needs only current phase or a richer set of event data.
- Discriminating check: prototype a pure calculation fixture for one saved location and a fixed UTC date. Verify the phase bucket, illumination percentage, next-quarter timestamp, local timezone formatting, and behavior when a rise/set search returns `null`. Then confirm the existing Weather widget still renders when the astronomy result is absent.
- Recommendation: proceed with a compact optional moon section. Keep the first payload to phase angle/name, illumination, waxing/waning, next canonical phase, and optionally moonrise/moonset. Avoid a separate external moon cache or API credential flow.

### C3: Add a new Astronomy dashboard widget

- Classification: beneficial with conditions
- Positive impact:
  - The self-registering renderer module and instance-scoped settings pattern are a direct fit for a new widget.
  - The widget can reuse saved weather locations while supporting different locations on different widget instances.
  - The local calculation model supports meaningful data even when the app is offline, which is a stronger fit for a personal dashboard than a per-refresh astronomy API.
- Negative impact or unintended consequence:
  - A widget that displays every available API result will be difficult to scan and will mix daily sky information with rare annual events.
  - Location management is currently owned by Weather. If Astronomy is independently enabled while Weather is disabled, the user may have no visible settings surface for creating or editing observer locations.
  - Global events such as seasons and lunar eclipses can be duplicated across multiple location-specific instances unless the UI distinguishes global data from local data.
- Affected surfaces: a new renderer module directory, a config hook and settings panel, shared astronomy contracts, Dashboard module import, AddWidgetModal metadata and gating, likely a feature context/general setting, and tests for normalization and view configuration. A full route or main-process database source is not required for the first widget slice.
- Dependencies and interactions: C1 and a shared saved-location decision. C2 and C3 should use the same calculation adapter so the Weather moon summary and Astronomy widget cannot disagree. The widget must follow [widget-settings-spec.md](../widget-settings-spec.md), including height locking, reset controls, and per-instance persistence.
- Confidence and rationale: medium. The technical extension points are clear, but the product value depends heavily on selecting a small first-release data set and deciding whether the feature is independent from Weather.
- Discriminating check: create a design-level fixture containing one saved location, no location, a polar-like location with missing rise/set, and a future event set. Confirm that a proposed card layout can show current data, local times, null event states, and global events without layout shifts or ambiguous labels.
- Recommendation: proceed as a focused dashboard widget after selecting the first-release data groups. Start with “Sky now” and “Next events”; defer full planet lists, eclipse timelines, and advanced coordinates to later slices.

## Frontend Data Menu

The following staged menu is intended to support UI design. It is a product-scope recommendation, not an implementation commitment.

### Weather widget: compact moon addition

Recommended default content:

- Phase icon or local phase visualization.
- Human-readable phase name.
- Illumination percentage.
- Waxing or waning label.
- Next canonical phase and a locally calculated relative time.

Optional content if it fits the existing sunrise/sunset row:

- Moonrise and moonset in the selected location timezone.
- Current moon altitude or azimuth, clearly labeled as calculated.
- Moon distance in kilometers, probably only at detailed level.

Avoid initially:

- Zodiac signs or interpretive text.
- Raw ecliptic coordinates.
- A full lunar calendar inside the Weather card.
- A second API or credentials flow.

### Astronomy widget: recommended first design

Suggested sections:

1. **Sky now**
   - Selected location.
   - Moon phase and illumination.
   - Sun altitude or day/night state.
   - Moon altitude and azimuth when available.
   - A small local-time indicator showing the calculation time.
2. **Today**
   - Sunrise, sunset, moonrise, moonset.
   - Civil, nautical, or astronomical twilight only if the detail level supports it.
   - Clear empty labels for events that do not occur during the search window.
3. **Next events**
   - Next Moon quarter.
   - Next lunar perigee/apogee as an optional detail item.
   - Next equinox/solstice when it is sufficiently near the current date.
   - Upcoming eclipse only as a clearly labeled rare event, not as a permanent dominant card.

Potential view settings, following the existing widget settings spec:

- Location: app default or a specific saved weather location.
- Detail level: summary, standard, detailed.
- Sections: Sky now, Today, Next lunar event, Seasons, Eclipses, Planets.
- Horizon bodies: Moon only, Sun and Moon, or selected planets.
- Time horizon for events: near-term or annual.
- Whether to show calculated coordinates and magnitudes in detailed mode.

## Cross-Change Considerations

- C1 should precede both C2 and C3. The package import, date conversion, observer construction, and normalized result types should be shared rather than re-created in each widget.
- C2 can be delivered before C3 as a lower-risk validation of the calculation contract, timezone formatting, missing-location state, and user value.
- C2 and C3 should not create separate saved-location stores. Reusing `WeatherLocation` avoids duplicate geocoding, but it creates a product decision about whether Astronomy depends on Weather being enabled.
- A local library means no astronomy polling timer is inherently required. Current values can be computed on snapshot access or a controlled refresh, while countdown labels update in the renderer from timestamps.
- Do not use the weather cache's `fetched_at` as the only astronomy freshness field if astronomy events are persisted. Weather refresh cadence and astronomy calculation cadence are different concepts even though the astronomy calculation itself is local.
- Global events should be calculated once per date or shared at the calculation boundary, while rise/set, horizon, and local solar eclipse results must be keyed by observer location.
- Astronomy calculations must be supplemental. Missing or invalid astronomy values should produce an empty/unknown state and preserve weather content.
- If the application later wants “good viewing conditions,” combine astronomy times with existing weather cloud/precipitation/visibility data as a clearly labeled heuristic. Astronomy Engine alone cannot provide that judgment.

## Handoff Options

1. **Continue pre-planning**: decide whether Astronomy is independent from Weather, confirm the shared-location policy, choose the first-release data groups, and sketch the compact Weather moon row plus the Astronomy widget's three sections. This is the recommended immediate next step because the user is still designing the frontend.
2. **Hand off to the planning agent**: carry forward a split scope consisting of a pinned local `astronomy-engine` dependency and calculation adapter; an optional normalized moon value in the Weather snapshot; and a new instance-scoped Astronomy widget reusing Weather locations. Preserve the constraints that no API key or external astronomy request is needed, all event times must be formatted in the observer timezone, rise/set may be null, and astronomy failure must not break weather.

## Quality Gate

- Every requested change was identified: Astronomy Engine exploration, moon phase in Weather, and a new Astronomy widget.
- Material clarification points are visible without converting unresolved frontend choices into requirements.
- Current-state claims are tied to the package, weather source, shared contracts, renderer hooks, widget registry, dashboard picker, feature gating, and existing documentation.
- Verified library capabilities, repository facts, assumptions, and unknown implementation probes are separated.
- Benefits, risks, privacy implications, dependency placement, persistence choices, timezone behavior, and cross-widget interactions are explicit.
- Each proposed change has a cheap discriminating check before implementation planning.
- The report does not prescribe a complete implementation plan and does not modify application code.

## Source Notes

- [Astronomy Engine JavaScript source directory](https://github.com/cosinekitty/astronomy/tree/master/source/js)
- [Astronomy Engine JavaScript reference](https://github.com/cosinekitty/astronomy/blob/master/source/js/README.md)
- [Astronomy Engine TypeScript declarations](https://github.com/cosinekitty/astronomy/blob/master/source/js/astronomy.d.ts)
- [Astronomy Engine package metadata](https://github.com/cosinekitty/astronomy/blob/master/source/js/package.json)
- [Astronomy Engine npm package](https://www.npmjs.com/package/astronomy-engine)
