# Prototype Brief — Personal News Dashboard

> Status: Historical prototype brief retained for implementation history. It describes the original scaffold target and should not be treated as the current architectural source of truth.
>
> Current maintained docs: [README](../../README.md), [docs/architecture/overview.md](./overview.md), [docs/architecture/data-sources.md](./data-sources.md), [docs/architecture/frontend.md](./frontend.md), and [docs/ui-ux.md](../ui-ux.md).

**For:** Rapid-prototype agent
**Project:** personal-news
**Last Updated:** 2026-03-15 (rev 2)

This document is self-contained. Do not reference any other file to begin building. Everything you need is here.

---

## Goal

Scaffold a working Electron + React desktop application that demonstrates: the collapsible sidebar shell, a drag-and-drop dashboard with the YouTube widget, Reddit Digest widget (with sort/layout controls), and Saved Posts widget (rendering hardcoded seed data), the Script Manager list view (with hardcoded scripts), and the Settings screen stub with a working theme toggle. All data flows through the IPC layer from the start — no direct DB access from the renderer.

---

## Stack — Exact Install

```bash
# Scaffold with electron-vite
npm create @quick-start/electron@latest personal-news -- --template react-ts
cd personal-news

# Core dependencies
npm install better-sqlite3 node-cron fast-xml-parser

# Dev dependencies for better-sqlite3 native rebuild
npm install --save-dev @electron/rebuild electron-builder

# UI
npm install tailwindcss @tailwindcss/vite
npm install @radix-ui/react-dialog @radix-ui/react-switch @radix-ui/react-tabs \
  @radix-ui/react-scroll-area @radix-ui/react-badge @radix-ui/react-separator \
  @radix-ui/react-tooltip
npm install class-variance-authority clsx tailwind-merge lucide-react

# Routing + DnD
npm install react-router-dom @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities

# shadcn/ui — run the init CLI, then add components as needed:
npx shadcn@latest init
# When prompted: TypeScript yes, default style, slate base color, CSS variables yes
# Then add components:
npx shadcn@latest add button card badge input switch tabs dialog scroll-area separator tooltip
```

**Node version:** 20+
**Electron version:** Use whatever `electron-vite` scaffolds (should be Electron 28+, which ships Node 18+ and includes `fetch` natively).

---

## What to Build

Build in this order. Each item is a shippable increment.

### 1. Project Scaffold + DB Setup

- Initialize with `electron-vite` using the `react-ts` template.
- Configure Tailwind CSS (add the `@tailwindcss/vite` plugin to `electron.vite.config.ts`).
- Create `src/main/db/database.ts`:
  - Opens `{userData}/data.db` using `better-sqlite3`.
  - Runs `src/main/db/migrations/001_initial.sql` if `schema_version` is not `1`.
- Write `src/main/db/migrations/001_initial.sql` with the full schema from `docs/architecture/data-model.md` (all tables, indexes, FTS5 triggers).
- Seed the DB with the hardcoded data below (see Data section).
- Expose `window.api.invoke` and `window.api.on`/`off` via `src/preload/index.ts` using `contextBridge`.

### 2. IPC Handlers — Core Set

Register these handlers in `src/main/ipc/index.ts`. For the prototype, each handler should query the SQLite DB synchronously (better-sqlite3 is synchronous — no await needed):

- `youtube:getChannels` — `SELECT * FROM yt_channels ORDER BY sort_order`
- `youtube:getVideos` — `SELECT * FROM yt_videos WHERE channel_id = ? ORDER BY published_at DESC LIMIT 15`
- `reddit:getDigestPosts` — `SELECT * FROM reddit_digest_posts ORDER BY fetched_at DESC` — returns a flat `DigestPost[]` array (grouping is done in the renderer)
- `reddit:getSavedPostsSummary` — `SELECT post_id, title, permalink, subreddit, saved_at FROM saved_posts ORDER BY saved_at DESC LIMIT 5`
- `scripts:getAll` — `SELECT s.*, r.started_at, r.finished_at, r.exit_code FROM scripts s LEFT JOIN script_runs r ON r.id = (SELECT id FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1)`
- `settings:getWidgetLayout` — reads `widget_order` and `widget_visibility` from `settings` table
- `settings:setWidgetLayout` — UPSERT `widget_order` and `widget_visibility` in `settings`
- `settings:getTheme` — reads `active_theme_id` from `settings`; returns `{ id: string; tokens: null }` (tokens always null in prototype — no custom themes)
- `settings:setTheme` — UPSERT `active_theme_id` in `settings`
- `shell:openExternal` — calls `shell.openExternal(url)` from Electron

