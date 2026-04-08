# Sports Page Plan

**Status:** Proposed
**Related Docs:** [sports-widget.md](./sports-widget.md) | [sports-widget-data-improvements.md](./sports-widget-data-improvements.md) | [architecture/ipc.md](../architecture/ipc.md)

---

## 1. Scope

Build a dedicated full-page Sports view (analogous to the YouTube page) that surfaces rich season context alongside today's action. Key capabilities:

- **Today's Games strip** — scrollable horizontal bar pinned to the top of the page showing all games for the current day across tracked/enabled sports, ordered: In Progress → Scheduled → Finished
- **Expandable live game cards** — clicking a live game card expands it inline to show real-time detail (period/inning/quarter, score, status string) fetched on demand via a new API call
- **Standings tables** — per-sport/per-league league standings pulled from TheSportsDB `lookuptable.php`, with auto-detected current season strings
- **Tracked team stat cards** — season record, win/loss streak, and last-5 results for each team the user follows
- **Sport ordering control** — drag-to-reorder which sports appear first on the page; preference persisted to the settings store
- **Floating radio mini-player** — app-wide persistent audio player that searches the Radio Browser community directory for stations likely covering a selected game, with full audio controls; persists while navigating between pages
- Page is gated behind the existing `sportsEnabled` context, appearing in the sidebar only when sports is enabled (same pattern as Reddit Digest)

---

## 2. API Strategy

### TheSportsDB (already integrated, free tier key `123`)

Existing endpoints in use:
- `all_leagues.php` — league catalog
- `eventsday.php` — today's games by league
- `eventsnextteam.php` / `eventslastteam.php` — team game history
- `searchteams.php` / `lookupteam.php` — team search and badge fetching

New endpoints to add:

| Endpoint | Use |
|---|---|
| `lookuptable.php?l={leagueId}&s={season}` | League standings table |
| `lookupevent.php?id={eventId}` | Expanded live event detail for card expansion |

**Season auto-detection logic** (renderer-side utility):

```ts
function getCurrentSeason(sport: string): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-based

  switch (sport) {
    case 'Baseball':
      // MLB season is calendar-year
      return String(year)
    case 'Basketball':
      // NBA season spans Oct–Jun; if Oct or later, season is year/year+1
      return month >= 10 ? `${year}-${year + 1}` : `${year - 1}-${year}`
    case 'Ice Hockey':
      // NHL same as NBA
      return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`
    default:
      return String(year)
  }
}
```

### Radio Browser API (new, renderer-only)

- Base URL: `https://de1.api.radio-browser.info/json/stations/search`
- No API key, no auth required, CORS-open (works directly from Electron renderer)
- Search parameters used: `name` (team city or station name keywords), `tags=sports`, `countrycode=US` (or CA for Canadian teams), `order=votes`, `limit=20`
- Each result includes: `stationuuid`, `name`, `url_resolved`, `favicon`, `country`, `codec`, `bitrate`, `tags`
- `url_resolved` is used for playback — the API pre-resolves playlists and redirects
- Playback via the HTML5 `<audio>` element (native in Electron/Chromium)
- Station search is best-effort; coverage is not guaranteed and is communicated clearly in the UI

---

## 3. Backend Changes

### `src/main/sources/sports/api.ts`

Add two new fetch functions:

**`fetchLeagueStandings(leagueId, season)`**
```ts
export async function fetchLeagueStandings(
  leagueId: string,
  season: string
): Promise<SportStandingRow[]>
// Calls: lookuptable.php?l={leagueId}&s={season}
// Returns ranked rows with: rank, teamId, teamName, played, win, loss, draw, points, goalsFor, goalsAgainst, form, description
```

**`fetchEventDetails(eventId)`**
```ts
export async function fetchEventDetails(
  eventId: string
): Promise<SportEventDetail | null>
// Calls: lookupevent.php?id={eventId}
// Returns: all SportEvent fields + strProgress, strStatus (detailed), strDescriptionEN (narrative if available)
```

### `src/shared/ipc-types.ts`

Add new IPC channel constants to the `IPC` object:
```ts
SPORTS_GET_STANDINGS: 'sports:getStandings',
SPORTS_GET_EVENT_DETAILS: 'sports:getEventDetails',
```

Add new types:
```ts
export interface SportStandingRow {
  rank: number
  teamId: string
  teamName: string
  played: number
  win: number
  loss: number
  draw: number
  points: number
  goalsFor: number | null
  goalsAgainst: number | null
  goalDifference: number | null
  form: string | null        // e.g. "WWLDW"
  description: string | null // e.g. "Playoff position"
  leagueId: string
  season: string
}

export interface SportEventDetail extends SportEvent {
  progress: string | null    // e.g. "3rd Quarter", "7th Inning"
  descriptionEN: string | null
}
```

### `src/main/sources/sports/index.ts`

Add two new exported functions:
```ts
export async function getSportsStandings(
  leagueId: string,
  season: string
): Promise<SportStandingRow[]>

export async function getSportsEventDetails(
  eventId: string
): Promise<SportEventDetail | null>
```

Note: standings are NOT cached in SQLite (season tables change frequently enough and the call is cheap). Event details are also not cached — they are always fetched live on expand.

### `src/main/sources/sports/ipc.ts`

Register two new IPC handlers:
- `IPC.SPORTS_GET_STANDINGS` → calls `getSportsStandings(leagueId, season)`
- `IPC.SPORTS_GET_EVENT_DETAILS` → calls `getSportsEventDetails(eventId)`

---

## 4. Frontend Architecture

### New Route

**`src/renderer/src/routes/Sports.tsx`**

