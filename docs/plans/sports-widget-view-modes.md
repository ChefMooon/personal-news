# Sports Widget — Enhanced View Modes

**Status:** Ready for implementation
**Related Docs:** [sports-widget.md](./sports-widget.md) | [widget-settings-spec.md](../widget-settings-spec.md) | [ui-ux.md](../ui-ux.md)
**Reference Mockup:** `sports-widget-layouts.jsx` (in project root) — interactive React component showing all four views

---

## 1. Overview

This plan adds four distinct view modes to the My Teams section of the Sports widget, replacing the current single flat-text layout. The four modes are:

| Mode | Key idea |
|---|---|
| **Today** | Only shows teams with a game today; dimmed row for teams without one |
| **Summarized** | Single compact row per team — badge, name, last result chip, next game inline |
| **Standard** | Two-panel card with team-color header gradient; last and next game side by side |
| **Detailed** | Rich card with record, streak, venue, and separate result tile per game section |

The existing `all_games` view mode is **not affected**. These four modes replace/extend `my_teams`.

---

## 2. Shared Types — `src/shared/ipc-types.ts`

### 2.1 Extend `SportsViewConfig`

```typescript
// Before
export interface SportsViewConfig {
  sport: string
  viewMode: 'all_games' | 'my_teams'
  showVenue: boolean
  showTime: boolean
}

// After
export interface SportsViewConfig {
  sport: string
  viewMode: 'all_games' | 'today' | 'summarized' | 'standard' | 'detailed'
  showVenue: boolean
  showTime: boolean
}
```

### 2.2 Add derived fields to `SportTeamEvents`

Add a computed `playingToday` flag and streak string. These are **derived on the renderer side** from existing data — no new IPC channels or DB columns required.

```typescript
// No change to SportTeamEvents interface itself.
// The renderer derives these locally:
//   playingToday: events.next[0]?.eventDate === todayDateString
//   streak: computed from events.last[] — see §6.2
```

---

## 3. Hook — `src/renderer/src/hooks/useSportsViewConfig.ts`

Update the default view mode from `'all_games'` to `'today'` for new widget instances. Existing saved configs are unaffected because `normalizeSportsViewConfig` preserves any stored value.

```typescript
// Change only this line:
export const DEFAULT_SPORTS_VIEW_CONFIG: SportsViewConfig = {
  sport: DEFAULT_SPORT,
  viewMode: 'today',          // was 'all_games'
  showVenue: false,
  showTime: true
}
```

Also update `normalizeSportsViewConfig` to accept the new view mode values:

```typescript
const VALID_VIEW_MODES: SportsViewConfig['viewMode'][] = [
  'all_games', 'today', 'summarized', 'standard', 'detailed'
]

function normalizeSportsViewConfig(config: Partial<SportsViewConfig>): SportsViewConfig {
  const sport = config.sport
  const viewMode = config.viewMode && VALID_VIEW_MODES.includes(config.viewMode)
    ? config.viewMode
    : DEFAULT_SPORTS_VIEW_CONFIG.viewMode
  return {
    ...DEFAULT_SPORTS_VIEW_CONFIG,
    ...config,
    sport: sport && isWidgetSport(sport) ? sport : DEFAULT_SPORT,
    viewMode
  }
}
```

---

## 4. Settings Panel — `src/renderer/src/modules/sports/SportsSettingsPanel.tsx`

Replace the two-item View `<Select>` with four options:

```tsx
<Select
  value={config.viewMode}
  onValueChange={(value) => setConfig({ ...config, viewMode: value as SportsViewConfig['viewMode'] })}
>
  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
  <SelectContent align="start" side="bottom">
    <SelectItem value="today">Today</SelectItem>
    <SelectItem value="summarized">Summarized</SelectItem>
    <SelectItem value="standard">Standard</SelectItem>
    <SelectItem value="detailed">Detailed</SelectItem>
    <SelectItem value="all_games">All Games</SelectItem>
  </SelectContent>
</Select>
```

The `showVenue` and `showTime` toggles remain unchanged and apply across all view modes.

