# Widget Code Organization Guidelines

**Project:** personal-news

**Status:** Shared baseline (v0.1)

**Last Updated:** 2026-10-15

This guide covers how widget implementation files are divided by
responsibility. It complements [Widget Design Guidelines](./widget-design-guidelines.md),
which defines the shared visual and interaction behavior. Keep the code
structure easy to follow without forcing every widget into the same file tree.

## Sources of truth

- [`AGENTS.md`](../AGENTS.md) defines the Electron and renderer boundaries,
  IPC patterns, and repository validation commands.
- [Widget Design Guidelines](./widget-design-guidelines.md) defines the shared
  card, size, responsive-width, state, and accessibility behavior.
- [`docs/widget-settings-spec.md`](./widget-settings-spec.md) defines the
  settings-panel contract and persistence behavior.
- [`src/renderer/src/contexts/WidgetInstanceContext.tsx`](../src/renderer/src/contexts/WidgetInstanceContext.tsx)
  is the source for instance-specific values supplied to a widget.

## Organize by responsibility

Keep module-specific implementation in `src/renderer/src/modules/<module>/`.
Use the following responsibilities as boundaries when they make the code
clearer; a small widget does not need a file for every row.

| Responsibility | Typical location | Keep it focused on |
| -------------- | ---------------- | ------------------ |
| Widget shell and orchestration | `<Name>Widget.tsx` | Reading `useWidgetInstance()`, composing the shared Card and header, coordinating data/config hooks, settings state, and the selected content policy. |
| Size and width policy | `<name>-content-policy.ts` | Pure decisions about selected content, caps, disclosure, arrangement, and overflow. Keep rendering and side effects out. |
| Preset-specific composition | `<Name>Small.tsx`, `<Name>Medium.tsx`, `<Name>Large.tsx` when justified | A genuinely distinct composition or interaction model for that preset. Pass focused typed data and callbacks from the shell. |
| Repeated module presentation | Named component files such as `WeatherSummary.tsx` | A coherent visual unit reused in multiple layouts or complex enough to understand independently. |
| Widget configuration | `src/renderer/src/hooks/use<Name>Config.ts` | Per-instance config defaults, loading, persistence, and updates. |
| Settings UI | `<Name>SettingsPanel.tsx` | The settings controls for that widget, following the settings specification. |
| Tests | `__tests__/` or colocated `*.test.ts` | Policy, formatting, and interaction rules that can be checked independently. |

The widget shell should remain the single owner of the Card, header, shared
settings controls, and coordination of instance-specific configuration. Leaf
layout components may own focused local interaction state. A size-specific
component should not duplicate the shared shell. Have the shell choose and
render the content layout. Keep module registration at the existing registry
boundary and module IDs stable.

## When to split Small, Medium, and Large layouts

Use separate preset components when the layout's structure, information
hierarchy, or interaction model materially changes by size. Examples include a
compact single-column summary, a medium two-region view with disclosure, and a
large detail view with its own scroll viewport.

Keep a single shared layout when presets use the same structure and differ only
in a few policy values such as density, item count, or a small style choice.
Do not create size-named files that only re-export functions defined in a large
widget file. A size-specific file should own the corresponding presentation
code, or it should not exist.

Separate policy from layout. A policy can select the content and overflow rules
for each preset and available width; layout components render those decisions.
Keep the same saved filters, detail level, and other content settings outside
the size policy, as described in the design guide.

## Keep files cohesive as widgets grow

There is no hard line-count limit. Treat a component or settings panel nearing
500 lines as a review prompt, not an automatic refactor requirement. Split when
one file combines several independent responsibilities, has deeply nested
size/state branches, requires many unrelated props to render one region, or is
hard to understand or test as a unit. Keep small, cohesive implementations
together even if extracting them would reduce a line count.

Prefer module-local components until another widget demonstrates the same
behavior and semantics. Move a component to shared UI only when reuse is real
and its contract is stable. Avoid extracting a one-off wrapper solely to make
the parent shorter; the new component should own a clear visual or behavioral
unit.

## Code organization review checklist

- [ ] The widget shell owns instance context, the shared Card/header, settings
  state, and composition; dashboard layout actions remain in `WidgetWrapper`.
- [ ] Size and width decisions are expressed in a focused content policy when
  they materially affect content, arrangement, disclosure, or overflow.
- [ ] Small, Medium, and Large are separate components only when their
  presentation or interaction meaningfully differs.
- [ ] Shared presentation is factored by a coherent visual or behavioral unit,
  not by arbitrary line count.
- [ ] Settings, persistence hooks, pure policies, and complex reusable pieces
  are separated when doing so makes ownership clearer.
- [ ] Files nearing 500 lines have been reviewed for responsibility
  boundaries; any split preserves behavior and avoids unnecessary prop
  plumbing or duplicate shells.
- [ ] New or updated pure policy behavior has focused coverage following the
  repository's existing test patterns.

## Initial code organization review observations

These observations are from a static review of the six shipped widgets on
2026-10-15. They identify review candidates, not required refactors based only
on file length.

| Module | Current structure | Review direction |
| ------ | ----------------- | ---------------- |
| YouTube | The main widget is a focused shell; channel and video pieces are separate. The settings panel is large and owns many related controls. | Keep the existing shared card and channel components. If the settings panel grows further, split by cohesive settings sections rather than by arbitrary line count. |
| Reddit Digest | The main widget combines policy selection, size/mode rendering, and a Small group selector; post columns are separate. The settings panel is large. | Preserve the content policy and post-column component. Consider extracting the Small group selector or the columns/tabs body only if it gives that behavior a clearer owner. |
| Saved Posts | The main widget combines settings shell, data state, and list rendering; post actions and the settings panel are already separate. | Fix the content-disclosure policy first. A focused list/state renderer is a candidate if the widget continues to grow; do not create one component per preset without distinct layouts. |
| Sports | The widget already uses compact, live-game, team, and all-games components, but the main widget and `MyTeamsView` are large. | Keep its meaningful view components. Review `MyTeamsView` and the Medium disclosure block for cohesive extraction rather than splitting every preset mechanically. |
| Weather | Small, Medium, and Large have real layout components, with shared forecast and summary components. | This is a useful example of size components backed by shared module components and a separate content policy. |
| Astronomy | The main widget is very large and contains primitives, presentation, settings, and orchestration; the size-named files are re-exports rather than owning the layouts. | Highest-priority organization review: move real presentation and primitive responsibilities into cohesive modules, keeping the widget shell focused. Do not simply move the existing code into thin size wrappers. |

Revisit these observations after behavioral follow-ups. Make refactors separately
from content-policy fixes when possible so each change has a clear purpose and
can be reviewed on its own.
