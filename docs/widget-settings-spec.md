# Widget Settings Spec — Personal News Dashboard

**Project:** personal-news
**Status:** Active
**Last Updated:** 2026-03-24
**Related Docs:** [ui-ux.md](./ui-ux.md) | [architecture/frontend.md](./architecture/frontend.md)

---

## 1. Overview

Every dashboard widget that has user-configurable options **must** use the inline settings panel pattern described in this document. This ensures a consistent UX across all widgets: settings open inside the card itself, the widget size does not change when settings open, and the user can always revert changes.

The YouTube, Reddit Digest, and Saved Posts widgets are the current reference implementations. Their config hooks are all instance-scoped so multiple copies of the same widget type can coexist safely on the dashboard.

---

## 2. Interaction Model

Settings are opened and closed inline — there is no modal overlay. The settings panel slides into the right side of the widget's `CardContent` area, leaving the live content visible on the left.

| State | Header right side | CardContent |
|-------|-------------------|-------------|
| Normal | `<Settings2>` button | Widget content (full width) |
| Editing | `<RotateCcw>` + `<RefreshCcw>` (in AlertDialog) + `<X>` | Two-column grid: preview (left) + settings panel (right, 300 px) |

Changes to settings take effect **immediately** — there is no Save button. Revert controls give the user an escape hatch without requiring an explicit save/cancel flow.

---

## 3. Header Controls

### 3.1 Normal mode

A single `<Settings2>` icon button sits at the right edge of the `CardHeader`. It must:

- Use `p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors` for visual consistency with all other icon buttons in the app.
- Have a descriptive `aria-label`, e.g. `"My widget settings"`.
- Call `handleOpenEdit()` on click (see §5).

Any persistent secondary actions the widget exposes in the header (e.g. a "View All" link) stay visible and to the **left** of the settings button. They are hidden while editing.

Example header structure (normal mode):

```tsx
<div className="flex items-center gap-2">
  {config.showViewAllLink && (
    <button className="text-xs text-primary hover:underline" onClick={...}>
      View All
    </button>
  )}
  <button
    className="p-1 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
    aria-label="My widget settings"
    onClick={handleOpenEdit}
  >
    <Settings2 className="h-4 w-4" />
  </button>
</div>
```

### 3.2 Edit mode

The `<Settings2>` button is replaced by a three-button row (no extra wrapper padding between items, `gap-0.5`):

| Position | Icon | Action | Tooltip / aria-label |
|----------|------|--------|----------------------|
| 1st | `<RotateCcw>` | Revert all changes made since opening | "Reset to when you opened this" |
| 2nd | `<RefreshCcw>` | Restore factory defaults (requires confirmation) | "Restore defaults" |
| 3rd | `<X>` | Close settings panel | "Close settings" |

All three use the same button class as the settings trigger above.

The `<RefreshCcw>` factory reset button **must** be wrapped in an `<AlertDialog>` with:

- Title: `Restore Defaults`
- Description: `Reset all [Widget Name] widget settings to their defaults? This cannot be undone.`
- Two actions: `Cancel` (AlertDialogCancel) and `Confirm` (AlertDialogAction → `handleFactoryReset()`)

Secondary header actions (e.g. "View All") remain visible in edit mode, to the left of the three-button group.

Example header structure (edit mode):

```tsx
<div className="flex items-center gap-2">
  {/* secondary actions remain here */}
  <div className="flex items-center gap-0.5">
    <button className="p-1 rounded ..." onClick={handleReset} title="Reset to when you opened this" aria-label="Reset settings">
      <RotateCcw className="h-4 w-4" />
    </button>
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className="p-1 rounded ..." title="Restore defaults" aria-label="Restore default settings">
          <RefreshCcw className="h-4 w-4" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Restore Defaults</AlertDialogTitle>
          <AlertDialogDescription>
            Reset all [Widget Name] widget settings to their defaults? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleFactoryReset}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <button className="p-1 rounded ..." onClick={handleClose} title="Close settings" aria-label="Close settings">
      <X className="h-4 w-4" />
    </button>
  </div>
</div>
```

---

## 4. CardContent Layout

### 4.1 Sizing — height locking

When settings open, the widget's `CardContent` height is **frozen** at its current rendered height so the dashboard layout does not shift. This is achieved with a `ref` and an inline `style`:

```tsx
<CardContent
  ref={cardContentRef}
  style={
    isEditing && editContentHeight
      ? { height: editContentHeight, overflow: 'hidden' }
      : undefined
  }
>
```

When settings close, the style is removed and the card returns to its natural content height.

### 4.2 Grid layout

Inside `CardContent`, wrap the content in a conditional CSS class that applies a two-column grid only while editing:

