# Sports Widget Data Improvements

**Status:** Proposed
**Related Docs:** [sports-widget.md](./sports-widget.md) | [sports-widget-view-modes.md](./sports-widget-view-modes.md) | [architecture/ipc.md](../architecture/ipc.md)

---

## Overview

This plan covers four requested improvements to the sports widget's data layer and three additional API-driven enhancements identified from the TheSportsDB v1 documentation. All changes are backwards-compatible with the existing schema and IPC surface.

### Requested Changes
1. Configurable polling interval (default: 5 minutes)
2. Opponent team badge in the Today view
3. Live score + finished/in-progress status display
4. 1-minute refresh cadence when games are in progress

### Suggested Additional Improvements
5. Per-event line scores (innings / quarters / periods) for the Detailed view
6. Efficient single-event refresh via `lookupevent.php`
7. Full season schedule prefetch

---

## 1. Configurable Polling Interval (default: 5 min)

### Background

The current sports module has **no periodic polling**. Data is fetched once at startup (if the cache is stale) and again only when the user clicks Refresh. This means live scores and game completions never appear automatically.

### Changes

#### `src/shared/ipc-types.ts`

Add a `SportsSettings` interface and two new IPC channels:

```ts
export interface SportsSettings {
  pollIntervalMinutes: number  // default: 5, min: 1, max: 1440
}

// Add to the IPC enum:
SETTINGS_GET_SPORTS_SETTINGS: 'settings:getSportsSettings',
SETTINGS_UPDATE_SPORTS_SETTINGS: 'settings:updateSportsSettings',
```

#### `src/main/sources/sports/index.ts`

Add a persistent settings store key and a polling timer, modelled on the Weather module pattern:

```ts
const SPORTS_POLL_INTERVAL_KEY = 'sports_poll_interval_minutes'
const DEFAULT_POLL_INTERVAL_MINUTES = 5

let pollTimer: ReturnType<typeof setInterval> | null = null

function getPollIntervalMinutes(): number {
  const raw = getSetting(SPORTS_POLL_INTERVAL_KEY)
  const parsed = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULT_POLL_INTERVAL_MINUTES
}

function startPollTimer(): void {
  stopPollTimer()
  const intervalMs = getPollIntervalMinutes() * 60 * 1000
  pollTimer = setInterval(() => {
    for (const sport of SUPPORTED_SPORTS) {
      void refreshSportInternal(sport, false).catch((err) => {
        console.error(`[Sports] Scheduled refresh failed for ${sport}:`, err)
      })
    }
  }, intervalMs)
}

function stopPollTimer(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

export function updateSportsSettings(settings: Partial<SportsSettings>): void {
  if (settings.pollIntervalMinutes !== undefined) {
    const clamped = Math.max(1, Math.min(1440, Math.round(settings.pollIntervalMinutes)))
    setSetting(SPORTS_POLL_INTERVAL_KEY, String(clamped))
  }
  // Restart timer with new interval
  if (isSportsEnabled()) {
    startPollTimer()
  }
}

export function getSportsSettings(): SportsSettings {
  return { pollIntervalMinutes: getPollIntervalMinutes() }
}
```

Call `startPollTimer()` at the end of `initialize()` and `stopPollTimer()` in `shutdown()`.

#### `src/main/sources/sports/ipc.ts`

Register the two new handlers:

```ts
ipcMain.handle(IPC.SETTINGS_GET_SPORTS_SETTINGS, (): SportsSettings => {
  return getSportsSettings()
})

ipcMain.handle(IPC.SETTINGS_UPDATE_SPORTS_SETTINGS, (_event, args: Partial<SportsSettings>): void => {
  updateSportsSettings(args)
})
```

#### Settings UI

Add a **Sports** section to `src/renderer/src/routes/Settings.tsx` (mirror the Weather poll-interval pattern). Show a numeric input labelled "Refresh every ___ minutes". Validate range 1–1440 before saving.

Alternatively, add a poll-interval input to `SportsSettingsPanel.tsx` for inline configuration on the widget itself.

---

## 2. Opponent Badge in the Today View

### Background

`SportEvent` carries `homeTeamId` / `awayTeamId` (IDs from TheSportsDB) but no badge URLs for those teams. The `sports_teams` table only covers *tracked* teams. The Today card in `MyTeamsView` shows the user's team badge (`TeamBadge`) but falls back to initials for the opponent because no badge URL is available.

### Approach

Add a lightweight **opponent badge cache** (a new SQLite table). When events are upserted, resolve badge URLs from the cache for both sides of the match. For any team ID not yet in the cache, fetch it lazily from `lookupteam.php`.

### Changes

#### `src/main/db/migrations/004_sports_team_cache.sql`

