# Sidebar Replication Guide

This document describes the visual language and behavior of the application's sidebar so it can be recreated in another application. It is written as a functional UI specification, with implementation details based on the current React/Electron sidebar.

## 1. Design Direction

The sidebar is a quiet, utility-first navigation rail:

- It is a full-height vertical panel attached to the left edge of the application.
- It uses the application's card/background surface rather than a separate decorative color.
- Navigation is compact, scannable, and icon-led.
- Active navigation is obvious but restrained: use the primary brand color and its readable foreground color.
- Inactive items use muted text, with an accent-colored hover surface and foreground text on hover.
- The only persistent control outside the navigation list is the collapse/expand button in the header.
- Settings is separated from the main navigation by a top border and remains pinned to the bottom.

The result should feel like application chrome, not a marketing sidebar.

## 2. Layout Specification

| Element | Expanded | Collapsed |
| --- | ---: | ---: |
| Sidebar width | `200px` | `56px` (`w-14`) |
| Height | `100%` of the containing window | `100%` of the containing window |
| Header height | approximately `52px` | approximately `52px` |
| Header horizontal padding | `8px` | `8px` |
| Header vertical padding | `6px` top and bottom | `6px` top and bottom |
| Navigation vertical padding | `8px` top and bottom | `8px` top and bottom |
| Item icon | `20px` by `20px` | `20px` by `20px` |
| Item height | `40px` minimum | `40px` |
| Item horizontal gap | `12px` between icon and label | none |
| Item horizontal padding | `12px` | centered |
| Item corner radius | `6px` (`rounded-md`) | `6px` |
| Item side margin | `4px` | centered with `4px` available margin |
| Collapse animation | `200ms`, ease-out | `200ms`, ease-out |

Additional layout rules:

- The sidebar must not shrink when the main content becomes narrow.
- Use a right border to separate it from the main content.
- Hide horizontal overflow so expanded labels cannot leak into the content area during or after collapse.
- The main navigation consumes the flexible vertical space.
- The bottom Settings section has a top border and `8px` vertical padding.
- The sidebar does not need a mobile drawer in this reference implementation. If the target application has a mobile layout, convert it to a drawer or overlay below the application's own mobile breakpoint while preserving the same item states.

## 3. Visual Tokens

Use the destination application's design tokens where possible. The reference implementation maps to these semantic tokens:

| Purpose | Semantic token |
| --- | --- |
| Sidebar surface | `card` |
| Divider | `border` |
| Default label/icon | `muted-foreground` |
| Hover surface | `accent` |
| Hover label/icon | `foreground` |
| Active surface | `primary` |
| Active label/icon | `primary-foreground` |
| Attention surface | amber at roughly `10%` opacity |
| Attention hover surface | amber at roughly `20%` opacity |
| Tooltip surface | `popover` |
| Tooltip text | `popover-foreground` |

Do not hardcode light or dark colors into the component if the destination app supports themes. Resolve these semantic tokens through CSS variables or the local design system.

## 4. Navigation Item Anatomy

Each item is a route link with this structure:

```text
[icon] [label................................]
```

Expanded state:

- Render a `20px` icon with `flex-shrink: 0`.
- Render the label in a `14px` text style.
- Let the label occupy remaining width and truncate overflow with an ellipsis.
- Keep the row at a stable height so labels never shift neighboring items.

Collapsed state:

- Keep the icon visible and centered in a `40px` by `40px` hit area.
- Remove the visible label entirely; do not leave a narrow clipped label.
- Preserve the same route, active state, hover state, and keyboard behavior.
- Show the full label in a tooltip on hover/focus.

Recommended icon size is `20px`. Use one consistent icon family. The reference uses Lucide icons:

| Item | Reference icon |
| --- | --- |
| Dashboard | `LayoutDashboard` |
| YouTube | `Youtube` |
| Reddit Digest | `Newspaper` |
| Saved Posts | `Bookmark` |
| Sports | `Trophy` |
| Script Manager | `Terminal` |
| Settings | `Settings` |
| Expand | `ChevronRight` |
| Collapse | `ChevronLeft` |

Icons are supplemental. The accessible name must come from the visible label in expanded mode and from the tooltip/ARIA label in collapsed mode.

## 5. Item States

### Default