```tsx
<div className={isEditing ? 'my-widget-card-edit' : undefined}>
  <div className={isEditing ? 'my-widget-card-edit__preview' : undefined}>
    {/* normal widget content — unchanged */}
  </div>
  {isEditing && (
    <div className="my-widget-card-edit__panel">
      <MyWidgetSettingsPanel config={config} onChange={setConfig} />
    </div>
  )}
</div>
```

Add the following CSS block to `src/renderer/src/assets/main.css` (after the existing `youtube-card-edit` and `saved-posts-card-edit` blocks, following the same naming convention):

```css
.my-widget-card-edit {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 1rem;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}

.my-widget-card-edit__preview {
  overflow-y: auto;
  min-width: 0;
  min-height: 0;
}

.my-widget-card-edit__panel {
  display: flex;
  overflow: hidden;
  min-height: 0;
  border-left: 1px solid hsl(var(--border));
  padding-left: 1rem;
}
```

Replace `my-widget` with the kebab-case module id of the new widget.

---

## 5. Widget Component State & Handlers

Add these four pieces of state plus the `cardContentRef` to the main widget component (not the settings panel):

```tsx
const [isEditing, setIsEditing]               = useState(false)
const [snapshotConfig, setSnapshotConfig]     = useState<MyViewConfig | null>(null)
const [editContentHeight, setEditContentHeight] = useState<number | null>(null)
const cardContentRef = useRef<HTMLDivElement | null>(null)
```

Add these four handlers:

```tsx
function handleOpenEdit(): void {
  const currentHeight = cardContentRef.current?.getBoundingClientRect().height
  if (currentHeight && currentHeight > 0) setEditContentHeight(currentHeight)
  setSnapshotConfig(config)
  setIsEditing(true)
}

function handleClose(): void {
  setIsEditing(false)
  setSnapshotConfig(null)
  setEditContentHeight(null)
}

function handleReset(): void {
  if (snapshotConfig) setConfig(snapshotConfig)
}

function handleFactoryReset(): void {
  setConfig(DEFAULT_MY_VIEW_CONFIG)
  setSnapshotConfig(DEFAULT_MY_VIEW_CONFIG)
}
```

Add an Escape-key listener tied to `isEditing`:

```tsx
useEffect(() => {
  if (!isEditing) return
  const handler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') handleClose()
  }
  window.addEventListener('keydown', handler)
  return () => window.removeEventListener('keydown', handler)
}, [isEditing]) // eslint-disable-line react-hooks/exhaustive-deps
```

---

## 6. Settings Panel Component

Each widget's settings panel lives in a separate file: `src/renderer/src/modules/<widget>/MyWidgetSettingsPanel.tsx`.

### 6.1 Props

```tsx
interface MyWidgetSettingsPanelProps {
  config: MyViewConfig
  onChange: (config: MyViewConfig) => void
  // pass other read-only data the panel needs, e.g.:
  availableSubreddits?: string[]
}
```

There is **no local draft state** in the panel. Changes call `onChange` directly, which persists immediately via the config hook.

### 6.2 Root element

```tsx
<div className="flex flex-col h-full w-full min-w-0 flex-1">
  <ScrollArea className="h-full w-full">
    <div className="space-y-5 pb-2 pr-4">
      {/* sections */}
    </div>
  </ScrollArea>
</div>
```

`w-full min-w-0 flex-1` on the root element and `w-full` on `ScrollArea` are required — without them the content shrinks to intrinsic width and leaves empty space in the panel column.

### 6.3 Section structure

Group related settings into named sections separated by `<Separator />`:

```tsx
<div>
  <h3 className="text-sm font-semibold mb-3">Section Name</h3>
  <div className="space-y-4">
    {/* controls */}
  </div>
</div>

<Separator />

<div>
  <h3 className="text-sm font-semibold mb-3">Next Section</h3>
  ...
</div>
```

Do not end the final section with a `<Separator />`.

### 6.4 Control patterns

#### Toggle (Switch)

```tsx
<div className="flex items-center justify-between">
  <label className="text-sm">Label text</label>
  <Switch
    checked={config.someBoolean}
    onCheckedChange={(checked) => onChange({ ...config, someBoolean: checked })}
  />
</div>
```

#### Select / dropdown

```tsx
<div>
  <label className="text-sm block mb-2">Label text</label>
  <Select
    value={config.someValue}
    onValueChange={(val) => onChange({ ...config, someValue: val as SomeType })}
  >
    <SelectTrigger className="h-8">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="option_a">Option A</SelectItem>
      <SelectItem value="option_b">Option B</SelectItem>
    </SelectContent>
  </Select>
</div>
```

#### Checkbox list (for multi-select filters)

