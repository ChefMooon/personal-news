# Weather Widget Astronomy Additions

**Project:** personal-news<br>
**Status:** Finalized for implementation planning<br>
**Scope:** `WeatherWidget` astronomy strip and forecast-control cleanup<br>
**Related docs:** [astronomy-backend.md](./astronomy-backend.md) | [astronomy-data.md](./astronomy-data.md) | [widget-settings-spec.md](../../widget-settings-spec.md) | [ui-ux.md](../../ui-ux.md)

## 1. Summary

Add a compact astronomy section to the existing Weather widget. The section consumes the canonical cached `AstronomySnapshot` for the selected Weather location and presents a bounded set of local astronomy calculations:

- Current lunar phase, illumination, and waxing/waning direction.
- Sunrise, sunset, moonrise, moonset, and the current solar/twilight state.
- The next primary lunar phase with a relative countdown and localized date/time.

The astronomy section is controlled by one instance-scoped `Show astronomy` setting. It is enabled by default and can be hidden without affecting weather data or forecast settings.

The app-level Astronomy `enabled` setting is the outer gate. When it is disabled, the Weather astronomy section is suppressed and Weather-triggered Astronomy calculations stop, while the cached data and both instance settings remain retained for re-enabling. When the app-level feature is enabled, `Show astronomy` controls only the current Weather widget instance.

At the same time, remove the in-card `All` / `Hourly` / `Daily` forecast segmented control. The existing widget `Display mode` setting becomes the only forecast-scope control. In particular, `Current + all` always renders both the daily and hourly forecasts.

This is a Weather-widget enhancement, not a new astronomy dashboard widget or a full astronomy calendar.

## 2. Confirmed Product Decisions

The following decisions were confirmed during UX clarification:

| Decision | Chosen behavior |
| --- | --- |
| Forecast control | Remove the `All` / `Hourly` / `Daily` segmented control. Use the widget's `Display mode` setting only. |
| Astronomy visibility | Add one `Show astronomy` switch for the whole astronomy section. |
| Default visibility | Astronomy is enabled by default for existing and new Weather widget instances. |
| App-level gate | The global Astronomy setting suppresses this section and Astronomy calculations when disabled, but does not delete cache or instance configuration. |
| Horizon times | Move sunrise and sunset into one combined horizon card with moonrise and moonset. Do not render a duplicate standalone sun-time row. |
| Twilight badge | Show the current calculated solar state, such as `Daylight`, `Civil Twilight`, or `Astronomical Night`. |
| Narrow layouts | Wrap the astronomy cards into additional rows; do not require horizontal scrolling. |
| Missing values | Keep the section and replace only unavailable values with a stable placeholder such as `Unavailable` or `-`. |
| Next phase detail | Show a relative countdown and the exact localized date/time as secondary information. |

## 3. Goals and Non-goals

### Goals

- Give the Weather widget useful lunar and horizon context for its selected location.
- Keep the astronomy presentation compact, factual, and scannable.
- Use the existing inline widget settings pattern and instance-scoped persistence.
- Keep all location-dependent time labels in the selected location's IANA timezone.
- Preserve a valid weather view when astronomy calculation data is missing or partially unavailable.
- Make forecast content predictable by removing the second forecast-scope control from the rendered card.

### Non-goals

- The standalone Astronomy dashboard widget's layout or settings; that surface has its own specification.
- Cloud-cover, visibility, light-pollution, or real-world sky-obstruction claims.
- Zodiac signs, astrology, interpretive descriptions, or provider-generated recommendations.
- A full lunar calendar, eclipse calendar, complete planet detail view, star chart, or orbital visualization.
- A separate astronomy location database.
- A new network request or user API credential flow.

## 4. Normal View Layout

The astronomy section appears after the current conditions and alert banner, before the configured forecast content. It replaces the existing standalone sunrise/sunset row and the in-card forecast-scope toggle location.

