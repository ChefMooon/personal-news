# Widget Design Guidelines

**Project:** personal-news

**Status:** Shared baseline (v0.2)

**Last Updated:** 2026-10-15

This guide defines the shared design and behavior baseline for new and updated
dashboard widgets. The audit status section records the six reviewed modules
and their known follow-ups; it does not claim that every existing widget
complies or that all runtime states have been verified. Treat these rules as
the default; record a content-specific exception and its reason when a widget
cannot follow one. Review existing differences incrementally rather than
assuming they are intentional.

## Sources of truth

- [`src/shared/dashboard-grid.ts`](../src/shared/dashboard-grid.ts) defines the
  canonical widget footprints, grid row height and gap, responsive column
  counts, and projected Small-width rule. Update this guide if those values
  change; do not introduce a separate widget-size table in code.
- [`AGENTS.md`](../AGENTS.md) defines repository-wide renderer boundaries,
  implementation patterns, and safe validation commands. This guide covers
  widget presentation and behavior; it does not override those rules.
- [`docs/widget-settings-spec.md`](./widget-settings-spec.md) is authoritative
  for the inline settings panel, size control, edit behavior, and allowed
  content scrolling. This guide summarizes those rules but does not replace
  them.
- [`docs/widget-code-organization-guidelines.md`](./widget-code-organization-guidelines.md)
  covers source-file responsibilities and when preset-specific components are
  useful. Keep those organization decisions separate from design behavior.
- [`src/renderer/src/components/ui/card.tsx`](../src/renderer/src/components/ui/card.tsx)
  and [`src/renderer/src/assets/main.css`](../src/renderer/src/assets/main.css)
  define shared Card primitives and dashboard card bounds. Follow their
  semantics and theme tokens rather than inventing per-widget card chrome.
- [`src/renderer/src/contexts/WidgetInstanceContext.tsx`](../src/renderer/src/contexts/WidgetInstanceContext.tsx),
  [`src/renderer/src/modules/registry.ts`](../src/renderer/src/modules/registry.ts),
  [`src/renderer/src/components/WidgetWrapper.tsx`](../src/renderer/src/components/WidgetWrapper.tsx),
  and [`src/renderer/src/routes/Dashboard.tsx`](../src/renderer/src/routes/Dashboard.tsx)
  define how modules are registered, mounted, and given per-instance state.
  The dashboard wrapper owns layout controls and the render-error boundary.

## Shared widget structure

Use the shared `Card`, `CardHeader`, `CardTitle`, and `CardContent` components.
Keep the same hierarchy across modules:

1. The header identifies the widget with its module icon and title, followed
   by persistent actions such as refresh and the settings control.
2. The content presents the selected widget size's information and states.
3. Optional settings open inline according to the settings specification.

Keep icon, title, action, and content spacing consistent with nearby widgets.
Use semantic theme utilities such as `bg-card`, `text-card-foreground`,
`text-muted-foreground`, `border`, `bg-muted`, and `text-primary`; avoid
hard-coded theme colors and one-off card treatments. Use the same visual
language for loading, empty, error, warning, and stale-data states, and make a
state understandable without color alone.

Use real buttons and links for actions. Give icon-only controls descriptive
accessible names, preserve visible keyboard focus, and keep interactive
controls keyboard-operable. Use headings and labels that identify content
sections; use `aria-label` only where a visible label does not already provide
an accessible name. Do not make a non-interactive container behave like a
button.

## Widget instance contract

Each dashboard item is an instance of a registered module. Keep the module ID
stable because saved dashboard layouts use it to identify the module. Read the
instance ID, optional user label, selected size, dashboard edit state, and
callbacks through `useWidgetInstance()`; do not add a parallel source of
instance or size state to the widget. Use the instance ID for instance-scoped
configuration and persistence so two copies of the same module can be
configured independently. Show the user label when present and otherwise use
the module's default display name.

