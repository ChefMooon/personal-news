# Widget Design Guidelines

**Project:** personal-news

**Status:** Initial baseline (v0.1)

**Last Updated:** 2026-10-14

This guide records shared dashboard-widget expectations and a starting point
for future consistency work. It is not an audit or a claim that every existing
widget already follows these rules. Review widgets incrementally and record
known differences before changing them.

## Sources of truth

- [`src/shared/dashboard-grid.ts`](../src/shared/dashboard-grid.ts) defines the
  canonical widget footprints, grid row height and gap, responsive column
  counts, and projected Small-width rule. Update this guide if those values
  change; do not introduce a separate widget-size table in code.
- [`docs/widget-settings-spec.md`](./widget-settings-spec.md) is authoritative
  for the inline settings panel, size control, edit behavior, and allowed
  content scrolling. This guide summarizes those rules but does not replace
  them.
- [`src/renderer/src/components/ui/card.tsx`](../src/renderer/src/components/ui/card.tsx)
  and [`src/renderer/src/assets/main.css`](../src/renderer/src/assets/main.css)
  define shared Card primitives and dashboard card bounds. Follow their
  semantics and theme tokens rather than inventing per-widget card chrome.

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

## Planned follow-up

This is the initial shared baseline. Future passes can audit existing modules,
document deliberate exceptions, and extract common tokens or helpers where
several widgets demonstrate the same need. Avoid a shared abstraction until
real widget implementations show that it improves reuse without hiding their
content-specific fit decisions.
