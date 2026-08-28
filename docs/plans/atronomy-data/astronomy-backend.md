# Astronomy Backend Design Brief

**Project:** personal-news<br>
**Status:** Finalized for implementation planning<br>
**Scope:** Shared local astronomy calculations for the standalone Astronomy widget and the Weather-widget astronomy strip<br>
**Related docs:** [astronomy-data.md](./astronomy-data.md) | [astronomy-widget.md](./astronomy-widget.md) | [weather-widget-additions.md](./weather-widget-additions.md) | [widget-settings-spec.md](../../widget-settings-spec.md)

## 1. Purpose

Define the backend contract and implementation boundary for local astronomy data before renderer work begins. The backend must provide one normalized result that can support:

- A new instance-configurable Astronomy dashboard widget.
- The compact astronomy section inside the existing Weather widget.
- Current sky calculations, local horizon events, lunar detail, planet detail, and bounded global events.

The implementation uses Astronomy Engine locally. It does not add an astronomy network request, API credential, remote image, or separate astronomy location database.

This document is a backend design brief and planning input. It is intentionally more specific than the exploratory [astronomy-data.md](./astronomy-data.md), but it does not replace the eventual implementation plan or the renderer specifications.

## 2. Confirmed Decisions

| Area                 | Decision                                                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product surfaces     | Support both the standalone Astronomy widget and the Weather astronomy strip from one backend contract.                                                                                  |
| Calculation owner    | Add a dedicated main-process Astronomy module with a reusable calculation adapter.                                                                                                       |
| Library              | Use a reviewed, exact-pinned `astronomy-engine` release. The previously researched package version was `2.1.19`; verify the release and bundle compatibility when implementation starts. |
| Location source      | Reuse saved Weather locations and the existing Weather default location. Do not create a second location store.                                                                          |
| Observer elevation   | Use `0` meters because `WeatherLocation` has no elevation field in the current model.                                                                                                    |
| Feature gate         | Add an independent app-level Astronomy enabled setting. When disabled, it suppresses all Astronomy calculations and surfaces, including the Weather strip; cache rows and widget configuration are retained. The Weather `Show astronomy` switch remains instance-scoped within the app-level gate. |
| Cache                | Store one normalized snapshot row per Weather location in a dedicated SQLite table.                                                                                                      |
| Polling              | Keep a user-configurable additive Astronomy polling interval, defaulting to 60 minutes and clamped to 15-1440 minutes. Weather refreshes remain the primary synchronized trigger; this interval refreshes Astronomy between Weather polls and never refreshes Weather. |
| Startup              | When Astronomy is enabled, calculate all saved Weather locations once after module initialization, then run the configured timer.                                                        |
| Manual refresh       | Support refreshing one location or all locations through Astronomy IPC.                                                                                                                  |
| Weather refresh      | A manual or scheduled Weather refresh also recalculates Astronomy for the refreshed location.                                                                                            |
| Time anchor          | Prefer the Weather snapshot's current timestamp. When no Weather snapshot exists, use one captured current UTC timestamp for the run.                                                    |
| Local horizon window | Calculate sunrise, sunset, moonrise, and moonset for the observer's current local calendar day. A missing event is normal and is represented as `null`.                                  |
| Global event window  | Calculate up to five upcoming events per event family during the next 365 days. First-release families are seasons, lunar eclipses, solar eclipses, and Mercury/Venus transits. Conjunctions, oppositions, and greatest elongations are deferred. |
| Planet scope         | Include the seven listed bodies: Mercury, Venus, Mars, Jupiter, Saturn, Uranus, and Neptune. Expose calculated facts plus a clearly derived sky-state classification; do not claim actual viewing conditions. |
| Failure handling     | Isolate failures by group, persist partial results and per-group status, and preserve the last successful group data when a later run fails.                                             |
| Renderer boundary    | Renderer code receives normalized shared data through IPC and never imports Astronomy Engine or accesses Node APIs.                                                                      |

## 3. Goals and Non-goals

### Goals

