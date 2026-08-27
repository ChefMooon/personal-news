# Astronomy Widget Specification

**Project:** personal-news<br>
**Status:** Finalized for implementation planning<br>
**Scope:** New instance-configurable Astronomy dashboard widget<br>
**Related docs:** [astronomy-backend.md](./astronomy-backend.md) | [weather-widget-additions.md](./weather-widget-additions.md) | [widget-settings-spec.md](../../widget-settings-spec.md) | [ui-ux.md](../../ui-ux.md)

## 1. Purpose and First-Release Scope

The Astronomy widget is a focused, information-dense dashboard widget backed by the canonical `AstronomySnapshot` contract. It uses the user's saved Weather locations and provides a compact summary plus an optional detailed view for one selected location.

The first release includes:

- Moon phase, illumination, waxing/waning direction, synodic progress, distance, and available lunar detail.
- Current Sun and Moon altitude/azimuth, local-day rise/set times, and calculated solar-state classification.
- One entry for each of the seven supported planets: Mercury, Venus, Mars, Jupiter, Saturn, Uranus, and Neptune.
- Bounded global events from seasons, lunar eclipses, solar eclipses, and Mercury/Venus transits.

All values are calculated geometry or event data. The widget must not claim that a body is actually visible or that local conditions are suitable for viewing.

## 2. Confirmed Product Decisions

| Area | Decision |
| --- | --- |
| Location source | Reuse saved Weather locations and the existing Weather default location. Do not create a second location database. |
| Widget selection | Each widget instance selects one saved Weather location and may use a different location from other instances. |
| Planet scope | Render all seven supported planet entries, including unavailable optional fields as stable placeholders. |
| Event scope | Render seasons, lunar eclipses, solar eclipses, and Mercury/Venus transits. Conjunctions, oppositions, and greatest elongations are deferred. |
| Event visibility | First-release events are global. Local eclipse contacts and visibility calculations are deferred and must not be inferred in the renderer. |
| App-level gate | The global Astronomy `enabled` setting controls widget picker visibility, dashboard rendering, settings access, data reads, and calculations. Disabling it hides the widget but retains widget instances and configuration. |
| Snapshot metadata | The dedicated snapshot includes the selected location display name and IANA timezone, so this widget does not need a second location lookup to format event times. |
| Responsive behavior | Detail sections wrap or stack at narrow widths. Do not introduce horizontal scrolling for the widget. |

## 3. Widget Settings and Registration

Register the widget through the existing renderer module registry with an explicit feature identifier and display name. The module must be imported by the dashboard composition path so registration is deterministic.

The instance configuration should contain:

- `locationId`: one saved Weather location, falling back to the existing Weather default when the configured location is removed.
- `viewMode`: `summary` or `detailed`, defaulting to `summary`.

Use the existing inline widget settings pattern, including immediate persistence, reset-to-open, factory reset, Escape handling, and edit-mode height locking. The location and view-mode controls are instance-scoped and must not alter Weather widget configuration.

The app-level Astronomy setting is a prerequisite for this widget. When it is disabled:

- The widget is hidden from the Add Widget picker and Settings surfaces.
- Existing Astronomy widget instances are suppressed rather than deleted.
- Dedicated Astronomy snapshot reads return `null` and calculations/refreshes are not started.
- Re-enabling restores the existing widget instances, selected locations, and view modes.

## 4. Summary Mode

Summary mode is the default and should support quick scanning without requiring the detailed geometry view. It contains:

### Moon summary

- Local phase glyph driven by `phaseAngle` and `illuminationPercent`.
- Phase name, whole-number illumination, and explicit `Waxing` or `Waning` text.
- Synodic progress with labels or accessible text for the four primary milestones.
- Distance when available.

### Horizon summary

- Current Sun altitude and solar-state label.
- Current Moon altitude when available.
- The next available rise or set item, with its localized time.

### Next phase summary

- Top-level `nextPrimaryPhase` name.
- Relative countdown derived from the current renderer clock.
- Exact event date and time in the snapshot's IANA timezone.

### Event summary