- Text and icon use the muted foreground token.
- No filled background.
- The item remains easy to scan against the sidebar surface.

### Hover and focus

- Apply the accent surface.
- Apply the normal foreground color to text and icon.
- Use a short color transition, approximately `150ms`.
- Provide a visible keyboard focus indicator consistent with the destination application's focus style. Do not rely on hover alone.

### Active route

- Apply the primary surface.
- Apply the primary foreground color.
- Keep the active state stronger than hover and attention states.
- Match the root route exactly and avoid treating every route as a child of `/`. In React Router this is equivalent to using `end` for the `/` link.

### Attention state

The Script Manager item can show an attention state when it contains stale scripts:

- Use a subtle amber background at approximately `10%` opacity.
- Use muted foreground text by default.
- On hover, increase the amber surface to approximately `20%` opacity and use the normal foreground.
- Active route styling takes precedence over attention styling.
- The attention state is a visual cue, not a replacement for an accessible status message or notification mechanism.

### Disabled or unavailable feature

Feature availability is not represented as a disabled row in the live sidebar. An unavailable feature is filtered out entirely. Keep the item in the saved order/configuration so it can reappear when the feature is enabled.

## 6. Collapse and Expand Behavior

The header contains one icon-only button:

- Expanded mode shows `ChevronLeft` and the label `Collapse sidebar`.
- Collapsed mode shows `ChevronRight` and the label `Expand sidebar`.
- Use `aria-label` and `aria-pressed` so the state is understandable to assistive technology.
- Keep the button in a stable `36px` by `36px` hit area.
- In expanded mode, align it to the right of the header.
- In collapsed mode, center it in the header.
- Animate only the width and the related layout transition. Use approximately `200ms` ease-out.
- Persist the new state immediately after the user toggles it.

The collapsed sidebar should still expose all visible routes through icon buttons/links. Never make collapse remove functionality.

## 7. Navigation Composition Rules

Build the live list in this order:

1. Start with the complete registry of known navigation items.
2. Build a set of currently available feature IDs from feature flags or module availability.
3. Read the persisted item order.
4. Resolve each ID to its registered item definition.
5. Remove unknown IDs.
6. Remove items that are currently unavailable.
7. Remove items explicitly listed as hidden.
8. Render the remaining items in the resulting order.

Conceptual pseudocode:

```ts
const availableIds = new Set([
  "dashboard",
  "youtube",
  "scripts",
  ...(redditDigestEnabled ? ["reddit-digest"] : []),
  ...(savedPostsEnabled ? ["saved-posts"] : []),
  ...(sportsEnabled ? ["sports"] : []),
]);

const hiddenIds = new Set(config.hiddenItemIds);

const visibleItems = config.itemOrder
  .map((id) => allItems.find((item) => item.id === id))
  .filter((item) => item != null)
  .filter((item) => availableIds.has(item.id) && !hiddenIds.has(item.id));
```

Settings is intentionally outside this customizable list. Render it in a separate bottom section so users can always recover the navigation configuration.

## 8. Configuration Model

Persist one normalized object per user/profile:

```ts
interface SidebarConfig {
  itemOrder: SidebarItemId[];
  hiddenItemIds: SidebarItemId[];
  collapsed: boolean;
}
```

The default configuration should contain every known customizable item in its canonical order, no hidden items, and `collapsed: false`.

Normalize configuration at read and write boundaries:

- Discard IDs that are not recognized.
- Remove duplicate IDs from the order.
- Remove duplicate hidden IDs.
- Append any newly introduced item IDs that are missing from the saved order.
- Treat a non-boolean collapse value as `false`.
- Keep hidden items in `itemOrder`; hiding changes visibility, not order.

This makes the configuration forward-compatible when new navigation items are added and resilient to malformed or older saved data.

## 9. Settings and Editing Controls

Provide a Sidebar settings screen or section with these controls:

- Drag handles for vertical drag-and-drop ordering.
- Keyboard-accessible Up and Down buttons for each item.
- A Show in sidebar switch for each item.
- A visible status such as `Visible in sidebar` or `Hidden from sidebar`.
- A feature availability status for items controlled by feature flags.
- A `Reset to default` action.

Behavior:

- Disable Up for the first item and Down for the last item.
- Reordering changes `itemOrder` but does not change hidden state.
- Hiding an item removes it from the live sidebar but does not remove it from the editor.
- A feature-disabled item stays in the editor and remains marked unavailable, but it cannot appear in the live sidebar.
- Reset restores the default order, clears hidden IDs, and expands the sidebar.
- Save changes optimistically, then report persistence errors with a user-visible toast or inline error.

## 10. Persistence and Loading

A reusable implementation should have one provider/store owning this state:

```text
initial state -> load persisted config -> normalize -> render
user action   -> normalize next config -> update UI immediately -> persist
persist error -> show error feedback; retain a recoverable local state
```

The reference implementation loads once when its provider mounts, uses the default configuration while loading, and persists each mutation immediately. The provider exposes these operations:

```ts
moveItem(itemId, direction: "up" | "down")
setItemOrder(itemOrder)
setItemHidden(itemId, hidden)
resetConfig()
setCollapsed(collapsed)
```

If the destination app has a backend, use its existing settings API. If it is browser-based, local storage or an existing preferences store is sufficient. Keep persistence behind a store/provider so the sidebar component only consumes configuration and actions.

## 11. Tooltip Behavior

In collapsed mode, wrap each navigation link with a tooltip:

- Trigger on hover and keyboard focus.
- Position it to the right of the sidebar.
- Use a small text style, compact padding, a border, and a shadow.
- Use a short side offset, approximately `10px`.
- The tooltip text is the exact navigation label.
- The tooltip must not be the only accessible name; also provide an ARIA label or equivalent accessible link name.

Do not show redundant tooltips while the sidebar is expanded because the label is already visible.

## 12. Accessibility Requirements

Target WCAG 2.1 AA behavior:

- Use a semantic `<nav>` landmark for the main links.
- Use real links for routes, not clickable generic elements.
- Give the collapse button an accessible name and pressed state.
- Preserve keyboard access to every route in both modes.
- Ensure focus indicators remain visible against active, hover, and card surfaces.
- Keep icon-only controls at least `36px` by `36px`; prefer `40px` navigation hit areas.
- Do not communicate attention through color alone. Pair stale-script highlighting with an accessible status, badge, or notification mechanism where needed.
- Ensure active and muted text meet the destination application's contrast requirements.
- Tooltip content should be available on focus, not only pointer hover.
- Test with the sidebar fully expanded, fully collapsed, with every optional feature disabled, and with long labels.

## 13. Reference Component Structure

```text
Sidebar
|-- header
|   |-- collapse/expand button
|-- TooltipProvider
|   |-- nav
|   |   |-- SidebarNavLink[]
|   |-- pinned settings section
|       |-- SidebarNavLink(Settings)
```

A navigation item definition should remain data-driven:

```ts
interface NavItem {
  id: SidebarItemId;
  to: string;
  label: string;
  icon: React.ReactNode;
  attention?: boolean;
}
```

Keep route definitions, feature availability, and persisted order separate. This prevents the visual component from becoming a second routing registry.

## 14. Acceptance Checklist

### Visual

- [ ] Full-height left rail with a right divider.
- [ ] Width is approximately `200px` expanded and `56px` collapsed.
- [ ] Icons are consistently `20px`.
- [ ] Rows are approximately `40px` high with `6px` corner radius.
- [ ] Active, hover, default, and attention states are visually distinct.
- [ ] Settings is separated and pinned to the bottom.
- [ ] Collapse transition completes in approximately `200ms`.

### Behavior

- [ ] Collapse/expand preserves all visible routes.
- [ ] Collapsed items expose labels through tooltips and accessible names.
- [ ] Root route active matching is exact.
- [ ] Feature-disabled items are omitted from the live list.
- [ ] Hidden items are omitted from the live list but remain configurable and routable.
- [ ] Saved ordering is respected after reload.
- [ ] New item IDs are appended during normalization.
- [ ] Reset restores default order, visibility, and expanded state.
- [ ] Persistence failures are visible to the user.

### Accessibility

- [ ] Main links are inside a navigation landmark.
- [ ] All controls are keyboard reachable.
- [ ] Focus styles are visible in every state.
- [ ] Collapse state is exposed with `aria-pressed` or an equivalent state property.
- [ ] Attention is not conveyed by color alone.
- [ ] Long labels truncate without changing row height.