The surrounding `WidgetWrapper` owns dashboard-level actions such as moving,
renaming, hiding, transferring, and removing a widget. Keep those actions out
of the widget card. A widget may provide content-specific actions in its own
header, but they must not duplicate the wrapper toolbar. The shared wrapper
also catches rendering exceptions; handle expected data-loading and request
failures in the widget's own content states instead of relying on that
boundary.

Use the runtime row callback only for content that truly cannot fit its
selected footprint. Runtime expansion must be derived again as content changes
and must not become saved user geometry; Astronomy is the current documented
example in the settings specification.

## Canonical size and responsive width

All modules start from the same canonical grid footprints:

| Preset | Grid footprint | Baseline height calculation | Approximate row-area height |
| ------ | -------------: | --------------------------: | --------------------------: |
| Small  |          6 × 6 |       6 × 40 px + 5 × 16 px |                      320 px |
| Medium |         12 × 9 |       9 × 40 px + 8 × 16 px |                      488 px |
| Large  |        12 × 12 |     12 × 40 px + 11 × 16 px |                      656 px |

The calculation uses the 40 px grid row and 16 px inter-row gap. It describes
the widget's grid area, not the usable content height. Subtract the card
header, card content padding, borders, and any internal section spacing when
planning content. Verify actual rendered bounds in the dashboard rather than
assuming the full row-area height is available to the widget body.

The dashboard projects the canonical 12-column layout to 12, 8, 4, or 1
columns as the viewport narrows. Small projects to half the available columns
when at least 8 columns are available; at 4 or 1 column it uses the full row.
Medium and Large use the available row width. Content must reflow within the
projected width: long labels wrap or truncate intentionally, and tables,
controls, and settings must not cause page-level horizontal overflow. Any
intentional horizontal scroller, such as a timeline or media strip, must remain
inside its own clearly bounded region.

The selected preset is per widget instance and changes its grid footprint. It
must not silently modify saved detail level, filters, view mode, density, or
other content settings. Astronomy's runtime height expansion for detailed
content is an explicit exception documented in the settings specification;
it is recomputed and is not saved as user geometry.

Use the presets to set presentation intent, not to require the same fields or
item count in every size:

| Preset | Presentation intent                                                                      |
| ------ | ---------------------------------------------------------------------------------------- |
| Small  | A glanceable summary of essential current information.                                   |
| Medium | A balanced overview with related information grouped together.                           |
| Large  | Expanded detail, such as a fuller chart, list, or breakdown when the module supports it. |

The selected size may intentionally cap or summarize content according to its
policy. Expose a More/Details path when additional content is available and
useful; do not change saved detail or other settings just because the preset
changed.

## Content density and bounded layout

Treat the available area as a real design constraint. Choose what to show from
the widget's content policy for that preset and width. Preserve the meaning and
selected information when rearranging the same size policy for a different
responsive width. A compact responsive layout may combine fields or use another
arrangement, but must not silently drop information that the active policy
selected. Intentional size-based summaries or caps are allowed as described
above, with a More/Details path where appropriate.

Define an explicit content policy when size or available width changes what is
shown, how it is arranged, or where it can scroll. Keep those decisions
separate from JSX rendering so the size, width, saved content settings, data
availability, and disclosure state produce one reviewable policy. Base
responsive decisions on the card's available content width when it can differ
from the window width. Keep saved detail, filters, view mode, density, and fetch
limits separate from the selected widget size.

Collapsed summaries should fit normally. Do not solve overflow by clipping
sections, hiding the last row, shrinking text until it is hard to read, or
adding an arbitrary fixed chart height. If the layout has unused height, let a
meaningful primary region fill it (for example, a forecast chart or evenly
spaced compact timeline). Align related regions when a widget uses adjacent
columns. Keep headings, tabs, controls, and summary sections at their natural
height; give the remaining height to the intended flexible region.

For a bounded card, a flex column can express that relationship:

```tsx
<Card className="flex h-full min-h-0 flex-col overflow-hidden">
  <CardHeader className="shrink-0">...</CardHeader>
  <CardContent className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="shrink-0">
        <Summary />
      </div>
      <div className="min-h-0 flex-1">
        <PrimaryContent />
      </div>
    </div>
  </CardContent>
</Card>
```