Show a bounded list of the nearest upcoming global events. Each item includes its event name, localized timestamp, family label, and a `Global` scope label. A global event must not receive a local visibility claim.

## 5. Detailed Mode

Detailed mode expands the summary with the following sections. It remains a dashboard widget, not a full-page planetarium.

### 5.1 Horizon and sky arc

- Render a static or interactive 180-degree arc mapping the horizon ($0^\circ$ altitude) to zenith ($90^\circ$).
- Plot the current Sun and Moon positions from their altitude and azimuth values.
- Use the calculated solar state to label the current daylight or twilight context.
- Keep the visual explanatory rather than predictive: it represents calculated geometry and does not account for clouds, haze, buildings, trees, or light pollution.
- Provide a text-equivalent list of the plotted values for keyboard and screen-reader users.

The arc may use restrained background bands for daylight and twilight context, but the state must also be represented with text and not color alone.

### 5.2 Lunar detail and synodic progress

- Render the phase glyph from normalized phase angle rather than a remote image.
- Render a stable 0-100 synodic progress indicator with tick marks or labels for New Moon, First Quarter, Full Moon, and Third Quarter.
- Show illumination, trend, distance, and available libration/apsis values.
- Preserve independent unavailable placeholders when optional lunar fields are `null`.

### 5.3 Planet geometry grid

Render a responsive grid containing all seven planet entries. Each entry may show:

- Planet name.
- Apparent magnitude when available.
- Altitude and azimuth when available.
- Illumination and phase angle when available.
- Rise and set times when available.
- A factual derived state: `Daylight`, `Below horizon`, `Near horizon`, `Potentially visible`, or `Unknown`.

`Potentially visible` is a geometry label from the backend, not a viewing recommendation. The grid must not use `Visible Sky`, `Naked-eye`, or similar wording that implies real-world visibility.

### 5.4 Daily sky timetable

The first-release timetable is a compact comparison of local-day rise and set events:

| Event | Time | Status |
| --- | --- | --- |
| Sunrise | Location-local time or `Unavailable` | Calculated solar state |
| Sunset | Location-local time or `Unavailable` | Calculated solar state |
| Moonrise | Location-local time or `Unavailable` | Calculated geometry |
| Moonset | Location-local time or `Unavailable` | Calculated geometry |

Use the selected snapshot timezone for every timestamp. A missing event is normal for some dates and locations and must not make the whole widget unavailable.

## 6. Milestones and Event Presentation

Use a wrapping grid or stacked list for milestones; do not use a horizontal scrolling strip. The first release presents:

- The next primary lunar phase.
- Upcoming seasons.
- Upcoming lunar and solar eclipses with global scope.
- Upcoming Mercury and Venus transit events when returned by the backend.

Show no more than five events per family in the backend-provided 365-day window. Format all event timestamps in the selected location's IANA timezone while retaining the `Global` scope label. Local visibility and local eclipse contacts are unavailable in this release and must remain `Unknown` or absent according to the normalized contract.

## 7. Data and IPC Boundary

The renderer consumes `AstronomySnapshot` through dedicated Astronomy IPC. It must not import Astronomy Engine, access Node APIs, calculate astronomy values independently, or maintain a second location store.

The snapshot includes:

- `locationId` and `location.name` / `location.timezone` metadata.
- `forTimestamp` and nullable `calculatedAt`.
- Overall and per-group status for Moon, Horizon, Planets, and Global Events.
- The seven planet entries and bounded global event list.

The widget derives countdown wording from the current clock and absolute event timestamps. It never stores a rendered countdown in the cache.

When no snapshot is available, retain the widget structure and show stable `Unavailable` placeholders where the app-level feature is enabled. When the feature is disabled, hide the widget entirely as defined in Section 3.

## 8. States and Error Handling

