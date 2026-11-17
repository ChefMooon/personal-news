---
name: next-up-card-matches-today
type: orc-plan
status: COMPLETED
source_brainstorm: none
planner: sonnet/high
implementer: opencode opencode/deepseek-v4.1-flash-free
dispatch: ctx_da5c338809ca
created: 2026-11-17
phases: 5/5
size: M
files: 11
plan_time: 4m41s
plan_usage: +13% session, +2% weekly (approx)
impl_time: ~18m26s
impl_usage: n/a
models: [opencode/deepseek-v4.1-flash-free, claude/sonnet]
---

# Plan: next-up-card-matches-today

## Plan (approved)

### Summary
`FeaturedNextGame` now mirrors the Today card's shell, header, team columns, centred time and LOCATION | PREVIOUS footer at all three sizes. It gets previous-result data, and the Previous format ("TR 108 - 112 NYK") is unified across every card. The edit preview now shows Next Up at medium and large. A shared `SportLabel` chip replaces the plain top-right sport text on Today small, Today medium/large and Next Up. A small shared helper module and footer keep the cards from drifting apart. Today's shells are left as they are.

### Overview

| id | goal | files | steps | parallel_safe | effort | size |
|---|---|---|---|---|---|---|
| P1 | Shared helpers (`shortTeamName`, `formatPreviousResult`), `GameCardFooter` and `SportLabel`, with unit tests | 4 (all new) | 9 | no | medium | M |
| P2 | Today cards adopt the shared footer, Previous format and `SportLabel` | 2 | 7 | no | low | S |
| P3 | Rewrite `FeaturedNextGame` as a Today mirror (including `SportLabel`), with tests | 2 | 9 | no | medium | S |
| P4 | Wire call sites (small, medium, large) and the edit preview | 3 | 6 | no | medium | M |
| P5 | Extend the renderer-browser harness (card content, sport chip, edit preview) | 1 | 5 | no | medium | S |