```sql
CREATE TABLE IF NOT EXISTS sports_opponent_cache (
  team_id    TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  badge_url  TEXT,
  fetched_at INTEGER NOT NULL
);
```

#### `src/shared/ipc-types.ts`

Extend `SportEvent` with resolved badge fields:

```ts
export interface SportEvent {
  // ... existing fields ...
  homeTeamBadgeUrl: string | null   // NEW
  awayTeamBadgeUrl: string | null   // NEW
}
```

#### `src/main/sources/sports/api.ts`

Add a helper to fetch a single team's badge:

```ts
export async function fetchOpponentBadge(teamId: string): Promise<{ name: string; badgeUrl: string | null } | null> {
  const rows = await request<SportsDbTeam>('lookupteam.php', { id: teamId })
  const match = rows[0]
  if (!match?.idTeam || !match.strTeam) return null
  return {
    name: match.strTeam,
    badgeUrl: normalizeRemoteUrl(match.strTeamBadge ?? match.strBadge ?? null)
  }
}
```

#### `src/main/sources/sports/cache.ts`

Add cache read/write helpers for `sports_opponent_cache`:

```ts
export function getOpponentBadge(db: Database.Database, teamId: string): string | null | undefined {
  // Returns undefined if not cached, null if cached with no badge
  const row = db.prepare('SELECT badge_url FROM sports_opponent_cache WHERE team_id = ?').get(teamId) as
    | { badge_url: string | null }
    | undefined
  return row === undefined ? undefined : row.badge_url
}

export function upsertOpponentBadge(db: Database.Database, teamId: string, name: string, badgeUrl: string | null): void {
  db.prepare(
    `INSERT INTO sports_opponent_cache (team_id, name, badge_url, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(team_id) DO UPDATE SET name = excluded.name, badge_url = excluded.badge_url, fetched_at = excluded.fetched_at`
  ).run(teamId, name, badgeUrl, Math.floor(Date.now() / 1000))
}
```

Add a `resolveBadgeUrls` step to the event upsert path in `index.ts`. After events are fetched and stored, iterate each event's `homeTeamId` and `awayTeamId`. For each ID:
1. Check `sports_teams` (tracked teams already have badges).
2. Check `sports_opponent_cache`.
3. If not found, call `fetchOpponentBadge(teamId)` and write to `sports_opponent_cache`.

Then extend `getTodayEvents` and `getTeamEvents` to join against both tables and return populated `homeTeamBadgeUrl` / `awayTeamBadgeUrl`.

```sql
-- Example for getTodayEvents
SELECT se.*,
       COALESCE(ht.badge_url, hoc.badge_url) AS home_team_badge_url,
       COALESCE(at.badge_url, aoc.badge_url) AS away_team_badge_url
  FROM sports_events se
  LEFT JOIN sports_teams ht ON ht.team_id = se.home_team_id
  LEFT JOIN sports_teams at ON at.team_id = se.away_team_id
  LEFT JOIN sports_opponent_cache hoc ON hoc.team_id = se.home_team_id
  LEFT JOIN sports_opponent_cache aoc ON aoc.team_id = se.away_team_id
 WHERE ...
```

#### `src/renderer/src/modules/sports/MyTeamsView.tsx`

In the Today card, add an `OpponentBadge` component that mirrors `TeamBadge` but accepts the badge URL directly from the event:

```tsx
function OpponentBadge({ name, badgeUrl, size = 'md' }: { name: string; badgeUrl: string | null; size?: 'sm' | 'md' | 'lg' }): React.ReactElement {
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'
  if (badgeUrl) {
    return <img src={badgeUrl} alt="" className={cn('rounded-full bg-muted object-cover', sizeClass)} />
  }
  return (
    <div className={cn('flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground', sizeClass)}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  )
}
```

Use it in the TodayCard where the opponent name is displayed.

---

## 3. Live Score + In-Progress / Finished Status

### Background

`SportEvent` already carries `homeScore`, `awayScore`, and `status`. `AllGamesView` uses `isLiveStatus()` / `isFinishedStatus()` helpers. The `MyTeamsView` Today card does **not** yet display scores or a live indicator.

The helpers need to be shared (move to a utility module, or duplicate for now in MyTeamsView).

### Changes

#### `src/renderer/src/modules/sports/utils.ts` *(new file)*

Extract shared helpers so both `AllGamesView` and `MyTeamsView` can use them:

```ts
export function isFinishedStatus(status: string | null): boolean {
  return Boolean(status && /(finished|final|completed|game over|ended|after penalties|after extra time)/i.test(status))
}

export function isLiveStatus(status: string | null): boolean {
  return Boolean(status && !isFinishedStatus(status) && /(live|in progress|half time|break|period|quarter|inning|set \d)/i.test(status))
}
```

#### `src/renderer/src/modules/sports/MyTeamsView.tsx`

Update the Today card for a team that has a game today:

- **Upcoming game** (not started): show "vs Opponent @ HH:MM" — no score.
- **In-progress game** (`isLiveStatus`): show current score ("3–2") with a pulsing red `●` indicator and the raw status string (e.g. "In Progress", "3rd Period").
- **Finished game** (`isFinishedStatus`): show final score with W/L styling from `outcomeClasses`.

```tsx
// Inside TodayCard (game-day section):
{isLiveStatus(todayGame.status) && (
  <div className="flex items-center gap-1.5">
    <span className="animate-pulse text-red-500 text-xs">●</span>
    <span className="text-sm font-semibold tabular-nums">
      {getScore(todayGame, team.teamId)}
    </span>
    <span className="text-xs text-muted-foreground">{todayGame.status}</span>
  </div>
)}
{isFinishedStatus(todayGame.status) && (
  <div className={cn('text-sm font-semibold tabular-nums', outcomeClasses(getOutcome(todayGame, team.teamId)).text)}>
    {getScore(todayGame, team.teamId)} · {getOutcome(todayGame, team.teamId)}
  </div>
)}
{!isLiveStatus(todayGame.status) && !isFinishedStatus(todayGame.status) && (
  <div className="text-xs text-muted-foreground">{formatTime(todayGame)}</div>
)}
```

Also apply the same live/finished display to the **Summarized**, **Standard**, and **Detailed** view cards where a same-day event appears.

---

## 4. Fast Polling for In-Progress Games (1-minute refresh)

### Background

When a game is live, the standard 5-minute poll interval produces stale scores. The fix is to detect live events after each refresh and temporarily schedule a faster follow-up poll.

To avoid hammering the API, the fast poll should:
- Only re-fetch **today's events** (not next/last-5 team history) using `eventsday.php`.
- Run at most every **60 seconds**.
- Stop automatically once no more live events are detected.

### Changes

#### `src/main/sources/sports/index.ts`

Add a secondary "live game" timer alongside the normal poll timer:

```ts
let liveRefreshTimer: ReturnType<typeof setTimeout> | null = null
const LIVE_REFRESH_INTERVAL_MS = 60_000

function scheduleLiveRefreshIfNeeded(sport: string): void {
  const db = ensureDb()
  const today = getLocalDateString()
  const events = readTodayEvents(db, sport, today)
  const hasLive = events.some((e) => isLiveEventStatus(e.status))

  if (hasLive && liveRefreshTimer === null) {
    liveRefreshTimer = setTimeout(() => {
      liveRefreshTimer = null
      void doLiveRefresh(sport)
    }, LIVE_REFRESH_INTERVAL_MS)
  }
}

async function doLiveRefresh(sport: string): Promise<void> {
  const db = ensureDb()
  const fetchDate = getLocalDateString()
  const enabledLeagues = listEnabledLeagues(db, sport)

  for (const league of enabledLeagues) {
    const events = await fetchLeagueEventsForDate(fetchDate, league.name)
    upsertEvents(db, events, fetchDate)
  }

  emitSportsUpdated({ sport, ok: true, error: null })
  scheduleLiveRefreshIfNeeded(sport)
}
```

Import `isLiveEventStatus` from a shared utility (the same regex used in the renderer, duplicated in the main process):

```ts
function isLiveEventStatus(status: string | null): boolean {
  return Boolean(status && !/(finished|final|completed|game over|ended)/i.test(status)
    && /(live|in progress|half time|break|period|quarter|inning|set \d)/i.test(status))
}
```

Call `scheduleLiveRefreshIfNeeded(sport)` at the end of `doRefreshSport()` so that after any normal refresh, the live timer is armed if needed. Cancel `liveRefreshTimer` in `shutdown()`.

---

## 5. (Suggested) Per-Event Line Scores — Innings / Quarters / Periods

### API Endpoint

`GET /api/v1/json/123/lookuplinescores.php?id={eventId}`

Returns an array of scoring entries, one per period/inning/quarter, with fields:
- `strPeriod` — "1st Quarter", "2nd Inning", etc.
- `intHomeScore` / `intAwayScore` — score for that period
- `intScoreHome` / `intScoreAway` — cumulative score

### Use Case

In the **Detailed** view card, show a compact inning/period table below the final score:

```
INN  1  2  3  4  5  6  7  8  9  R  H  E
TOR  0  1  0  2  0  0  1  0  0  4  9  1
NYY  0  0  2  0  0  1  0  0  0  3  7  0
```

### Changes Required

- `src/shared/ipc-types.ts`: Add `SportLineScore` interface and `SportEventDetail` (event + line scores).
- `src/main/sources/sports/api.ts`: Add `fetchEventLineScores(eventId)` function.
- `src/main/db/migrations/005_sports_linescores.sql`: New `sports_linescores` table.
- `src/main/sources/sports/cache.ts`: Add `upsertLineScores` / `getLineScores` helpers.
- `src/main/sources/sports/index.ts`: After fetching today's events, call `fetchEventLineScores` for any event that is live or finished (to populate the table).
- `src/renderer/src/modules/sports/MyTeamsView.tsx`: Render the line score grid in the Detailed card.

---

## 6. (Suggested) Single-Event Refresh via `lookupevent.php`

### API Endpoint

`GET /api/v1/json/123/lookupevent.php?id={eventId}`

Returns full event details for a specific event ID. Much cheaper than re-fetching the entire league day schedule.

### Use Case

During the live-game fast-refresh path (Section 4), instead of calling `eventsday.php` for the whole league, call `lookupevent.php?id=` for each known live event. This reduces the number of API calls during live game periods significantly (especially valuable when many tracked teams are playing simultaneously).

### Changes Required

- `src/main/sources/sports/api.ts`: Add `fetchEventById(eventId: string): Promise<SportEvent | null>`.
- `src/main/sources/sports/index.ts`: In `doLiveRefresh`, identify event IDs of live games from the DB, call `fetchEventById` for each, and upsert results.

---

## 7. (Suggested) Full Season Schedule Prefetch

### API Endpoint

`GET /api/v1/json/123/eventsseason.php?id={leagueId}&s={season}`

Returns all events for a given season (e.g. `s=2024-2025` for NHL, `s=2025` for MLB).

### Use Case

Currently, the widget only knows about:
- Today's games (from `eventsday.php`)
- Last 5 and Next 5 for tracked teams (from `eventslast.php` / `eventsnext.php`)

With a season prefetch the widget could:
- Show a full multi-week schedule in the Standard/Detailed view
- Display a mini calendar of upcoming home games
- Support scrubbing through the season in a future "Season" view mode

### Changes Required

- `src/shared/ipc-types.ts`: Add `SPORTS_PREFETCH_SEASON` IPC channel and `SportSeasonPrefetchArgs`.
- `src/main/sources/sports/api.ts`: Add `fetchSeasonEvents(leagueId, season)`.
- `src/main/sources/sports/index.ts`: Add `prefetchSeason()` function; wire to IPC.
- `src/main/db/migrations/`: No schema change needed — `sports_events` can hold the season data; add a `season` column and an index on `(league_id, season)` for efficient retrieval.
- Settings UI: Add a "Prefetch season" toggle per league.

---

## Implementation Order

| # | Change | Effort | Value |
|---|--------|--------|-------|
| 1 | Configurable poll interval (5 min default) | Medium | High — enables all live data |
| 3 | Live score + status display in Today view | Small | High — visible UX win |
| 2 | Opponent badge in Today view | Medium | Medium — nice UX polish |
| 4 | 1-minute refresh for live games | Medium | High — accurate live scores |
| 6 | Single-event refresh via `lookupevent.php` | Small | Medium — API efficiency |
| 5 | Line scores (innings/quarters/periods) | Large | Medium — Detailed view depth |
| 7 | Season schedule prefetch | Large | Low-Medium — future feature |

Recommended first sprint: **1 → 3 → 4** (poll infrastructure + live display).
Second sprint: **2 → 6** (opponent badges + API efficiency).
Future: **5 → 7** (richer data).

---

## File Checklist

### New files
- [ ] `src/main/db/migrations/004_sports_team_cache.sql`
- [ ] `src/main/db/migrations/005_sports_linescores.sql` *(optional, section 5)*
- [ ] `src/renderer/src/modules/sports/utils.ts`

### Modified files
- [ ] `src/shared/ipc-types.ts` — `SportsSettings`, `SportEvent` badge fields, new IPC channels
- [ ] `src/main/sources/sports/index.ts` — poll timer, live refresh timer, settings functions
- [ ] `src/main/sources/sports/api.ts` — `fetchOpponentBadge`, `fetchEventById` *(section 6)*, `fetchEventLineScores` *(section 5)*
- [ ] `src/main/sources/sports/cache.ts` — opponent badge cache helpers, line score helpers *(section 5)*, updated queries with badge JOINs
- [ ] `src/main/sources/sports/ipc.ts` — new settings handlers
- [ ] `src/renderer/src/modules/sports/MyTeamsView.tsx` — live score display, opponent badge, `OpponentBadge` component
- [ ] `src/renderer/src/modules/sports/AllGamesView.tsx` — import shared utils
- [ ] `src/renderer/src/routes/Settings.tsx` — Sports poll interval setting UI
