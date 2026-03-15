# Frontend Architecture — Personal News Dashboard

**Project:** personal-news
**Last Updated:** 2026-03-15 (rev 2)

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
| `/saved-posts` | `SavedPosts` | Triggers ntfy onboarding if not configured |
| `/scripts` | `ScriptManager` | Shows stale badge on nav item when relevant |
| `/settings` | `Settings` | Tabbed: API Keys, YouTube, Reddit, Saved Posts, Appearance |
| `/settings/youtube` | `Settings` (YouTube tab active) | Navigable directly from YouTube widget gear icon |
| `/settings/saved-posts` | `Settings` (Saved Posts tab active) | Also triggers ntfy onboarding if not configured |

Navigation is via the collapsible left sidebar. The sidebar is always rendered by `App.tsx`; route content renders in the main area via `<Outlet />`.

---

## 3. Component Tree

```
ThemeProvider  ← wraps entire app; applies active_theme_id to <html data-theme>
└── App.tsx
    ├── Sidebar
    │   ├── NavItem (Dashboard)
    │   ├── NavItem (Saved Posts)
    │   ├── NavItem (Script Manager)  ← shows amber dot badge when stale scripts exist
    │   └── NavItem (Settings)
    └── <Outlet>
        ├── Dashboard
        │   ├── DashboardEditModeToggle
        │   └── DndContext (@dnd-kit/core)
        │       └── SortableContext
        │           └── WidgetWrapper[] (one per enabled module, in widget_order)
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
        │   ├── NtfyStaleWarningBanner  ← shown when last poll >24h ago
        │   ├── NtfyOnboardingModal     ← shown on first visit with no topic configured
        │   │   ├── OnboardingStep1 (What is ntfy)
        │   │   ├── OnboardingStep2 (Choose topic + server URL)
        │   │   ├── OnboardingStep3 (Test connection)
        │   │   └── OnboardingStep4 (Phone setup guide — iOS/Android)
        │   ├── SavedPostsToolbar
        │   │   ├── SearchInput
        │   │   ├── FilterBySubreddit
        │   │   ├── FilterByTag
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
| `reddit:ntfyIngestComplete` | ntfy startup ingestion finished |

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

Each data source module registers a widget component and a settings component. The renderer-side module registry (`src/renderer/modules/registry.ts`) maps module IDs to their components:

```typescript
// src/renderer/modules/registry.ts
import { YouTubeWidget } from './youtube/YouTubeWidget';
import { YouTubeSettings } from './youtube/YouTubeSettings';
import { RedditDigestWidget } from './reddit/RedditDigestWidget';
import { RedditDigestSettings } from './reddit/RedditDigestSettings';
import { SavedPostsWidget } from './saved-posts/SavedPostsWidget';
import { SavedPostsSettings } from './saved-posts/SavedPostsSettings';

export const moduleRegistry: ModuleRegistration[] = [
  {
    id: 'youtube',
    displayName: 'YouTube',
    WidgetComponent: YouTubeWidget,
    SettingsComponent: YouTubeSettings,
  },
  {
    id: 'reddit_digest',
    displayName: 'Reddit Digest',
    WidgetComponent: RedditDigestWidget,
    SettingsComponent: RedditDigestSettings,
  },
  {
    id: 'saved_posts',
    displayName: 'Saved Posts',
    WidgetComponent: SavedPostsWidget,
    SettingsComponent: SavedPostsSettings,
  },
];
```

### 5.2 Dashboard Rendering

The `Dashboard` route reads `widget_order` and `widget_visibility` from IPC (settings table), then renders `WidgetWrapper` components in that order, skipping hidden modules. `@dnd-kit/core` wraps the list; on drag-end, the new order is written back via `settings:set`.

```typescript
// Simplified Dashboard render
const orderedModules = widgetOrder
  .map(id => moduleRegistry.find(m => m.id === id))
  .filter(Boolean)
  .filter(m => widgetVisibility[m.id] !== false);