```text
+------------------------------------------------------------------+
| Weather                                             Updated [gear]|
+------------------------------------------------------------------+
| [current conditions]                                             |
| [optional alert banner]                                          |
|                                                                  |
| Astronomy                                                        |
| +----------------------+ +----------------------+ +-------------+ |
| | Moon                 | | Horizon              | | Next phase  | |
| | [phase glyph]        | | Sunrise   06:42      | | Full Moon   | |
| | Waxing Gibbous       | | Sunset    19:58      | | in 3 days  | |
| | 74% illuminated  ^   | | Moonrise  21:14      | | Aug 28, 9pm| |
| |                      | | Moonset   07:03      | |             | |
| |                      | | [Civil Twilight]     | |             | |
| +----------------------+ +----------------------+ +-------------+ |
|                                                                  |
| [daily forecast when Display mode includes daily]               |
| [hourly forecast when Display mode includes hourly]              |
+------------------------------------------------------------------+
```

### 4.1 Astronomy strip container

- Render a full-width bordered section with a compact `Astronomy` heading.
- Use a responsive grid of three small cards: `Moon`, `Horizon`, and `Next phase`.
- On wide widget widths, the cards occupy one horizontal row.
- On narrow widget widths, cards wrap to additional rows while retaining their own boundaries and readable minimum widths.
- Do not introduce a horizontal scrollbar for this section.
- The strip must not change the card's width when astronomy is toggled on or off; normal widget height may change because content is added or removed.
- The section is absent when `config.showAstronomy` is `false`.

### 4.2 Moon card

Show the core lunar snapshot in one small card:

- A small local vector phase glyph whose illuminated side follows the calculated phase angle.
- A human-readable phase name: `New Moon`, `Waxing Crescent`, `First Quarter`, `Waxing Gibbous`, `Full Moon`, `Waning Gibbous`, `Third Quarter`, or `Waning Crescent`.
- Whole-number illumination percentage, for example `74% illuminated`.
- A text-and-icon direction indicator: `Waxing` with an upward/increasing affordance or `Waning` with a downward/decreasing affordance.
- The direction must not be conveyed by color alone.

The phase glyph is a local UI asset or component. It must not depend on a remote image or an external astronomy service. If the normalized phase value is unavailable, retain the card and show the phase fields as unavailable rather than rendering a misleading moon state.

### 4.3 Combined horizon card

Show the four daily horizon times together so solar and lunar timing can be compared directly:

- `Sunrise`
- `Sunset`
- `Moonrise`
- `Moonset`

Use the selected weather location's IANA timezone for all four values. The existing `Show sun times` row is removed; the combined card owns sunrise and sunset whenever the astronomy section is enabled.

Add a compact current-state badge to the same card. Supported labels are:

- `Daylight`
- `Civil Twilight`
- `Nautical Twilight`
- `Astronomical Twilight`
- `Astronomical Night`

The badge describes the calculated solar state at the astronomy calculation time. It must not imply that the sky is actually viewable: Astronomy Engine does not account for clouds, haze, buildings, trees, or light pollution.

If a rise or set search returns no event for the requested window, show `Unavailable` for that value and keep the other values visible. This is expected behavior for some locations and seasons, including polar conditions.

### 4.4 Next phase card

Show one upcoming canonical lunar milestone:

- The next primary phase name: `New Moon`, `First Quarter`, `Full Moon`, or `Third Quarter`.
- A relative countdown, for example `Full Moon in 3 days`.
- The exact event date and time in the selected location's IANA timezone as secondary text.

The relative countdown is derived from the event timestamp and the current clock so it does not remain frozen at the time the weather snapshot was fetched. Use sensible units such as minutes, hours, or days, and handle singular/plural wording. If the event timestamp is unavailable, retain the card and show `Next phase unavailable`.

## 5. Forecast Control Change

The existing `Display mode` setting already defines the forecast scope:

| `displayMode` | Rendered forecast content |
| --- | --- |
| `current` | Current conditions only |
| `current_hourly` | Current conditions and hourly forecast |
| `current_daily` | Current conditions and daily forecast |
| `current_all` | Current conditions, daily forecast, and hourly forecast |

