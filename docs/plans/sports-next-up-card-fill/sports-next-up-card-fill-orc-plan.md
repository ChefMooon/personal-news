---
name: sports-next-up-card-fill
type: orc-plan
status: COMPLETED
source_brainstorm: none
planner: sonnet
implementer: claude sonnet medium
dispatch: ctx_2881971b127a
created: 2026-11-16
---

# Plan: sports-next-up-card-fill

## Plan (approved)

# Plan: Sports "Next Up" card fill and consistency

## Summary
Rework `FeaturedNextGame` so it fills its box. It gets a label, a centered matchup with a prominent date and time row, and a venue line at the bottom. Small gets a definite-height wrapper and a compact variant. Large renders the same card when no game is today. The fill assertion goes in the renderer-browser harness, not the Electron harness. The Electron fixtures always have live games today, so the Next Up card never renders there.

## Verified in the repo
- `FeaturedNextGame` is already `h-full` when `dense`, so the box is filled. The visible gap comes from the content having no flex-grow and no centering.
- Callers:
  - Medium: `SportsMediumLayout.tsx` L73-82, in the `div.min-h-0.min-w-0` grid cell.
  - Small: `CompactSportsView.tsx` L466-476, in `div.min-h-28.min-w-0`.
- Large: `SportsWidget.tsx` L395-410 always renders `MediumLiveGameView` in `div.shrink-0`. That view returns null with no events (`MediumLiveGameView.tsx` L120).
- `formatDateTime` in `team-display-utils.ts` is used by many other views. Its output must not change.
- `scripts/test-renderer-browser.mjs` already has a no-games-today check:
  - L1975-1990 opens the sports dashboard with `sportsNoGamesToday: true`.
  - It only loops `small` and `medium`.
  - `sportsWidgetIds` (L1209) has no `large` key.
  - The preview reads the scenario from `sessionStorage["__rendererBrowserScenario"]`.
- In that scenario `scripts/renderer-browser-api.mjs` strips today's events from the team events. The remaining upcoming game is the Baseball one tomorrow.
- The Electron harness (`scripts/test-local-test-data.mjs`) selects live games in `assertBasketballWidgets`. `src/main/dev-test-data/definitions/sports.ts` has no upcoming Basketball event, and all four leagues have a live game today. A Next Up card cannot appear in Electron without changing fixtures. Adding a fixture would break the count assertions in `definitions.test.ts` (6 events) and widen scope.
- Unit tests render with `renderToStaticMarkup` using `React.createElement` in `__tests__/*.test.ts`. Vitest includes `src/**/*.test.{ts,tsx}`.

## Design decisions
1. **Fix `FeaturedNextGame` itself.** It becomes a flex column with a fixed label at the top, a middle body that fills and centers, and a fixed venue line at the bottom. The leaning in the ledger is to avoid reusing the live card.
2. **Keep `dense: boolean` and add optional `compact?: boolean`.** Medium passes `dense`, Small passes `dense compact`, and Large passes `dense={false}`. This keeps the existing call signature.
3. **Label text stays "Next up" with the existing `uppercase` class.** It renders as "NEXT UP" and still matches the existing `/Next up/i` browser check and the `aria-label="Next up"`. The date and time leave the label.
4. **Body:**
   - `data-sports-next-up-body` is a `flex min-h-0 flex-1 flex-col justify-center gap-2` container.
   - Its children are the matchup grid (unchanged `minmax(0,1fr)_auto_minmax(0,1fr)` with `truncate` and `title`) and the time row.
   - The group is centered, so the space above the matchup equals the space below the time row.
5. **Time row, default and dense:**
   - Line 1 is the weekday and date in `text-xs text-muted-foreground`.
   - Line 2 is the time in `text-base font-bold tabular-nums`.
   - `showTime` false: date only.
   - `showTime` true but no `eventTime`: line 2 reads "Time TBD".
6. **Compact variant (Small).** The time row is a single line `text-xs font-semibold` ("Tue, Nov 17 · 7:00 PM"), and the avatars are `h-6 w-6`. A two-line row plus 28px avatars would likely overflow Small's `min-h-28` (112px) box. The compact total is about 100px.
7. **Small wrapper becomes `h-full min-h-28 min-w-0`.** Do not touch the grid row template. If the harness shows the wrapper not matching the grid height, add `grid-rows-[minmax(0,1fr)]` to the grid only when `fillAvailable`, as a fallback.
8. **Large uses `dense={false}` inside the existing `shrink-0` wrapper.** Its height is content-driven, like the live card. Stretching it would push the team list out of view.
9. **Large uses the same condition as Medium:** `eligibleTodayEvents.length === 0 ? getFeaturedNextGame(fallbackEvents) : null`. It is inlined with no new helper. `SportsWidget.tsx` imports `FeaturedNextGame` and `getFeaturedNextGame`.
10. **Venue is hidden when missing** (existing behavior). The body stays centered either way. Names stay truncated with `title`.
11. **New `formatWeekdayDate(game)` in `team-display-utils.ts`.**
    - It uses the same options as `formatDateTime` (weekday short, month short, day numeric).
    - `formatDateTime` is refactored to call it, with no output change.
    - Time comes from the existing `formatTime(game)`, which returns "" when there is no time.