| State | Required behavior |
| --- | --- |
| No saved locations | Use the existing location setup empty state and do not render fabricated values. |
| Configured location removed | Fall back to the Weather default location and persist the corrected instance configuration through the existing settings path. |
| Astronomy snapshot absent | Keep the widget usable with stable placeholders and a concise unavailable status. |
| Snapshot partial | Render successful groups, preserve stale indicators, and show unavailable fields independently. |
| Snapshot stale | Display the existing stale treatment and label calculated data as stale where needed; never describe it as a live observation. |
| Rise/set is `null` | Show `Unavailable` for that event only. |
| App-level Astronomy disabled | Hide the widget and suppress reads/calculations while retaining instances and configuration. |
| Refresh failure | Keep the previous snapshot, surface concise status, and rely on main-process logging for detailed errors. |

Passive unavailable data must not trigger a toast on every render. A failed group must not hide data from successful groups.

## 9. Responsive and Accessibility Requirements

- Use stable grid tracks and minimum widths so labels and values do not resize neighboring content unexpectedly.
- Wrap or stack sections at narrow widths without horizontal scrolling.
- Keep headings, primary values, supporting values, and status text in normal reading order.
- Give the widget and each detailed section semantic headings.
- Provide text equivalents for the sky arc's plotted Sun and Moon positions.
- Give the phase glyph an accessible name containing phase name and illumination; hide decorative vector details from duplicate screen-reader output.
- Pair all directional or state icons with visible text.
- Announce unavailable values as `Unavailable`, not as empty content.
- Keep location, view mode, refresh, and widget actions keyboard accessible with descriptive labels.
- Apply the existing Weather time-format preference where the widget shares that preference, while always using the selected location timezone.

## 10. Supporting Files and Integration

| File or area | Required change |
| --- | --- |
| `src/renderer/src/modules/astronomy/` | Add the self-registering widget module, view components, config handling, and presentation helpers. |
| `src/renderer/src/modules/registry.ts` | Register explicit Astronomy metadata and feature requirements. |
| `src/renderer/src/routes/Dashboard.tsx` | Import the module and suppress existing instances when the app-level feature is disabled. |
| `src/renderer/src/components/AddWidgetModal.tsx` | Hide Astronomy from the picker when the app-level feature is disabled. |
| `src/renderer/src/routes/Settings.tsx` and feature context | Add the app-level Astronomy setting using the existing optional-feature pattern. |
| `src/renderer/src/hooks/` | Add dedicated snapshot/settings/status hooks using IPC and unsubscribe event listeners correctly. |
| `src/shared/ipc-types.ts` | Consume the canonical shared Astronomy types and IPC constants from the backend specification. |
| Focused renderer tests | Cover location fallback, summary/detail rendering, timezone formatting, countdowns, partial/unavailable data, and app-level gating. |

The widget must not add Astronomy-specific persistence outside the existing widget instance configuration and the backend-owned cache/settings paths.

## 11. Acceptance Criteria

- [ ] The widget is available through the existing Add Widget flow only while app-level Astronomy is enabled.
- [ ] Each widget instance selects one saved Weather location and retains that selection through reload and reset flows.
- [ ] Summary mode is the default and includes Moon, Horizon, Next phase, and a bounded event summary.
- [ ] Detailed mode includes the sky arc, lunar progress, all seven planet entries, and the first-release daily timetable.
- [ ] The planet grid uses factual geometry states and never claims actual visibility.
- [ ] Event lists include only seasons, lunar eclipses, solar eclipses, and Mercury/Venus transits, with global scope visible.
- [ ] All local timestamps use the selected location's IANA timezone.
- [ ] Relative countdowns update from the current clock rather than remaining fixed at calculation time.
- [ ] Missing fields and partial groups preserve the surrounding widget and render stable placeholders.
- [ ] Disabling the app-level Astronomy feature hides the widget and suppresses data reads/calculations without deleting instances or configuration.
- [ ] The widget wraps at narrow widths without horizontal scrolling or overlapping text.
- [ ] Existing widget settings, refresh behavior, keyboard access, reset controls, and inline height locking continue to work.

## 12. Deferred Scope

The following are deliberately deferred and must not be added as hidden backend or renderer requirements for the first implementation:

- Solar noon.
- Rise/set azimuth and direction fields.
- Observer-scoped eclipse contacts or local visibility.
- Conjunction, opposition, and greatest-elongation event families.
- A complete lunar or eclipse calendar.
- Star charts, orbital visualization, telescope controls, and historical browsing.