Required behavior changes:

- Remove the rendered `All` / `Hourly` / `Daily` buttons from `WeatherWidget.tsx`.
- Remove the `forecastView` branch from the render path. `current_all` always renders `DailyForecast` followed by `HourlyTimeline`.
- Remove the `forecastView` field from the shared `WeatherViewConfig` contract and default config after migration.
- Keep the existing `HourlyTimeline` metric control (`Overview`, `Precipitation`, `Wind`, `Humidity`); it changes the hourly metric, not the forecast scope.
- Keep the `Display mode` select in `WeatherSettingsPanel.tsx` and make its four values the authoritative forecast control.
- Ignore the legacy persisted `forecastView` value when loading an existing configuration. No user action should be required to migrate it.

## 6. Astronomy Setting

Add `showAstronomy: boolean` to the instance-scoped `WeatherViewConfig`.

### Default

`showAstronomy` defaults to `true`. Existing stored configurations receive the default through the existing config merge behavior, so the new section appears unless the user turns it off.

### Settings panel

Add a `Show astronomy` switch in the Weather widget's `Sections` settings group. The switch:

- Updates the config immediately through `onChange`.
- Controls the entire astronomy strip, including moon, horizon, twilight, and next-phase cards.
- Applies only when the app-level Astronomy feature is enabled; the app-level gate can suppress the strip for every Weather widget.
- Does not affect the weather forecast, alerts, location selection, or refresh behavior.
- Does not delete or recalculate the underlying astronomy data.

When disabled, the existing standalone sunrise/sunset row remains hidden as well because those values now belong to the combined astronomy section. If the app-level Astronomy feature is disabled, the entire section is hidden regardless of this instance setting.

Factory reset restores `showAstronomy: true`. Reset-to-open restores the value captured when widget settings were opened.

## 7. Data Contract and Calculation Boundary

The renderer should consume the normalized, app-owned `AstronomySnapshot` on `WeatherSnapshot`; it should not import Astronomy Engine or access Node APIs. Calculation, caching, scheduling, and IPC ownership are defined in [astronomy-backend.md](./astronomy-backend.md).

The shared `WeatherSnapshot` field is required in the TypeScript contract but nullable at runtime:

```ts
astronomy: AstronomySnapshot | null;
```

The canonical `AstronomySnapshot` shape, including `location.name`, `location.timezone`, group status, seven planets, and bounded global events, is defined in [astronomy-backend.md](./astronomy-backend.md). This consumer uses only its `moon`, `horizon`, and top-level `nextPrimaryPhase` fields.

- A missing cache row, disabled app-level feature, or initial calculation failure is represented as `astronomy: null` so a calculation failure cannot invalidate a valid weather response.
- Moon phase and illumination may remain available even when a location-specific rise/set search returns `null`.
- Event timestamps are normalized as integer Unix seconds to match the existing weather contract.
- The renderer formats timestamps using `snapshot.location.timezone` for Weather data or `astronomy.location.timezone` for the dedicated astronomy payload, never the computer's timezone.
- Astronomy calculations remain local and deterministic; no astronomy network request is added.
- The UI uses factual labels such as `Calculated` or `Unavailable` where needed and does not claim actual visibility.

## 8. Component Scope: `WeatherWidget.tsx`

The primary renderer change is in [WeatherWidget.tsx](../../../src/renderer/src/modules/weather/WeatherWidget.tsx).

### Add

- A small astronomy strip component or local child components for the three cards.
- A local phase-glyph component/helper driven by normalized phase data.
- Location-time formatting for sunrise, sunset, moonrise, moonset, and the exact next-phase timestamp.
- Relative countdown formatting based on the current clock and the next-phase event timestamp.
- Stable unavailable states for the whole astronomy payload and individual null fields.
- `config.showAstronomy` as the instance render gate within the app-level Astronomy enabled gate.

### Remove or change

