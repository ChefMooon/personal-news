# System Architecture Overview — Personal News Dashboard

**Project:** personal-news
**Last Updated:** 2026-03-24 (rev 3)

---

## 1. Architecture Pattern

The application follows a **layered, process-separated architecture** imposed by Electron's security model:

```
┌──────────────────────────────────────────────────────────┐
│  Renderer Process (Chromium)                             │
│  React UI — no Node.js access; communicates only via IPC │
├──────────────────────────────────────────────────────────┤
│  Preload Script (contextBridge)                          │
│  Typed IPC surface — only channel exposed to renderer    │
├──────────────────────────────────────────────────────────┤
│  Main Process (Node.js)                                  │
│  Database · Data Sources · Scheduler · Notifications     │
│  Tray · Auto-Updates · Child Processes                   │
└──────────────────────────────────────────────────────────┘
```

The renderer never touches the database or file system directly. All data flows through IPC invoke/handle pairs defined in the preload bridge. This is enforced by `contextIsolation: true` and `nodeIntegration: false`.

---

## 2. Component Map

```
src/
├── main/                          MAIN PROCESS
│   ├── index.ts                   Entry — creates BrowserWindow, runs startup tasks
│   ├── db/
│   │   ├── database.ts            Opens SQLite connection; applies schema baseline
│   │   └── migrations/            Baseline migration SQL (`001_initial.sql`)
│   ├── ipc/
│   │   └── index.ts               Registers all ipcMain.handle() channels
│   ├── notifications/
│   │   └── notification-service.ts Desktop notification preferences + emitters
│   ├── sources/
│   │   ├── registry.ts            Module registry — lifecycle for main-process sources
│   │   ├── link-sources.ts        Saved-link source detection and generic metadata fallback
│   │   ├── youtube/
│   │   │   └── index.ts           YouTubeModule — polling, ingest, notifications
│   │   ├── reddit/
│   │   │   ├── index.ts           RedditModule — startup/scheduled/manual ntfy polling
│   │   │   ├── ntfy.ts            ntfy.sh poller + saved_posts upsert
│   │   │   ├── metadata.ts        Reddit JSON API fetcher (post metadata)
│   │   │   └── validation.ts      Reddit URL validation/normalization helpers
│   │   └── scripts/
│   │       ├── index.ts           ScriptManagerModule — implements DataSourceModule
│   │       ├── executor.ts        child_process.spawn wrapper; streams stdout/stderr
│   │       └── scheduler.ts       node-cron job registry; stale detection logic
│   └── settings/
│       └── store.ts               settings table R/W; safeStorage for API key
│   └── updates/
│       └── service.ts             Windows packaged auto-update integration
│
├── preload/
│   └── index.ts                   contextBridge.exposeInMainWorld — all IPC channels
│
└── renderer/                      RENDERER PROCESS
    ├── main.tsx                   React entry point
    ├── App.tsx                    Shell — sidebar nav + <Outlet>
    ├── routes/
    │   ├── Dashboard.tsx
   │   ├── YouTube.tsx
   │   ├── RedditDigest.tsx
   │   ├── SavedPosts.tsx
    │   ├── ScriptManager.tsx
    │   └── Settings.tsx
    ├── providers/
    │   └── ThemeProvider.tsx      Applies active theme to <html data-theme>; handles system preference
    ├── modules/                   One folder per data source
    │   ├── youtube/
    │   ├── reddit/
    │   ├── saved-posts/           SavedPostsWidget (dashboard) + SavedPostsSettings
    │   └── scripts/
    └── components/                Shared UI components
        ├── ui/                    shadcn/ui components (owned copies)
        └── ...
```

---

## 3. Data Flow

### 3.1 App Startup Sequence

```
1. main/index.ts starts
2. db/database.ts opens SQLite; applies `001_initial.sql` when schema is uninitialized
3. sources/registry.ts calls initialize(db) on every registered DataSourceModule
4. registered source modules initialize background work (YouTube polling, ntfy polling, script schedules)
5. auto-update service initializes for packaged Windows builds when enabled
6. scripts/scheduler.ts registers node-cron jobs for all scheduled scripts;
   runs any scripts with schedule = 'on_app_start'
7. BrowserWindow and Tray are created; close-to-tray defaults are applied
8. renderer loads and hydrates from IPC
```

### 3.2 YouTube RSS Poll Cycle