This is a layout pattern, not a requirement to force every widget to fill its
card. Keep content at natural height when that is clearer. `min-h-0` is
important in nested flex/grid layouts so children can fit within the assigned
area. If a view is intentionally scrollable, put scrolling on its designated
content viewport and keep headers and controls outside that viewport. Do not
use card-level overflow clipping as a substitute for fitting or an intentional
scroll owner.

Follow the settings specification's behavior: collapsed Small/Medium capped
content does not scroll; it exposes a More/Details path when needed. Expanded
or Large content may scroll in its designated viewport. Lists with a clear
scroll interaction and long expanded details are valid exceptions to
fit-everything behavior. Horizontal timeline/media scrolling is also
intentional when it remains local to that region.

## Settings and size changes

When a widget has configurable options, use the inline settings pattern in
[`docs/widget-settings-spec.md`](./widget-settings-spec.md): settings stay
inside the card, opening them does not change the widget's dashboard geometry,
changes take effect immediately, and reset/close actions follow the shared
pattern. Keep the live preview usable at the selected size; the settings pane
must fit its allocated area and may scroll internally when its controls need
more room.

Changing Small, Medium, or Large changes the instance's grid footprint and
presentation only. It must preserve the instance's saved settings and data.
When settings open or close, the card size remains stable. Test both transitions
after changing size, as well as keyboard dismissal and focusable controls.

## Data and interaction states

Make the states that apply to the widget distinct and understandable:

- **Loading:** distinguish the initial load from a background refresh. When
  usable data is already visible, keep it available while refreshing and show
  refresh progress without replacing the whole widget with a loading screen.
- **Empty or not configured:** explain what is missing and offer the relevant
  setup action when one is available. Do not present a valid empty result as an
  error.
- **Error:** explain the failure in plain language and provide a retry or
  recovery action when supported. If older data is still usable, keep it
  visible and identify that the refresh failed or the data may be stale.
- **Partial, stale, or warning:** identify which information is unavailable or
  out of date when that affects how the user should interpret the widget.

Use text and semantic status/alert behavior for meaningful state changes;
color and icons may reinforce a message but must not carry it alone. Use
`role="status"` for non-urgent dynamic updates and reserve `role="alert"` for
important errors that need immediate attention. Actions must use buttons or
links with clear names, visible focus, and a clear disabled or in-progress
state when an operation cannot be repeated. Use the shared button and dialog
primitives for confirmations, and keep external destinations as links or the
app's established external-link action.

## Author and review checklist

Use this short checklist when adding a widget or changing its design. The
regression checklist below gives the detailed layout checks.

- [ ] Register a stable module ID and use the shared instance context; keep
  settings and other persisted configuration instance-scoped.
- [ ] Use the shared Card shell, theme tokens, header hierarchy, and accessible
  controls. Leave dashboard layout actions to `WidgetWrapper`.
- [ ] Define what Small, Medium, and Large show, including any caps,
  disclosure path, scrolling region, and width-dependent rearrangement.
- [ ] Confirm size and width changes preserve saved content settings and do not
  silently drop information selected by the active content policy.
- [ ] Implement the applicable loading, empty, error, partial, and stale states
  with a clear next step where one exists.
- [ ] Check keyboard operation, focus visibility, accessible names, and
  announcements for meaningful state changes.
- [ ] Follow the settings specification and verify open/close and size changes
  keep the card geometry stable.
- [ ] Review the widget at each preset and supported responsive column count,
  including both sides of any content-width breakpoint.
- [ ] Validate in the isolated widget harness; for a new module, add fixture
  coverage so its preset and responsive behavior can be checked there. Capture
  screenshots for the visual states changed and record anything not checked.

## Existing widget audit status

Static audit completed on 2026-10-15 against this guide, the widget settings
specification, and the current widget sources. This records known exceptions
and follow-ups; it does not claim that runtime visual states were exercised.
Refresh a row after a follow-up is completed, and add a row when a widget is
introduced.