No YouTube API calls, no ntfy polling, no script execution in the prototype. Just DB reads.

### 3. App Shell

- `src/renderer/main.tsx`: Wrap app in `ThemeProvider` then `MemoryRouter`. `ThemeProvider` calls `settings:getTheme` on mount, sets `document.documentElement.setAttribute('data-theme', id)`. For the prototype, only `system`/`light`/`dark` need to work — `system` uses `window.matchMedia('(prefers-color-scheme: dark)')` to choose between the two.
- `src/renderer/App.tsx`: Left sidebar (collapsible) + main content area via React Router `<Routes>` / `<Outlet>`.
- `src/renderer/components/Sidebar.tsx`: Nav items — Dashboard, Saved Posts, Script Manager, Settings. Active item highlighted. Collapse button toggles sidebar width (expanded: 200px, collapsed: icon-only 56px).
- Wire up routes: `/` → Dashboard, `/saved-posts` → placeholder (full view), `/scripts` → ScriptManager, `/settings` → Settings.
- Min window size: 900×600. Set in `BrowserWindow` options.

### 4. Dashboard — Drag-and-Drop Widget Layout

- `src/renderer/routes/Dashboard.tsx`: Fetches widget order via `settings:getWidgetLayout`. Renders widgets in that order inside a `@dnd-kit/core` `DndContext` + `SortableContext`.
- `src/renderer/components/WidgetWrapper.tsx`: Wraps each widget. In edit mode, shows a `useSortable` drag handle and an eye-icon toggle button.
- "Edit Layout" button in Dashboard header toggles edit mode. On drag-end, call `settings:setWidgetLayout` with the new order.
- Render two widgets: `YouTubeWidget` and `RedditDigestWidget`.

### 5. YouTube Widget

- `src/renderer/modules/youtube/YouTubeWidget.tsx`:
  - Header: "YouTube" title + gear icon (no-op for now).
  - Fetches channels via `youtube:getChannels`.
  - Renders one `ChannelRow` per enabled channel.
