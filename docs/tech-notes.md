# Technical Notes — Personal News Dashboard

**Project:** personal-news
**Status:** Draft
**Last Updated:** 2026-03-15 (rev 7)
**Related Docs:** [PRD.md](./PRD.md) | [data-sources.md](./data-sources.md) | [ui-ux.md](./ui-ux.md)

---

## 1. Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Desktop runtime | Electron | Cross-platform desktop (Windows, macOS, Linux). Enables Node.js APIs (file system, child process, HTTP server) alongside a web UI. Standard choice for distributable desktop apps in JS ecosystem. |
| UI framework | React | Component model aligns well with the widget/module architecture. Large ecosystem. |
| Styling | Tailwind CSS | Utility-first, consistent design tokens, pairs well with shadcn/ui. |
| Component library | shadcn/ui | Radix UI primitives — accessible, composable, and unstyled enough to customize. Owned components (copied into repo) rather than a black-box dependency. |
| Database | better-sqlite3 | Synchronous SQLite bindings for Node.js. Simpler than async alternatives for this use case. All data is local; no concurrency issues. |
| Packaging | electron-builder | Mature packaging and auto-update solution. Supports NSIS (Windows), DMG (macOS), AppImage/deb (Linux). |
| Drag-and-drop | @dnd-kit/core | Accessible drag-and-drop primitives for React. Preferred over react-beautiful-dnd (deprecated) and react-dnd (heavier). |
| Build toolchain | electron-vite | Opinionated Electron + Vite scaffold. Handles main/renderer/preload configuration with minimal setup. Confirmed over manual Vite config. |
| Scheduling | node-cron | Cron-style scheduling within the Electron main process. Scripts only run when the app is open — this is a known and accepted limitation. |

---

## 2. Electron Architecture

### 2.1 Main Process vs. Renderer Process

Electron splits code into two contexts:

- **Main process** (Node.js): Full access to the OS. Handles database access, child process spawning, scheduling, and all external API calls (including ntfy.sh polling).
- **Renderer process** (Chromium): Runs the React UI. Has no direct Node.js access by default (contextIsolation: true, nodeIntegration: false).
- **Preload script**: The bridge. Exposes a typed, minimal API surface from main to renderer via `contextBridge.exposeInMainWorld`.

This separation is enforced for security. The renderer never touches the database or file system directly — it only calls IPC functions exposed by the preload.

### 2.2 IPC Communication Pattern

All data flows through Electron's `ipcMain` / `ipcRenderer` via the preload bridge. Example channels:

```
youtube:getChannels        → returns channel list
youtube:addChannel         → takes channel ID, triggers fetch
youtube:getVideos          → takes channel ID, returns cached videos
reddit:getSavedPosts       → returns saved post list
reddit:pollNtfy            → triggers an immediate ntfy.sh poll (manual refresh)
reddit:getNtfyStaleness    → returns { lastPolledAt: number | null } so the renderer can compute whether to show the stale warning
scripts:getAll             → returns registered scripts
scripts:run                → takes script ID, triggers execution
scripts:getRunHistory      → takes script ID, returns run records
settings:getApiKey         → returns the YouTube API key (decrypted from safeStorage; never returns the raw value to the renderer, only a masked confirmation)
settings:setApiKey         → takes the YouTube API key value, encrypts and stores via safeStorage
settings:getNtfyConfig     → returns { topic, serverUrl } from the plain settings table
settings:setNtfyConfig     → takes { topic, serverUrl }, writes plain text to the settings table
```

IPC calls from the renderer should always be async (invoke/handle pattern, not send/on) so the UI can await results.

### 2.3 Background Work in Main Process

The following run in the main process on timers or events:

- **YouTube RSS poller**: `setInterval` or `node-cron` job per configured channel. Polls the RSS feed, compares against stored video IDs, triggers API v3 fetch if delta detected.
- **Script scheduler**: `node-cron` jobs per script with a schedule. Spawns the script as a child process.
- **ntfy.sh startup poll**: Runs once on app launch. Fetches new messages from the user's configured ntfy.sh topic, ingests any valid Reddit URLs as saved posts, and advances the message cursor. No persistent listener or open port is required.

These must not block the main process event loop. Long-running work (script execution) runs in child processes. Network calls use async APIs.

---

## 3. YouTube API Strategy

