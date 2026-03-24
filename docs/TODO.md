# Implementation TODO

> Status: Historical implementation checklist retained for project history. This file is not maintained as the current source of truth for project status.
>
> Current maintained docs: [README](../README.md), [docs/PRD.md](./PRD.md), [docs/architecture/overview.md](./architecture/overview.md), [docs/architecture/data-sources.md](./architecture/data-sources.md), and [docs/ui-ux.md](./ui-ux.md).

Everything the prototype deliberately skipped. Work through these one at a time.
Each item links to the relevant architecture doc for the full spec.

---

## YouTube

- [x] **RSS feed polling** — implement the interval timer using `node-cron`. On each tick, fetch the Atom feed for every enabled channel, parse with `fast-xml-parser`, compare against DB to detect new/changed videos. Store results in `yt_videos`. See `docs/architecture/data-sources.md §1`.
- [x] **YouTube Data API v3 delta fetch** — when RSS detects a new video ID not in the DB, call the YouTube v3 API to fetch full video details (duration, live broadcast status, scheduled start). Minimise quota usage — only call on new IDs. See `docs/architecture/data-sources.md §1.3`.
- [x] **API key validation** — when the user saves their YouTube API key in Settings, make a cheap test call (e.g. `videos?part=id&id=dQw4w9WgXcQ`) and surface success/error inline.
- [x] **Add channel flow** — the "Add" button in Settings > YouTube should resolve a channel URL or handle via the YouTube API, save the result to `yt_channels`, and push a `youtube:updated` event to the renderer. Currently a no-op.
- [x] **Per-channel enabled toggle persistence** — the toggle in Settings > YouTube currently updates local state only. Wire it to `settings:setChannelEnabled` IPC → UPDATE `yt_channels SET enabled = ?`.
- [x] **Push `youtube:updated` event** — after each RSS poll or API fetch that changes data, call `BrowserWindow.webContents.send('youtube:updated')` so the renderer re-fetches without polling.

---

## Reddit Digest

- [x] **Reddit digest script execution** — wire the "Run Now" button in Script Manager to actually spawn the `reddit_digest.py` script as a child process, stream stdout/stderr to the DB (`script_runs`), and push a `scripts:runComplete` event when done. See `docs/architecture/data-sources.md §4`.
- [x] **Ingest script output into DB** — after `reddit_digest.py` runs, parse its output and upsert results into `reddit_digest_posts`. The script should write JSON to stdout; the main process reads and saves it.
- [x] **Stale script warning — real computation** — `scripts:getAll` currently returns hardcoded stale state from seed data. Replace with real staleness logic: compare `last_run_at` against `schedule_interval` threshold. See `docs/architecture/data-model.md §2.2` stale detection query.
- [x] **Sidebar stale badge — dynamic** — the amber dot on the Script Manager nav item is currently hardcoded. Drive it from the `scripts:getAll` result: show the dot if any script has `isStale: true`.

---

## Saved Posts (ntfy.sh)

- [x] **ntfy.sh polling on startup** — on app launch, call the ntfy topic URL, fetch messages since the last `ntfy_last_message_id` cursor, parse each message as a Reddit URL, and upsert into `saved_posts`. Store the new cursor in `settings`. See `docs/architecture/data-sources.md §3`.
- [x] **ntfy stale-poll warning** — if `ntfy_last_polled_at` is more than 24 hours ago, show a warning banner in the Saved Posts view with a "Sync Now" button and last-polled timestamp. See `docs/ui-ux.md §6.0`.
- [x] **ntfy onboarding flow** — implement the 4-step setup wizard that appears on first visit to Saved Posts with no topic configured: explain ntfy, generate a topic name, test connection, show phone setup guide. See `docs/ui-ux.md §8.4`.
- [x] **Saved Posts full-page view** — implement `/saved-posts` route: full list with search (FTS5), filter by subreddit, sort controls. Currently a placeholder. See `docs/ui-ux.md §6`.
- [x] **FTS5 full-text search** — the `saved_posts_fts` virtual table and sync triggers are already in the schema. Wire up the `saved-posts:search` IPC channel to query it.
- [x] **Tag management** — implement inline tag add/remove on saved post rows. Add a tag management panel (rename, delete) in Settings > Saved Posts. Tags are stored as a JSON array in `saved_posts.tags`. See `docs/ui-ux.md §6.3`.