---

## 5. Sports Widget Router — `src/renderer/src/modules/sports/SportsWidget.tsx`

Find the section that currently renders `<MyTeamsView>` (likely gated on `config.viewMode === 'my_teams'`) and expand the routing logic:

```tsx
// Replace the existing my_teams branch with:
{(config.viewMode === 'today' ||
  config.viewMode === 'summarized' ||
  config.viewMode === 'standard' ||
  config.viewMode === 'detailed') && (
  <MyTeamsView
    teams={teams}
    teamEventsById={teamEventsById}
    showVenue={config.showVenue}
    showTime={config.showTime}
    viewMode={config.viewMode}
  />
)}
{config.viewMode === 'all_games' && (
  <AllGamesView ... />   // unchanged
)}
```

Pass `viewMode` as a new prop to `MyTeamsView`.

---

## 6. My Teams View — `src/renderer/src/modules/sports/MyTeamsView.tsx`

This file does the main work. It becomes a router that delegates to one of four sub-components based on `viewMode`.

### 6.1 Updated props signature

```typescript
export function MyTeamsView({
  teams,
  teamEventsById,
  showVenue,
  showTime,
  viewMode,
  showSportLabels = false
}: {
  teams: TrackedTeam[]
  teamEventsById: Record<string, SportTeamEvents>
  showVenue: boolean
  showTime: boolean
  viewMode: 'today' | 'summarized' | 'standard' | 'detailed'
  showSportLabels?: boolean
}): React.ReactElement
```

### 6.2 Derived helpers (add to top of file)

```typescript
/** Returns today's date as YYYY-MM-DD in the user's local timezone. */
function getTodayString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Computes a streak string (e.g. "W3", "L2") from the last-N events for a team.
 * Events must be ordered most-recent first (as returned by `eventslast.php`).
 */
function computeStreak(lastGames: SportEvent[], teamId: string): string {
  if (!lastGames.length) return ''
  const results = lastGames.map((g) => {
    const isHome = g.homeTeamId === teamId
    const ts = Number.parseInt(isHome ? g.homeScore ?? '' : g.awayScore ?? '', 10)
    const os = Number.parseInt(isHome ? g.awayScore ?? '' : g.homeScore ?? '', 10)
    if (!Number.isFinite(ts) || !Number.isFinite(os)) return null
    return ts > os ? 'W' : ts < os ? 'L' : 'T'
  })
  const first = results[0]
  if (!first) return ''
  let count = 0
  for (const r of results) {
    if (r === first) count++
    else break
  }
  return `${first}${count}`
}
```

### 6.3 View routing

```tsx
export function MyTeamsView({ teams, teamEventsById, showVenue, showTime, viewMode, showSportLabels = false }) {
  const today = getTodayString()

  if (teams.length === 0) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        No tracked teams yet. Add teams from Settings → Sports.
      </div>
    )
  }

  if (viewMode === 'today') {
    return <TodayView teams={teams} teamEventsById={teamEventsById} showVenue={showVenue} showTime={showTime} today={today} />
  }

  return (
    <div className="space-y-3">
      {teams.map((team) => {
        const events = teamEventsById[team.teamId]
        const lastGame = events?.last?.[0] ?? null
        const nextGame = events?.next?.[0] ?? null
        const streak = computeStreak(events?.last ?? [], team.teamId)

        if (viewMode === 'summarized') {
          return <SummarizedTeamCard key={team.teamId} team={team} lastGame={lastGame} nextGame={nextGame} showTime={showTime} />
        }
        if (viewMode === 'standard') {
          return <StandardTeamCard key={team.teamId} team={team} lastGame={lastGame} nextGame={nextGame} showTime={showTime} showVenue={showVenue} />
        }
        if (viewMode === 'detailed') {
          return <DetailedTeamCard key={team.teamId} team={team} lastGame={lastGame} nextGame={nextGame} streak={streak} showTime={showTime} showVenue={showVenue} />
        }
        return null
      })}
    </div>
  )
}
```

---