**Goal:** Stay within the YouTube Data API v3 free tier (10,000 units/day) for a typical personal-use channel list.

### 3.1 RSS-First Approach

YouTube's public Atom feed (`youtube.com/feeds/videos.xml?channel_id=...`) is quota-free and returns the 15 most recent uploads. This is the primary discovery mechanism:

1. Poll the RSS feed every N minutes (user-configurable, default 15 minutes; stored as `rss_poll_interval_minutes` in the `settings` table).
2. Parse the feed for video IDs.
3. Compare against video IDs already in the database.
4. If no new IDs, stop. No API call made.
5. If new IDs detected, proceed to Tier 2.

### 3.2 API v3 Calls

Called only when necessary:

| Trigger | API Call | Quota Cost |
|---------|----------|------------|
| New video detected via RSS | `videos.list` (batch, up to 50) | 1 unit |
| Channel added by user | `channels.list` | 1 unit |
| Known upcoming stream — reschedule check | `videos.list` (single or batch) | 1 unit |

**Quota estimate (example):** 10 channels, each with 1 new video per day = 10 `videos.list` calls/day = 10 units/day. Well within the 10,000 unit free tier. The RSS polling itself costs 0 units.

### 3.3 Deduplication

Video IDs are the primary key in `yt_videos`. An upsert on video ID prevents duplicates even if the poller runs more frequently than new content is uploaded.

---

## 4. Data Persistence

### 4.1 Database

**better-sqlite3** with a single SQLite file stored in the Electron user data directory:
```
Windows:  %APPDATA%\personal-news\data.db
macOS:    ~/Library/Application Support/personal-news/data.db
Linux:    ~/.config/personal-news/data.db
```

All schema definitions are in migration files. The app runs pending migrations on startup. A simple integer schema version in a `meta` table tracks the current state.

### 4.2 Schema Versioning

```sql
CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
-- Example: INSERT INTO meta VALUES ('schema_version', '1');
```

Migrations are numbered files (e.g., `001_initial.sql`, `002_add_tags.sql`). On startup, the app reads the current version, finds all migration files with a higher number, and runs them in order within a transaction.

### 4.3 Full Schema Reference

See [data-sources.md](./data-sources.md) for per-source table definitions. Additional tables:

```sql
-- Application settings — plain text values only.
-- Examples: ntfy_topic, ntfy_server_url, ntfy_last_message_id,
--           ntfy_last_polled_at, widget_order, rss_poll_interval_minutes
CREATE TABLE settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

The YouTube Data API v3 key is NOT stored in the `settings` table — it is encrypted via `safeStorage` and stored separately. See Section 5.

---

## 5. Credential Storage

Only one value in this application is a true credential: the **YouTube Data API v3 key**. It has quota and potential billing implications if leaked, and must not be stored in plaintext.

**Storage mapping — explicit:**

| Value | Storage | Rationale |
|-------|---------|-----------|
| YouTube Data API v3 key | `safeStorage` (encrypted) | Real credential — quota/billing implications if exposed |
| ntfy topic name | `settings` table (plain text) | Not a credential; no account, no billing, no quota |
| ntfy server URL | `settings` table (plain text) | Not a credential; a URL, not a secret |
| ntfy cursor / timestamps | `settings` table (plain text) | Operational state, not sensitive |

**`safeStorage` API (Electron built-in)**

Electron's `safeStorage` module encrypts and decrypts strings using the OS-level credential store:
- Windows: DPAPI
- macOS: Keychain
- Linux: libsecret / kwallet

The encrypted bytes are stored in a dedicated column or separate blob (not in the plain `settings` table). On read, the main process decrypts via `safeStorage.decryptString`. The renderer never sees the raw key value — IPC returns only a masked confirmation that a key has been set.

**Why not `keytar`?** `keytar` is a native module that requires rebuilding for each Electron version. `safeStorage` is built into Electron, requires no rebuild, and is the current recommended approach as of Electron 15+.

---

## 6. ntfy.sh Ingestion (Saved Posts)

Saved posts are ingested by polling a user-configured ntfy.sh topic at app startup. The app makes only outbound HTTPS requests — no local port is opened.

### 6.1 Poll Request

```
GET https://ntfy.sh/{TOPIC}/json?poll=1&since={LAST_MESSAGE_ID}
```

- `poll=1` tells ntfy.sh to return immediately rather than holding the connection open (long-poll mode is not used).
- `since={LAST_MESSAGE_ID}` returns only messages newer than the last successfully processed message. The cursor is stored in the `settings` table under the key `ntfy_last_message_id`. On first run, `since=all` fetches all available messages.
- Response is newline-delimited JSON — each line is one message object with an `id` and `message` field.

### 6.2 ntfy.sh Message Format

The mobile shortcut sends the Reddit post URL as the plain message body. Example message object:

```json
{
  "id": "2oSuEFZbjMn2",
  "time": 1710500000,
  "event": "message",
  "topic": "your-private-topic",
  "message": "https://www.reddit.com/r/example/comments/abc123/post_title/"
}
```

The app extracts the `message` field and validates it matches a Reddit post URL pattern before fetching metadata.

### 6.3 Stale Poll Detection

The app tracks the timestamp of the last successful ntfy poll in the `settings` table under the key `ntfy_last_polled_at` (Unix timestamp). On each app launch, after the startup poll completes, this value is updated.

The renderer fetches this value via the `reddit:getNtfyStaleness` IPC channel. If the elapsed time since `ntfy_last_polled_at` exceeds 24 hours — or if the value is null (never polled) and a topic is configured — the Saved Posts view displays the stale-poll warning banner (see ui-ux.md Section 6.0).

The threshold is 24 hours because that is the default message retention period on the public ntfy.sh server. Users who self-host can extend retention, but the warning threshold is kept at 24 hours for consistency — it reflects the worst-case scenario on the public service.

### 6.4 Custom Server URL

The ntfy server base URL is stored in the `settings` table under the key `ntfy_server_url` (plaintext — not a secret). It defaults to `https://ntfy.sh` if absent. All poll requests use this base URL:

```
GET {ntfy_server_url}/{TOPIC}/json?poll=1&since={LAST_MESSAGE_ID}
```

Users configure this in the onboarding flow (Step 2) and can edit it later in Settings. This supports self-hosted ntfy instances without any code changes.

### 6.5 Security Considerations

- The ntfy topic name and server URL are not credentials and are stored as plain text in the `settings` table (see Section 5 for the full storage mapping).
- A long, random topic name provides obscurity — anyone who knows the topic name can post to it, but it cannot be guessed if sufficiently random. The onboarding flow pre-generates a 20-character alphanumeric name and explains this tradeoff.
- The app validates that each message body is a Reddit URL before making any follow-up fetch. Non-Reddit URLs are ignored and logged.
- ntfy.sh retains messages for 24 hours on the free public tier. The onboarding flow surfaces this limitation at Step 2 so users can make an informed choice about self-hosting before completing setup.
- The server URL is validated as a well-formed `https://` URL before saving.

---

## 7. Script Manager — Child Process Execution

Scripts are executed using Node.js `child_process.spawn` in the Electron main process. In v1, the interpreter is always `python3`. The execution function accepts an interpreter parameter internally so that future support for other runtimes requires no structural changes.

```javascript
// Internal signature — interpreter fixed to 'python3' in v1
function runScript(interpreter: string, scriptPath: string, args: string[]) {
  const child = spawn(interpreter, [scriptPath, ...args], {
    cwd: path.dirname(scriptPath),
    env: { ...process.env }
  });
  // ...
}
```

- `stdout` and `stderr` are streamed and forwarded to the renderer via IPC as chunks.
- On process exit, `exit_code`, `stdout`, and `stderr` are written to `script_runs`.
- Output is truncated at a configurable limit (default: 50KB) to prevent unbounded DB growth.
- A running script can be terminated via `child.kill()` triggered by a UI cancel action.

**Python environment:** The app uses whatever `python3` resolves to on `PATH`. The app does not bundle a Python runtime. Users are responsible for having Python installed. This must be documented in the README as a prerequisite.

---

## 8. Module / Plugin Architecture

To satisfy NFR-04 (adding a data source must not require changes to core code), each data source should be structured as a module with a defined interface:

```typescript
interface DataSourceModule {
  id: string;                    // Unique identifier, e.g. 'youtube'
  displayName: string;
  initialize(db: Database): void; // Run on app start
  getWidgetComponent(): ReactComponent;
  getSettingsComponent(): ReactComponent;
  onScheduledRefresh?(): Promise<void>;
}
```