- Remove the `All` / `Hourly` / `Daily` button row and all `forecastView` render branching.
- Remove the standalone `showSunTimes` sunrise/sunset row.
- Render the combined horizon card in the astronomy strip instead.
- Keep the existing edit-mode height locking, reset controls, factory reset confirmation, Escape handling, refresh action, alert behavior, hourly metric control, and forecast components.

### Preserve

- The existing Weather card header and per-instance widget label.
- The current loading, no-location, no-cached-data, stale, and alert states.
- The current `Display mode` setting values and immediate persistence model.
- The existing weather detail-level behavior unless a separate product decision changes it later. Astronomy visibility is controlled by `Show astronomy`, not by forecast scope.

## 9. Supporting Files

The Weather widget change requires these supporting updates:

| File | Change |
| --- | --- |
| `src/shared/ipc-types.ts` | Add the canonical nullable Astronomy snapshot field; remove `forecastView` and `showSunTimes` only when the config compatibility behavior is in place. |
| `src/main/sources/weather/index.ts` or a shared astronomy helper | Calculate and normalize the local astronomy values; keep failures isolated from weather refresh success. |
| `src/renderer/src/hooks/useWeatherConfig.ts` | Default `showAstronomy` to `true`, remove obsolete default fields, and tolerate legacy stored fields. |
| `src/renderer/src/modules/weather/WeatherSettingsPanel.tsx` | Add the `Show astronomy` switch and remove the obsolete forecast-scope and standalone sun-time controls if present. |
| `src/renderer/src/modules/weather/WeatherWidget.tsx` | Implement the section layout, forecast-control cleanup, formatting, and empty states. |
| `src/main/db/database.ts` and `src/main/db/migrations/` | Register and add the dedicated Astronomy cache migration required by the backend spec. |
| Weather-focused tests | Cover normalization, phase labeling, timezone formatting, countdown boundaries, null rise/set values, app-level disable behavior, and config migration behavior. |

The Weather UI does not own the Astronomy cache migration. The dedicated cache table and migration are required by [astronomy-backend.md](./astronomy-backend.md), even though this renderer slice only consumes the enriched Weather snapshot.

## 10. States and Error Handling

| State | Required UI behavior |
| --- | --- |
| No effective location | Use the existing Weather location setup empty state; do not render misleading astronomy values. |
| Weather loading | Use the existing weather loading state. Do not flash an unrelated astronomy layout before the snapshot exists. |
| Weather available, astronomy cache absent | Keep the Weather widget fully usable and render the astronomy strip with stable unavailable placeholders when the app-level feature is enabled. |
| App-level Astronomy disabled | Hide the astronomy strip for every Weather widget and do not trigger Astronomy refreshes; retain cached data and instance configuration. |
| Moon data absent, horizon data present | Keep the horizon and next-phase cards visible; show unavailable fields only in the Moon card. |
| Rise/set result is `null` | Show `Unavailable` for that one time; do not treat it as an application error. |
| Next phase absent | Show `Next phase unavailable` in the milestone card. |
| Snapshot stale | Preserve the existing `Stale` badge. Astronomy values are calculations associated with the snapshot and must not be presented as live observations. |
| Setting persistence failure | Follow the existing Weather config hook behavior and surface the save error without discarding the in-memory change. |
| Astronomy calculation failure | Log at the calculation boundary and return `astronomy: null` or a partial snapshot; do not reject or remove the valid weather snapshot. |

Passive missing astronomy values should not trigger a toast on every render. Inline placeholders are sufficient; calculation failures should be logged where they occur.

## 11. Responsive and Accessibility Requirements

- Use a responsive grid that wraps the three cards at narrow widths without horizontal scrolling.
- Give each card a stable minimum width and allow text to wrap or truncate without changing neighboring card dimensions unexpectedly.
- Keep labels and values in normal reading order: card heading, primary value, supporting value, then status/detail.
- Use semantic headings and group the strip under an accessible `Astronomy` label.
- Provide an accessible name for the phase glyph that includes the phase name and illumination percentage; decorative vector details should be hidden from duplicate screen-reader output.
- Pair the waxing/waning icon with visible text so direction is not color-only.
- Use icon buttons only for existing widget actions and retain descriptive `aria-label` values.
- Ensure placeholder text is announced as unavailable data rather than an empty field.
- Preserve keyboard access to the settings switch and all existing Weather widget controls.
- Respect the existing time-format setting for localized next-phase detail while always applying the selected location timezone.