return (
  <DndContext onDragEnd={handleDragEnd}>
    <SortableContext items={orderedModules.map(m => m.id)}>
      {orderedModules.map(m => (
        <WidgetWrapper key={m.id} moduleId={m.id} editMode={editMode}>
          <m.WidgetComponent />
        </WidgetWrapper>
      ))}
    </SortableContext>
  </DndContext>
);
```

### 5.3 Settings Rendering

The Settings view iterates `moduleRegistry` and renders each module's `SettingsComponent` as a tab or section. Adding a new module automatically adds its settings section — no changes to `Settings.tsx` required.

---

## 6. Key UI Behaviors

### 6.1 Dashboard Edit Mode

- `editMode` state lives in `Dashboard.tsx`.
- "Edit Layout" button toggles it.
- In edit mode: drag handles appear on `WidgetWrapper`; each widget shows an eye-icon toggle (calls `settings:set` to update `widget_visibility`).
- Drag-end handler calls `settings:set` to persist new `widget_order`.
- Exiting edit mode (clicking "Done") simply sets `editMode = false`.

### 6.2 ntfy Onboarding Modal

- `SavedPosts.tsx` fetches ntfy config on mount via `settings:getNtfyConfig`.
- If `topic` is null/empty and `ntfy_onboarding_dismissed` is not `"1"`, opens `NtfyOnboardingModal`.
- Modal manages its own step state (`step: 1 | 2 | 3 | 4`).
- "Done" on Step 4 calls `settings:setNtfyConfig`, then closes modal and refreshes saved posts.
- "Skip Setup" calls `settings:set('ntfy_onboarding_dismissed', '1')` and closes modal.

### 6.3 Stale Script Badge

- `Sidebar.tsx` maintains a `hasStaleScripts` boolean, computed by calling `scripts:getStaleStatus` on mount and re-checking whenever `scripts:runComplete` is received.
- The amber dot on the Script Manager nav item is rendered conditionally based on this flag.

### 6.4 Theme Application

- `ThemeProvider` wraps the app in `main.tsx` (`<ThemeProvider><MemoryRouter>...</MemoryRouter></ThemeProvider>`).
- On mount, it calls `settings:getTheme` → receives `{ id: string; tokens: Record<string,string> | null }`.
  - For built-in IDs (`system`, `light`, `dark`): sets `document.documentElement.setAttribute('data-theme', id)`. The CSS for these themes is statically bundled in `globals.css` as `[data-theme="light"]` and `[data-theme="dark"]` blocks.
  - For user-created themes: sets `data-theme="custom"` and injects a `<style id="theme-override">` tag whose body is the `tokens` object serialized as CSS custom properties on `:root`.
- `system` theme resolves to `light` or `dark` via `window.matchMedia('(prefers-color-scheme: dark)')`. The `ThemeProvider` listens for OS preference changes and updates the `data-theme` attribute in response.
- The `useTheme()` hook (consumed by `AppearanceTab` in Settings) exposes `{ themeId, setTheme }` — the setter calls `settings:setTheme` and triggers a re-render of `ThemeProvider`.
- Custom theme tokens must satisfy a 4.5:1 contrast ratio for all foreground/background pairings. This is enforced by documentation convention in v1, not by code.

### 6.5 Reddit Digest View Config

- `RedditDigestWidget` reads `reddit_digest_view_config` from the settings table on mount via `settings:get('reddit_digest_view_config')`.
- Parsed into `{ sort_by, sort_dir, group_by, layout_mode }` with defaults applied for any missing fields.
- `DigestViewControls` renders a sort dropdown and a layout mode toggle button in the widget header. On change, the new config is written back via `settings:set('reddit_digest_view_config', JSON.stringify(newConfig))` and local state is updated immediately.
- Sorting is applied in the renderer (client-side) over the data already returned by `reddit:getDigestPosts`. No round-trip to main for sort changes.
- Grouping: when `group_by = 'subreddit'`, posts are grouped into columns/tabs by subreddit. When `group_by = 'none'`, all posts are merged into a single flat list sorted by the active sort field and displayed in a single column/tab labeled "All".
- Layout mode toggle: swaps between the CSS grid columns layout and the shadcn `Tabs` layout. The same `DigestPostRow` component is used in both modes — only the container changes.

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
├── routes/
│   ├── Dashboard.tsx
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
│   │   ├── DigestViewControls.tsx  Sort dropdown + layout toggle
│   │   ├── SubredditColumn.tsx
│   │   ├── DigestTabs.tsx          Tabs layout container
│   │   ├── DigestPostRow.tsx
│   │   └── RedditDigestSettings.tsx
│   ├── saved-posts/
│   │   ├── SavedPostsWidget.tsx    Dashboard widget (compact, 5 posts)
│   │   └── SavedPostsSettings.tsx  Settings tab (ntfy config — same as SavedPostsTab)
│   └── scripts/
│       └── ScriptManagerSettings.tsx
├── components/
│   ├── ui/                   shadcn/ui owned copies
│   ├── Sidebar.tsx
│   ├── WidgetWrapper.tsx
│   ├── NtfyOnboardingModal/
│   │   ├── index.tsx
│   │   ├── Step1.tsx
│   │   ├── Step2.tsx
│   │   ├── Step3.tsx
│   │   └── Step4.tsx
│   ├── NtfyStaleWarningBanner.tsx
│   ├── StaleScriptCallout.tsx
│   └── TagChip.tsx
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