Size M · 5 phases · 11 files · 0 parallel_safe · longest chain P1 → P2 → P3 → P4 → P5 · risk medium (the small card's vertical fit and the header width at narrow columns are unverified without the browser harness, and the fill assertions in scripts/test-renderer-browser.mjs must keep passing)

### Design decisions
1. **Shared module, not a shared card shell.** `game-card-utils.ts` holds `shortTeamName`, `formatPreviousResult` and `NO_PREVIOUS_GAME_TEXT`. `GameCardFooter.tsx` and `SportLabel.tsx` are single components used by Today small, Today medium/large and Next Up. Today's two shells already differ and redesigning them is out of scope. Today's existing footer tests (`grid-cols-1`, `divide-x`, "Location", "Previous") pin the footer's behaviour.
2. **Previous format.** `${short(tracked)} ${score ?? "-"} - ${score ?? "-"} ${short(opponent)}`, which is the existing small-card logic moved verbatim. `shortTeamName` is the initials of a multi-word name (max 4), or the first 8 characters of a single word.
3. **Empty previous text** is "No previous game" everywhere. The medium card's "No previous game data" is retired, and no test references it.
4. **Tracked team on Next Up** mirrors Today: `resolveTrackedTeamSide` decides the left column, with `leftSide = trackedSide ?? "away"`. If no tracked team resolves, Previous shows "No previous game". If both are tracked, the first in `teams` wins.
5. **Previous game source:** `getPreviousGame(teamEventsById[trackedTeam.teamId], trackedTeam.teamId, trackedTeam.name, game.eventId, trackedTeam.leagueId)`. `FeaturedNextGame` gets a required `teamEventsById: Record<string, SportTeamEvents>` prop.
6. **Footer when `showVenue` is off** copies Today: one column, Previous kept. Location text is `formatVenueLine(...) ?? "Venue TBD"`.
7. **Variants** (values copied from the Today cards; the sport chip follows decision 12):
   - **compact** (small): `p-2`, `mt-2`, grid `gap-2`, avatar `h-7`, name `mt-1 text-xs`, score `text-sm`, footer `text-[10px]` with `pr-2`/`pl-2`.
   - **dense** (medium): `p-2`, `mt-2`, `gap-2`, `h-7`, name `mt-0.5 text-xs`, score `text-base`, footer `text-[11px]` with `pr-3`/`pl-3`.
   - **default** (large): `p-3`, `mt-3`, `gap-4`, `h-9`, name `mt-1 text-sm`, score `text-lg`, footer `text-xs` with `pr-3`/`pl-3`.
8. **Colour: violet.** Today's shell is emerald and its scheduled pill is sky. Next Up uses `border-violet-500/20 bg-violet-500/5` with a matching pill (`border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-300`). The sport chip stays neutral on every card.
9. **Pill text** is one text node, `Next up · ${formatWeekdayDate(game)}` (e.g. "Next up · Tue, Nov 17"), in `Badge variant="secondary"` with `min-w-0` and an inner truncating span. The date shows even when `showTime` is off.
10. **Centre column** shows `formatTime(game) || "TBD"` in `text-xs text-muted-foreground` when `showTime` is on, else an empty span so the grid stays intact. "at" and "Time TBD" are removed. Scores render a literal "-" in Today's bold tabular-nums class.
11. **Shared `SportLabel` chip** (`{ sport: string; size: "compact" | "dense" | "default" }`):
    - **Look:** a ghost chip, `inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 leading-4 text-muted-foreground`. It has no new accent colour and a transparent fill. Its `py-0.5`, `leading-4` and 1px border match the Today pill's height so the two line up. The pill stays the anchor because the chip is untinted and muted.
    - **Text:** `<span className="truncate">{sport}</span>`, the raw `game.sport` string as before ("Ice Hockey" stays "Ice Hockey"). The text stays in the DOM. The chip has `title={sport}` and `data-sports-sport-label`, and renders nothing for an empty sport.
    - **Icon:** a lucide icon, `aria-hidden="true"` and `shrink-0`. Compact uses `text-[11px]` and `h-3 w-3`. Dense and default use `text-xs` and `h-3.5 w-3.5`.
12. **Icon mapping** (verified against lucide-react 0.460.0 in `node_modules` and `src/shared/sports.ts`):
    - The supported sport ids are exactly `Baseball`, `Basketball` and `Ice Hockey`.
    - This lucide version has no baseball, basketball or hockey icon. The plan uses loose metaphors: `Basketball` → `Dribbble` (a ball with seams), `Ice Hockey` → `Snowflake`, `Baseball` → `CircleDot`, and any other sport → `Trophy`.
    - The map is `{ Baseball: CircleDot, Basketball: Dribbble, "Ice Hockey": Snowflake } satisfies Record<SupportedSport, LucideIcon>`, with lookup `isSupportedSport(sport) ? map[sport] : Trophy`. The implementer confirms the imports compile via `npm run typecheck`.
13. **Narrow-width behaviour: truncate, never drop the icon.** The header is `flex items-center justify-between gap-2`. The pill is `min-w-0 shrink`. The chip is `min-w-[1.75rem] shrink-[4] overflow-hidden`, so it gives up width first, never gets narrower than its icon plus padding, and truncates its text with an ellipsis. CSS only, no container queries. Today's pill is not changed internally, and the section's `overflow-hidden` is the backstop at extreme widths.
14. **Fill behaviour kept.** The section stays `flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border` with `data-sports-next-up` and `data-sports-next-up-body`. The body (`mt-2` or `mt-3 flex min-h-0 flex-1 flex-col justify-center`) contains only the matchup grid, so the harness's top and bottom gap measurements still work. Header and footer sit outside it as `shrink-0`. The footer keeps its own `mt-*`, as on Today.
15. **Edit preview.** `SportsWidget` computes `featuredNextGame = eligibleTodayEvents.length === 0 ? getFeaturedNextGame(fallbackEvents) : null` once. The large branch and the medium/large preview both use it, and the preview passes `dense={size === "medium"}` to match live. It replaces `MediumLiveGameView` only when `featuredNextGame` is set.
16. **No changes** to `getFeaturedNextGame`, data hooks, IPC, DB or `team-display-utils.ts`.

### Phases

#### P1: Shared helpers, footer and sport chip
- **depends_on:** none · **parallel_safe:** no · **effort:** medium
- **files (create):** `src/renderer/src/modules/sports/game-card-utils.ts`, `src/renderer/src/modules/sports/GameCardFooter.tsx`, `src/renderer/src/modules/sports/SportLabel.tsx`, `src/renderer/src/modules/sports/__tests__/game-card-utils.test.ts`
- **steps:**
  1. In `game-card-utils.ts`, move `shortTeamName` verbatim from `CompactSportsView.tsx` (lines 55-63) and export it. Export `NO_PREVIOUS_GAME_TEXT = "No previous game"`.
  2. Add `formatPreviousResult(previousGame: SportEvent | null, trackedTeam: TrackedTeam | null): string | null`. Return null if either argument is null or the side (from `resolveTrackedTeamSide(previousGame, trackedTeam.teamId, trackedTeam.name, trackedTeam.leagueId)` in `./side-resolution`) is null. Otherwise return `` `${shortTeamName(t.name)} ${t.score ?? "-"} - ${o.score ?? "-"} ${shortTeamName(o.name)}` `` built from the previous game's home and away fields.
  3. In `GameCardFooter.tsx`, export `GameCardFooter({ size, showVenue, venueLine, previousText })`, where `size` is `"compact" | "dense" | "default"` and `previousText` is `string | null`.
     - Root: `cn("grid min-w-0 shrink-0 border-t text-muted-foreground", showVenue ? "grid-cols-2 divide-x" : "grid-cols-1", sizeRoot)`, where `sizeRoot` is `mt-2 pt-1.5 text-[10px]` (compact), `mt-2 pt-1.5 text-[11px]` (dense) or `mt-3 pt-2 text-xs` (default).
     - Left cell (only when `showVenue`): `min-w-0 pr-2` (compact) or `pr-3`, `text-left`, with a `<p className="font-semibold uppercase tracking-wide">Location</p>` header and a truncated value `<p className="truncate" title={venueLine}>`.
     - Right cell: `min-w-0`, plus `pl-2`/`pl-3` and `text-right` when `showVenue`, else `text-left`, with the "Previous" header and `<p className="truncate" title={previousText ?? NO_PREVIOUS_GAME_TEXT}>{previousText ?? NO_PREVIOUS_GAME_TEXT}</p>`.
  4. In `SportLabel.tsx`, export `SportLabel({ sport, size })` per decisions 11 to 13. Import `CircleDot`, `Dribbble`, `Snowflake`, `Trophy` and `type LucideIcon` from `lucide-react`, `isSupportedSport` and `type SupportedSport` from `../../../../shared/sports`, and `cn` from `../../lib/utils`. Chip classes: `inline-flex min-w-[1.75rem] shrink-[4] items-center gap-1 overflow-hidden rounded-full border border-border/60 px-2 py-0.5 leading-4 text-muted-foreground` plus `text-[11px]` (compact) or `text-xs`. Icon: `cn("shrink-0", size === "compact" ? "h-3 w-3" : "h-3.5 w-3.5")` with `aria-hidden="true"`. Text in `<span className="truncate">`, with `data-sports-sport-label` and `title={sport}`. Render nothing when `sport` is empty.
  5. Tests (`React.createElement` + `renderToStaticMarkup`, as in sibling tests) for `formatPreviousResult`: "TR 108 - 112 NYK" when Toronto is away; scores flip when Toronto is home; a null score renders "-"; null for a null game, null team or unresolved side. Use matching `leagueId` values, `awayTeam: "Toronto Raptors"`, `homeTeam: "New York Knicks"`.
  6. Footer tests: `showVenue` false gives `grid-cols-1`, no `divide-x`, no "Location"; true gives `grid-cols-2 divide-x`; a null `previousText` renders "No previous game".
  7. `SportLabel` tests: renders the text and `data-sports-sport-label` for "Basketball", "Baseball" and "Ice Hockey"; an unknown sport ("Cricket") renders text plus an `<svg aria-hidden="true">` without throwing; compact has `text-[11px]` and `h-3 w-3`; default has `text-xs` and `h-3.5 w-3.5`; an empty string renders nothing.
  8. Do not change any existing file. `CompactSportsView` keeps its own `shortTeamName` until P2.
  9. Run the checks.
- **acceptance:** the new tests pass and there are no type errors, including the lucide imports.
- **checks:** `npm test -- game-card-utils`, `npm run typecheck`

#### P2: Today cards adopt the shared pieces
- **depends_on:** P1 · **parallel_safe:** no · **effort:** low
- **files (modify):** `src/renderer/src/modules/sports/CompactSportsView.tsx`, `src/renderer/src/modules/sports/MediumLiveGameView.tsx`
- **steps:**
  1. In `CompactSportsView.tsx`, delete the local `shortTeamName` (lines 55-63) and import it from `./game-card-utils`. It is also used near lines 403-404 and 520.
  2. In `CompactGameSummary`, delete the `previousTrackedSide`, `previousTrackedTeam` and `previousOpponent` blocks (lines 129-161). Add `const previousText = formatPreviousResult(previousGame, trackedTeam);`.
  3. Replace the footer markup (lines 255-279) with `<GameCardFooter size="compact" showVenue={showVenue} venueLine={venueLine} previousText={previousText} />`.
  4. In the header (lines 205-207), replace the plain `{game.sport}` span with `<SportLabel sport={game.sport} size="compact" />`.
  5. In `MediumLiveGameView.tsx`, add `const previousText = formatPreviousResult(previousGame, selectedTeam);` and replace the footer (lines 307-335) with `<GameCardFooter size={dense ? "dense" : "default"} ... />`. This removes the `eventDate · a-b` format.
  6. In the same file, replace the sport span (lines 236-238) with `<SportLabel sport={selectedGame.sport} size={dense ? "dense" : "default"} />`. Keep all other markup.
  7. Add a test (in `game-card-utils.test.ts` or a new `MediumLiveGameView` render test) that renders `MediumLiveGameView` with a tracked team and a previous game in `teamEventsById` and expects "TR 108 - 112 NYK" (or the equivalent fixture names) and `data-sports-sport-label`. Also assert that `CompactSportsView` markup contains `data-sports-sport-label`.
- **acceptance:** Today footers render with the same classes as before, except for the Previous format and unified empty text. The sport label is the neutral chip on both Today cards. `sports-widget-location.test.ts` passes unchanged.
- **checks:** `npm test -- sports`, `npm test -- game-card-utils`, `npm run typecheck`

#### P3: Rewrite `FeaturedNextGame`
- **depends_on:** P1 (runs after P2 for sequencing) · **parallel_safe:** no · **effort:** medium
- **files (modify):** `src/renderer/src/modules/sports/FeaturedNextGame.tsx`, `src/renderer/src/modules/sports/__tests__/FeaturedNextGame.test.ts`
- **steps:**
  1. Add the required prop `teamEventsById: Record<string, SportTeamEvents>`. Keep `dense` and `compact?`.
  2. Compute `variant = compact ? "compact" : dense ? "dense" : "default"` and a style table per decision 7.
  3. Resolve `trackedTeam`, `trackedSide`, `leftSide` and `rightSide` per decision 4. Badges use `teams.find(side === X)?.badgeUrl ?? game.<side>TeamBadgeUrl`.
  4. Compute `previousGame` via `getPreviousGame` and `previousText` via `formatPreviousResult`. Compute `venueLine = formatVenueLine(game, getLeagueCountry(game, leaguesById)) ?? "Venue TBD"`. `showVenue` now only toggles the Location column.
  5. Shell: `data-sports-next-up`, `aria-label="Next up"`, `flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-violet-500/20 bg-violet-500/5` plus the padding class.
  6. Header: `flex shrink-0 items-center justify-between gap-2`, with the pill (decisions 8, 9, 13) and `<SportLabel sport={game.sport} size={variant} />`.
  7. Body: `data-sports-next-up-body`, `{mt} flex min-h-0 flex-1 flex-col justify-center`, with one child, the grid `grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center text-center {gap}`.
     - Team column: `min-w-0`, `TeamAvatar` (`mx-auto rounded-full`, `h-7 w-7` or `h-9 w-9`), `<p className="truncate font-semibold {nameClass}" title>`, then `<p className="font-bold tabular-nums {scoreClass}">-</p>`.
     - Centre: `<span className="text-xs text-muted-foreground">{timeLabel}</span>`, or an empty span.
  8. Footer: `<GameCardFooter size={variant} showVenue={showVenue} venueLine={venueLine} previousText={previousText} />`.
  9. Rewrite the tests. Add `teamEventsById: {}` to the `render` helper, with an override for previous-data tests.
     - Keep: label and `data-sports-next-up`, both teams, venue, `showVenue=false` omits venue and "Location", and the `formatDateTime` test.
     - Replace the "omits the time line", "Time TBD" and "compact single-line" tests with: time shown or hidden by `showTime`; `>TBD<` and "Venue TBD"; the pill contains `formatWeekdayDate(game)` and "Next up"; scores render "-"; a tracked home team appears in the left column; previous result "TR 108 - 112 NYK" when tracked, "No previous game" otherwise; compact gives `h-7 w-7` and not `h-6`; `showVenue=false` gives `grid-cols-1` with Previous still present; markup contains `data-sports-sport-label` with "Basketball".
- **acceptance:** markup follows decisions 4 to 14, hooks and fill classes are unchanged, and the component's tests pass. Callers fail to typecheck until P4 adds the new required prop, so `npm run typecheck` is only expected to pass after P4.
- **checks:** `npm test -- FeaturedNextGame`

#### P4: Wire call sites and the edit preview
- **depends_on:** P3 · **parallel_safe:** no · **effort:** medium
- **files (modify):** `src/renderer/src/modules/sports/CompactSportsView.tsx`, `src/renderer/src/modules/sports/SportsMediumLayout.tsx`, `src/renderer/src/modules/sports/SportsWidget.tsx`
- **steps:**
  1. `CompactSportsView.tsx`: pass `teamEventsById={teamEventsById}` to `FeaturedNextGame` (lines 468-476). Keep `dense compact` and the `h-full min-h-28 min-w-0` wrapper.
  2. `SportsMediumLayout.tsx`: pass `teamEventsById={teamEventsById}` (already in props). Keep `dense`.
  3. `SportsWidget.tsx`: after the `useSportsWidgetData` destructure, add `const featuredNextGame = eligibleTodayEvents.length === 0 ? getFeaturedNextGame(fallbackEvents) : null;`.
  4. In the large branch, delete the IIFE (lines 403-428). Render `featuredNextGame ? <FeaturedNextGame game={featuredNextGame} teams={enabledTeams} teamEventsById={teamEventsById} showTime showVenue leaguesById dense={false} /> : <MediumLiveGameView .../>`. Keep the `shrink-0` wrapper.
  5. In the edit preview's medium/large branch (lines 291-300), use the same ternary with `dense={size === "medium"}`.
  6. The edit-preview small branch already goes through `CompactSportsView`, so it needs no change. It does not get `fillAvailable`, which is existing behaviour.
- **acceptance:** `npm run typecheck` passes. Medium and large edit previews show Next Up when there is no game today. Previews with games today are unchanged. Large no longer calls `getFeaturedNextGame` in an IIFE.
- **checks:** `npm run typecheck`, `npm test -- sports`

#### P5: Harness
- **depends_on:** P4 · **parallel_safe:** no · **effort:** medium
- **files (modify):** `scripts/test-renderer-browser.mjs`
- **steps:**
  1. In the `sportsNoGamesToday` block (about lines 1976-2066), keep every fill assertion (card height equal to parent, scroll and client heights, top and bottom gaps, the Large layout bounds with minimum height 120, small viewport overflow). Add per-size checks: case-insensitive `/location/i` and `/previous/i` on the widget's `innerText` (it is CSS-uppercased), and that `[data-sports-sport-label]` inside the card has non-empty text and contains an `svg[aria-hidden="true"]`.
  2. In the same `card.evaluate`, measure the sport chip and its previous sibling (the pill). Assert their heights differ by at most 2px, and that the chip's right edge is within the card's right edge. Include both rects in the failure message.
  3. Verify against the fixtures: yesterday's final (FT) fixture is a previous game for the tracked team. If tracked-team resolution is deterministic, also assert `/\d+ - \d+/`. If not, assert only "Previous" and note the pattern check was not added.
  4. Add an edit-preview check for medium and large: click `getByRole("button", {name: "Sports widget settings"})`, wait for `[data-sports-next-up]` inside `.sports-card-edit__preview`, assert it is visible, has non-zero size, contains a `[data-sports-sport-label]` and the text "Next up", then click "Close settings".
  5. Add no small-size edit-preview case. Small preview already uses `CompactSportsView`.
- **acceptance:** the harness passes, and it would fail if the preview rendered nothing at medium or large, or if the chip overflowed the card.
- **checks:** `npm run test:renderer-browser`. Report as not run if Chromium is unavailable.

### Acceptance criteria (overall)
- At small, medium and large, Next Up and Today share the same header, team columns, time and footer. Only the pill text and colour differ.
- The top-right sport label is the same muted outlined chip with a small icon on Today small, Today medium/large and Next Up. It is the same height as the pill and truncates before the pill does. The text stays in the DOM and the icon is `aria-hidden`.
- Next Up shows the tracked team's last result as "TR 108 - 112 NYK", or "No previous game". Every Today card uses the same format.
- The edit preview at medium and large shows the same Next Up card as the live widget when there is no game today.
- Next Up still fills its card at every size, with no overflow or clipping.
- `showVenue` off gives one column with Previous kept on every card.
- "Venue TBD" and "TBD" appear as empty-state copy.

### Checks (overall)
1. `npm run typecheck` passes for both projects.
2. `npm test -- sports`, `npm test -- FeaturedNextGame` and `npm test -- game-card-utils` pass, then run `npm test`.
3. `npm run test:renderer-browser` passes.
4. `npm run test:local-test-data -- --widget sports` needs Electron, so say so if it can't run. Fixtures always have games today, so Next Up never renders there. The run only confirms the Today cards still look right with the new Previous format and sport chip. A grep found no script locator that depends on the old plain sport text.

### Risks and open questions
- **Icon fit.** lucide 0.460.0 has no baseball, basketball or hockey icon. `CircleDot` for baseball is the weakest match. The alternative is custom inline SVGs per sport, which is not planned.
- **Small card height (unverified).** The compact Next Up card is now about as tall as Today's small card (~150px) against a `min-h-28` (112px) wrapper. The harness `scrollHeight` check will catch overflow. If it fails, reduce spacing before dropping content. The chip matches the pill's height, so it adds none.
- **Header width at narrow columns.** The chip truncates first and keeps its icon. Today's pill (e.g. "LIVE 2nd Q") isn't truncated internally. Check the 1-column projection visually in `npm run dev:renderer-browser`.
- **Pill width.** "Next up · Tue, Nov 17" may truncate at the narrowest projections. It truncates cleanly, so this is cosmetic.
- **Previous ordering.** `getPreviousGame` assumes newest-first, as Today does. Not verified.
- **Violet** is a judgement call.
- **Decided, non-blocking:** `showVenue` off keeps Previous. The first tracked team wins. `showTime` off leaves the centre empty. The chip shows the raw sport string, so "Ice Hockey" stays "Ice Hockey". `AllGamesView` shows "Hockey" via `getSportLabel`, and that is not changed.
- **Harness fixture:** the result-pattern assertion depends on the fixture's tracked-team identity, which the implementer verifies in P5.

### Out of scope / do not touch
- `getFeaturedNextGame` and `sports-game-selection.ts`.
- `team-display-utils.ts` (only imported from).
- Today card redesign beyond the footer, Previous format and sport chip.
- `src/main/**`, IPC, preload, DB, and `src/shared/sports.ts` (only imported).
- Electron fixtures (`src/main/dev-test-data/**`).
- Sport labels in other views (`AllGamesView`, `TodayGamesStrip`, `ExpandedGameCard`, `TeamStatCard`).
- The `AllGamesView` and `MyTeamsView` "Next up" text.
- `CHANGELOG.md` and anything outside the Sports widget.

## Run log

### 1. Planned (2026-11-17)
- Planner: sonnet, high effort (first draft plus one revision for the sport chip). No scouts were used.
- plan_time: 4m41s (about 3m00s first draft, 1m42s revision).
- plan_usage: +13% session, +2% weekly (approximate: it also counts other sessions and review time).

### 2. Implementer started (2026-11-17)
- Harness: opencode, model `opencode/deepseek-v4.1-flash-free` (user's pick over the configured default claude sonnet medium). No effort (unsupported). Dispatch `ctx_da5c338809ca`, run `run_f231e2c35e2a`, kept open.
- Warning given: opencode is `simple_only` and works directly with no subagents, and this plan is size M with 5 phases, so it may be a poor fit.
- Usage before start: n/a (opencode has no usage entry).

### 3. Implementer report (2026-11-17)
- STATUS: done. PHASES: P1 to P5 all done (P3 typecheck deliberately deferred to P4).
- FILES CHANGED (confirmed by `git status`, matches the plan's 11 files): `scripts/test-renderer-browser.mjs`, `CompactSportsView.tsx`, `FeaturedNextGame.tsx`, `MediumLiveGameView.tsx`, `SportsMediumLayout.tsx`, `SportsWidget.tsx`, `__tests__/FeaturedNextGame.test.ts`, new `game-card-utils.ts`, `GameCardFooter.tsx`, `SportLabel.tsx`, `__tests__/game-card-utils.test.ts`. Diff: 376 insertions, 221 deletions across the 7 modified files.
- CHECKS RUN (worker-reported, not rerun by the coordinator): `npm test -- game-card-utils`, `npm run typecheck`, `npm test -- sports`, `npm test -- FeaturedNextGame`, `npm run test:renderer-browser`, full `npm test` (80 files, 620 tests), `npm run test:local-test-data -- --widget sports`: all pass. eslint on the touched files: no new warnings.
- DEVIATIONS: P3 style table written as named className constants derived from the variant (same classes as decision 7). The harness's `getByText(/Next up/i).waitFor()` needed `.first()` because the pill and the header label now both match. The P2 test was added to `game-card-utils.test.ts` instead of a new file.
- OPEN ISSUES: the worker said `sports-widget-location.test.ts` (named in the P2 acceptance) does not exist in this worktree. Corrected by the reviewer: it exists at `src/renderer/src/modules/sports/sports-widget-location.test.ts` and passes. Pre-existing prettier warnings in untouched lines remain.
- MODELS: opencode / deepseek-v4.1-flash-free (launched model matches the requested one; effort none).
- cost: stage=implement harness=opencode model=opencode/deepseek-v4.1-flash-free/none time=~12m34s (from dispatchedAt 15:14:45 to completedAt 15:27:19; the two timestamps use different formats) usage=n/a

### 4. Review round 1 (2026-11-17)
- Reviewer: claude sonnet subagent (`orc-phase-verifier`, read-only). VERDICT: PARTIAL. P1 to P3 passed, P4 and P5 partial. No blockers.
- Reviewer ran: `npm run typecheck` (pass), `npm test -- sports` (19 files, 121 tests, pass), `npm test -- game-card-utils FeaturedNextGame` (28 tests, pass). Not run: full `npm test`, `npm run test:renderer-browser`, Electron sports run (so those results remain worker-reported only).
- Distilled findings:
  - F1 (minor, plan deviation) `SportsWidget.tsx` ~308-315: the edit preview's `MediumLiveGameView` now gets `dense={size === "medium"}`, so the medium preview with games today renders the dense layout. The plan said previews with games today stay unchanged (decision 15 applies `dense` to Next Up only). It matches the live widget, so it is arguably an improvement. Fix: revert to stay in scope, or keep and accept as intended. Not rendered by the reviewer.
  - F2 (minor) `scripts/test-renderer-browser.mjs`: the `/location/i` and `/previous/i` check runs on the whole widget `innerText`, so it could pass from another element. Fix: scope it to the `[data-sports-next-up]` card text.
  - F3 (minor) `scripts/test-renderer-browser.mjs`: the `/\d+ - \d+/` result assertion also runs on the whole widget text. Fix: scope it to the footer inside the Next Up card. The comment's fixture claim (tracked team is the baseball home team) is unverified.
- Dropped: chip-vs-pill check measures height only, not truncation at narrow widths (new test scope beyond the plan's P5; unverified). The reviewer's note that the worker's "location test missing" claim was wrong was applied to this log directly (no code fix needed).
- cost: stage=review harness=claude model=sonnet/n/a time=58s usage=n/a

### 5. Fixes chosen and sent (2026-11-17)
- User chose all three: F1 (revert `dense` on the medium edit preview's `MediumLiveGameView`), F2 (scope the Location/Previous check to the Next Up card), F3 (scope the result-pattern check to the Next Up footer). Sent to the implementer (`ctx_da5c338809ca`) with the instruction to rerun the plan's checks and report in the same format. Usage before send: n/a.

### 6. Fixes applied (2026-11-17)
- Implementer result: STATUS done. F1 applied (`dense` removed from the edit preview's `MediumLiveGameView`; `FeaturedNextGame` preview keeps `dense={size === "medium"}`). F2 applied (the Location/Previous check reads the `[data-sports-next-up]` card's own `innerText`, still case-insensitive). F3 applied (the result pattern reads only the footer child containing the Previous label; the worker says the fixture's first tracked team is baseball home "Fixture Owls", with yesterday's FT as its previous game). Files touched this round: `SportsWidget.tsx` and `scripts/test-renderer-browser.mjs` only (confirmed by `git status`: still the same 11 files).
- Checks reported after the fixes (worker-reported): `npm run typecheck`, `npm test -- sports` (19 files, 121 tests), `npm run test:renderer-browser` (two clean runs), `npm run test:local-test-data -- --widget sports`: all pass. eslint: no new warnings.
- Operational note from the worker: its first browser run after the fixes was cut off by an environment restart and left an orphaned harness/vite process tree; it stopped its own PIDs and reran.
- Not fixed: none skipped. Dropped finding (truncation test) stays out of scope.
- MODELS: opencode / deepseek-v4.1-flash-free (`worker-show` reports no launched model/effort fields for this follow-up task).
- cost: stage=fixes harness=opencode model=opencode/deepseek-v4.1-flash-free/none time=~5m52s (dispatchedAt 15:32:00 to completedAt 15:37:52; timestamp formats differ) usage=n/a

### 7. Review round 2 (2026-11-17)
- Reviewer: fresh claude sonnet subagent (`orc-phase-verifier`, read-only). VERDICT: PASSED. P1 to P5 passed; F1, F2 and F3 confirmed fixed with no new defects. The F3 fixture claim was verified by tracing the fixtures: the first tracked team is baseball home "Fixture Owls", yesterday's FT 3-1 stays in `last` in the no-games-today mode, so Previous renders "FO 3 - 1 FC".
- Reviewer ran: `npm run typecheck` (pass), `npm test -- sports` (19 files, 121 tests, pass). Not run: `npm run test:renderer-browser`, the Electron harness, `npm run build`, so the browser assertions are verified by reading only (the worker reported them passing).
- Minor, no action: the Location assertion assumes `showVenue` is on in the fixture (the default; it fails loudly rather than passing vacuously if not). The edit-preview button names ("Sports widget settings", "Close settings") exist in `SportsWidget.tsx` but their behaviour in the browser run was not independently verified.
- cost: stage=review harness=claude model=sonnet/n/a time=1m28s usage=n/a

### 8. Completed (2026-11-17)
- **Built:** Next Up now mirrors the Today card at small, medium and large (violet shell and pill "Next up · <date>", shared sport chip, "-" score placeholders, centred muted time, LOCATION | PREVIOUS footer with the tracked team's last result). Previous format is "TR 108 - 112 NYK" on every card. Shared `game-card-utils.ts`, `GameCardFooter.tsx` and `SportLabel.tsx` added. Medium/large edit preview shows Next Up when there is no game today. Browser harness extended (chip, footer, edit preview).
- **Files (11, all uncommitted):** modified `scripts/test-renderer-browser.mjs`, `CompactSportsView.tsx`, `FeaturedNextGame.tsx`, `MediumLiveGameView.tsx`, `SportsMediumLayout.tsx`, `SportsWidget.tsx`, `__tests__/FeaturedNextGame.test.ts`; new `game-card-utils.ts`, `GameCardFooter.tsx`, `SportLabel.tsx`, `__tests__/game-card-utils.test.ts`.
- **Checks (worker-reported after the fixes; the reviewers independently reran typecheck and the sports tests):** typecheck, `npm test -- sports` (121 tests), full `npm test` (80 files, 620 tests, run before the fix round), `npm run test:renderer-browser` (two clean runs), `npm run test:local-test-data -- --widget sports`: all pass.
- **Review:** 2 rounds. Round 1 PARTIAL (3 minor findings F1 to F3, all applied; 1 dropped as out of scope). Round 2 PASSED.
- **Open issues:** none blocking. Not independently run by the coordinator or reviewers: the browser harness, the Electron sports run and the full suite. The chip-truncation-at-narrow-widths guard was left out of the harness (new scope). Violet colour and the icon metaphors (Dribbble / Snowflake / CircleDot / Trophy) are judgement calls to check by eye in `npm run dev:renderer-browser`.
- **Models used:** implementer opencode / deepseek-v4.1-flash-free (a `simple_only` harness used on a size-M plan at the user's request; it completed without subagents); reviews claude sonnet; planner sonnet/high.

**Cost summary**
- plan: sonnet/high, 4m41s, +13% session, +2% weekly (approximate)
- implement: opencode deepseek-v4.1-flash-free, ~12m34s, usage n/a
- review 1: claude sonnet, 58s, usage n/a
- fixes: opencode deepseek-v4.1-flash-free, ~5m52s, usage n/a
- review 2: claude sonnet, 1m28s, usage n/a
- totals: implement + fixes ~18m26s; plan size M, 5 phases, 11 files (actual: 11 files, 7 modified and 4 new)

<!-- run-log-end -->