- `src/renderer/modules/youtube/ChannelRow.tsx`:
  - Channel thumbnail + name on the left.
  - `StreamPanel` on the left (shows upcoming/live videos from the channel's video list where `broadcast_status IN ('upcoming','live')`).
  - `VideoCarousel` on the right (horizontal scroll, `@radix-ui/react-scroll-area`, shows videos where `broadcast_status = 'none'` or null).
- `src/renderer/modules/youtube/VideoCarousel.tsx`: Horizontally scrollable row of `VideoCard` components. Each card: 16:9 thumbnail, title (2-line truncation), relative published date.
- `src/renderer/modules/youtube/StreamPanel.tsx`: Shows stream cards. Each card: thumbnail, title, status badge ("LIVE NOW" in red Badge, or "Starts in Xh Ym" in neutral Badge). If empty, show "No upcoming streams" in muted text.
- All links open in default browser: `window.api.invoke('shell:openExternal', url)` — add this IPC handler using Electron's `shell.openExternal`.

### 6. Reddit Digest Widget

- `src/renderer/modules/reddit/RedditDigestWidget.tsx`:
  - Header: "Reddit Digest" + last-fetched timestamp + `DigestViewControls` component.
  - Fetches digest posts via `reddit:getDigestPosts` — returns a flat `DigestPost[]`. Read the view config from `settings:get('reddit_digest_view_config')` (parse JSON; apply defaults if missing).
  - Applies sort client-side: sort the flat array by `sort_by` field in `sort_dir` direction.
  - Applies grouping client-side: if `group_by = 'subreddit'`, group into a `Map<string, DigestPost[]>`. If `group_by = 'none'`, single group labeled "All".
  - Renders in `layout_mode`: columns uses CSS grid `grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`; tabs uses shadcn `Tabs` with one tab per group.
- `src/renderer/modules/reddit/DigestViewControls.tsx`: small sort dropdown (Score / Comments / Age / Date collected) and a layout toggle button (columns icon / tabs icon). On change, persist the full config object via `settings:set('reddit_digest_view_config', JSON.stringify(newConfig))` and update local state immediately (optimistic).
- `src/renderer/modules/reddit/SubredditColumn.tsx`: Column header (r/subreddit or "All"), then list of `DigestPostRow` components.
- `src/renderer/modules/reddit/DigestPostRow.tsx`: title (linked, opens in browser via `shell:openExternal`), score, comment count, relative age. No thumbnail needed.

### 7. Saved Posts Widget

- `src/renderer/modules/saved-posts/SavedPostsWidget.tsx`:
  - Header: "Saved Posts" + "View All" link (navigates to `/saved-posts`).
  - Fetches data via `reddit:getSavedPostsSummary`.
  - Renders up to 5 `SavedPostSummaryRow` components (inline or separate file).
- `SavedPostSummaryRow`: subreddit chip (shadcn `Badge`), title (linked via `shell:openExternal`), relative saved date.
- If the result is empty: show "No saved posts yet." in muted text. Do not show the ntfy onboarding prompt in the widget — that belongs in the full Saved Posts route only.
- Register `saved_posts` in the renderer module registry (`src/renderer/modules/registry.ts`) alongside `youtube` and `reddit_digest`.

### 8. Script Manager View

- `src/renderer/routes/ScriptManager.tsx`:
  - Fetches all scripts via `scripts:getAll`.
  - Renders a list of `ScriptRow` components.
- `ScriptRow` (inline or separate): name, schedule description, last-run time, exit code badge (green/red/grey), `isStale` → amber `[!]` indicator. "Run Now" button (no-op in prototype — just `console.log`).
- Stale badge on sidebar nav item: hardcode `hasStale: true` in the prototype — seed data includes a stale script.

### 9. Settings Screen Stub

- `src/renderer/routes/Settings.tsx`: Tabbed layout using shadcn `Tabs`.
- Tabs: "API Keys", "YouTube", "Reddit Digest", "Saved Posts", "Appearance".
- API Keys tab: a password input for "YouTube Data API v3 Key" with a show/hide toggle and a "Save" button (no-op — just `console.log`).
- YouTube tab: a list of channels from the DB (same data as widget), each with an enabled toggle. An "Add Channel" text input with an "Add" button (no-op).
- Appearance tab: a `ThemeSelect` with three options — System Default, Light, Dark. On change, call `settings:setTheme(id)` then re-call `settings:getTheme()` and update `ThemeProvider` state (the simplest approach is to expose a `setTheme` function from `ThemeProvider` via a `useTheme()` hook that the Appearance tab calls directly).
- Other tabs: placeholder text "Configuration coming soon."

---

## What to Skip

The following are explicitly out of scope for the prototype. Do not implement them:

- **YouTube RSS polling** — no interval timer, no actual RSS fetches. All video data is seeded.
- **YouTube Data API v3 calls** — no HTTP calls to YouTube. No API key validation.
- **ntfy.sh polling** — no ntfy ingestion on startup or on demand.
- **Saved Posts full-page view** — render a route placeholder (`/saved-posts`). The `SavedPostsWidget` on the dashboard IS in scope (step 7). Skip the full list/search/filter view, NtfyOnboardingModal, and tag management.
- **ntfy onboarding flow** — skip all 4 steps.
- **Script execution** — "Run Now" does not spawn any child process. Just `console.log`.
- **node-cron scheduling** — no cron jobs. Scripts are display-only.
- **safeStorage** — skip encrypted API key storage. The Settings API key field can just `console.log`.
- **Tag management** — skip entirely.
- **FTS5 search** — skip entirely (full Saved Posts view is a placeholder).
- **Custom themes** — the `themes` DB table ships empty; only the three built-in themes (system/light/dark) need to function in the prototype. No theme creation UI.
- **electron-builder packaging** — prototype runs in dev mode only (`npm run dev`).
- **Auto-update** — not in scope.
- **Error handling / toasts** — basic console.error is sufficient. No error boundary UI.
- **Window management** — single window, no tray icon.
- **Channel add flow** (API resolution) — the Add Channel button can be a no-op.
- **Per-channel enabled toggle persistence** — the toggle can update local state only; no IPC call needed.

---

## Data — Seed SQL

Insert this data in `001_initial.sql` (or a separate `src/main/db/seed.ts` called in dev mode only):

```sql
-- Settings
INSERT OR IGNORE INTO settings VALUES ('schema_version', '1');
INSERT OR IGNORE INTO settings VALUES ('widget_order', '["youtube","reddit_digest","saved_posts"]');
INSERT OR IGNORE INTO settings VALUES ('widget_visibility', '{"youtube":true,"reddit_digest":true,"saved_posts":true}');
INSERT OR IGNORE INTO settings VALUES ('rss_poll_interval_minutes', '15');
INSERT OR IGNORE INTO settings VALUES ('active_theme_id', 'system');
INSERT OR IGNORE INTO settings VALUES ('reddit_digest_view_config', '{"sort_by":"score","sort_dir":"desc","group_by":"subreddit","layout_mode":"columns"}');

-- YouTube channels
INSERT OR IGNORE INTO yt_channels VALUES
  ('UC_x5XG1OV2P6uZZ5FSM9Ttw', 'Google Developers',
   'https://yt3.ggpht.com/placeholder-thumb-1.jpg',
   1700000000, 1, 0),
  ('UCVHFbw7woebKtfvTzSGJ1pQ', 'Fireship',
   'https://yt3.ggpht.com/placeholder-thumb-2.jpg',
   1700000100, 1, 1);

-- YouTube videos (mix of regular and live)
INSERT OR IGNORE INTO yt_videos VALUES
  ('dQw4w9WgXcQ', 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
   'Building with Gemini API — Full Tutorial',
   1710000000,
   'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
   1823, 'none', NULL, 1710100000),
  ('abc123def456', 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
   'Flutter 3.19 — What is New',
   1709900000,
   'https://i.ytimg.com/vi/abc123def456/hqdefault.jpg',
   934, 'none', NULL, 1710100000),
  ('liveStream001', 'UC_x5XG1OV2P6uZZ5FSM9Ttw',
   'Google I/O 2026 Keynote — LIVE',
   1710200000,
   'https://i.ytimg.com/vi/liveStream001/hqdefault.jpg',
   NULL, 'upcoming',
   -- Set scheduled_start to ~2 hours from a known test date:
   1710507600,
   1710200000),
  ('xyz789ghi000', 'UCVHFbw7woebKtfvTzSGJ1pQ',
   'I built a full-stack app in 100 seconds',
   1710050000,
   'https://i.ytimg.com/vi/xyz789ghi000/hqdefault.jpg',
   412, 'none', NULL, 1710100000),
  ('xyz789ghi001', 'UCVHFbw7woebKtfvTzSGJ1pQ',
   'Next.js 15 is here',
   1709980000,
   'https://i.ytimg.com/vi/xyz789ghi001/hqdefault.jpg',
   380, 'none', NULL, 1710100000);

-- Saved posts (for SavedPostsWidget on dashboard)
INSERT OR IGNORE INTO saved_posts
  (post_id, title, url, permalink, subreddit, author, score, body, saved_at, tags)
VALUES
  ('sp001', 'Why Rust async is finally good',
   'https://example.com/rust-async',
   '/r/rust/comments/sp001/why_rust_async_is_finally_good/',
   'rust', 'async_fan', 2110, NULL, 1742036400, NULL),
  ('sp002', 'I built a personal news dashboard in Electron',
   'https://github.com/example/personal-news',
   '/r/programming/comments/sp002/i_built/',
   'programming', 'user_one', 842, NULL, 1741950000, '["projects","electron"]'),
  ('sp003', 'New generics patterns in Go 1.22',
   'https://go.dev/blog/generics',
   '/r/golang/comments/sp003/new_generics/',
   'golang', 'gopher_99', 1203, NULL, 1741863600, NULL);

-- Scripts (one stale, one healthy)
INSERT OR IGNORE INTO scripts VALUES
  (1, 'Reddit Digest', '/home/user/scripts/reddit_digest.py',
   'python3', '--limit 25',
   '{"type":"fixed_time","hour":6,"minute":0}',
   1, 1700000000),
  (2, 'Backup Notes', '/home/user/scripts/backup_notes.py',
   'python3', NULL,
   '{"type":"interval","minutes":120}',
   1, 1700000100);

-- Script runs: Reddit Digest last ran 3 days ago (stale), Backup ran 1 hour ago (healthy)
INSERT OR IGNORE INTO script_runs VALUES
  (1, 1,
   -- 3 days ago:
   1709827200, 1709827245, 0,
   'Fetched 50 posts across 2 subreddits.', NULL),
  (2, 2,
   -- 1 hour ago (relative to 2026-03-15 12:00 UTC = 1742040000):
   1742036400, 1742036412, 0,
   'Backup complete. 142 files copied.', NULL);
```

**Note on timestamps:** The seed data uses fixed Unix timestamps. The stale detection logic in `scripts:getAll` will correctly identify script ID 1 as stale (last ran 3 days ago, scheduled daily). If running the prototype much later than March 2026, update the `script_runs.started_at` / `finished_at` values for script 2 to be recent (within 2 hours of the current time) so it remains non-stale. Reddit Digest starts empty until the script runs.

---

## Key Decisions the Prototype Must Respect

1. **IPC-first, always.** The renderer never imports `better-sqlite3` or touches the file system. All DB reads go through `window.api.invoke`. No exceptions — this boundary must be established from the first line of code.

2. **`contextIsolation: true`, `nodeIntegration: false`.** Set these in `BrowserWindow` creation. The preload script is the only bridge. If you find yourself needing `nodeIntegration: true` to make something work, you are doing it wrong — use IPC instead.

3. **Module ID as the join key.** The string IDs `'youtube'` and `'reddit_digest'` must be consistent across: `widget_order` in the settings table, the renderer module registry array, and the IPC channel prefixes. A mismatch will break the dashboard rendering.

4. **better-sqlite3 is synchronous.** All DB calls in IPC handlers are synchronous — no async/await needed for DB operations. Do not wrap them in Promises unless you have a specific reason to. This is the whole point of using better-sqlite3.

5. **Push events for live updates.** When a background task modifies the DB (even in future when polling is added), it notifies the renderer via `BrowserWindow.webContents.send(channel)`, not by the renderer polling on a timer. Establish the `window.api.on` subscription pattern in at least one hook (e.g., `useYouTubeChannels`) even if the push event never fires in the prototype — this proves the architecture is wired correctly.

6. **Theme system must be extensible from the start.** The `ThemeProvider` must handle both built-in string IDs (`system`/`light`/`dark`) and an arbitrary `tokens` object from the DB. In the prototype, `tokens` is always `null`, but the code path that injects CSS custom properties from a `tokens` object must be written and branched on — not deferred. This ensures the architecture supports user-created themes without a future rewrite.

7. **Digest posts are a flat array; grouping is the renderer's job.** `reddit:getDigestPosts` returns `DigestPost[]`, not `{ [subreddit: string]: DigestPost[] }`. The renderer groups and sorts the array according to the `reddit_digest_view_config` setting. Never push grouping logic into the IPC handler.

---

## Folder Structure

```
personal-news/
├── electron.vite.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.node.json
│
├── resources/
│   └── scripts/
│       └── reddit_digest.py          (bundled default script)
│
├── src/
│   ├── main/
│   │   ├── index.ts                  BrowserWindow creation, startup sequence
│   │   ├── db/
│   │   │   ├── database.ts           Open DB, run migrations
│   │   │   └── migrations/
│   │   │       └── 001_initial.sql   Full schema + seed data (including themes table)
│   │   ├── ipc/
│   │   │   └── index.ts              All ipcMain.handle() registrations
│   │   ├── sources/
│   │   │   ├── registry.ts           DataSourceModule interface + registry
│   │   │   ├── youtube/
│   │   │   │   └── index.ts          YouTubeModule stub
│   │   │   ├── reddit/
│   │   │   │   └── index.ts          RedditModule stub
│   │   │   └── scripts/
│   │   │       └── index.ts          ScriptManagerModule stub
│   │   └── settings/
│   │       └── store.ts              getSetting/setSetting helpers
│   │
│   ├── preload/
│   │   └── index.ts                  contextBridge: window.api.invoke/on/off
│   │
│   ├── renderer/
│   │   ├── index.html
│   │   ├── main.tsx                  ReactDOM.createRoot, ThemeProvider > MemoryRouter
│   │   ├── App.tsx                   Sidebar + Outlet layout
│   │   ├── providers/
│   │   │   └── ThemeProvider.tsx     Fetches active theme; sets data-theme on <html>
│   │   ├── routes/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── SavedPosts.tsx        Placeholder only (full view)
│   │   │   ├── ScriptManager.tsx
│   │   │   └── Settings.tsx
│   │   ├── modules/
│   │   │   ├── registry.ts           youtube + reddit_digest + saved_posts
│   │   │   ├── youtube/
│   │   │   │   ├── YouTubeWidget.tsx
│   │   │   │   ├── ChannelRow.tsx
│   │   │   │   ├── StreamPanel.tsx
│   │   │   │   ├── VideoCarousel.tsx
│   │   │   │   └── VideoCard.tsx
│   │   │   ├── reddit/
│   │   │   │   ├── RedditDigestWidget.tsx
│   │   │   │   ├── DigestViewControls.tsx  Sort + layout toggle
│   │   │   │   ├── SubredditColumn.tsx
│   │   │   │   └── DigestPostRow.tsx
│   │   │   └── saved-posts/
│   │   │       └── SavedPostsWidget.tsx    Dashboard widget (5 most recent)
│   │   ├── components/
│   │   │   ├── ui/                   (shadcn/ui components)
│   │   │   ├── Sidebar.tsx
│   │   │   └── WidgetWrapper.tsx
│   │   ├── hooks/
│   │   │   ├── useYouTubeChannels.ts
│   │   │   ├── useYouTubeVideos.ts
│   │   │   ├── useRedditDigest.ts
│   │   │   ├── useSavedPostsSummary.ts
│   │   │   ├── useScripts.ts
│   │   │   ├── useWidgetLayout.ts
│   │   │   ├── useTheme.ts           Reads/writes active_theme_id; used by ThemeProvider
│   │   │   └── useRedditDigestConfig.ts  Reads/writes reddit_digest_view_config
│   │   └── lib/
│   │       ├── utils.ts              cn() helper
│   │       └── time.ts               formatRelativeTime(unixTs): string
│   │
│   └── shared/
│       └── ipc-types.ts              Channel name constants + payload types
│
└── docs/
    └── architecture/                 (these files)
```

---

## How to Run

```bash
npm install
npm run dev
```

If `better-sqlite3` fails to load (native module mismatch), run:

```bash
./node_modules/.bin/electron-rebuild
npm run dev
```

The app opens a single window. No external services are required to see the dashboard with seed data.

---

## Open Questions

None. All decisions have been resolved. This document contains zero `Decision needed` callouts.