Top-level page component. Mirrors `YouTube.tsx` in structure:
- Loads tracked teams, today's events, and leagues on mount
- Listens to `IPC.SPORTS_DATA_UPDATED` for live refresh pushes
- Maintains sport order state (loaded from/saved to settings via `SETTINGS_GET` / `SETTINGS_SET` with key `sports_page_sport_order`)
- Renders: header bar → today's strip → sport sections (in user-defined order)

### New Components (all under `src/renderer/src/modules/sports/`)

#### `TodayGamesStrip.tsx`
Horizontally scrollable row of game summary cards pinned below the page header. Sort order: live first → scheduled (ascending time) → finished. Each card shows:
- Team badges (if available) or team abbreviations
- Score (or scheduled time if not started)
- Live badge (pulsing green dot) if in progress
- On click: expands the card to `ExpandedGameCard`

#### `ExpandedGameCard.tsx`
Inline expansion panel rendered below (or replacing) the compact card. Triggers a `SPORTS_GET_EVENT_DETAILS` IPC call on open. Shows:
- Full score + detailed status string (e.g. "End of 3rd Quarter")
- Progress string if available
- Venue
- "Find Radio" button → triggers radio station search for this game
- Loading skeleton while fetching

#### `StandingsTable.tsx`
Tabular standings for a league. Triggered by `SPORTS_GET_STANDINGS`. Columns: Rank, Team, W, L, D/T (sport-dependent), Pts, Form (color-coded W/L/D pills). Highlights any tracked team rows. Shows a loading skeleton and a graceful "Standings unavailable" empty state.

#### `TeamStatCard.tsx`
Card per tracked team showing:
- Team badge + name
- Season record (W-L, derived from `SportTeamEvents` last events)
- Win/loss streak (computed client-side from last-5 results)
- Last 5 result dots (green W / red L / gray D)
- Next game info (opponent, date, time)

Uses the existing `getSportsTeamEvents` IPC call — no new backend needed.

#### `SportOrderControl.tsx`
Drag-to-reorder list of enabled sports using `@dnd-kit/sortable` (already a project dependency). Rendered in the page header area as a compact pill row. On reorder, saves to `settings:set` with key `sports_page_sport_order` (JSON array of sport strings).

#### `RadioPlayer.tsx`
**App-wide floating mini-player** — rendered at the `App.tsx` level (outside `<main>`) so it persists during navigation. State is lifted to a new `RadioPlayerContext`.

**Station search flow:**
1. User clicks "Find Radio" in an expanded game card
2. Component searches Radio Browser API: `name={teamCityKeyword}&tags=sports&limit=20&order=votes`
3. Results appear in a popover/drawer listing stations with name, country, bitrate, codec badge
4. User clicks a station → playback begins via `<audio>` element
5. Mini-player docks at bottom of screen (above the Toaster) with:
   - Station favicon + name
   - Current game label (e.g. "Cubs vs Cardinals")
   - Play / Pause button
   - Volume slider (0–100)
   - Stop button (clears player state entirely)
   - Connection status indicator (connecting / live / error)

**Error handling:**
- If stream URL fails to load within 8s → show "Stream unavailable" toast and leave controls enabled to try another station
- Explicit UI copy: "Stations are community-listed — coverage isn't guaranteed"

**`RadioPlayerContext.tsx`** (new context):
```ts
interface RadioPlayerState {
  isOpen: boolean
  isPlaying: boolean
  isConnecting: boolean
  station: RadioStation | null
  gameLabel: string | null
  volume: number // 0-1
  stations: RadioStation[]
  stationsLoading: boolean
}
```

---

## 5. Routing & Navigation Changes

### `src/renderer/src/App.tsx`
- Import `SportsPage` and add `<Route path="/sports" element={<SportsPage />} />`
- Wrap the app with `<RadioPlayerProvider>` (new context)
- Render `<RadioPlayer />` at the layout level (inside the main flex container but outside `<main>`) so it floats across all pages

### `src/renderer/src/components/Sidebar.tsx`
- Import `useSportsEnabled` from `SportsEnabledContext`
- Add Sports nav item conditionally (same pattern as Reddit Digest):
  ```tsx
  ...(sportsEnabled ? [{ to: '/sports', label: 'Sports', icon: <Trophy /> }] : [])
  ```
- Use `Trophy` icon from `lucide-react`

---

## 6. Settings Persistence

| Key | Type | Description |
|---|---|---|
| `sports_page_sport_order` | JSON string (`string[]`) | User-defined sport display order |

Read via `SETTINGS_GET`, written via `SETTINGS_SET`. Default order: `['Baseball', 'Basketball', 'Ice Hockey']`.

---

## 7. Implementation Order

1. **Backend** — add `fetchLeagueStandings` and `fetchEventDetails` to `api.ts`, new types to `ipc-types.ts`, new exports in `index.ts`, register handlers in `ipc.ts`
2. **RadioPlayerContext** — new context + provider (no UI yet, just state)
3. **App.tsx / Sidebar.tsx** — add route + nav item + provider wiring
4. **Sports.tsx** — page shell with header, sport order control, data loading
5. **TodayGamesStrip + ExpandedGameCard** — today's section with expansion
6. **StandingsTable** — per-league standings
7. **TeamStatCard** — tracked team summaries
8. **RadioPlayer** — station search + floating player UI

---

## 8. Out of Scope

- Player/athlete statistics (TheSportsDB free tier doesn't return per-player stats at useful granularity)
- Push notifications for game start/end (can be a future follow-up to the existing notification system)
- Historical season archives / season picker UI (auto-detect only for now)
- Caching standings in SQLite (standings are fetched fresh per page visit)
- Guaranteeing radio coverage for any specific game (community-sourced, best-effort)
