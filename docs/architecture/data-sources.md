# Data Sources and Main-Process Modules

**Project:** personal-news | **Last reviewed:** 2026-10-20

This document inventories the registered main-process source modules and the external providers they use. The inventory was checked against module registration in `src/main/index.ts` and implementations under `src/main/sources/`.

## Module lifecycle and registry

The `DataSourceModule` contract lives in `src/main/sources/registry.ts`. A module has a stable `id`, a `displayName`, `initialize(db)`, optional `start()`, and `shutdown()`. Startup registers the modules in `src/main/index.ts`; `initializeAll` initializes all registered modules first, then calls each optional `start`. Shutdown calls each module's `shutdown`.

| Module ID | Display name | Implementation | Data provided / behavior |
|---|---|---|---|
| `youtube` | YouTube | `src/main/sources/youtube/index.ts` | Channel feeds and video details; persists channel/video data and emits updates/notifications. |
| `reddit` | Reddit | `src/main/sources/reddit/` | Saved Posts ingestion, URL metadata enrichment, and ntfy polling. |
| `scripts` | Script Manager | `src/main/sources/scripts/` | Runs user-configured scripts and scheduled jobs; the bundled Reddit Digest script is one consumer. |
| `weather` | Weather | `src/main/sources/weather/` | Location search, current conditions, forecasts, air quality, and weather alerts. |
| `astronomy` | Astronomy | `src/main/sources/astronomy/` | Calculates and caches astronomical events for saved weather locations; calculations are local and use no external astronomy API. |
| `sports` | Sports | `src/main/sources/sports/` | Scores, schedules, standings, team data/badges, and radio station lookup/playback support. |

## YouTube

**Module:** `youtube` (`src/main/sources/youtube/index.ts`)

- Reads channel feeds from YouTube's Atom RSS endpoint (`https://www.youtube.com/feeds/videos.xml`).
- Uses YouTube Data API v3 (`https://www.googleapis.com/youtube/v3/`) for channel/video metadata, including tracked upcoming and live videos. The user's API key is held through Electron `safeStorage`.
- Polling interval is configured by the YouTube RSS poll setting. New video and live-start notifications follow user preferences.
- Channel add/initial hydration also resolves channel metadata and fetches feed/API data through main-process IPC handlers in `src/main/ipc/index.ts`.

## Reddit and Saved Posts

**Module:** `reddit` (`src/main/sources/reddit/`)

- Polls the configured ntfy topic (default server `https://ntfy.sh`) for messages containing links to save. Polling uses a persisted message cursor and is scheduled while Saved Posts is enabled.
- Reddit post enrichment uses Reddit's public JSON endpoint by requesting the normalized post URL with `.json`; `/s/` short links are resolved before fetching metadata.
- Saved Posts source matching is in `link-sources.ts`. It has dedicated handling for Reddit, X/Twitter, and Bluesky URLs; X and Bluesky metadata is derived from the URL and optional note without calling those platforms' APIs. Unmatched generic URLs are not currently supported by the metadata ingestion path.
- Reddit Digest's standalone route can fetch a subreddit top-post listing through `src/main/ipc/index.ts`; scheduled digest ingestion is described under Script Manager below.

## Script Manager and Reddit Digest

**Module:** `scripts` (`src/main/sources/scripts/`)

Script Manager executes user-configured local scripts and records their output and run status. Scheduled jobs are managed by `scheduler.ts`; processes are launched by `executor.ts`. User scripts are extensible and may access their own external services, so they cannot be enumerated as fixed application providers here.

The bundled `resources/scripts/reddit_digest.py` fetches subreddit top posts from Reddit's public JSON listing endpoint and writes a JSON result for the main process to validate and persist. On first Reddit Digest configuration, the app registers this script with its default weekly schedule; adding a subreddit can also trigger a one-off run. See the script and `src/main/sources/scripts/index.ts` for current registration and ingest details.

## Weather

**Module:** `weather` (`src/main/sources/weather/`)

Weather is a registered data-source module and belongs in this inventory. Its external provider is Open-Meteo:

- Geocoding API (`https://geocoding-api.open-meteo.com/v1/search`) searches for locations.
- Forecast API (`https://api.open-meteo.com/v1/forecast`) supplies current conditions, hourly and daily forecasts, and the weather variables used for alerts.
- Air Quality API (`https://air-quality-api.open-meteo.com/v1/air-quality`) supplies the current US AQI value. This request is optional: a failure is logged and the weather forecast remains usable without AQI.

The module persists location and forecast snapshots in the weather tables, refreshes on its configured interval, and provides manual refresh through IPC. Location save/change/remove hooks also notify the Astronomy module. Main-process implementation and polling are in `src/main/sources/weather/index.ts`.

## Astronomy

**Module:** `astronomy` (`src/main/sources/astronomy/`)

Astronomy is a registered module but not an external data provider. It calculates solar/lunar events and related details locally using saved Weather location coordinates, time zones, and the relevant timestamp. It caches results and refreshes them on its configured schedule. Weather location lifecycle hooks invalidate or recalculate affected results. See `calculator.ts`, `time.ts`, and `cache.ts`.

## Sports

**Module:** `sports` (`src/main/sources/sports/`)

The module uses multiple providers, with provider-specific fetch and caching logic in `api.ts` and radio lookup/playback helpers in `radio.ts`:

- TheSportsDB (`https://www.thesportsdb.com/api/v1/json/123/`) supplies league/team catalog and lookup data, event data, and badge/image metadata where available.
- ESPN Core API (`https://sports.core.api.espn.com/v2`) and ESPN site API (`https://site.api.espn.com/apis/site/v2/`) provide supported-league fallback/augmentation data, including scores, events, and standings.
- Radio Browser (`https://all.api.radio-browser.info/json/stations/search`) searches stations associated with supported teams. Stream URLs are then resolved/checked by the app for playback; the audio stream itself comes from the station.

Sports data is cached in the local database and refreshed on the configured schedule; live events can receive more frequent refreshes. Provider fallback and merge behavior can vary by sport and endpoint. See `docs/dashboard-sports-data-sources.md` for the detailed provider and merge flow.

## Other network requests

The app also makes network requests outside the registered data-source modules, for example app update checks and user-requested external links. This document focuses on data consumed by application features. Keep the module inventory synchronized with `registerModule(...)` calls in `src/main/index.ts`, and update provider sections when fetch logic is added or moved.
