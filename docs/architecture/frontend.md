# Frontend Architecture — Personal News Dashboard

**Project:** personal-news
**Last Updated:** 2026-03-24 (rev 3)

---

## 1. Overview

The renderer process is a React 18 single-page application bundled by electron-vite (Vite under the hood). Routing is client-side only (no URLs, no history API — Electron loads `index.html` directly). State management is local React state + custom hooks backed by IPC calls. No global state library (Redux, Zustand, etc.) is used — the IPC layer is the source of truth; React state is a cache.

A `ThemeProvider` wraps the entire app at the root level (`main.tsx`) and is responsible for applying the active theme to the document. It reads `active_theme_id` via IPC on mount and responds to theme changes by toggling the `data-theme` attribute on `<html>` (for built-in themes) or by injecting CSS custom property overrides from the `themes` DB table (for user-created themes). This keeps the theme concern entirely inside `ThemeProvider` — no other component needs to know about theme logic.

---

## 2. Routing

React Router v6 with `MemoryRouter` (required in Electron — no `BrowserRouter` since there is no web server).

### Route Table

| Path | Component | Notes |
|------|-----------|-------|
| `/` | `Dashboard` | Default route |
| `/youtube` | `YouTubePage` | Full-page YouTube view |
| `/reddit-digest` | `RedditDigest` | Present only when the feature is enabled |
| `/saved-posts` | `SavedPosts` | Present only when the feature is enabled; opens ntfy onboarding when no topic is configured |
| `/scripts` | `ScriptManager` | Shows stale badge on nav item when relevant |
| `/settings` | `Settings` | Tabbed settings plus feature flags, notifications, updates, and Saved Posts sync controls |

Navigation is via the collapsible left sidebar. `App.tsx` renders the sidebar, the current route, the Sonner toast container, and the notifications flyout trigger.

---

## 3. Component Tree

```
ThemeProvider  ← wraps entire app; applies active_theme_id to <html data-theme>
└── App.tsx
    ├── Sidebar
    │   ├── NavItem (Dashboard)
    │   ├── NavItem (YouTube)
    │   ├── NavItem (Reddit Digest)   ← feature-gated
    │   ├── NavItem (Saved Posts)     ← feature-gated
    │   ├── NavItem (Script Manager)  ← shows amber dot badge when stale scripts exist
    │   ├── NavItem (Settings)
    │   └── Notifications button      ← opens NotificationsFlyout with unread dot
    └── route area
        ├── Dashboard
        │   ├── DashboardEditModeToggle
        │   └── DndContext (@dnd-kit/core)
        │       └── SortableContext
        │           └── WidgetWrapper[] (one per widget instance, in widget_order)
        │               ├── YouTubeWidget
        │               │   └── ChannelRow[] (one per enabled channel)
        │               │       ├── StreamPanel (left — upcoming/live streams)
        │               │       │   └── StreamCard[]
        │               │       └── VideoCarousel (right — recent videos)
        │               │           └── VideoCard[]
        │               ├── RedditDigestWidget
        │               │   ├── DigestViewControls (sort dropdown + layout mode toggle)
        │               │   └── [columns mode] SubredditColumn[] | [tabs mode] DigestTabs
        │               │       └── DigestPostRow[]
        │               └── SavedPostsWidget
        │                   └── SavedPostSummaryRow[] (up to 5 most recent posts)
        │
        ├── SavedPosts
        │   ├── StaleWarning            ← shown when last poll >24h ago
        │   ├── NtfyOnboardingWizard    ← shown when no topic is configured
        │   ├── SavedPostsToolbar
        │   │   ├── SearchInput
        │   │   ├── FilterBySubreddit
        │   │   ├── FilterByTag
        │   │   ├── FilterBySource
        │   │   └── ManageTagsButton → TagManagementModal
        │   └── SavedPostList
        │       └── SavedPostCard[]
        │           └── TagChip[] (inline tag editing)
        │
        ├── ScriptManager
        │   ├── ScriptList
        │   │   └── ScriptRow[]
        │   │       ├── StaleWarningIndicator (amber [!] when stale)
        │   │       └── RunNowButton
        │   └── ScriptDetailPanel (drawer or right pane)
        │       ├── ScriptEditForm
        │       ├── StaleWarningCallout  ← shown when script is stale
        │       ├── LiveOutputPane       ← shown while script is running
        │       └── RunHistoryList
        │           └── RunHistoryRow[]
        │
        └── Settings
            ├── SettingsTabs
            │   ├── ApiKeysTab
            │   │   └── YouTubeApiKeyField (masked input + show/hide + Test button)
            │   ├── YouTubeTab
            │   │   ├── ChannelList
            │   │   │   └── ChannelRow[] (toggle + remove)
            │   │   ├── AddChannelInput
            │   │   └── RssPollIntervalInput
            │   ├── RedditDigestTab
            │   │   ├── SubredditList (add/remove)
            │   │   └── TimeWindowSelect
            │   ├── SavedPostsTab (ntfy config)
            │   │   ├── NtfyConfigDisplay (topic + server + last synced)
            │   │   ├── TestConnectionButton
            │   │   └── MobileSetupGuideButton → OnboardingStep4 (modal)
            │   └── AppearanceTab
            │       └── ThemeSelect (system/light/dark + future custom themes)
            └── ...
```