---

## Script Manager

- [x] **Child process execution** — implement `scripts:run(id)` IPC handler: spawn the script's interpreter + path + args as a child process, stream stdout/stderr lines back to the renderer via `scripts:output` push events, write a `script_runs` row on start and update it on exit. See `docs/architecture/data-sources.md §4`.
- [x] **node-cron scheduling** — on app startup, register a cron job for each script with a schedule. When the app was closed during a scheduled window, run the overdue script immediately on next launch (or warn the user). See `docs/architecture/data-sources.md §4.3`.
- [x] **Live output streaming** — in the Script Manager detail panel, subscribe to `scripts:output` push events and render stdout/stderr lines in real time while the script is running.
- [x] **Script detail panel** — implement the expand/detail view for a script: full run history table, stale callout block, live output area. Currently only the list row exists.

---

## Settings & Credentials

- [x] **safeStorage for YouTube API key** — replace the `console.log` no-op in Settings > API Keys with a real `safeStorage.encryptString` / `decryptString` implementation. The key must never be written to the plain `settings` table. See `docs/architecture/tech-notes.md §5`.
- [x] **ntfy topic configuration** — implement the ntfy settings fields in Settings > Saved Posts: topic name (plain text), optional custom server URL, Test Connection button, last-synced timestamp. See `docs/ui-ux.md §8.3`.
- [x] **YouTube RSS poll interval setting** — the input in Settings > YouTube should read from and write to `rss_poll_interval_minutes` in the `settings` table, and re-register the cron job with the new interval.
- [x] **Reddit Digest settings tab** — currently a "coming soon" placeholder. Add subreddit list management (add/remove subreddits the digest script will target).

---

## Themes

- [x] **Custom theme creation UI** — allow users to create themes by defining CSS custom property tokens. Store as rows in the `themes` table. The `ThemeProvider` already has the code path to inject tokens from the DB — this just needs the creation UI. See `docs/architecture/frontend.md §6.4` and `docs/architecture/data-model.md §2.7`.
- [x] **Theme management** — list, rename, delete user-created themes in Settings > Appearance.

---

## App Polish

- [x] **Error toasts** — replace `console.error` calls with a toast notification system (shadcn `Sonner` or similar). Surface IPC errors, failed API calls, and script execution errors to the user.
- [x] **Error boundaries** — add React error boundaries around each widget so one failing widget doesn't crash the whole dashboard.
- [x] **System tray icon** — add a tray icon so the app can run minimised in the background and still poll on schedule. See `docs/PRD.md` (noted as v2 stretch goal — implement only if background polling is needed).
- [x] **WCAG AA accessibility audit** — review all interactive components against the 4.5:1 contrast ratio requirement and keyboard navigation. Targeted for v1 but not formally audited yet. See `docs/ui-ux.md §11`.
- [x] **Window state persistence** — remember window size/position between sessions using `electron-window-state` or a manual `settings` entry.

---

## Packaging & Distribution

- [ ] **electron-builder config** — configure `electron-builder` in `package.json` for Windows (NSIS installer), macOS (DMG), and Linux (AppImage). See `docs/tech-notes.md` packaging section.
	- [x] Windows NSIS (x64, guided installer) configured and validated via `npm run build:win -- --publish=never`.
- [x] **Production build** — verify `npm run build` produces a working distributable. Test that `better-sqlite3` native module is correctly bundled/rebuilt for the target platform.
	- [x] Automated verification added: `npm run verify:production:win` (build + package + artifact checks + packaged smoke test).
	- [x] Verified output includes `resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node`.
	- [x] Verified packaged smoke run initializes DB and applies migrations (`dist/smoke-test-report.json`).
- [x] **Auto-update** — integrate `electron-updater` for automatic updates from a GitHub Releases feed.
- [ ] **Code signing** — required for macOS notarisation and Windows SmartScreen. Set up signing certificates in CI before distributing.