12. **Stable test hooks.** `data-sports-next-up` is on the section and `data-sports-next-up-body` on the body. This matches the existing `data-sports-*` convention.
13. **Harness assertion goes in `scripts/test-renderer-browser.mjs`.** It extends the existing `sportsNoGamesToday` block, so it is deterministic and runs without Electron. The fixture is Baseball tomorrow. Layout has no sport logic, so this is equivalent to the Basketball fixture. This deviates from the scope's "Electron harness"; see Open questions.
14. **No change to the edit-mode preview**, `MediumLiveGameView`, the Other-teams column, data, or settings.

## Phases

### P1: Component and utils
- **goal:** Rework `FeaturedNextGame` and add the date helper.
- **depends_on:** none
- **files:**
  - modify `src/renderer/src/modules/sports/FeaturedNextGame.tsx`
  - modify `src/renderer/src/modules/sports/team-display-utils.ts`
  - create `src/renderer/src/modules/sports/__tests__/FeaturedNextGame.test.ts`
- **steps:**
  1. In `team-display-utils.ts`, add exported `formatWeekdayDate(game)` and make `formatDateTime` call it.
  2. In `FeaturedNextGame.tsx`, import `cn` from `../../lib/utils`, `formatWeekdayDate` and `formatTime`. Add the optional `compact` prop.
  3. Build the section: `data-sports-next-up`, `aria-label="Next up"`, `flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border`, with `gap-1.5 p-2` when dense and `gap-2 p-3` otherwise.
  4. Label: `<p className="shrink-0 truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Next up</p>`.
  5. Body: the container from decision 4. Keep the matchup grid as it is, with the avatar size `h-6` when compact, `h-7` when dense, and `h-9` otherwise.
  6. Time row as in decisions 5 and 6.
  7. Venue: `shrink-0 truncate border-t pt-1.5 text-[11px] text-muted-foreground` with `title`, rendered only when `venueLine` is set.
  8. Unit test (use `renderToStaticMarkup`, and do not assert exact locale time strings):
     - Output contains both team names, `data-sports-next-up`, "Next up" and the venue.
     - `showVenue=false` omits the venue.
     - `showTime=false` omits the time line.
     - `eventTime: null` with `showTime=true` contains "Time TBD".
     - `compact` renders without the two-line time row.
- **acceptance criteria:**
  - `formatDateTime` output is unchanged.
  - The new tests pass.
  - `FeaturedNextGame` keeps its exported name and its existing props.
- **checks:**
  - `npm test -- FeaturedNextGame`
  - `npm test -- sports`
  - `npm run typecheck`
- **parallel_safe:** no
- **effort:** medium

### P2: Wire Small and Large
- **goal:** Small gets the definite-height wrapper and compact card. Large renders the fallback.
- **depends_on:** P1
- **files:**
  - modify `src/renderer/src/modules/sports/CompactSportsView.tsx`
  - modify `src/renderer/src/modules/sports/SportsWidget.tsx`
  - Medium needs no change: `SportsMediumLayout.tsx` already passes `dense`.
- **steps:**
  1. `CompactSportsView.tsx` L467: change the wrapper to `h-full min-h-28 min-w-0` and pass `dense compact` to `FeaturedNextGame`.
  2. `SportsWidget.tsx`, in the large branch (L400-410), compute `const featuredNextGame = eligibleTodayEvents.length === 0 ? getFeaturedNextGame(fallbackEvents) : null`. Do this before the JSX return, or in an IIFE.
  3. Inside `div.shrink-0`, render `<FeaturedNextGame game teams={enabledTeams} showTime={config.showTime} showVenue={config.showVenue} leaguesById dense={false} />` when `featuredNextGame` is set. Otherwise render `MediumLiveGameView` unchanged.
  4. Add the imports for `FeaturedNextGame` and `getFeaturedNextGame`.