- Provide deterministic, local calculations for the selected Weather location.
- Give both renderer surfaces the same phase, horizon, planet, and event values.
- Keep valid weather data available when astronomy calculation fails.
- Preserve partial astronomy data when only one calculation group fails.
- Normalize all event timestamps as Unix seconds.
- Keep location-dependent labels and dates tied to the saved location's IANA timezone.
- Make the cache and scheduler independent from Open-Meteo network availability while allowing Weather refreshes to update astronomy immediately.
- Make the first backend contract broad enough for the planned detailed widget without requiring a second redesign for common astronomy extensions.

### Non-goals

- No astronomy API, API key, network request, cloud synchronization, or astronomy image service.
- No separate astronomy location database, geocoder, or elevation-management flow.
- No claims that a body is actually visible. Astronomy Engine does not know about clouds, haze, buildings, trees, or light pollution.
- No astrology, zodiac interpretation, recommendations, or provider-generated prose.
- No full historical astronomy archive or unbounded event calendar.
- No durable storage of raw Astronomy Engine vectors unless a later feature explicitly needs them.
- No database migration for the Weather widget's `showAstronomy` setting or legacy `forecastView` / `showSunTimes` fields; those remain instance configuration handled by the renderer config hook.

## 4. Repository Integration Boundary

### 4.1 Main process

Add a dedicated module under `src/main/sources/astronomy/` that implements the existing `DataSourceModule` interface from `src/main/sources/registry.ts`:

- `initialize(db)` stores the database reference, loads Astronomy settings, starts the startup calculation, and schedules the timer when enabled.
- `shutdown()` clears the timer, cancels or prevents subsequent work where possible, and releases the database reference.
- The module owns settings normalization, cache reads/writes, refresh coordination, status reporting, and update events.

Keep the library-specific calls in a calculation adapter/helper rather than inside IPC handlers or renderer-facing code. The expected internal split is:

- `calculator.ts`: Astronomy Engine calls and pure normalization of one location at one anchor timestamp.
- `cache.ts` or equivalent repository helpers: prepared SQLite statements for snapshot/status reads and upserts.
- `index.ts`: module lifecycle, settings, refresh orchestration, event emission, and public functions used by IPC and Weather.

The exact file split can follow nearby Weather conventions, but there must be one calculation path shared by Weather and the standalone widget.

### 4.2 Shared contracts

Add the normalized contracts and IPC payload types to `src/shared/ipc-types.ts`. Shared types must describe app-owned values rather than Astronomy Engine return types. The renderer should not need to know whether a value came from `AstroTime`, a search result, or a calculated vector.

### 4.3 Preload and IPC

The existing preload bridge already exposes typed channel invocation/subscription wrappers. Add channel constants to `IPC` and register handlers in `src/main/ipc/index.ts` for:

- `ASTRONOMY_GET_SNAPSHOT(locationId)`
- `ASTRONOMY_REFRESH(locationId?)`
- `ASTRONOMY_GET_SETTINGS()`
- `ASTRONOMY_SET_SETTINGS(settings)`
- `ASTRONOMY_GET_STATUS()`
- `ASTRONOMY_UPDATED`

The standalone widget should use dedicated Astronomy IPC. Weather should continue using `WEATHER_GET_SNAPSHOT`; that response is enriched with the cached normalized Astronomy result so the Weather renderer does not need a second request.

## 5. Location and Time Model

### 5.1 Observer input

Build the Astronomy Engine observer from the existing `WeatherLocation`:

```ts
new Astronomy.Observer(location.latitude, location.longitude, 0);
```

The backend must validate that latitude and longitude are finite and in valid ranges before calculation. A malformed location should produce a failed location result and log the reason without stopping other locations.

The saved `location.timezone` is an IANA timezone supplied by the existing Weather location flow. It is used for local-day boundaries and is returned with the location through the existing snapshot contract. It must not be replaced by the computer's timezone.

### 5.2 Calculation anchor

Each run captures exactly one anchor timestamp:

1. For a Weather-triggered calculation, use the weather current timestamp that was just written to the cache.
2. For a standalone Astronomy refresh, read the latest Weather current timestamp for the location.
3. If no Weather snapshot exists, use one `Math.floor(Date.now() / 1000)` value for the complete run.

The normalized result should distinguish the time at which the astronomy values describe the sky from the time the calculation was performed:

- `forTimestamp`: the captured UTC calculation anchor.
- `calculatedAt`: the Unix timestamp when the successful normalized result was produced.

The Weather UI's next-phase countdown must be derived from the current renderer clock and the event timestamp. It must not be baked into the cached payload.

### 5.3 Local calendar day

For the four daily horizon events:

- Derive the local calendar date containing `forTimestamp` using `location.timezone`.
- Convert that local date's start and end to UTC instants with DST-aware timezone handling.
- Search only within that interval for Sun rise, Sun set, Moon rise, and Moon set.
- Return `null` when the event does not occur in that local day, including polar conditions.

This differs from a generic “next event after now” search. The Weather Horizon card needs a comparable local-day view, while a future detailed widget may separately request the next occurrence if that becomes a product requirement.

### 5.4 Timestamp and precision rules

- Store and expose event times as integer Unix seconds.
- Keep phase angles, altitudes, azimuths, distances, magnitudes, and illumination values at calculation precision in the normalized payload; round only in the renderer.
- Clamp or reject impossible normalized values at the adapter boundary rather than allowing `NaN`, `Infinity`, or invalid dates into SQLite or IPC.
- Preserve `null` for a valid search with no event. Do not convert no-rise/no-set into an exception.

## 6. Normalized Data Contract

The contract below is the target shape. Names may be adjusted to match the project's existing camelCase conventions, but the data meaning and optionality should remain stable.

### 6.1 Snapshot envelope

```ts
type AstronomyGroupName = "moon" | "horizon" | "planets" | "globalEvents";

type AstronomyGroupState = "fresh" | "stale" | "unavailable";

interface AstronomyGroupStatus {
  state: AstronomyGroupState;
  calculatedAt: number | null;
  error: string | null;
}

interface AstronomySnapshot {
  locationId: string;
  location: {
    name: string;
    timezone: string;
  };
  forTimestamp: number;
  calculatedAt: number | null;
  status: "complete" | "partial" | "unavailable";
  groupStatus: Record<AstronomyGroupName, AstronomyGroupStatus>;
  moon: AstronomyMoonSnapshot | null;
  horizon: AstronomyHorizonSnapshot | null;
  planets: AstronomyPlanetSnapshot[];
  nextPrimaryPhase: {
    name: "New Moon" | "First Quarter" | "Full Moon" | "Third Quarter";
    timestamp: number;
  } | null;
  globalEvents: AstronomyEventSnapshot[];
}
```

`AstronomySnapshot` is the canonical dedicated IPC/cache result. Add a required nullable field to `WeatherSnapshot`:

```ts
astronomy: AstronomySnapshot | null;
```

An absent row, an initial calculation failure, or a weather snapshot with no astronomy cache must produce `astronomy: null`, not a rejected Weather response.

### 6.2 Status semantics

- `complete`: all required groups calculated successfully for the current run. A valid no-event field such as `moonrise: null` still counts as a successful group.
- `partial`: at least one group has usable data and at least one group is stale or unavailable. If a later run fails for every group but an older snapshot exists, preserve that data, mark every group stale, and keep the snapshot `partial`.
- `unavailable`: no usable astronomy group has ever succeeded for the location. An initial all-group failure has this status.
- `fresh`: the group was calculated in the current run.
- `stale`: the current run failed for that group, but the cache still contains its last successful value. The UI may show it as calculated/stale and must not call it a live observation.
- `unavailable`: the group has no successful value. A valid no-rise/no-set or no-event result is not a group failure; its field remains `null` while the group can still be `fresh`.

Status and error fields are for diagnostics and stable UI states. They must not trigger a renderer toast on every render.

### 6.3 Moon data

The Moon group must contain the Weather-required fields and the selected advanced values:

```ts
interface AstronomyMoonSnapshot {
  phaseAngle: number;
  phaseName:
    | "New Moon"
    | "Waxing Crescent"
    | "First Quarter"
    | "Waxing Gibbous"
    | "Full Moon"
    | "Waning Gibbous"
    | "Third Quarter"
    | "Waning Crescent";
  illuminationPercent: number;
  trend: "waxing" | "waning";
  synodicProgressPercent: number;
  distanceKm: number | null;
  librationLongitudeDeg: number | null;
  librationLatitudeDeg: number | null;
  nextApsis: {
    kind: "perigee" | "apogee";
    timestamp: number;
    distanceKm: number | null;
  } | null;
}
```