---

## 4. State Management

### 4.1 Approach

No global store. Each route/feature owns its state via custom hooks that wrap IPC calls. The pattern is:

```typescript
// hooks/useYouTubeChannels.ts
function useYouTubeChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.invoke('youtube:getChannels').then((data) => {
      setChannels(data as Channel[]);
      setLoading(false);
    });
  }, []);

  // Subscribe to push updates from main process
  useEffect(() => {
    const handler = () => {
      window.api.invoke('youtube:getChannels').then((data) => {
        setChannels(data as Channel[]);
      });
    };
    window.api.on('youtube:updated', handler);
    return () => window.api.off('youtube:updated', handler);
  }, []);

  return { channels, loading };
}
```

### 4.2 Push Updates from Main Process

When the main process completes a background task (RSS poll, script run, ntfy ingestion), it pushes a notification event to the renderer via `BrowserWindow.webContents.send(channel)`. The renderer subscribes in `useEffect` and re-queries the relevant data. This keeps the UI fresh without polling from the renderer side.

**Push channels (main → renderer):**

| Channel | Meaning |
|---------|---------|
| `youtube:updated` | New videos or stream status changes available |
| `scripts:output` | Chunk of stdout/stderr from running script |
| `scripts:runComplete` | Script finished — payload: `{ scriptId, exitCode }` |
| `reddit:ntfyIngestComplete` | ntfy startup/scheduled/manual ingestion finished |
| `app:showTrayHint` | Show the first-close tray hint toast |
| `updates:status` | Auto-update state changed |

### 4.3 IPC Type Safety

The preload script exposes typed wrappers. All IPC channel names and payload shapes are defined in a shared types file at `src/shared/ipc-types.ts` imported by both the preload and the renderer. This ensures compile-time safety on both sides.

```typescript
// src/shared/ipc-types.ts
export type IpcChannels = {
  'youtube:getChannels': { args: []; return: Channel[] };
  'youtube:addChannel': { args: [channelIdOrUrl: string]; return: Channel };
  // ...
};
```

---

## 5. Widget / Module System

### 5.1 Registration

The renderer-side module registry is intentionally small: it maps module IDs to widget components only. Dashboard settings panels live alongside each widget and are not registered separately.

```typescript
// src/renderer/modules/registry.ts
import { YouTubeWidget } from './youtube/YouTubeWidget';
import { RedditDigestWidget } from './reddit/RedditDigestWidget';
import { SavedPostsWidget } from './saved-posts/SavedPostsWidget';

export const moduleRegistry: RendererModule[] = [
  {
    id: 'youtube',
    displayName: 'YouTube',
    widget: YouTubeWidget,
  },
  {
    id: 'reddit_digest',
    displayName: 'Reddit Digest',
    widget: RedditDigestWidget,
  },
  {
    id: 'saved_posts',
    displayName: 'Saved Posts',
    widget: SavedPostsWidget,
  },
];
```

### 5.2 Widget Instances

The dashboard supports **multiple instances of the same module**. The `WidgetLayout` type tracks instances separately from module types:

```typescript
interface WidgetInstance {
  instanceId: string   // e.g. "reddit_digest_1", "reddit_digest_1714000000000"
  moduleId: string     // e.g. "reddit_digest"
  label: string | null // user-supplied name; null = use module's displayName
}

interface WidgetLayout {
  widget_order: string[]                       // array of instanceIds
  widget_visibility: Record<string, boolean>   // keyed by instanceId
  widget_instances: Record<string, WidgetInstance>
}
```