- **acceptance criteria:**
  - Live and today views are unchanged. Compare with `sportsNoGamesToday` off.
  - At Large with no game today, the card renders instead of an empty area.
  - The Small card fills its box.
- **checks:**
  - `npm run typecheck`
  - `npm test -- sports`
  - Manual: `npm run dev:renderer-browser`. In the browser console run `sessionStorage.setItem("__rendererBrowserScenario", JSON.stringify({astronomyEnabled:true, sportsNoGamesToday:true}))` and reload.
  - On the Sports dashboard, inspect Small, Medium and Large. Also check narrow widths (1-column projection) and then the live scenario.
- **parallel_safe:** no
- **effort:** low

### P3: Harness assertion
- **goal:** Assert the card fills its container at all three sizes.
- **depends_on:** P1, P2
- **files:** modify `scripts/test-renderer-browser.mjs` (only the sports block at ~L1209 and ~L1975-1990)
- **steps:**
  1. Add `large: "pn_dev_fixture_widget_sports_large"` to `sportsWidgetIds`. Add `"large"` to the L1976 size loop.
  2. For each size, take `card = widget.locator("[data-sports-next-up]")`, wait for it, and run `card.evaluate` returning:
     - `cardH` and `parentH`, from the card and `parentElement` bounding rects.
     - `scrollHeight` and `clientHeight` of the card.
     - `topGap`: body top to the first child's top.
     - `bottomGap`: the last child's bottom to body bottom, using `[data-sports-next-up-body]` as the body.
     - `regionH`: the height of `[data-sports-layout="medium"]` for medium, or `[data-sports-content-viewport="small"]` for small. Null for large.
     - `viewportScrollH` and `viewportClientH` for the small viewport.
  3. Assert:
     - `|cardH - parentH| <= 2`.
     - `|parentH - regionH| <= 2` when `regionH` exists.
     - `scrollHeight <= clientHeight + 1`.
     - `|topGap - bottomGap| <= 2`.
     - For small, `viewportScrollH <= viewportClientH + 1`.
     - Keep the existing `/Next up/` and no-"No games today" checks.
  4. Negative check (do not commit it): temporarily remove `h-full` from the card's classes and from the Small wrapper. Confirm the run fails, then revert.
- **acceptance criteria:**
  - Passes at Small, Medium and Large.
  - Fails when the card stops filling.
- **checks:** `npm run test:renderer-browser` passes. If Playwright Chromium is unavailable in this environment, report it as not run.
- **parallel_safe:** no
- **effort:** medium

## Overall acceptance criteria
- With no game today, Medium shows a card with no large empty gap. The matchup is centered, the time is prominent on a two-line row, and the venue is at the bottom. The card fills the left cell.
- Small shows the same data as a compact filling card. Large shows the card where it used to be empty.
- The same fallback game appears at all three sizes.
- The harness assertion passes and fails when the card stops filling.
- Live, today and edit views are unchanged.

## Checks (overall)
Run these on a Windows shell:
- `npm run typecheck` passes for both node and web projects.
- `npm test` passes, including the new `FeaturedNextGame` test and the existing `sports-game-selection` test.
- `npm run test:renderer-browser` passes.
- `npm run test:local-test-data -- --widget sports` still passes (regression only). It needs Electron and a built profile. If it cannot run in this environment, report that.

## Risks and open questions
- **Assertion location (resolved on approval):** the harness assertion goes in the renderer-browser harness, as planned. The scope said Electron, but Electron cannot render the card without a fixture change. An Electron assertion would need a new upcoming Basketball fixture event plus a Next Up scenario, which changes `definitions.test.ts` counts and fixture ownership lists. Not planned here.
- **Edit-mode preview (resolved on approval):** the Medium and Large preview (`SportsWidget.tsx` L288-298) still renders nothing when there is no game today. It is out of scope and left as is.
- **Risk: Small height.** Small's real box may be shorter than 112px. If the compact card overflows, the harness's small `scrollHeight` check will catch it. Then reduce padding or drop the venue line for compact.
- **Risk: Chromium sizing.** Percent heights inside a stretched grid item depend on Chromium behavior. Decision 7's fallback covers this.
- **Risk: Large height.** Large's card height is natural (decision 8). The "fills its container" assertion is nearly trivial there, but it still guards against clipping.
- **Not checked:** the planner did not run the app, tests or harness.

## Out of scope / do not touch
- `MediumLiveGameView.tsx`, the Other-teams/secondary column, data fetching (`useSportsWidgetData.ts`, main process), and settings.
- Electron fixtures in `src/main/dev-test-data/**`.
- A shared card-shell refactor, and any sport-specific logic.
- The `AllGamesView`/`MyTeamsView` "Next up" text.