Rules:

- Phase angle follows Astronomy Engine's convention: `0` New Moon, `90` First Quarter, `180` Full Moon, and `270` Third Quarter.
- Phase names use eight deterministic buckets. Boundary behavior must be explicit and covered by tests, including the wraparound near `0` / `360` degrees.
- Illumination is the normalized fraction converted to a percentage and rounded only for display.
- `trend` is derived from the normalized phase angle and is exposed as text-capable data so the UI cannot rely on color alone.
- `synodicProgressPercent` is a normalized 0-100 cycle position for a future progress bar; it is not a claim about the exact duration of an individual lunar month.
- Distance, libration, apsis, and phase-cycle values may be `null` independently if the library result cannot be normalized.

### 6.4 Horizon and solar state

```ts
interface AstronomyHorizonSnapshot {
  localDate: string;
  sunrise: number | null;
  sunset: number | null;
  moonrise: number | null;
  moonset: number | null;
  sunAltitudeDeg: number | null;
  sunAzimuthDeg: number | null;
  moonAltitudeDeg: number | null;
  moonAzimuthDeg: number | null;
  solarState:
    | "daylight"
    | "civil_twilight"
    | "nautical_twilight"
    | "astronomical_twilight"
    | "astronomical_night"
    | null;
}
```

Recommended solar-state thresholds use the current Sun altitude at `forTimestamp`:

- `daylight`: Sun altitude at or above the standard refracted sunrise/set threshold, approximately `-0.833` degrees.
- `civil_twilight`: Sun altitude from below daylight through `-6` degrees.
- `nautical_twilight`: Sun altitude from below civil twilight through `-12` degrees.
- `astronomical_twilight`: Sun altitude from below nautical twilight through `-18` degrees.
- `astronomical_night`: Sun altitude below `-18` degrees.

The calculation should use one inclusive-boundary convention and test each boundary. The label describes calculated solar geometry only; it does not claim that the sky is clear or viewable.

### 6.5 Planet data

Return one entry for each of the seven supported planets, even when some fields are unavailable:

```ts
type AstronomyPlanetName =
  "Mercury" | "Venus" | "Mars" | "Jupiter" | "Saturn" | "Uranus" | "Neptune";

interface AstronomyPlanetSnapshot {
  body: AstronomyPlanetName;
  altitudeDeg: number | null;
  azimuthDeg: number | null;
  rise: number | null;
  set: number | null;
  apparentMagnitude: number | null;
  illuminationPercent: number | null;
  phaseAngleDeg: number | null;
  elongationDeg: number | null;
  rightAscensionHours: number | null;
  declinationDeg: number | null;
  eclipticLongitudeDeg: number | null;
  eclipticLatitudeDeg: number | null;
  skyState:
    | "daylight"
    | "below_horizon"
    | "near_horizon"
    | "potentially_visible"
    | "unknown";
}
```

Planet rise/set values use the same observer and local-day interval as the Horizon group. The adapter may return `null` where the library does not provide a meaningful field for a body.

The recommended derived `skyState` rules are evaluated in this order:

- `unknown`: required position data is missing.
- `daylight`: the Sun altitude is known and is at or above the civil-twilight boundary, regardless of planet altitude. This state takes precedence over the geometric planet states.
- `below_horizon`: the Sun is below the civil-twilight boundary or unavailable, and planet altitude is below `0` degrees.
- `near_horizon`: the Sun is below the civil-twilight boundary or unavailable, and planet altitude is from `0` through less than `10` degrees.
- `potentially_visible`: the Sun is below the civil-twilight boundary or unavailable, and the body is at least `10` degrees above the horizon.

These are calculated geometry labels, not viewing recommendations. They must be documented and rendered with factual wording.

### 6.6 Global and planetary events

Return a bounded, chronologically sorted list with no more than five events per family in the interval `[forTimestamp, forTimestamp + 365 days]`:

```ts
type AstronomyEventFamily =
  "season" | "lunar_eclipse" | "solar_eclipse" | "planetary";

interface AstronomyEventSnapshot {
  id: string;
  family: AstronomyEventFamily;
  name: string;
  timestamp: number;
  endTimestamp: number | null;
  scope: "global";
  details: {
    season:
      | "march_equinox"
      | "june_solstice"
      | "september_equinox"
      | "december_solstice"
      | null;
    eclipseKind: "penumbral" | "partial" | "total" | "annular" | null;
    planet: AstronomyPlanetName | null;
    eventType: "transit" | null;
    localVisibility: null;
  };
}
```

Event-family rules:

- Seasons include the four annual equinox/solstice events.
- Lunar eclipses include the global event kind, peak timestamp, and available duration/obscuration details.
- Solar eclipses include the global event only. Local contact/visibility details are deferred; a global eclipse must never be presented as visible from the selected location without a separate local calculation.
- Planetary events include Mercury and Venus transits in the first release. Conjunction, opposition, and greatest-elongation events are deferred.
- First-release seasons, eclipses, and transits are global events. Observer-scoped local eclipse contacts and visibility are deferred; the renderer must not infer local visibility from a global event.
- Global event timestamps are formatted in the selected location timezone by the renderer, but their scope remains global.

The exact Astronomy Engine search calls for each planetary event family are an implementation detail to verify against the pinned package release. The normalized event union must not expose provider-specific result objects.

## 7. Cache and Database Design

Add a migration under `src/main/db/migrations/` with a dedicated one-row-per-location table. A target schema is:

```sql
CREATE TABLE IF NOT EXISTS astronomy_cache (
		location_id       TEXT PRIMARY KEY,
		snapshot_json     TEXT NOT NULL,
		calculated_at     INTEGER,
		last_attempted_at INTEGER NOT NULL,
		status_json       TEXT NOT NULL,
		FOREIGN KEY (location_id) REFERENCES weather_locations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_astronomy_cache_calculated_at
		ON astronomy_cache (calculated_at DESC);
```

The migration must be added to the explicit version-to-file map in `src/main/db/database.ts`, with its next numbered schema version. Production verification must continue to find the new migration in the bundled resources and recognize the new highest schema version.

`calculated_at` is the last successful snapshot time and may be `NULL` when no group has ever succeeded. `last_attempted_at` and `status_json` allow diagnostics without falsely treating a failed attempt as fresh data.

The JSON payload contains the normalized snapshot and group values. The scalar timestamps support status queries and avoid parsing every payload for the module status screen.

### 7.1 Upsert behavior

- A complete or partial successful run upserts the current normalized payload and status.
- If a group fails but has a previous successful value, retain that group's payload and mark its status `stale` with the new error and attempt time.
- If a group fails without a previous value, store it as `null` or an empty list and mark it `unavailable`.
- If the entire run fails before any group produces a value, preserve the previous payload when one exists, mark every previously successful group stale, set the overall status to `partial`, and update `last_attempted_at` / status only. If no previous row exists, insert an unavailable row so the UI can show stable placeholders after the first failed attempt.
- A no-event result such as polar-day `moonrise: null` is not a calculation failure. Store the null field with a successful group status.
- Deleting a Weather location removes its Astronomy cache through the foreign key cascade.
- Updating a saved location's coordinates or timezone must invalidate or immediately recalculate its Astronomy row so values from the old observer are not reused silently. Invalidation applies even while Astronomy is disabled; retaining the feature cache does not permit reuse for a changed observer.

No historical retention or cache-pruning job is required because only the latest normalized result is stored.

## 8. Settings and Scheduler

### 8.1 Settings contract

Add a dedicated settings payload, for example:

```ts
interface AstronomySettings {
  enabled: boolean;
  pollIntervalMinutes: number;
}
```

Defaults:

```ts
const DEFAULT_ASTRONOMY_SETTINGS: AstronomySettings = {
  enabled: true,
  pollIntervalMinutes: 60,
};
```

Persist settings using the existing key/value settings store. Merge missing fields from defaults and clamp `pollIntervalMinutes` to `15..1440`. A malformed stored value falls back to defaults without preventing app startup.