`instanceId` is `${moduleId}_1` for the initial instance (migrated from old format) and `${moduleId}_${Date.now()}` for subsequently added instances.

### 5.3 Instance Context

`WidgetInstanceContext` (`src/renderer/src/contexts/WidgetInstanceContext.tsx`) provides `{ instanceId, moduleId, label }` to widget components via React context. Dashboard wraps each widget in a context provider before rendering it. Widget components read this context via `useWidgetInstance()` to access their own instance metadata without requiring prop changes.

### 5.4 Dashboard Rendering

`Dashboard.tsx` iterates `widget_order` (instanceIds), looks up the `WidgetInstance`, then the registered module by `moduleId`, and renders each widget inside a context provider:

```typescript
{layout.widget_order.map((instanceId) => {
  const instance = layout.widget_instances[instanceId]
  const mod = getModule(instance.moduleId)
  return (
    <WidgetInstanceContext.Provider value={instance}>
      <WidgetWrapper id={instanceId} label={instance.label} defaultLabel={mod.displayName} ...>
        <mod.widget />
      </WidgetWrapper>
    </WidgetInstanceContext.Provider>
  )
})}
```

### 5.5 Layout Migration

`useWidgetLayout` automatically migrates the old format (where `widget_order` contained moduleIds directly) to the new instance format on first load. The migrated layout is written back to storage transparently. Old format: `widget_order: ["youtube", "reddit_digest"]` → New format: instances `youtube_1`, `reddit_digest_1` etc.

### 5.3 Settings Rendering

The Settings route is composed explicitly from settings tabs and feature sections. Widget settings are rendered inline from each widget's own settings panel, not from the renderer registry. Adding a new module may still require a deliberate Settings UI entry if that module exposes app-level controls.

---

## 6. Key UI Behaviors

### 6.1 Dashboard Edit Mode