| Module | Status | Deliberate behavior and known follow-up |
| ------ | ------ | --------------------------------------- |
| YouTube | Update needed | Small and Medium use channel caps with a Show more path; the local video carousel is appropriate. Push updates set loading and replace visible channels with a loading message, and fetch failures are only transient toasts. Preserve loaded channels during background refresh and make refresh failure discoverable. |
| Reddit Digest | Update needed | Small uses one group at a time with a bounded horizontal group selector; Medium changes to tabs below 440 px of card content width. In column mode, only the first 3–5 groups are rendered when more groups exist, with no disclosure. Filter/week changes show a loading state while push updates use silent fetches; failures are only transient toasts. Keep every group discoverable and make relevant request failures discoverable in the widget. |
| Saved Posts | Update needed | Medium's two-column arrangement and Large's local vertical scrolling are useful. Small (3), Medium (8), and Large (6) all cap the rendered list without a More/Details path; the optional View All action cannot guarantee access to omitted posts. Use the available counts in the content policy and disclose size-based caps. |
| Sports | Follows baseline; policy cleanup | Small's paged summary, Medium's disclosure panel, and Large's fixed live-game area with a separate details viewport are good size-specific choices. The Medium disclosure and item limits are calculated separately from the content policy; consolidate those decisions or remove policy fields the renderer does not use. |
| Weather | Update needed | The bounded horizontal forecast timeline and Medium's width-sensitive stacking are good content-specific choices. Push-triggered refreshes set `loading` even when a snapshot exists, replacing the forecast with a loading message; failures are only transient toasts. Keep the snapshot visible during refresh and expose refresh failures in the widget. |
| Astronomy | Follows baseline; policy cleanup | Medium and Large detailed share the “Sun & Moon positions” elevation view, with vertical markers around one shared 0° horizon line, plain-language altitude, and full compass direction names. The paired body cards reflow from one to two columns using a container-width query; Medium stacking follows measured card content width. Small/Medium Details navigation and Large's detailed view remain appropriate. Runtime row growth is an intentional exception documented in the settings specification. Remaining policy follow-up: the Medium policy says disclosed content uses a viewport, but the Details action navigates away and the card viewport remains visible; align the policy with the actual navigation behavior. |

The Reddit group selector is a navigation control, not a media-content scroller;
keep it bounded within the card and retain its current-group indicator. The
settings specification documents this narrow horizontal-navigation exception.

## Regression checklist

For a widget change, cover the relevant items and note anything that remains
untested:

- Render Small, Medium, and Large at wide, medium, narrow, and single-column
  dashboard widths. Include both sides of any content-specific breakpoint.
- Check the normal state and meaningful variants: loading, empty, error,
  warning/alert, longest realistic labels or values, and detailed content.
- Confirm the last required field/row/forecast is visible at the initial
  scroll position, with bottom padding intact. A bounded summary should not
  need vertical scrolling to reveal required content.
- Check that no section is clipped by an ancestor, the card stays within its
  assigned bounds, and horizontal scrolling is confined to its intended
  region. Verify column bottoms align when the design calls for it.
- Exercise tabs, filters, expand/collapse, and More/Details paths. Confirm that
  responsive rearrangements retain the information selected by the active size
  policy, while intentional size-based caps remain discoverable.
- Open settings, change the widget size, use the settings controls, then close
  settings. Check that geometry and saved config behave as specified and that
  keyboard access remains available.
- Capture screenshots for each preset and responsive width touched. Add a
  focused geometry or interaction regression when a layout bug was fixed, so
  it asserts visible content and initial bounds rather than reproducing the
  implementation's CSS classes.

## Maintaining this guide

The six shipped modules listed above have a static audit record. Recheck their
rows as follow-ups land; add newly introduced modules as `Not yet audited` until
their preset policies, data states, responsive behavior, settings, and
accessibility have been reviewed. Record exceptions with the reason they help
the user and the behavior that keeps them bounded. Avoid a shared abstraction
until real widget implementations show that it improves reuse without hiding
their content-specific fit decisions.