## Run log

### 1. Implementer started (2026-11-16)
Harness claude, model sonnet, effort medium, dispatch ctx_2881971b127a (run run_3f3eb4c615d7), kept open. Plan has 3 phases, so the worker should delegate to `orc-phase-implementer` subagents.

### 2. Implementer report (2026-11-16)
- STATUS: done (worker reported success). No DELEGATION line; the worker said it implemented all three phases directly (no subagents).
- FILES CHANGED (confirmed with git status): FeaturedNextGame.tsx, team-display-utils.ts, CompactSportsView.tsx, SportsWidget.tsx, new `__tests__/FeaturedNextGame.test.ts`, scripts/test-renderer-browser.mjs.
- CHECKS RUN: typecheck pass, `npm test` 597 pass, `test:renderer-browser` pass. Negative check (removing `h-full`) made the harness fail on Small, then was reverted. NOT RUN: `test:local-test-data -- --widget sports`.
- Flag: plan had 3 phases but was done directly; no `DELEGATION` line in the report.

### 3. Review round 1 (2026-11-16)
Reviewer: Claude `orc-phase-verifier` subagent (sonnet). Verdict: PARTIAL (P1 and P2 pass; P3 partial). Checks it ran: typecheck pass, `npm test -- sports` 98 pass. It did not run the full test run, the browser harness or Electron. No out-of-scope changes; `formatDateTime` output confirmed unchanged for its callers; no accessibility regression.

Distilled findings:
- F1 (major) `scripts/test-renderer-browser.mjs`, Large assertions: close to vacuous. The card's parent is the content-sized `shrink-0` wrapper and the card is `overflow-hidden`, so the fill and overflow checks always pass at Large. Fix: compare against a fixed reference such as the `[data-sports-content-viewport="large"]` sibling, or assert a stable minimum height.
- F2 (minor) `SportsWidget.tsx:153-156`: `largeFeaturedNextGame` is computed on every render for all sizes. Fix: compute it only in the Large branch.
- F3 (minor) `FeaturedNextGame.test.ts`: no `compact` plus `showTime=false` case, and no check that `formatDateTime` output is unchanged. Fix: add both tests.

Dropped: the `topGap`/`bottomGap` tolerance remark (the check is meant to confirm centering; the tolerance is fine), and the "run Electron once" note (a user action, not a fix).

### 4. Fixes chosen and sent (2026-11-16)
User chose apply all: F1, F2, F3. Sent to the implementer as follow-up dispatch ctx_159504942c4e. The send gave the checks to rerun and asked for a DELEGATION line.

### 5. Fixes result (2026-11-16)
Worker reported done, again directly with no subagents. F1: Large now also asserts card height >= 120 and that its top and bottom sit inside `[data-sports-layout=large]`; a negative check (min raised to 100000) failed at Large, showing the real card is about 186px tall, then was reverted. F2: `largeFeaturedNextGame` is computed in an IIFE inside the Large branch only. F3: added tests for `compact` with `showTime=false` and for `formatDateTime` against the original Intl composition. Checks: typecheck pass, `npm test -- sports` 100 pass, `test:renderer-browser` pass. Not run: `test:local-test-data -- --widget sports`. Files touched match git status; nothing committed.

### 6. Wrap-up (2026-11-16)
Built: `FeaturedNextGame` reworked to fill its box (label, centered body with a two-line date and time row, venue footer, compact variant for Small); `formatWeekdayDate` added with `formatDateTime` unchanged; Small wrapper given a definite height; Large shows the Next Up fallback when no game is today; fill assertions added at Small, Medium and Large in `scripts/test-renderer-browser.mjs`.
Files changed: FeaturedNextGame.tsx, team-display-utils.ts, CompactSportsView.tsx, SportsWidget.tsx, `__tests__/FeaturedNextGame.test.ts` (new), scripts/test-renderer-browser.mjs.
Checks (worker-reported): typecheck pass, `npm test` pass (597 before fixes; `npm test -- sports` 100 after), `test:renderer-browser` pass, negative checks fail as expected. The reviewer independently ran typecheck and `npm test -- sports`. Not run by anyone: `test:local-test-data -- --widget sports` (Electron regression).
Review: 1 round (Claude verifier, sonnet), verdict PARTIAL; F1, F2, F3 applied.
Models: implementer claude sonnet medium, working directly with no subagents on both the main run and the fixes, despite the 3-phase plan.
Open issues: Electron sports regression not run; the edit-mode preview still renders nothing when no game is today (out of scope by decision).

<!-- run-log-end -->