- `editMode` state lives in `Dashboard.tsx`.
- "Edit Layout" button toggles it.
- In edit mode:
  - Drag handles appear on each `WidgetWrapper` for reordering.
  - Eye-icon toggle shows/hides individual widgets.
  - Widget name is shown inline with a pencil icon — clicking opens an inline text input for renaming. Pressing Enter or blurring commits; Escape cancels. Clearing the name (or setting it back to the module's default name) removes the custom label.
  - A trash icon removes the widget instance from the layout entirely.
  - An "Add widget" strip appears at the bottom of the dashboard showing one button per registered module. Clicking adds a new instance of that module to the end of `widget_order`.
- Drag-end handler, rename, add, and remove all call `setLayout` which persists the full `WidgetLayout` object via `settings:setWidgetLayout`.
- Exiting edit mode (clicking "Done") simply sets `editMode = false`.

### 6.2 ntfy Onboarding Wizard

- `SavedPosts.tsx` derives the onboarding state from `reddit:getNtfyStaleness` plus raw `settings:get('ntfy_topic')` / `settings:get('ntfy_server_url')` values.
- If no topic is configured, it opens `NtfyOnboardingWizard`.
- The wizard owns the multi-step flow and is also reused from the Saved Posts settings tab.
- Completing the wizard persists plain settings values, closes the wizard, and refreshes Saved Posts state.

### 6.3 Stale Script Badge

- `Sidebar.tsx` derives `hasStaleScripts` from the `useScripts()` hook result.
- The amber styling on the Script Manager nav item is rendered conditionally based on whether any returned script row has `is_stale = true`.

### 6.4 Theme Application

- `ThemeProvider` wraps the app in `main.tsx` (`<ThemeProvider><MemoryRouter>...</MemoryRouter></ThemeProvider>`).
- On mount, it calls `settings:getTheme` → receives `{ id: string; tokens: Record<string,string> | null }`.
  - For built-in IDs (`system`, `light`, `dark`): sets `document.documentElement.setAttribute('data-theme', id)`. The CSS for these themes is statically bundled in `globals.css` as `[data-theme="light"]` and `[data-theme="dark"]` blocks.
  - For user-created themes: sets `data-theme="custom"` and injects a `<style id="theme-override">` tag whose body is the `tokens` object serialized as CSS custom properties on `:root`.
- `system` theme resolves to `light` or `dark` via `window.matchMedia('(prefers-color-scheme: dark)')`. The `ThemeProvider` listens for OS preference changes and updates the `data-theme` attribute in response.
- The `useTheme()` hook (consumed by `AppearanceTab` in Settings) exposes `{ themeId, setTheme }` — the setter calls `settings:setTheme` and triggers a re-render of `ThemeProvider`.
- Custom theme tokens must satisfy a 4.5:1 contrast ratio for all foreground/background pairings. This is enforced by documentation convention in v1, not by code.

### 6.5 Reddit Digest View Config

Config is per-instance, stored under the settings key `reddit_digest_view_config:<instanceId>`.

- `useRedditDigestConfig(instanceId)` loads config for the given instance. Falls back to the legacy global key `reddit_digest_view_config` on first load so existing saved preferences are preserved after migration.
- Config shape: `{ sort_by, sort_dir, group_by, layout_mode, subreddit_filter }`. All fields have defaults; missing fields are filled by spreading over `DEFAULT_CONFIG`.
- `DigestViewControls` renders:
  - Sort field dropdown
  - Sort direction toggle (↑/↓)
  - Layout mode toggle (grid columns / tabs)
  - Subreddit filter button — shows "All" when no filter is active, or a count badge when a filter is set. Clicking opens a floating checklist of all subreddits present in the data; checking/unchecking updates `subreddit_filter`.
- `subreddit_filter: null` means show all subreddits; an array of subreddit names restricts the widget to those subreddits.
- All filtering, sorting, and grouping is applied client-side in the renderer. No round-trip to main for config changes.
- Multiple Reddit Digest widget instances each maintain independent configs, enabling e.g. one instance pinned to r/rust + r/programming and another to r/gaming.

### 6.6 Live Script Output

- `ScriptDetailPanel` subscribes to `scripts:output` push events filtered by the open script's ID.
- Output is appended to a `string[]` state, displayed in a `<ScrollArea>` that auto-scrolls to the bottom.
- On `scripts:runComplete` for the open script, the "Running..." indicator clears and the run is added to run history.

---

## 7. Folder Structure (Renderer)

```
src/renderer/
├── main.tsx                  React entry; wraps app in ThemeProvider > MemoryRouter
├── App.tsx                   Root layout: Sidebar + Outlet
├── providers/
│   └── ThemeProvider.tsx     Reads active_theme_id; applies data-theme to <html>
├── contexts/
│   └── WidgetInstanceContext.tsx  Per-instance context (instanceId, moduleId, label)
├── routes/
│   ├── Dashboard.tsx
│   ├── YouTube.tsx
│   ├── RedditDigest.tsx
│   ├── SavedPosts.tsx
│   ├── ScriptManager.tsx
│   └── Settings.tsx
├── modules/
│   ├── registry.ts           Module registry (renderer side)
│   ├── youtube/
│   │   ├── YouTubeWidget.tsx
│   │   ├── ChannelRow.tsx
│   │   ├── StreamPanel.tsx
│   │   ├── VideoCarousel.tsx
│   │   └── YouTubeSettings.tsx
│   ├── reddit/
│   │   ├── RedditDigestWidget.tsx
│   │   ├── DigestViewControls.tsx  Sort, layout, subreddit filter controls
│   │   ├── SubredditColumn.tsx
│   │   ├── DigestTabs.tsx          Tabs layout container
│   │   ├── DigestPostRow.tsx
│   │   └── RedditDigestSettings.tsx
│   ├── saved-posts/
│   │   ├── SavedPostsWidget.tsx    Dashboard widget (compact, 5 posts)
│   │   ├── SavedPostsSettingsPanel.tsx
│   │   ├── NtfyOnboardingWizard.tsx
│   │   ├── StaleWarning.tsx
│   │   └── TagManagementModal.tsx
│   └── scripts/
│       └── ScriptManagerSettings.tsx
├── components/
│   ├── ui/                   shadcn/ui owned copies
│   ├── Sidebar.tsx
│   ├── Sidebar.tsx
│   ├── NotificationsFlyout.tsx
│   ├── WidgetWrapper.tsx
│   └── ...
├── hooks/
│   ├── useYouTubeChannels.ts
│   ├── useYouTubeVideos.ts
│   ├── useSavedPosts.ts
│   ├── useScripts.ts
│   ├── useScriptRuns.ts
│   ├── useSettings.ts
│   ├── useNtfyStaleness.ts
│   ├── useTheme.ts             Reads/writes active_theme_id; consumed by ThemeProvider + AppearanceTab
│   └── useRedditDigestConfig.ts  Reads/writes reddit_digest_view_config setting
└── lib/
    ├── utils.ts              cn() helper (shadcn convention)
    └── time.ts               Relative time formatting helpers
```
