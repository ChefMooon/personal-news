# Specification Change Impact Assessment: Astronomy Details Page

## Decision Summary
- Overall disposition: hand off to planning agent
- Confidence: high
- Scope assessed: promote the existing Astronomy details route into the full-data page, add gated sidebar navigation, and add location-aware entry points from Astronomy and Weather widgets.

## Proposed Changes
### C1: Promote Astronomy details to the full-data page
- Intended outcome: Give users a dedicated page that exposes the Astronomy data currently supplied to the dashboard widget.
- In scope: Reuse the existing `/astronomy/details` route; show the selected location and timezone, calculation and freshness metadata, group availability, and all available Moon, horizon, planet, and global-event data from `AstronomySnapshot`. The route should handle loading, missing locations, missing snapshots, and partial data without hiding successful groups.
- Out of scope: New astronomy calculations, backend or IPC changes, new data sources, local visibility predictions, and widget editing controls.
- Dependencies: Existing Astronomy snapshot hook, shared snapshot contract, Weather locations and time-format settings.
- Open assumptions: “All info” means all Astronomy data available through the widget's snapshot contract, not the widget's configuration controls. The current `/astronomy/details` route is the temporary surface to promote rather than a route to duplicate.

### C2: Add Astronomy to sidebar navigation and gate it
- Intended outcome: Make the dedicated page discoverable in the sidebar when Astronomy is enabled.
- In scope: Add a configurable Astronomy sidebar entry with a matching MoonStar icon; hide it when the global Astronomy feature is disabled; guard direct visits to `/astronomy/details` and redirect to Dashboard when the feature is disabled. Preserve the user's sidebar order/visibility preference while Astronomy is off.
- Out of scope: Changing the Astronomy feature toggle or its data-retention behavior.
- Dependencies: C1; existing Astronomy feature context and sidebar configuration.
- Open assumptions: Dashboard is the fallback destination for a disabled-feature route.

### C3: Add widget entry points to the page
- Intended outcome: Let users open full Astronomy details from the relevant dashboard widgets without losing the location context.
- In scope: Add a Details button to the Astronomy widget's Small and Medium sizes and to the Weather widget's Small, Medium, and Large cards. Each button opens the shared details route for that widget's effective location.
- Out of scope: Adding a button to the Astronomy Large widget, whose content is already uncapped, or changing widget data and settings.
- Dependencies: C1; Astronomy feature visibility and each widget's effective location.
- Open assumptions: Weather's Details button is available only while Astronomy is enabled and the Weather instance is configured to show its Astronomy section.

## Clarifications
- Asked and answered: When Astronomy is off, the sidebar entry should be hidden and direct visits to the page should be guarded.
- Still needed: None.
- Assumptions used for this assessment: A guarded route redirects to Dashboard. Existing query-based location selection and the current `/astronomy/details` path remain in use.

## Current-State Evidence
- `src/renderer/src/App.tsx` already registers `/astronomy/details` unconditionally. It also wraps the application in `AstronomyEnabledProvider`.
- `src/renderer/src/routes/AstronomyDetails.tsx` already resolves a requested Weather location or the Weather default and renders `AstronomyDetailedPrimitives`. It reads the Astronomy enabled state for its data hook but does not redirect or hide its page shell when the feature is disabled.
- `src/renderer/src/hooks/useAstronomySnapshot.ts` clears the snapshot and avoids reads and subscriptions when Astronomy is disabled. Therefore the existing page can remain reachable while showing an empty-data state.
- `src/renderer/src/modules/astronomy/AstronomyPrimitives.tsx` already supplies summary, position, timetable, planet, and event sections to the details route. The shared `AstronomySnapshot` contract in `src/shared/ipc-types.ts` also exposes Moon trend, synodic progress, libration and apsis data, planet illumination/phase and orbital values, group status, and snapshot freshness metadata that the current detailed rendering does not display in full.
- `src/renderer/src/modules/astronomy/astronomy-content-policy.ts` marks details as available for Small and Medium Astronomy widgets; `AstronomyWidget.tsx` already links those sizes to `/astronomy/details` with the effective `locationId`.
- `src/renderer/src/modules/weather/WeatherWidget.tsx` gates its Astronomy section on the global Astronomy toggle and the instance's `showAstronomy` setting. `WeatherSmall.tsx`, `WeatherMedium.tsx`, and `WeatherLarge.tsx` render that section through `WeatherAstronomy`, so a location-aware Details action can be shared across all three sizes.
- `src/renderer/src/components/Sidebar.tsx` builds the available entries from `CUSTOMIZABLE_SIDEBAR_ITEM_IDS` and feature-enabled state. `src/renderer/src/routes/Settings.tsx` separately describes configurable entries and their availability. `src/shared/ipc-types.ts` normalizes persisted sidebar settings by appending newly recognized entry IDs, which supports older saved configurations without a separate migration.
- `src/renderer/src/components/Sidebar.tsx` uses Lucide icons, and the existing Astronomy widget and details page already use `MoonStar`, making it a consistent sidebar choice.
- `scripts/test-renderer-browser.mjs` already opens the Astronomy details route from a Medium Astronomy widget and checks fixture evidence and browser errors. The repository guidance in `AGENTS.md` identifies `npm run test:renderer-browser` as the renderer browser validation command.
- `git status --short` returned no changes, so no concurrent uncommitted implementation was present during this assessment.

