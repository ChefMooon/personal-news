---
name: Widget editor Escape handling
type: brainstorm
status: DRAFT
ready_for_planning: yes
created: 2026-11-12
plans: []
---
# Brainstorm Scope: Widget editor Escape handling

## Goal
- **Intended outcome:** pressing Escape inside a widget's settings editor closes only the innermost thing that is open. The editor itself closes on Escape only when nothing nested is open.
- **Affected users:** anyone editing widget settings with the keyboard, in all six widgets (Weather, YouTube, Reddit Digest, Sports, Saved Posts, Astronomy).
- **Why it matters:** today Escape to dismiss a dropdown or the Restore Defaults dialog very likely throws you out of the editor, which is surprising and interrupts the edit.

## In Scope
- One shared editor-Escape behaviour, adopted by all six widgets in place of their six separate copies.
- Escape with a nested overlay open (Select, alert dialog) closes that overlay and leaves the editor open.
- Escape with nothing nested open closes the editor, as today.
- Escape while the cursor is in a text field inside the editor still closes the editor, as today.
- A browser test: open the Weather editor, open a Select, press Escape, and the editor stays open.

## Out of Scope
- Reset controls in the Weather editor (duplicate reset actions, reused refresh icon, "cannot be undone" wording).
- Empty-state messages in the Weather widget.
- Splitting the Weather header into smaller components.
- Custom menus and popovers outside the editors (for example the Saved Posts item menu and the Weather summary popover): parked for later.
- Two-step Escape for text fields.
- No change to how the editor closes from the X button.

## Repository Context
- **Confirmed:** all six widgets have a bare window-level Escape listener active while editing, checking only the key. Weather's is at `src/renderer/src/modules/weather/WeatherWidget.tsx:97-104`; the others are in `YouTubeWidget.tsx:134-141`, `RedditDigestWidget.tsx:110-121`, `SportsWidget.tsx:96-108`, `SavedPostsWidget.tsx:122-128` and `AstronomyWidget.tsx:177-185`.
- **Confirmed:** no shared hook or helper exists for this, and nothing in the renderer checks whether an Escape event was already handled (no `defaultPrevented` matches in `src/renderer/src`).
- **Confirmed:** the Weather settings panel uses four Radix Selects (`WeatherSettingsPanel.tsx:9-15`, backed by `@radix-ui/react-select`), and the Restore Defaults alert dialog (`@radix-ui/react-alert-dialog`) lives in the widget's edit header (`WeatherWidget.tsx:232-257`).
- **Confirmed:** the Weather location search is a plain input with an inline results list (`WeatherSettingsPanel.tsx:135-182`), with no key handling of its own.
- **Confirmed:** `scripts/test-weather-browser.mjs:318-324` presses Escape in the Weather editor with nothing nested open; no scenario covers a nested overlay.
- **Likely:** an open Radix Select or dialog handles Escape itself and marks the event as handled before the widget's listener runs (node_modules not inspected).
- **Unknown:** what overlays the other five settings panels contain.
- **Unknown:** whether the bug reproduces at runtime; nothing was run.

## Acceptance Criteria
- In each of the six widget editors, Escape with a dropdown or dialog open closes only that dropdown or dialog.
- A second Escape then closes the editor.
- Escape with nothing nested open closes the editor in one press, in all six widgets.
- Escape in the Weather location search closes the editor.
- The existing weather browser Escape scenario still passes, and the new nested-overlay scenario passes.

## Assumptions and Decisions
- **Settled:** fix all six widgets through one shared rule, not Weather alone.
- **Settled:** text fields do not hold Escape back.
- **Assumption (not blocking):** Radix marks the Escape event as handled. If it doesn't, the shared rule needs another way to know an overlay is open.
- **Open (not blocking):** whether other panels have overlays that need the same treatment, such as custom non-Radix menus.
- **Open (not blocking):** whether to add the nested-overlay test for widgets other than Weather.

## Authorization and Handoff
- **Limits:** nothing has been changed; this brainstorm was read-only. No implementation, commits or branches are authorized yet.
- **Ready for planning:** yes. Scope-shaper should first confirm the bug in the browser preview and check the Radix assumption.

## Ledger
- **Settled:** started from a review of `WeatherWidget.tsx`; Escape handling chosen as the first thread.
- **Leaning:** none.
- **Open (not blocking):** hook-name searches (`useEscape`, `useDismiss`) were not run, so "no shared helper" rests on a keyword grep; whether widget editors are reachable during dashboard edit mode.
- **Parked:** Weather reset controls (collapse to one undoable flow, stop reusing the refresh icon); Weather empty states (actionable no-data and no-location messages); header structure cleanup.
- **Assumptions:** other Escape handlers outside editors (`AddWidgetModal`, `NotificationsFlyout`, `DashboardToolbarActions`, `WidgetWrapper` rename input, `TagManagementModal`) are unaffected and stay as they are.
