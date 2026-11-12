---
name: widget-editor-escape-handling
type: orc-plan
status: COMPLETED
source_brainstorm: docs/plans/widget-editor-escape-handling/widget-editor-escape-handling-brainstorm.md
planner: sonnet
implementer: copilot gpt-6-luna
dispatch: ctx_77b659cd3696
created: 2026-11-12
---
# Plan: widget-editor-escape-handling

## Plan (approved)

### Summary
Add one shared hook, `useEditorEscape(active, onClose)`, in `src/renderer/src/hooks/`. It keeps today's window-level, bubble-phase `keydown` listener but ignores events whose `defaultPrevented` is already true. The six per-widget listeners are replaced by it. A Weather browser scenario goes into the existing script, and a small Vitest unit test covers the pure predicate.

The planner confirmed the Radix assumption in `node_modules`. `@radix-ui/react-dismissable-layer` 1.1.19 listens for `keydown` on the document in the capture phase, only while it is the highest layer. On Escape it calls `onEscapeKeyDown`, then `event.preventDefault()` and `onDismiss()`. Select (`react-select` 2.3.7) and Dialog/AlertDialog both render a `DismissableLayer`. A window bubble listener therefore sees `defaultPrevented === true` when an overlay consumed the Escape.

### Design decisions
- **Close only when `event.key === "Escape" && !event.defaultPrevented`.** Radix already signals "consumed" this way, so no overlay registry is needed.
- **Keep the listener on `window`, in the bubble phase.** Radix runs on document capture, which fires first. Moving to capture would break the rule.
- **The hook does not call `preventDefault()` or `stopPropagation()`.** Doing so would change multi-editor behaviour, where one Escape currently closes every widget in edit mode.
- **No text-field or `isComposing` special-casing.** The scope settles that text fields do not hold Escape back, and the location search input has no key handler.
- **Hook file:** `src/renderer/src/hooks/useEditorEscape.ts`, exporting the pure predicate `shouldCloseEditorOnEscape(event: Pick<KeyboardEvent, "key" | "defaultPrevented">)`.
  - `onClose` is kept in a ref, so the effect depends only on `[active]`. This avoids stale closures and exhaustive-deps lint noise.
  - The name matches the existing `useX` style in that folder.
  - The helper search ran: `grep -rniE "useEscape|useDismiss|useEditor|useKeyDown|useHotkey" src` found nothing.
- **Call sites pass an inline arrow: `useEditorEscape(isEditing, () => handleClose())`.** Weather declares `handleClose` as a `const` after the effect, so passing it directly would hit the temporal dead zone. The other widgets declare it as a hoisted function. The arrow is safe in all six.
- **The unit test is Vitest, predicate only.** `vitest.config.mts` uses `environment: "node"` with no DOM or testing library, so the browser test covers the hook itself.
- **The browser test is Weather-only, in `scripts/test-weather-browser.mjs`.**
  - Covering the other five widgets means navigating five more dashboards and fixtures, which is not cheap.
  - The shared hook and identical Radix primitives (checked by grep) justify Weather-only.
  - The scenario goes right after the existing Escape block at about lines 318-324 and reuses its `small`, `page` and `assert` variables.
  - It also covers the Restore Defaults dialog and Escape in the location search, because both are acceptance criteria and cheap.
- **Do not wire the script into `package.json`.** It isn't today. Run it with `node scripts/test-weather-browser.mjs`.

### Phases

**P1: Shared hook plus unit test**
- depends_on: none. parallel_safe: yes (with P3). Effort: low.
- Files (create): `src/renderer/src/hooks/useEditorEscape.ts`, `src/renderer/src/hooks/useEditorEscape.test.ts`
- Steps:
  1. Export the pure `shouldCloseEditorOnEscape`.
  2. Export `useEditorEscape(active: boolean, onClose: () => void): void`, holding `onClose` in a ref updated every render.
  3. One `useEffect` keyed on `[active]` returns early when inactive. Otherwise it adds `window.addEventListener("keydown", handler)` and returns the matching removal. The handler calls `onCloseRef.current()` when the predicate is true.
  4. Add a doc comment saying that Radix overlays handle Escape in the document capture phase and mark the event `defaultPrevented`, so the listener must stay in the bubble phase on window.
  5. In the test, use `describe`/`it`/`expect` from vitest (as in `youtube-updated-subscription.test.ts`). Cover `{Escape, false}` → true, `{Escape, true}` → false, and `{Enter, false}` → false.