The independent `enabled` setting controls all Astronomy calculations and surfaces, including the standalone widget, its module scheduler, the dashboard picker, and the Weather astronomy strip. When disabled, the app-level gate wins over `WeatherViewConfig.showAstronomy`: the Weather strip is hidden and Weather-triggered Astronomy calculations are skipped. Disabling does not delete cached values or instance configuration. Re-enabling restores the previously configured Weather visibility and standalone widget instances. Explicit Astronomy refresh is also disabled while the app-level gate is off.

### 8.2 Lifecycle

1. Register `AstronomyModule` with the main-process source registry and initialize it after the database opens.
2. Initialize all module references and cross-module hooks before any asynchronous startup refresh can begin; do not rely on registration order to make Weather call an uninitialized Astronomy service.
3. Load settings and existing Weather locations.
4. If enabled, perform one startup calculation for every saved Weather location.
5. Start one interval using the normalized setting.
6. On each interval, calculate every saved Weather location and emit `ASTRONOMY_UPDATED` after the batch.
7. On settings changes, clear and recreate the interval; disabling the feature stops future scheduled and Weather-triggered work but does not delete the cache.
8. On location save, removal, or coordinate/timezone change, update or invalidate the Astronomy cache as appropriate.
9. On shutdown, clear the interval, invalidate in-flight work, and prevent late results from writing through a released database reference.

The scheduler must avoid overlapping batches. The implementation must define request coalescing for one-location versus all-location refreshes: repeated requests for the same location reuse one in-flight promise, while a broader request may await the active batch or enqueue the missing locations. The returned `refreshedCount` must describe the requested operation, including the unknown-location case.

The timer is for cached current positions and event data. Event countdowns remain renderer-derived, so a one-hour interval does not freeze “in 3 days” at the time of the last calculation.

### 8.3 Weather-triggered calculation

After `refreshLocation()` successfully writes a Weather cache row:

- When the app-level Astronomy feature is enabled, invoke the Astronomy service for that location with the Weather current timestamp as `forTimestamp`.
- Do not reject or roll back the Weather refresh if Astronomy fails.
- Emit the normal Weather update after both writes when possible. Astronomy-only timer or manual updates must also cause Weather consumers to re-read `WEATHER_GET_SNAPSHOT`, either through an Astronomy subscription in the Weather hook or through a deliberately deduplicated Weather update.
- Preserve Weather's existing alert notification behavior.

The dedicated Astronomy timer remains active independently. This coupling is an immediate-refresh optimization, not a requirement that astronomy wait for a network weather request.

## 9. IPC Behavior

### `ASTRONOMY_GET_SNAPSHOT`

- Request: `locationId: string`.
- Response: `AstronomySnapshot | null`.
- Returns the latest cached snapshot without starting an implicit long calculation.
- Unknown locations return `null`, matching the existing Weather snapshot IPC behavior.
- When the app-level Astronomy feature is disabled, return `null` without deleting the cached row.

### `ASTRONOMY_REFRESH`

- Request: optional `locationId`.
- With an ID, calculate that saved location only.
- Without an ID, calculate all saved locations.
- Response: existing `IpcMutationResult` plus `refreshedCount`.
- An explicit unknown `locationId` is an invalid request and must be rejected; it must not be reported as a successful zero-count refresh.
- Calculation failures are reported through per-location status and logs. The IPC should reject only when the request itself is invalid or the module is not initialized, not because one location has no moonrise.
- When the app-level Astronomy feature is disabled, reject the refresh as a feature-disabled request and retain all cache rows.

### `ASTRONOMY_GET_SETTINGS` / `ASTRONOMY_SET_SETTINGS`

- Read and write the normalized `AstronomySettings` payload.
- `SET` clamps the interval, persists the setting, reschedules the module, and emits an update if the active cache/scheduler state changes.

### `ASTRONOMY_GET_STATUS`

Return operational information needed by the future Settings UI, such as:

- Saved location count.
- Last successful calculation timestamp.
- Last attempted calculation timestamp.
- Count of complete, partial, and unavailable location snapshots.
- Whether the module is enabled and the normalized interval.

Do not expose raw stack traces or provider-specific errors through renderer status. Log detailed errors in the main process and return concise group-level messages.

### `ASTRONOMY_UPDATED`