The core app maintains a registry of modules. The dashboard iterates the registry to render widgets and settings sections. Adding a new source = adding a new module file and registering it — no changes to dashboard layout or settings screen plumbing.

Assumed: This interface is not final. The architecture agent should define the exact contract. This is a directional sketch to ensure modularity is a first-class design constraint, not an afterthought.

---

## 9. Packaging and Distribution

**electron-builder** handles packaging. Targets:

| Platform | Format | Notes |
|----------|--------|-------|
| Windows | NSIS installer (.exe) | Standard Windows installer experience |
| macOS | DMG | Requires code signing for Gatekeeper |
| Linux | AppImage | Portable, no install required |

**Native modules:** `better-sqlite3` is a native Node module that must be compiled for the target Electron version. electron-builder handles this via `electron-rebuild` as part of the build pipeline.

**Production verification (Windows):** Run `npm run verify:production:win` to execute the full local release gate. This verifies:

- `npm run build` succeeds
- `npm run build:win -- --publish=never` produces expected installer/unpacked outputs
- packaged resources include DB migrations under `resources/migrations`
- `better-sqlite3` native binary exists under `resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node`
- packaged runtime smoke test initializes the database and migrations successfully

**Packaged smoke mode:** The main process supports `--smoke-test` and optional `--smoke-output=<path>` to initialize DB/migrations in packaged mode and exit with status 0 on success. This is used by the Windows verification script and CI pipeline.

**Auto-update:** Considered for v2. electron-builder supports `electron-updater` for GitHub Releases or S3. Not in scope for v1 (Decision needed: confirm).

---

## 10. Development Setup Conventions

- **Main process code**: `src/main/` — TypeScript, compiled to `dist/main/`
- **Renderer code**: `src/renderer/` — React + TypeScript, bundled by Vite
- **Preload script**: `src/preload/` — TypeScript, strict contextBridge API surface
- **Database migrations**: `src/main/migrations/`
- **Data source modules**: `src/main/sources/` (e.g., `youtube/`, `reddit/`, `scripts/`)

`electron-vite` is confirmed as the build toolchain. It manages the main/renderer/preload build pipeline with an opinionated but flexible config. The directory conventions above align with `electron-vite` defaults.

---

## 11. Open Technical Decisions

| # | Decision | Options | Recommendation | Status |
|---|----------|---------|----------------|--------|
| TD-01 | Credential storage mechanism | `safeStorage` vs. `keytar` vs. encrypted SQLite field | `safeStorage` — built-in, no rebuild needed | **Confirmed: `safeStorage` for YouTube API key only. ntfy values stored plain text in `settings` table.** |
| TD-02 | Build toolchain | `electron-vite` vs. manual Vite + Electron config | `electron-vite` — opinionated, less config | **Confirmed: `electron-vite`** |
| TD-03 | Drag-and-drop library | `@dnd-kit/core` vs. `react-beautiful-dnd` vs. custom | `@dnd-kit` — actively maintained, accessible | **Confirmed: `@dnd-kit/core`** |
| TD-04 | Script Manager interpreter scope | Python only vs. multi-interpreter in v1 | Python only, extensible interface | **Confirmed: Python only in v1** |
| TD-05 | RSS polling interval | Fixed vs. user-configurable | User-configurable with a sensible default (15 min) | **Confirmed: User-configurable, default 15 minutes. Stored in `settings` table as `rss_poll_interval_minutes`. Configurable from YouTube Settings section.** |
| TD-06 | SQLite migration library | Hand-rolled vs. `better-sqlite3-migrations` vs. `db-migrate` | Hand-rolled is simple enough given low migration volume | **Confirmed: Hand-rolled migrations. No third-party library.** |
| TD-07 | ntfy.sh stale-poll warning | Warn user if last poll was >24h ago vs. silent | Surface a warning — messages expire after 24h on free tier | **Confirmed: Warning required in v1. Threshold: 24h. See Section 6.3.** |
| TD-08 | Custom ntfy server URL + onboarding flow | Supported in v1 Settings vs. deferred | Support in v1 with guided first-run setup | **Confirmed: Both supported in v1. See Section 6.4 and ui-ux.md Section 8.4.** |