- Acceptance: the files exist, the predicate behaves as above, and no widget is touched.
- Checks:
  - `npm test -- useEditorEscape` passes.
  - `npm run typecheck:web` passes.
  - `npx eslint` on the two files has no errors. Do not use `npm run lint`, which runs `--fix` across the repo.

**P2: Adopt the hook in all six widgets**
- depends_on: P1. parallel_safe: no. Effort: low.
- Files (modify):
  - `src/renderer/src/modules/weather/WeatherWidget.tsx` (97-104)
  - `src/renderer/src/modules/youtube/YouTubeWidget.tsx` (134-142, including the "Close on Escape key" comment)
  - `src/renderer/src/modules/reddit/RedditDigestWidget.tsx` (110-121)
  - `src/renderer/src/modules/sports/SportsWidget.tsx` (96-109)
  - `src/renderer/src/modules/saved-posts/SavedPostsWidget.tsx` (122-129)
  - `src/renderer/src/modules/astronomy/AstronomyWidget.tsx` (177-186)
- Steps:
  1. Delete the Escape `useEffect` block in each file.
  2. Replace it with `useEditorEscape(isEditing, () => handleClose());` and add the import from `../../hooks/useEditorEscape`, matching each file's hooks import style.
  3. Remove imports that become unused. `useEffect` is likely still used elsewhere, so check with typecheck and lint.
  4. Do not alter `handleClose`, the X buttons, or the `AlertDialog` markup.
  5. Run `grep -rn 'key === "Escape"' src/renderer/src/modules/*/*Widget.tsx`. It should return nothing.
- Acceptance: the six bare listeners are gone, each widget calls the shared hook, the X-button path is unchanged, and the other Escape handlers are untouched.
- Checks: `npm run typecheck`, `npx eslint` on the six files, and `npm test` all pass.

**P3: Weather browser scenario**
- depends_on: none for authoring. It passes only after P1 and P2, and is expected to fail before P2, which shows the bug reproduces. parallel_safe: yes (with P1). Effort: medium.
- Files (modify): `scripts/test-weather-browser.mjs`
- Steps:
  1. Run `node scripts/test-weather-browser.mjs` first to confirm the baseline is green. Playwright Chromium must be installed, which is unverified.
  2. Find the existing block after the `Weather widget settings` click (about lines 318-324). It clicks the settings button, waits for `Close settings`, presses Escape, then waits for the settings button again. Insert the new scenario right after it. `small` is the `weather_small` locator.
  3. Select case:
     - Open the editor on `small` and click `small.getByRole("combobox").first()`. The labels aren't associated with the triggers, so there is no accessible name to select by. This is the "Displayed location" trigger.
     - Wait for `page.getByRole("listbox")`, press Escape, and wait for the listbox to be hidden.
     - Assert `Close settings` is still visible, only after the listbox is hidden, because Radix applies `aria-hidden` to the rest of the page while open.
     - Press Escape again and wait for `Weather widget settings` to reappear.
  4. Alert dialog case:
     - Reopen the editor and click `Restore default settings` (aria-label at `WeatherWidget.tsx:237`).
     - Wait for `getByRole("alertdialog")`, press Escape, and wait for it to be hidden.
     - Assert `Close settings` is still visible.
     - Press Escape and assert the editor closes.
  5. Text field case:
     - Reopen the editor and focus `#weather-location-search` (the `htmlFor` id in `WeatherSettingsPanel.tsx`).
     - Press Escape and assert the editor closes.
  6. Use the file's existing `assert(ok, message)` and match its style. Avoid `waitForTimeout` where possible.
  7. Do not edit other parts of the script, and do not add an npm script.
- Acceptance: after P2 the script finishes with its "Passed N Weather ... checks" line and no `browserErrors`. Before P2, the new scenario fails at the "editor stays open" assertion. Record whether you observed that.
- Checks: `node scripts/test-weather-browser.mjs` exits 0. It is long-running because of its viewport and theme matrices, so allow a generous timeout.

### Acceptance criteria (overall)
- **Select open in the Weather editor:** Escape closes only the Select and the editor stays open (P3 Select case).
- **Restore Defaults dialog open:** Escape closes only the dialog (P3 alert case).
- **Second Escape closes the editor:** covered by P3.
- **Nothing nested open:** Escape closes the editor in one press in all six widgets. P2 keeps the same listener semantics, and the existing Weather scenario at about lines 318-324 still passes.
- **Escape in the Weather location search closes the editor:** P3 text-field case.
- **One shared rule replaces six copies:** the P2 grep finds no remaining bare Escape listeners in the six widgets.
- **X-button behaviour unchanged:** the diff does not touch it.