## 7. New Card Components

Create all four components in `src/renderer/src/modules/sports/MyTeamsView.tsx` as local functions (they are only used in this file). Do not create separate files for each card.

### 7.1 Shared utilities

```typescript
function getOutcome(game: SportEvent, teamId: string): 'W' | 'L' | 'T' | null {
  const isHome = game.homeTeamId === teamId
  const ts = Number.parseInt(isHome ? game.homeScore ?? '' : game.awayScore ?? '', 10)
  const os = Number.parseInt(isHome ? game.awayScore ?? '' : game.homeScore ?? '', 10)
  if (!Number.isFinite(ts) || !Number.isFinite(os)) return null
  return ts > os ? 'W' : ts < os ? 'L' : 'T'
}

function getScore(game: SportEvent, teamId: string): string {
  const isHome = game.homeTeamId === teamId
  const ts = isHome ? game.homeScore : game.awayScore
  const os = isHome ? game.awayScore : game.homeScore
  if (!ts || !os) return '—'
  return `${ts}-${os}`
}

function getOpponent(game: SportEvent, teamId: string): string {
  return game.homeTeamId === teamId ? game.awayTeam : game.homeTeam
}

/** Returns a Tailwind text/bg class pair for W/L/T/null outcomes. */
function outcomeClasses(outcome: 'W' | 'L' | 'T' | null): { text: string; bg: string; border: string } {
  if (outcome === 'W') return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' }
  if (outcome === 'L') return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' }
  if (outcome === 'T') return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
  return { text: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-muted' }
}
```

### 7.2 `SummarizedTeamCard`

Single-row layout. Badge + name on the left, outcome chip on the right, next game on second line.

```tsx
function SummarizedTeamCard({ team, lastGame, nextGame, showTime }: {
  team: TrackedTeam
  lastGame: SportEvent | null
  nextGame: SportEvent | null
  showTime: boolean
}): React.ReactElement {
  const outcome = lastGame ? getOutcome(lastGame, team.teamId) : null
  const cls = outcomeClasses(outcome)

  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <TeamBadge team={team} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{team.name}</span>
          {lastGame && outcome && (
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-bold', cls.text, cls.bg)}>
              {outcome} {getScore(lastGame, team.teamId)}
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {nextGame
            ? <>Next: <span className="text-foreground/80">{getOpponent(nextGame, team.teamId)}</span> · {formatDateTime(nextGame, showTime)}</>
            : 'No upcoming games'}
        </p>
      </div>
    </div>
  )
}
```

### 7.3 `StandardTeamCard`

Two-section card. Top header has badge, name, sport/league, and a result chip pinned right. Bottom is a two-column grid: Last Game | Next Game.