Send the event after a successful or partial cache batch and after location/cache changes that affect subscribers. Renderer hooks must return the unsubscribe function from `window.api.on`, matching existing Weather behavior.

## 10. Weather Widget Compatibility

The backend must directly support every first-release data requirement in [weather-widget-additions.md](./weather-widget-additions.md):

- `WeatherSnapshot.astronomy` is required and nullable. An absent cache row or unavailable result is exposed as `null`.
- `AstronomySnapshot` includes the saved location display name and IANA timezone so the dedicated widget can format local times without a second location lookup.
- Moon phase, illumination, trend, and next primary phase remain available even if horizon searches fail.
- Horizon contains sunrise, sunset, moonrise, moonset, and calculated solar state.
- Rise/set `null` values are normal unavailable values and do not erase other horizon fields.
- Next primary phase includes an absolute Unix timestamp; relative wording is calculated in the renderer from the current clock.
- All renderer timestamps use `snapshot.location.timezone` and the existing Weather time-format setting.
- Astronomy calculation failure leaves current conditions, forecasts, alerts, stale treatment, and refresh behavior usable.
- The app-level Astronomy setting gates all Astronomy calculations and surfaces. When it is enabled, the instance setting alone controls Weather rendering. When it is disabled, Weather enrichment returns `astronomy: null` and dedicated snapshot reads return `null`; the stored cache and widget configuration remain intact for re-enabling.

The Weather renderer work must also:

- Add `showAstronomy: true` to the default `WeatherViewConfig`.
- Ignore legacy persisted `forecastView` and `showSunTimes` fields while loading config.
- Remove the in-card forecast-scope control and render `current_all` as daily followed by hourly.
- Remove the standalone sunrise/sunset row because the combined Astronomy Horizon card owns those values.

These are renderer/config changes, but they are listed here because the backend contract must not reintroduce the old fields or require an additional Weather request.

## 11. Error Isolation and Observability

Calculation boundaries should be isolated at these levels:

1. **Location:** an invalid observer or unexpected failure does not stop other locations.
2. **Group:** Moon, Horizon, Planets, and Global Events calculate independently where practical.
3. **Field:** a missing rise/set or unsupported optional metric becomes `null`, not a group failure.
4. **Persistence:** a cache write failure is logged and reported to the initiating operation without corrupting the prior row.

Use concise main-process logs with a stable prefix, for example:

- `[Astronomy] Startup refresh failed for <location id>`
- `[Astronomy] Horizon group unavailable for <location id>`
- `[Astronomy] Cache write failed for <location id>`

Do not log user location data beyond the existing location identifier/name conventions used by Weather. Do not log raw vectors or large payloads by default.

## 12. Implementation Sequence

The backend must be completed and validated before either renderer surface is implemented.

### Phase 1: Dependency and shared contract

- Verify the exact reviewed `astronomy-engine` release, package exports, TypeScript declarations, and Electron/electron-vite bundling behavior.
- Add the dependency and update the lockfile.
- Add shared Astronomy types, settings, IPC constants, and event/status contracts.
- Add deterministic phase, timestamp, timezone, and enum utility tests before wiring the module.

### Phase 2: Cache and module lifecycle

- Add the SQLite migration and prepared cache statements.
- Implement settings merge/clamping and the independent enabled flag.
- Implement module initialization, startup calculation, timer scheduling, shutdown, and in-flight refresh coordination.
- Add location lifecycle hooks for save/update/delete behavior.

### Phase 3: Calculation adapter

- Implement the Moon group first, including phase labeling, illumination, cycle progress, distance, libration, next primary phase, and apsis.
- Implement the local-day Horizon group and solar-state thresholds.
- Implement the seven Planet entries, geometry, timing, brightness/phase values, coordinates, and derived sky state.
- Implement bounded season, eclipse, and planetary event searches.
- Normalize every result into the shared contract and isolate partial failures.

### Phase 4: IPC and Weather enrichment

- Register the dedicated Astronomy IPC handlers and update event.
- Add Weather-triggered Astronomy refresh after a successful Weather cache write.
- Enrich `getWeatherSnapshot()` from the Astronomy cache with `astronomy: null` when unavailable.
- Verify that Weather network failures and Astronomy failures remain independent.

### Phase 5: Backend validation gate