### Checks (overall), in order
1. `npm run typecheck` passes.
2. `npm test` passes, including the new `useEditorEscape` test.
3. `npx eslint` on the 7 changed or new `src` files has no errors.
4. `node scripts/test-weather-browser.mjs` exits 0. It needs Playwright Chromium. If that isn't installed, report it as not run.
5. Optional: `npm run test:renderer-browser` as a broader smoke test.

Nothing was run during planning. No Electron run is needed because the change is renderer-only.

### Risks and open questions
- **Runtime reproduction is untested.** The Radix source strongly implies the bug exists today. P3's red-before-green run is the confirmation.
- **Other Radix layers also mark Escape as handled.** A visible Radix Tooltip would swallow one Escape.
  - The only Tooltip found is in `weather/AstronomyStrip.tsx`, in the widget view and not the editor.
  - The Saved Posts `AddSavedPostModal` is a Radix Dialog and will now correctly keep the editor open.
- **Custom non-Radix overlays are parked.** `SavedPostItemActions.tsx:142` and `WeatherSummary.tsx:286` have their own Escape handlers that don't set `defaultPrevented`, so they aren't covered. A custom dropdown in any panel would need the same treatment.
- **Multiple editors open at once** all still close on one Escape. That is unchanged and out of scope.
- **The Weather script isn't in `package.json`** and may be slow or fragile. If the P3 step 1 baseline already fails, stop and report instead of changing unrelated checks.
- **Open (not blocking):** nested-overlay tests for the other five widgets were deliberately not added.

### Out of scope / do not touch
- Weather reset controls and Weather empty-state messages.
- Splitting the Weather header into smaller components.
- Custom menus and popovers outside the editors: `SavedPostItemActions.tsx`, `WeatherSummary.tsx`.
- Two-step Escape for text fields.
- The X-button close path.
- Other Escape handlers: `AddWidgetModal`, `NotificationsFlyout`, `DashboardToolbarActions`, the `WidgetWrapper` rename input, `TagManagementModal`, `OnboardingWizard`, `routes/SavedPosts.tsx`.
- No commits, branches or worktrees.

## Run log
### 1. Implementer started (2026-11-12)
Copilot orchestrator, gpt-6-luna, medium effort, started in a terminal with `--autopilot --allow-all --no-ask-user --max-autopilot-continues 30`. Prompt requires gpt-6-luna only, for the orchestrator and every subagent (user request). Dispatch `ctx_77b659cd3696`, run `run_8cdaaae9dd54`.
### 2. Implementer report (2026-11-12)
The worker stopped twice mid-run and was nudged to continue each time.
- STATUS: done
- PHASES: P1 (gpt-6-luna/low), P2 (gpt-6-luna/low), P3 (gpt-6-luna/medium), all passed
- FILES CHANGED: new `useEditorEscape.ts` and `useEditorEscape.test.ts`; six widgets switched to the hook; `scripts/test-weather-browser.mjs` gained the nested-overlay scenario. Confirmed by `git status` and `git diff --stat` (7 modified, 2 new).
- CHECKS RUN: typecheck, `npm test`, eslint on changed files (exit 0, Prettier CRLF warnings), `git diff --check`, Escape-listener grep, `node scripts/test-weather-browser.mjs` (baseline green, pre-P2 failure reproduced, final run 66 checks passed). All passed.
- DEVIATIONS: none. OPEN ISSUES: none.
- MODELS: orchestrator gpt-6-luna/medium; subagents gpt-6-luna only.
### 3. Review round 1 (2026-11-12)
Reviewer: Claude `phase-verifier` subagent. Verdict: PASSED. It reran typecheck, the hook unit test (3 passed), eslint (0 errors) and the Weather browser script (66 checks passed). Line endings are CRLF with no whole-file churn, and no out-of-scope files changed.
- Dropped: import ordering (cosmetic, nothing enforces it). Missing hook-lifecycle unit test and non-Weather overlay scenarios (match the plan's decisions, not defects).
- No fixes to apply.

### 4. Wrap-up (2026-11-12)
Built: shared `useEditorEscape` hook adopted by all six widgets, a predicate unit test, and a Weather browser scenario (Select, alert dialog, text field). Checks all passed. One review round, clean. Models: Copilot orchestrator gpt-6-luna/medium, subagents gpt-6-luna only. Nothing committed.
<!-- run-log-end -->