```tsx
<div className="space-y-2">
  {items.map(({ value, label }) => (
    <label key={value} className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={!config.filter || config.filter.includes(value)}
        onChange={() => toggleItem(value)}
        className="rounded border-input"
      />
      <span>{label}</span>
    </label>
  ))}
</div>
```

If the list can grow long, constrain it with `max-h-32 overflow-y-auto` on the wrapper div.

#### Reorderable list (up/down buttons)

Use `<GripVertical>` as a visual-only drag affordance and `<ArrowUp>` / `<ArrowDown>` buttons for accessible reordering:

```tsx
{config.order.map((item, idx) => (
  <div key={item} className="flex items-center gap-2 px-2 py-1.5 rounded border bg-muted/30 text-sm">
    <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    <span className="flex-1">{LABEL_MAP[item]}</span>
    <button
      type="button"
      disabled={idx === 0}
      onClick={() => moveItem(item, 'up')}
      className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
    >
      <ArrowUp className="h-3.5 w-3.5" />
    </button>
    <button
      type="button"
      disabled={idx === config.order.length - 1}
      onClick={() => moveItem(item, 'down')}
      className="p-0.5 hover:bg-muted rounded disabled:opacity-30"
    >
      <ArrowDown className="h-3.5 w-3.5" />
    </button>
  </div>
))}
```

---

## 7. Config Hook Pattern

Per-widget configuration is stored via the IPC `settings:get` / `settings:set` channels, keyed by instance ID. Create a dedicated hook: `src/renderer/src/hooks/useMyWidgetConfig.ts`.

```ts
import { useState, useEffect } from 'react'
import type { MyViewConfig } from '../../../shared/ipc-types'

export const DEFAULT_MY_VIEW_CONFIG: MyViewConfig = {
  // all fields with their defaults
}

export function useMyWidgetConfig(instanceId: string): {
  config: MyViewConfig
  setConfig: (newConfig: MyViewConfig) => void
} {
  const [config, setConfigState] = useState<MyViewConfig>(DEFAULT_MY_VIEW_CONFIG)
  const storageKey = `my_widget_view_config:${instanceId}`

  useEffect(() => {
    window.api
      .invoke('settings:get', storageKey)
      .then((raw) => {
        if (raw) {
          try {
            setConfigState({
              ...DEFAULT_MY_VIEW_CONFIG,
              ...(JSON.parse(raw as string) as Partial<MyViewConfig>)
            })
          } catch { /* use default on parse error */ }
        }
      })
      .catch(console.error)
  }, [instanceId])

  const setConfig = (newConfig: MyViewConfig): void => {
    setConfigState(newConfig)
    window.api
      .invoke('settings:set', storageKey, JSON.stringify(newConfig))
      .catch(console.error)
  }

  return { config, setConfig }
}
```

Rules:
- Always export `DEFAULT_MY_VIEW_CONFIG` so the widget can use it in `handleFactoryReset()`.
- Merge loaded config with defaults (`{ ...DEFAULT_MY_VIEW_CONFIG, ...parsed }`) to tolerate missing fields after config schema additions.
- The storage key must include the `instanceId` so multiple instances of the same widget type have independent settings.

---

## 8. File Checklist for a New Widget with Settings

When adding a new widget that follows this spec, create or modify these files:

| File | What to do |
|------|------------|
| `src/renderer/src/modules/<widget>/MyWidget.tsx` | Add `isEditing`, `snapshotConfig`, `editContentHeight`, `cardContentRef`, the four handlers, the Escape listener, and the conditional header / CardContent layout |
| `src/renderer/src/modules/<widget>/MyWidgetSettingsPanel.tsx` | New file — settings form component (no local state, calls `onChange` directly) |
| `src/renderer/src/hooks/useMyWidgetConfig.ts` | New file — config persistence hook with exported default config |
| `src/renderer/src/assets/main.css` | Add `my-widget-card-edit`, `my-widget-card-edit__preview`, `my-widget-card-edit__panel` CSS classes |
| `src/shared/ipc-types.ts` | Add `MyViewConfig` interface |

---

## 9. Reference Implementations

| Widget | Widget component | Settings panel | Config hook |
|--------|------------------|----------------|-------------|
| YouTube | `src/renderer/src/modules/youtube/YouTubeWidget.tsx` | `YouTubeSettingsPanel.tsx` | `useYouTubeViewConfig.ts` |
| Reddit Digest | `src/renderer/src/modules/reddit/RedditDigestWidget.tsx` | `RedditDigestSettingsPanel.tsx` | `useRedditDigestConfig.ts` |
| Saved Posts | `src/renderer/src/modules/saved-posts/SavedPostsWidget.tsx` | `SavedPostsSettingsPanel.tsx` | `useSavedPostsConfig.ts` |