## Impact Findings
### C1: Promote Astronomy details to the full-data page
- Classification: beneficial
- Positive impact: Consolidates the widget's Astronomy information into a readable, location-aware surface and gives the existing temporary route a complete purpose. Reusing the shared snapshot and presentation helpers avoids duplicating astronomy calculations or introducing a new data path.
- Negative impact or unintended consequence: Showing more fields creates a longer page and requires careful responsive layout. Partial or unavailable groups must remain independently understandable; stale or calculated geometry must not be presented as a live observation.
- Affected surfaces: `AstronomyDetails.tsx`, `AstronomyPrimitives.tsx`, astronomy display helpers, and renderer browser coverage.
- Dependencies and interactions: C2 and C3 depend on this route and its location query behavior.
- Confidence and rationale: High. The route, snapshot hook, shared data contract, and detailed primitives are present and directly inspectable.
- Discriminating check: With renderer fixtures, verify representative Moon, horizon, planet, event, location/timezone, and freshness fields on the page; include partial/unavailable groups and confirm the page remains usable without horizontal overflow.
- Recommendation: proceed.

### C2: Add gated Astronomy sidebar navigation
- Classification: beneficial
- Positive impact: Makes the dedicated page discoverable while keeping navigation consistent with the global Astronomy feature toggle and the app's configurable sidebar.
- Negative impact or unintended consequence: Adding an ID to persisted sidebar configuration will append the entry to existing saved orders and make it visible by default unless hidden by the user. A disabled-feature route must redirect promptly, including if the toggle changes while the user is already on the page.
- Affected surfaces: `Sidebar.tsx`, the sidebar section of `Settings.tsx`, `CUSTOMIZABLE_SIDEBAR_ITEM_IDS` and `normalizeSidebarConfig` in `ipc-types.ts`, and route handling in `App.tsx` or `AstronomyDetails.tsx`.
- Dependencies and interactions: C1; the entry should use the existing Astronomy enabled context and retain sidebar preferences while disabled.
- Confidence and rationale: High. Existing feature-gated entries and sidebar-setting normalization provide direct implementation patterns. The route behavior was clarified with the user.
- Discriminating check: With the Astronomy toggle on, verify the entry appears and opens the page; with it off, verify the entry disappears and direct navigation redirects to Dashboard; verify re-enabling restores navigation without resetting sidebar preferences.
- Recommendation: proceed.

### C3: Add widget links to Astronomy details
- Classification: beneficial
- Positive impact: Gives users a direct path from compact Astronomy and Weather views to the complete details page, while preserving the selected location.
- Negative impact or unintended consequence: Buttons may consume scarce space in compact cards. Incorrect location propagation could show the Weather default instead of the location associated with the widget.
- Affected surfaces: `AstronomyWidget.tsx`, `WeatherAstronomy.tsx` or the three Weather layouts, and renderer browser coverage.
- Dependencies and interactions: C1; action visibility must follow the existing Astronomy feature and per-Weather-instance display gates.
- Confidence and rationale: High. The Astronomy widget already has location-aware navigation, and all three Weather sizes share the `WeatherAstronomy` rendering path.
- Discriminating check: Open details from Astronomy Small and Medium and Weather Small, Medium, and Large fixtures; assert each route receives the originating widget's location ID. Also confirm the Weather action is absent when Astronomy is disabled or `showAstronomy` is off.
- Recommendation: proceed.

## Cross-Change Considerations
- C1 is the shared prerequisite for C2 and C3; all entry points should preserve the existing `/astronomy/details?locationId=...` behavior.
- The global Astronomy toggle is distinct from Weather's per-instance `showAstronomy` setting. The global toggle gates the page and all entry points; the instance setting gates only the Weather widget's Astronomy section and its Details action.
- The sidebar item should retain its configured order and hidden state when the Astronomy feature is disabled; feature gating should affect availability rather than rewrite the user's preference.
- No backend, IPC, or database changes are indicated by the current contract.

## Handoff Options
1. **Continue specification assessment**: No further clarification is currently required. Revisit only if the redirect destination or interpretation of “all info” changes.
2. **Hand off to the planning agent**: Plan C1 first, then add the gated sidebar route and widget entry points. Carry forward the confirmed direct-route guard, Dashboard fallback assumption, current snapshot contract, location propagation requirements, sidebar compatibility behavior, and browser checks for all entry points and toggle states.

## Quality Gate
- Every requested change is identified and mapped to a user outcome in C1-C3.
- The material route-access question was asked and answered; the redirect destination is explicitly labeled as an assumption.
- Current-state claims cite the owning files, symbols, and relevant browser test.
- Benefits, regressions, dependencies, and interactions are explicit for each change.
- Each recommendation includes a focused check that could disconfirm it.
- No blocking decisions remain before planning; unverified implementation details are carried forward as checks.