- Run focused Astronomy unit tests.
- Run Weather snapshot/cache integration tests, including a missing/partial Astronomy payload.
- Run `npm run typecheck` and `npm run build`.
- Run the Windows production verification command before renderer integration if the dependency or main-process bundle changed.

Only after this gate should the standalone Astronomy widget and Weather astronomy strip consume the contract.

## 13. Focused Test Plan

### Pure calculation tests

- Map angles at all eight phase bucket boundaries, including `0`, `360`, quarter angles, and values immediately on either side.
- Verify illumination conversion and rounding behavior.
- Verify waxing/waning normalization and cycle progress wraparound.
- Select the next primary phase from fixed timestamps near each quarter.
- Verify next apsis and lunar distance normalization when the library returns values.
- Verify solar-state labels at every altitude boundary.
- Verify local calendar-day event searches in at least two IANA timezones and across a DST transition.
- Verify missing rise/set results remain `null` and do not fail the Horizon group.
- Verify planet geometry fields, null optional fields, and each derived `skyState` boundary.
- Verify the event window is bounded to 365 days and no family returns more than five entries.

### Cache and lifecycle tests

- Upsert a complete snapshot and read it back without changing numeric values.
- Preserve prior group data and mark it stale when a later group calculation fails.
- Insert an unavailable result after an initial full failure.
- Confirm a no-event null is stored as a normal successful field.
- Confirm deleting a Weather location cascades to the Astronomy cache.
- Confirm changing location coordinates/timezone invalidates or refreshes the old observer result.
- Confirm scheduler interval clamping, enable/disable behavior, startup refresh, shutdown cleanup, and no overlapping batches.

### IPC and Weather integration tests

- Return a dedicated Astronomy snapshot for one location and refresh one/all locations.
- Return concise status without raw errors.
- Enrich a Weather snapshot with Astronomy data when the cache exists.
- Return `astronomy: null` while preserving valid current, hourly, daily, and alert data when the cache is absent or calculation failed.
- Confirm a Weather refresh triggers Astronomy but still succeeds when Astronomy throws.
- Confirm `ASTRONOMY_UPDATED` and `WEATHER_UPDATED` subscriptions receive updates without duplicate listener leaks.

## 14. Acceptance Criteria

- One dedicated main-process Astronomy module owns calculation, caching, settings, scheduling, and IPC-facing operations.
- The module uses saved Weather locations and zero elevation; no second location store exists.
- Both the standalone Astronomy widget and Weather consume the same normalized snapshot vocabulary.
- The dedicated cache has one row per location, supports partial status, and preserves the last valid data through full-run failures.
- Startup and the 60-minute default timer calculate all saved locations when Astronomy is enabled.
- Manual refresh supports one location or all locations.
- Weather refresh updates Astronomy for the refreshed location without making Weather dependent on Astronomy success.
- Moon, Horizon, Planet, and Global Event groups cover the agreed fields and bounded windows.
- All timestamps are Unix seconds and all local formatting can use the selected location's IANA timezone.
- Polar/no-event rise and set values are represented as normal `null` fields.
- Derived planet states and solar states are explicitly calculated labels, never claims of real-world visibility.
- Missing Astronomy data leaves the Weather snapshot valid and renderer-consumable.
- Focused unit, cache, lifecycle, IPC, and Weather integration tests pass.
- `npm run typecheck`, `npm run build`, and the applicable Windows production verification pass before frontend implementation begins.

## 15. Remaining Implementation Checks

These are technical checks for the implementation plan rather than unresolved product choices:

- Confirm the exact pinned Astronomy Engine version and the import form that bundles cleanly in the current Electron main process.
- Verify the package APIs and return shapes for lunar apsis, libration, all seven planet illumination/magnitude fields, local eclipse searches, and planetary event searches.
- Decide whether the final migration stores only `snapshot_json` plus scalar status columns or additionally stores a schema/version field inside the payload.
- Confirm the project's migration runner versioning and foreign-key behavior before adding `astronomy_cache`.
- Verify DST-aware conversion from an IANA local date boundary to UTC using the project's supported Node runtime.
- Confirm the exact renderer-facing wording for stale group status and derived planet sky states when the Astronomy widget implementation is planned.