```
1. Scheduled poll fires inside youtube/index.ts
2. For each enabled channel: fetch RSS feed (HTTP GET, quota-free)
3. Parse Atom XML → extract video IDs
4. Query DB for known video IDs for this channel
5. Compute delta (new IDs not in DB)
6. Collect uncached video IDs plus already-tracked upcoming/live IDs that need refresh
7. Fetch YouTube Data API details in batches from the same module (batch size up to 50)
8. Upsert results into yt_videos
9. Emit `youtube:updated` so the renderer re-queries
```

### 3.3 ntfy Ingestion Flow (startup + scheduled/manual)

```
1. Read ntfy_topic, ntfy_server_url, ntfy_last_message_id from settings table
2. If topic not configured → skip; log; return
3. GET {server_url}/{topic}/json?poll=1&since={last_message_id}
   (since=all on first run)
4. Parse newline-delimited JSON response
5. For each message event:
   a. Parse URL + optional note from plain text or share-sheet JSON
   b. If no HTTP(S) URL is found → log and skip (cursor still advances)
   c. Detect source (reddit | x | bsky | generic)
   d. Resolve source-specific metadata and upsert into saved_posts
6. Update ntfy_last_message_id to ID of last processed message
7. Update ntfy_last_polled_at to current Unix timestamp
8. If ntfy unreachable → log; leave cursor unchanged; return without updating ntfy_last_polled_at
```

### 3.4 Script Execution Flow

```
1. User clicks "Run Now" → renderer invokes scripts:run(scriptId)
2. ipcMain handler calls scripts/executor.ts runScript('python3', filePath, args)
3. child_process.spawn starts the child process
4. stdout/stderr chunks forwarded to renderer via BrowserWindow.webContents.send('scripts:output', {scriptId, chunk})
5. On process exit: write script_runs row (started_at, finished_at, exit_code, stdout, stderr)
6. Send 'scripts:runComplete' event to renderer with { scriptId, exitCode }
```

### 3.5 Renderer Data Hydration

```
1. Route component mounts
2. Calls window.api.invoke('channel:name', ...args) via preload bridge
3. ipcMain handler queries SQLite synchronously (better-sqlite3)
4. Returns serialized data to renderer
5. React state updated; component re-renders
```

---

## 4. Module Registry

Each data source implements `DataSourceModule`:

```typescript
interface DataSourceModule {
  id: string;                         // e.g. 'youtube'
  displayName: string;                // e.g. 'YouTube'
  initialize(db: Database): void;     // Called on app start — set up DB refs, start timers
  shutdown(): void;                   // Called on app quit — clear timers, kill processes
}
```

The registry in `sources/registry.ts` holds the array of all registered main-process modules and manages startup/shutdown only. Renderer widget rendering is driven by the persisted widget layout plus the renderer module registry. Adding a new data source still means creating a new module file and registering it, but dashboard rendering is instance-based rather than registry-order based.

Widget and settings components live in the renderer under `modules/{id}/`. The module `id` is the join key between the main-process module and its renderer components.

---

## 5. IPC Bridge Contract

The preload script exposes a single `window.api` object:

```typescript
window.api = {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>,
  on: (channel: string, listener: (...args: unknown[]) => void) => void,
  off: (channel: string, listener: (...args: unknown[]) => void) => void,
}
```

All renderer-to-main communication uses `invoke` (request/response). All main-to-renderer push events use `on`/`off`. The complete channel registry is in `docs/architecture/ipc.md`.

---

## 6. Storage Locations

| Data | Location | Notes |
|------|----------|-------|
| SQLite database | `{userData}/data.db` | All structured app data |
| YouTube API key | `safeStorage` encrypted blob, stored alongside app config | Never in SQLite |
| Migration files | `src/main/db/migrations/*.sql` | Bundled with app |
| Bundled scripts | `resources/scripts/` | Reddit digest default script |

`{userData}` resolves to:
- Windows: `%APPDATA%\personal-news\`
- macOS: `~/Library/Application Support/personal-news/`
- Linux: `~/.config/personal-news/`

---

## 7. Security Constraints

- `contextIsolation: true`, `nodeIntegration: false` — enforced in BrowserWindow creation.
- The preload script is the only code that bridges main and renderer. It uses `contextBridge.exposeInMainWorld` exclusively.
- The renderer never receives the raw YouTube API key. IPC returns only a boolean `hasKey` flag or masked display string.
- Scripts run with the same OS permissions as the Electron process. No sandboxing is applied; this is acceptable for a personal-use app where the user registers their own scripts.
- ntfy message bodies must yield a valid HTTP(S) URL before any follow-up fetch is made; source-specific metadata resolution happens only after that parse step.