## 12. User Flows

### View astronomy data

1. The user opens a dashboard containing a Weather widget with a selected location.
2. The widget renders current weather and, when both the app-level Astronomy feature and the instance setting are enabled, the three-card astronomy strip.
3. The user scans the Moon, Horizon, and Next phase cards without opening a separate page.
4. The user sees local times and a calculated solar-state badge for the selected location.

When the app-level Astronomy feature is disabled, the strip is hidden for every Weather widget and no Astronomy calculation is triggered. Re-enabling the feature makes the retained instance setting effective again.

### Hide astronomy data

1. The user opens the Weather widget settings button.
2. The user turns off `Show astronomy`.
3. The astronomy strip and its horizon times disappear immediately, including the former standalone sunrise/sunset row.
4. The user closes settings; the per-instance choice remains after reload.

### Select forecast content

1. The user opens the Weather widget settings button.
2. The user selects a `Display mode`.
3. The widget immediately renders the configured forecast content.
4. When `Current + all` is selected, both daily and hourly forecasts are shown; there is no second in-card forecast-scope toggle.

## 13. Acceptance Criteria

- [ ] The `All` / `Hourly` / `Daily` control is absent from the normal Weather widget render.
- [ ] `Display mode` is the only setting that selects current, hourly, daily, or all forecast content.
- [ ] `current_all` consistently renders both `DailyForecast` and `HourlyTimeline`.
- [ ] The astronomy section contains exactly three bounded cards: Moon, Horizon, and Next phase.
- [ ] The cards render horizontally when space permits and wrap without horizontal scrolling when it does not.
- [ ] The Moon card shows a dynamic phase glyph, phase name, illumination percentage, and explicit waxing/waning direction.
- [ ] The Horizon card shows sunrise, sunset, moonrise, moonset, and the current solar-state badge in the selected location timezone.
- [ ] The Next phase card shows the phase name, a live relative countdown, and localized event date/time.
- [ ] `Show astronomy` is instance-scoped, defaults to enabled, persists immediately, and restores correctly through reset and factory reset.
- [ ] The app-level Astronomy gate hides the strip and suppresses Astronomy refreshes while retaining cache rows and Weather widget configuration.
- [ ] The old standalone sunrise/sunset row is not rendered, and `showSunTimes` does not create duplicate or contradictory visibility behavior.
- [ ] Missing astronomy data leaves weather content usable and displays stable, localized placeholders.
- [ ] `null` rise/set results are handled as normal unavailable values.
- [ ] Stale weather data retains the existing stale treatment and is not described as a live sky observation.
- [ ] Existing Weather settings, refresh, alerts, forecast metric selection, and inline edit height locking continue to work.

## 14. Focused Test Plan

Add or extend focused tests for:

- Phase-angle to phase-name mapping at the eight bucket boundaries.
- Illumination rounding and waxing/waning normalization.
- Next-primary-phase selection and countdown wording at minute, hour, and day boundaries.
- Formatting horizon and next-phase timestamps with a non-system IANA timezone.
- Rendering partial astronomy data, including missing moonrise or moonset.
- Rendering the astronomy-unavailable state without hiding valid weather content.
- Suppressing the strip and Astronomy refreshes when the app-level feature is disabled, then restoring the retained instance setting after re-enable.
- Loading legacy Weather widget config containing `forecastView` and `showSunTimes` without restoring either obsolete behavior.
- Defaulting a missing `showAstronomy` field to `true`.
- `current_all` rendering both daily and hourly sections without an in-card scope toggle.
- Refreshing Weather after an Astronomy-only update so the enriched `WeatherSnapshot` does not remain stale in the renderer.