```tsx
function StandardTeamCard({ team, lastGame, nextGame, showTime, showVenue }: {
  team: TrackedTeam
  lastGame: SportEvent | null
  nextGame: SportEvent | null
  showTime: boolean
  showVenue: boolean
}): React.ReactElement {
  const outcome = lastGame ? getOutcome(lastGame, team.teamId) : null
  const cls = outcomeClasses(outcome)

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="flex items-center gap-3 border-b bg-muted/20 px-3 py-2.5">
        <TeamBadge team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">{team.sport} · {team.leagueId}</p>
        </div>
        {lastGame && outcome && (
          <div className={cn('flex shrink-0 flex-col items-center rounded-md px-2.5 py-1', cls.bg)}>
            <span className={cn('text-base font-extrabold leading-none', cls.text)}>{outcome}</span>
            <span className={cn('text-[10px] font-semibold', cls.text)}>{getScore(lastGame, team.teamId)}</span>
          </div>
        )}
      </div>
      {/* Two-column body */}
      <div className="grid grid-cols-2 divide-x text-xs">
        <div className="px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground" style={{ fontSize: '10px' }}>Last Game</p>
          {lastGame ? (
            <>
              <p className="mt-1 text-sm text-foreground/80">vs. {getOpponent(lastGame, team.teamId)}</p>
              <p className="text-muted-foreground">{formatDateLabel(lastGame.eventDate)}</p>
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">No recent games</p>
          )}
        </div>
        <div className="px-3 py-2">
          <p className="font-semibold uppercase tracking-wide text-muted-foreground" style={{ fontSize: '10px' }}>Next Game</p>
          {nextGame ? (
            <>
              <p className="mt-1 text-sm text-foreground/80">vs. {getOpponent(nextGame, team.teamId)}</p>
              <p className="text-muted-foreground">
                {formatDateTime(nextGame, showTime)}
                {showVenue && nextGame.venue ? <> · {nextGame.venue}</> : null}
              </p>
            </>
          ) : (
            <p className="mt-1 text-muted-foreground">No upcoming games</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

### 7.4 `DetailedTeamCard`

Three-section card: header (badge, name, standing placeholder, record from last games, streak), last game section, next game section.

**Note on record:** `TrackedTeam` does not expose a win/loss record. Show `streak` in the header and omit a full season record unless it becomes available via the API in a future update.

```tsx
function DetailedTeamCard({ team, lastGame, nextGame, streak, showTime, showVenue }: {
  team: TrackedTeam
  lastGame: SportEvent | null
  nextGame: SportEvent | null
  streak: string
  showTime: boolean
  showVenue: boolean
}): React.ReactElement {
  const outcome = lastGame ? getOutcome(lastGame, team.teamId) : null
  const cls = outcomeClasses(outcome)
  const streakIsWin = streak.startsWith('W')

  return (
    <div className="overflow-hidden rounded-lg border">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-3 py-3">
        <TeamBadge team={team} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">{team.sport}</p>
        </div>
        {streak && (
          <div className="shrink-0 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Streak</p>
            <p className={cn('text-sm font-extrabold', streakIsWin ? 'text-emerald-400' : 'text-red-400')}>{streak}</p>
          </div>
        )}
      </div>

      {/* Last Game */}
      <div className="flex items-center gap-3 border-b px-3 py-2.5">
        {outcome && (
          <div className={cn('flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg border', cls.bg, cls.border)}>
            <span className={cn('text-sm font-extrabold leading-none', cls.text)}>{outcome}</span>
            <span className={cn('text-[10px] font-semibold', cls.text)}>{lastGame ? getScore(lastGame, team.teamId) : ''}</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Last Game{lastGame ? ` · ${formatDateLabel(lastGame.eventDate)}` : ''}
          </p>
          {lastGame ? (
            <>
              <p className="mt-0.5 text-sm font-medium">vs. {getOpponent(lastGame, team.teamId)}</p>
              <span className={cn('mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold', cls.text, cls.bg)}>
                {outcome === 'W' ? 'Win' : outcome === 'L' ? 'Loss' : outcome === 'T' ? 'Tie' : ''}
              </span>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">No recent games</p>
          )}
        </div>
      </div>

      {/* Next Game */}
      <div className="flex items-center gap-3 bg-muted/10 px-3 py-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-muted bg-muted/30 text-lg">
          📅
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next Game</p>
          {nextGame ? (
            <>
              <p className="mt-0.5 text-sm font-medium">vs. {getOpponent(nextGame, team.teamId)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(nextGame, showTime)}
                {showVenue && nextGame.venue ? ` · ${nextGame.venue}` : ''}
              </p>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">No upcoming games scheduled</p>
          )}
        </div>
      </div>
    </div>
  )
}
```

---

## 8. Today View — `TodayView`

A separate component (still in `MyTeamsView.tsx`) that renders game-day cards for teams playing today, and a dimmed "no game today" row for the rest.

```tsx
function TodayView({ teams, teamEventsById, showVenue, showTime, today }: {
  teams: TrackedTeam[]
  teamEventsById: Record<string, SportTeamEvents>
  showVenue: boolean
  showTime: boolean
  today: string
}): React.ReactElement {
  const playing = teams.filter((t) => teamEventsById[t.teamId]?.next?.[0]?.eventDate === today)
  const resting = teams.filter((t) => teamEventsById[t.teamId]?.next?.[0]?.eventDate !== today)

  if (playing.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-dashed px-4 py-5 text-center text-sm text-muted-foreground">
          None of your teams are playing today.
        </div>
        {resting.length > 0 && (
          <div className="space-y-1.5">
            {resting.map((team) => {
              const nextGame = teamEventsById[team.teamId]?.next?.[0] ?? null
              return <TodayRestingRow key={team.teamId} team={team} nextGame={nextGame} showTime={showTime} />
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {playing.map((team) => {
        const events = teamEventsById[team.teamId]
        const nextGame = events?.next?.[0] ?? null
        const lastGame = events?.last?.[0] ?? null
        return (
          <TodayGameCard
            key={team.teamId}
            team={team}
            nextGame={nextGame}
            lastGame={lastGame}
            showTime={showTime}
            showVenue={showVenue}
          />
        )
      })}

      {resting.length > 0 && (
        <div>
          <p className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">No game today</p>
          <div className="space-y-1.5">
            {resting.map((team) => {
              const nextGame = teamEventsById[team.teamId]?.next?.[0] ?? null
              return <TodayRestingRow key={team.teamId} team={team} nextGame={nextGame} showTime={showTime} />
            })}
          </div>
        </div>
      )}
    </div>
  )
}
```

### 8.1 `TodayGameCard`

Focus: the upcoming game is the hero. Shows matchup, game time, venue, and last result as secondary context.

```tsx
function TodayGameCard({ team, nextGame, lastGame, showTime, showVenue }: {
  team: TrackedTeam
  nextGame: SportEvent | null
  lastGame: SportEvent | null
  showTime: boolean
  showVenue: boolean
}): React.ReactElement {
  const outcome = lastGame ? getOutcome(lastGame, team.teamId) : null
  const cls = outcomeClasses(outcome)

  return (
    <div className="overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-500/5">
      {/* Team header with Game Day indicator */}
      <div className="flex items-center gap-3 border-b border-emerald-500/10 px-3 py-2.5">
        <TeamBadge team={team} size="md" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{team.name}</p>
          <p className="text-xs text-muted-foreground">{team.sport}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-400">Game Day</span>
        </div>
      </div>

      {/* Matchup */}
      {nextGame && (
        <div className="flex items-center justify-between gap-3 px-3 py-3">
          <div className="text-center">
            <TeamBadge team={team} size="lg" />
            <p className="mt-1 text-xs font-semibold">Toronto</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">vs</p>
            <p className="mt-1 text-base font-extrabold tracking-tight">
              {showTime && nextGame.eventTime ? formatTime(nextGame) : 'Tonight'}
            </p>
            <p className="text-[10px] text-muted-foreground">Tonight</p>
          </div>
          <div className="text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-lg">🏟️</div>
            <p className="mt-1 text-xs font-semibold">{getOpponent(nextGame, team.teamId).split(' ').slice(-1)[0]}</p>
            <p className="text-[10px] text-muted-foreground">{getOpponent(nextGame, team.teamId).split(' ').slice(0, -1).join(' ')}</p>
          </div>
        </div>
      )}

      {/* Footer: venue + last result */}
      <div className="grid grid-cols-2 divide-x border-t bg-muted/10 text-xs">
        {showVenue && nextGame?.venue && (
          <div className="px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Venue</p>
            <p className="mt-0.5 text-foreground/80">{nextGame.venue}</p>
          </div>
        )}
        {lastGame && (
          <div className={cn('px-3 py-2', !showVenue || !nextGame?.venue ? 'col-span-2' : '')}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Last Result</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              {outcome && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold', cls.text, cls.bg)}>{outcome}</span>
              )}
              <span className="text-foreground/80">{getScore(lastGame, team.teamId)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** Formats the UTC eventTime to a local time string (e.g. "7:07 PM"). */
function formatTime(game: SportEvent): string {
  if (!game.eventTime) return ''
  return new Date(`${game.eventDate}T${game.eventTime}:00Z`).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}
```

### 8.2 `TodayRestingRow`

Dimmed single-row entry for teams not playing today.

```tsx
function TodayRestingRow({ team, nextGame, showTime }: {
  team: TrackedTeam
  nextGame: SportEvent | null
  showTime: boolean
}): React.ReactElement {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 opacity-40">
      <TeamBadge team={team} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-muted-foreground">{team.name}</p>
        <p className="text-xs text-muted-foreground">
          {nextGame
            ? <>Next: {getOpponent(nextGame, team.teamId)} · {formatDateTime(nextGame, showTime)}</>
            : 'No upcoming games'}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground/50">—</span>
    </div>
  )
}
```

---

## 9. TeamBadge — Size Variants

The existing `TeamBadge` component in `MyTeamsView.tsx` is hardcoded to `h-9 w-9`. Add a `size` prop:

```tsx
function TeamBadge({ team, size = 'md' }: { team: TrackedTeam; size?: 'sm' | 'md' | 'lg' }): React.ReactElement {
  const sizeClass = size === 'sm' ? 'h-7 w-7 text-xs' : size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9 text-xs'

  if (team.badgeUrl) {
    return <img src={team.badgeUrl} alt="" className={cn('rounded-full bg-muted object-cover', sizeClass)} />
  }

  return (
    <div className={cn('flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground', sizeClass)}>
      {(team.shortName ?? team.name).slice(0, 2).toUpperCase()}
    </div>
  )
}
```

---

## 10. File Checklist

| File | Change |
|---|---|
| `src/shared/ipc-types.ts` | Extend `SportsViewConfig.viewMode` union with `'today' \| 'summarized' \| 'standard' \| 'detailed'` |
| `src/renderer/src/hooks/useSportsViewConfig.ts` | Change default `viewMode` to `'today'`; update `normalizeSportsViewConfig` to accept new values |
| `src/renderer/src/modules/sports/SportsSettingsPanel.tsx` | Add four new `<SelectItem>` entries to the View dropdown |
| `src/renderer/src/modules/sports/SportsWidget.tsx` | Expand routing to pass `viewMode` prop to `MyTeamsView`; include new modes in the condition |
| `src/renderer/src/modules/sports/MyTeamsView.tsx` | Full rewrite — add `viewMode` prop, helper functions, `TeamBadge` size variants, and four card sub-components |

No new files. No backend changes. No new IPC channels. No DB migrations.

---

## 11. Out of Scope

- **Team brand colors:** TheSportsDB v1 does not return a `teamColor` field. Do not attempt to derive colors from badge images. The card designs use Tailwind semantic tokens (`muted`, `emerald`, `red`) rather than per-team brand colors.
- **Season record (W-L):** Not returned by the existing IPC. The `streak` string computed from `events.last[]` is a sufficient proxy for now.
- **Live scores:** Out of scope per `sports-widget.md §12`.
- **`all_games` view changes:** Not touched by this plan.
- **Drag-to-reorder in Today view:** Teams render in `sortOrder` (their existing order in `sports_teams`).

---

## 12. Verification Steps

1. Run `npm run typecheck` — the updated `viewMode` union must not produce any TypeScript errors.
2. Open the widget in dev. Confirm the View dropdown in settings shows all five options (Today, Summarized, Standard, Detailed, All Games).
3. Set view to **Today**. Confirm only teams with `events.next[0].eventDate === todayString` show game-day cards. Confirm teams with no game today appear dimmed below.
4. Set view to **Summarized**. Confirm one row per team, outcome chip visible, next game inline.
5. Set view to **Standard**. Confirm two-panel layout: header with result chip, body with Last/Next columns.
6. Set view to **Detailed**. Confirm three-section card: header with streak, last game section, next game section.
7. Toggle **Show venue** on/off — venue text must appear/disappear in Standard, Detailed, and Today (footer) views.
8. Toggle **Show local game times** on/off — times must appear/disappear in all views.
9. Confirm **All Games** view is unaffected.
10. Create a second widget instance and confirm view mode settings are stored per-instance (different `instanceId` keys in localStorage).
