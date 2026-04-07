# Sports Widget Plan

**Status:** Proposed
**Related Docs:** [ui-ux.md](../ui-ux.md) | [widget-settings-spec.md](../widget-settings-spec.md) | [architecture/ipc.md](../architecture/ipc.md)

---

## 1. Scope

Add a Sports widget backed by TheSportsDB v1 free API with:

- Two view modes: **All Games** (today's schedule across all leagues for the selected sport) and **My Teams** (tracked favorites showing last result and next game)
- Baseball as the first supported sport; the sport selector is designed for extensibility
- Once-a-day fetch cadence — data is pulled on app startup and once more if the cache is stale (older than the day boundary)
- Per-widget inline settings panel following `widget-settings-spec.md`
- A dedicated **Sports** tab in the Settings screen (mirrors Weather pattern)
- A global Sports toggle in the General section of Settings (mirrors Weather/Reddit Digest toggles)
- No API key required — TheSportsDB v1 is free and unauthenticated

---

## 2. TheSportsDB v1 API

Base URL: `https://www.thesportsdb.com/api/v1/json/2/`

> The free public key is `2`. No authentication header required.

### Endpoints used

| Purpose | Endpoint |
|---|---|
| Today's games (all leagues) | `eventsday.php?d=YYYY-MM-DD` |
| Today's games for one league | `eventsday.php?d=YYYY-MM-DD&l={leagueId}` |
| Next 5 events for a team | `eventsnext.php?id={teamId}` |
| Last 5 events for a team | `eventslast.php?id={teamId}` |
| Search teams by name | `searchteams.php?t={query}` |
| All leagues for a sport | `search_all_leagues.php?s={sport}` (e.g. `Baseball`) |
| All teams in a league | `lookup_all_teams.php?id={leagueId}` |

### Cache strategy

- All fetched data is stored in SQLite and tagged with a `fetched_date` (YYYY-MM-DD string in the user's local timezone).
- On app startup (and on the IPC `sports:refresh` call), the main process checks whether the stored `fetched_date` for today already exists. If it does, no network calls are made.
- If the cache is missing or stale, the module fetches today's events (for all tracked leagues of each enabled sport) plus the last-5 and next-5 events for every tracked team.
- The renderer always reads from the SQLite cache — it never calls the API directly.
- If the app is started after midnight (new calendar day), the old cache is ignored and a fresh fetch runs.

---

## 3. Data Model

Add the following tables to the SQLite database.

### `sports_leagues`

Populated on first setup or when the user browses leagues for a sport.

```sql
CREATE TABLE IF NOT EXISTS sports_leagues (
  league_id   TEXT PRIMARY KEY,   -- TheSportsDB league ID (e.g. "4424" for MLB)
  sport       TEXT NOT NULL,       -- "Baseball", "Soccer", etc.
  name        TEXT NOT NULL,       -- "Major League Baseball"
  country     TEXT,
  logo_url    TEXT,
  enabled     INTEGER NOT NULL DEFAULT 1,  -- whether this league appears in "All Games" view
  sort_order  INTEGER NOT NULL DEFAULT 0,
  added_at    INTEGER NOT NULL     -- Unix timestamp
);
```

### `sports_teams`

Tracked favorite teams.

```sql
CREATE TABLE IF NOT EXISTS sports_teams (
  team_id     TEXT PRIMARY KEY,    -- TheSportsDB team ID
  league_id   TEXT NOT NULL,
  sport       TEXT NOT NULL,
  name        TEXT NOT NULL,       -- "New York Yankees"
  short_name  TEXT,                -- "Yankees"
  badge_url   TEXT,                -- team crest/logo URL
  enabled     INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  added_at    INTEGER NOT NULL
);
```

### `sports_events`

Cached game results and upcoming fixtures.

```sql
CREATE TABLE IF NOT EXISTS sports_events (
  event_id      TEXT PRIMARY KEY,   -- TheSportsDB event ID
  league_id     TEXT NOT NULL,
  sport         TEXT NOT NULL,
  home_team_id  TEXT,
  away_team_id  TEXT,
  home_team     TEXT NOT NULL,
  away_team     TEXT NOT NULL,
  home_score    TEXT,               -- NULL if not yet played; TEXT to handle "TBD" etc.
  away_score    TEXT,
  event_date    TEXT NOT NULL,      -- YYYY-MM-DD
  event_time    TEXT,               -- HH:MM UTC, NULL if TBD
  status        TEXT,               -- "Match Finished", "Not Started", etc.
  venue         TEXT,
  fetched_date  TEXT NOT NULL       -- YYYY-MM-DD (local) when row was written
);
```

### `sports_cache_meta`

Simple one-row-per-sport-date record to track whether a full fetch has been completed for the day.

```sql
CREATE TABLE IF NOT EXISTS sports_cache_meta (
  sport        TEXT NOT NULL,
  fetch_date   TEXT NOT NULL,       -- YYYY-MM-DD local
  fetched_at   INTEGER NOT NULL,    -- Unix timestamp of last successful fetch
  PRIMARY KEY (sport, fetch_date)
);
```

---

## 4. Main Process Module

File: `src/main/sources/sports/index.ts`

Follows the same module interface as `WeatherModule`, `YouTubeModule`, etc.

```
src/main/sources/sports/
  index.ts          — module entry: registers, initializes, fetches on startup
  api.ts            — thin wrapper around TheSportsDB HTTP calls (fetch + JSON parse)
  cache.ts          — read/write helpers for the four sports_* tables
  ipc.ts            — registers all IPC handlers for the sports domain
  schema.ts         — CREATE TABLE statements run in db:migrate
```

### Startup flow

1. `SportsModule.initialize()` is called from `src/main/index.ts` alongside the other modules.
2. It checks `sports_cache_meta` for each enabled sport. Any sport without a row for today triggers a full fetch.
3. The fetch runs in the background (does not block app startup). The renderer reads the existing cache immediately; a push event `sports:dataUpdated` is fired when the fresh data lands.
4. If the fetch fails (e.g., no network), a toast is surfaced via the push event with an error payload; cached data continues to be shown.

### IPC handlers registered in `ipc.ts`

See Section 5 for the full channel list.

---

## 5. IPC Channels

All channels follow the `domain:verbNoun` convention.

### Renderer → Main (invoke)

| Channel | Args | Returns | Description |
|---|---|---|---|
| `sports:getTodayEvents` | `{ sport: string }` | `SportEvent[]` | All cached events for today for the given sport (across all enabled leagues) |
| `sports:getTeamEvents` | `{ teamId: string }` | `{ last: SportEvent[], next: SportEvent[] }` | Last-5 and next-5 cached events for a tracked team |
| `sports:getTrackedTeams` | none | `TrackedTeam[]` | All teams in `sports_teams` |
| `sports:addTeam` | `{ teamId: string, leagueId: string, sport: string }` | `TrackedTeam` | Add a team to favorites; triggers a background fetch for that team |
| `sports:removeTeam` | `{ teamId: string }` | `{ ok: true }` | Remove team from favorites |
| `sports:setTeamEnabled` | `{ teamId: string, enabled: boolean }` | `{ ok: true }` | Toggle a team's visibility |
| `sports:setTeamOrder` | `{ orderedIds: string[] }` | `{ ok: true }` | Persist drag-reordered team list |
| `sports:getLeagues` | `{ sport: string }` | `SportLeague[]` | All cached leagues for a sport |
| `sports:addLeague` | `{ leagueId: string, sport: string }` | `SportLeague` | Enable a league in the All Games view |
| `sports:removeLeague` | `{ leagueId: string }` | `{ ok: true }` | Remove a league from All Games view |
| `sports:searchTeams` | `{ query: string, sport: string }` | `TeamSearchResult[]` | Search TheSportsDB for teams matching a name |
| `sports:refresh` | `{ sport: string }` | `{ ok: true }` | Force a fresh fetch for the given sport, ignoring the daily cache guard |

### Main → Renderer (push)

| Channel | Payload | When |
|---|---|---|
| `sports:dataUpdated` | `{ sport: string }` | After a background fetch completes (success or error) |

---

## 6. Shared Types (`src/shared/ipc-types.ts`)

Add the following interfaces:

```typescript
export interface SportEvent {
  eventId: string
  leagueId: string
  sport: string
  homeTeam: string
  awayTeam: string
  homeScore: string | null
  awayScore: string | null
  eventDate: string          // YYYY-MM-DD
  eventTime: string | null   // HH:MM UTC
  status: string | null      // "Match Finished" | "Not Started" | etc.
  venue: string | null
}

export interface TrackedTeam {
  teamId: string
  leagueId: string
  sport: string
  name: string
  shortName: string | null
  badgeUrl: string | null
  enabled: boolean
  sortOrder: number
}

export interface SportLeague {
  leagueId: string
  sport: string
  name: string
  country: string | null
  logoUrl: string | null
  enabled: boolean
  sortOrder: number
}

export interface TeamSearchResult {
  teamId: string
  name: string
  leagueId: string
  leagueName: string
  sport: string
  badgeUrl: string | null
}

export interface SportsViewConfig {
  sport: string              // "Baseball" — default; future sports added here
  viewMode: 'all_games' | 'my_teams'
  showVenue: boolean
  showTime: boolean
}
```

---

## 7. Renderer Module

```
src/renderer/src/modules/sports/
  index.ts                   — registers the module with moduleRegistry
  SportsWidget.tsx           — main widget component
  SportsSettingsPanel.tsx    — inline settings panel (per widget-settings-spec.md)
  AllGamesView.tsx           — "All Games" sub-view
  MyTeamsView.tsx            — "My Teams" sub-view
  GameCard.tsx               — shared game result / fixture card component
```

### Config hook

File: `src/renderer/src/hooks/useSportsViewConfig.ts`

Storage key: `sports_view_config:{instanceId}`

```typescript
export const DEFAULT_SPORTS_VIEW_CONFIG: SportsViewConfig = {
  sport: 'Baseball',
  viewMode: 'all_games',
  showVenue: false,
  showTime: true,
}
```

---

## 8. Widget UI Design

### 8.1 Widget structure

```
+----------------------------------------------------------+
|  Sports                          [settings gear icon]    |
+----------------------------------------------------------+
|  [Sport: Baseball ▾]   [View: All Games ▾]              |
+----------------------------------------------------------+
|  (content area — one of the two view modes below)        |
+----------------------------------------------------------+
```

The two header dropdowns (`Sport` and `View`) use `<Select>` components. See Section 8.4 for the dropdown alignment fix.

### 8.2 All Games view

Shows today's MLB (and any other enabled baseball leagues) games in a scrollable list, grouped by league when multiple leagues are active.

```
MLB — Monday, April 7
  +-------------------------------------------------+
  |  NYY 5  ·  BOS 3          Final                 |
  +-------------------------------------------------+
  |  LAD 2  ·  SF  4          Final                 |
  +-------------------------------------------------+
  |  HOU  ·  TEX               7:05 PM ET          |
  +-------------------------------------------------+
  |  ...                                            |
  +-------------------------------------------------+
```

- Completed games (status contains "Finished") show the final score with home/away layout.
- Upcoming games show the scheduled time (converted from UTC to the local timezone).
- No games today → show a "No games today" placeholder with the next N upcoming games surfaced across tracked leagues. Use `eventsnext.php?id={teamId}` for the first tracked team per league as a proxy if no league-level upcoming endpoint is available.
- Live/in-progress games (if the API provides a mid-game status string) are shown with an "IN PROGRESS" badge and sorted to the top.

### 8.3 My Teams view

Shows one card per tracked team, each card containing:

- Team name and badge (if available)
- **Last game**: opponent, final score, W/L indicator, date
- **Next game**: opponent, date, time (local), venue (if enabled in settings)
- If no last game in cache: "No recent games"
- If no next game in cache: "No upcoming games scheduled"

```
+-------------------------------------------------+
|  [badge] New York Yankees                       |
|  Last:  vs. Boston Red Sox — W 5–3  (Apr 5)    |
|  Next:  vs. Tampa Bay Rays — Thu Apr 10  7:05 PM |
+-------------------------------------------------+
|  [badge] Los Angeles Dodgers                    |
|  Last:  vs. San Francisco Giants — L 2–4  (Apr 6)|
|  Next:  vs. San Diego Padres — Fri Apr 11  9:10 PM|
+-------------------------------------------------+
```

Teams render in the user-defined sort order (configured in the Sports Settings tab).

### 8.4 Dropdown alignment (no left-side cutoff)

The Sport and View dropdowns sit in the widget header, which may be near the left edge of the sidebar or a constrained container. Use `align="start"` on all `<SelectContent>` components in this widget to ensure the dropdown opens aligned to the left edge of the trigger rather than centering, preventing right-side overflow. Additionally use `side="bottom"` (Radix default) and avoid any `overflow: hidden` ancestor that could clip the portal.

For dropdowns inside the inline settings panel — where the 300 px column is bounded — use the same `align="start"` pattern and confirm that the panel's `overflow-y: auto` does not interfere with the Radix portal z-index.

```tsx
<SelectContent align="start" side="bottom">
  ...
</SelectContent>
```

---

## 9. Settings Integration

### 9.1 Global Sports toggle (General tab)

Follow the exact same pattern as the Weather toggle in Settings > General:

- A `SportsEnabledContext` (mirrors `WeatherEnabledContext`) stored at `src/renderer/src/contexts/SportsEnabledContext.tsx`.
- Settings key: `sports_enabled` (string `"true"` / `"false"`).
- When disabled: the Sports widget is hidden from the dashboard, the Sports nav entry in the Add Widget modal is suppressed, and the Sports Settings tab is hidden.
- Label text (matches the Weather pattern):

```
Sports
Enable or disable the Sports feature. When disabled, the dashboard widget and settings tab are hidden.
[Enable Sports  ●○]
```

### 9.2 Dedicated Sports Settings tab

Appears in the Settings `<Tabs>` list when `sports_enabled` is true, between Weather and any future tabs. Component file: `src/renderer/src/modules/sports/SportsSettingsTab.tsx`.

Tab sections:

#### Data & Refresh

- **Last synced** — timestamp of the last successful fetch per sport. Shown as "Today at 08:14" or "Yesterday at 08:14" etc.
- **Refresh Now** button — calls `sports:refresh` for each enabled sport and shows a success/failure toast.

#### Baseball — Tracked Teams

- List of tracked teams in user-defined order (reorderable with up/down arrows per `widget-settings-spec.md §6.4`).
- Each row: team badge, team name, league, enabled toggle, remove button.
- **Add Team** flow: a text input with a search button. Calls `sports:searchTeams`. Results list shows team name, league. Click to add; if already tracked, show "Already added."

#### Baseball — Leagues in All Games view

- Checkbox list of all cached baseball leagues (from `sports_leagues`). Checked = appears in the All Games overview.
- A **Browse Leagues** button that calls `sports:getLeagues` with `{ sport: 'Baseball' }` and shows a modal list to pick additional leagues.

---

## 10. CSS

Add the following class block to `src/renderer/src/assets/main.css` after the existing widget blocks:

```css
.sports-card-edit {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 1rem;
  height: 100%;
  max-height: 100%;
  overflow: hidden;
}

.sports-card-edit__preview {
  overflow-y: auto;
  min-width: 0;
  min-height: 0;
}

.sports-card-edit__panel {
  display: flex;
  overflow: hidden;
  min-height: 0;
  border-left: 1px solid hsl(var(--border));
  padding-left: 1rem;
}
```

---

## 11. File Checklist

| File | Action |
|---|---|
| `src/main/sources/sports/index.ts` | New — module entry; registers with `registerModule`; runs startup fetch |
| `src/main/sources/sports/api.ts` | New — TheSportsDB HTTP fetch helpers |
| `src/main/sources/sports/cache.ts` | New — SQLite read/write helpers for all four sports_* tables |
| `src/main/sources/sports/ipc.ts` | New — registers all `sports:*` IPC handlers |
| `src/main/sources/sports/schema.ts` | New — CREATE TABLE statements for sports_* tables |
| `src/main/index.ts` | Modify — import and register `SportsModule` |
| `src/main/db/database.ts` (or migration file) | Modify — run sports schema migration |
| `src/shared/ipc-types.ts` | Modify — add `SportEvent`, `TrackedTeam`, `SportLeague`, `TeamSearchResult`, `SportsViewConfig` |
| `src/renderer/src/modules/sports/index.ts` | New — `registerRendererModule({ id: 'sports', displayName: 'Sports', widget: SportsWidget })` |
| `src/renderer/src/modules/sports/SportsWidget.tsx` | New — main widget with inline settings per widget-settings-spec.md |
| `src/renderer/src/modules/sports/SportsSettingsPanel.tsx` | New — inline settings panel (sport, view mode, show venue, show time) |
| `src/renderer/src/modules/sports/SportsSettingsTab.tsx` | New — Settings screen tab for team management, league selection, refresh |
| `src/renderer/src/modules/sports/AllGamesView.tsx` | New — today's games grouped by league |
| `src/renderer/src/modules/sports/MyTeamsView.tsx` | New — tracked teams, last result + next fixture |
| `src/renderer/src/modules/sports/GameCard.tsx` | New — shared card for a single game (result or fixture) |
| `src/renderer/src/hooks/useSportsViewConfig.ts` | New — config persistence hook; exports `DEFAULT_SPORTS_VIEW_CONFIG` |
| `src/renderer/src/contexts/SportsEnabledContext.tsx` | New — global enabled state; mirrors `WeatherEnabledContext` |
| `src/renderer/src/routes/Settings.tsx` | Modify — import `SportsEnabledContext`; add global Sports toggle; add Sports tab |
| `src/renderer/src/assets/main.css` | Modify — add `.sports-card-edit` CSS classes |
| `src/renderer/src/components/AddWidgetModal.tsx` | Modify — add Sports to the available widget list, gated by `useSportsEnabled` |

---

## 12. Out of Scope (v1)

- Live score polling (API rate limits and v1 free tier restrictions make real-time impractical)
- Sports other than Baseball (the UI sport selector is built in but only Baseball data is wired up)
- Push notifications for game results
- Historical stats beyond last-5 / next-5 events per team
- Team standings or league tables
- TheSportsDB API key field in Settings (v1 free API requires no key)
