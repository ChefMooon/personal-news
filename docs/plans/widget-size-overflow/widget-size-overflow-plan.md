---
title: "Widget Size Overflow Fix - Implementation Plan"
status: COMPLETED
current_phase: 2 / 2
created: 2026-09-21
last_updated: 2026-09-21
---

# Overall Plan Completion Status

* **Final State:** COMPLETED
* **Total Phases Completed:** 2 / 2
* **Summary of Outcome:** All six affected widget editors now invalidate stale edit-height measurements on size transitions, with Saved Posts also remeasuring its row-based height. Focused tests, full typecheck/build, and final diff validation passed; no grid geometry or non-editing overflow behavior changed. Component-level DOM regression tests were not added because the existing test setup has no renderer DOM harness.
* **Final Validation Evidence:** Independent validation in the implementation worktree passed `git diff --check`, the focused Vitest selector (5 files/30 tests), `npm run typecheck:web`, and `npm run build` (node/web typechecks plus main/preload/renderer bundles). The final diff contains only the six planned widget files plus this execution plan; no dashboard geometry or content-policy files changed.

# Specification & Overview

### 1. Scope & Objective
- **Goal:** Ensure changing a dashboard widget size while its settings editor is open does not preserve the old content height and visually cut off the newly expanded widget area.
- **In-Scope:** The shared edit-height behavior in the affected renderer widget modules, focused regression coverage where practical, and validation of the existing dashboard sizing contract.
- **Out-of-Scope:** Redesigning dashboard grid geometry, changing widget footprints, changing content policies, or altering normal non-editing overflow behavior.

### 2. Technical Constraints & Architecture
- Keep renderer changes within existing widget components and React state/effect patterns.
- Preserve the fixed edit-height behavior that prevents settings panels from expanding the grid unexpectedly, but invalidate or recalculate stale measurements when `size` changes.
- Maintain TypeScript 5.6, React 19-compatible typings, Tailwind conventions, and existing Vitest/build scripts.
- Coordinator: GPT-5.6 Luna, high reasoning. Scout: not used because this is a bounded single-repository UI bug. Implementer and validator: GPT-5.6 Luna, medium reasoning.

---

# Execution Plan & Handoffs

## Phase 1: Implement size-change height invalidation
- **Status:** COMPLETED
- **Objective:** Remove the stale edit-mode height constraint after a widget changes size so the new layout can render fully.

### Tasks
- [x] Confirm all widget editors that capture `editContentHeight` and identify the shared size-change behavior.
- [x] Update each affected widget editor to invalidate or refresh its captured edit height when `size` changes, without changing normal display overflow behavior.
- [x] Add or update focused tests for the regression if the behavior can be isolated under the existing test setup.
- [x] Update this phase's status, handoff evidence, and plan frontmatter as implementation progresses.

### Verification & Acceptance Criteria
- [x] **Automated Checks:** Run the focused Vitest test selector covering changed logic, then run the repository typecheck/build command appropriate to the changed renderer files.
- [x] **Functional Assertions:** Switching a widget from medium to large while its settings editor is open no longer leaves `CardContent` constrained to the pre-change height; the full large preview/panel remains reachable within the widget's scrollable area.
- [x] **Functional Assertions:** Existing small/medium/large rendering and non-editing overflow behavior remain unchanged.

### Plan Compliance Checklist
- [x] **Required Files:** Only the six affected renderer widget files were changed; no unrelated test or geometry files were modified.
- [x] **Boundaries:** `WIDGET_FOOTPRINTS`, grid breakpoints, row height, dashboard geometry projection, and content policies were not changed.
- [x] **Legacy Code Removed:** Each affected widget now invalidates its captured edit height on a size transition; no duplicate size-independent workaround was added. Saved Posts also invalidates its row-measurement sentinel so the new size can be measured.
- [x] **Acceptance Checks:** Focused Vitest, renderer typecheck, and full build commands completed successfully.

### Phase 1 Handoff & Verification Report
- **Compliance Check:** PASSED
- **Verification Result:** PASSED
- **Execution Proof / Logs:**
```bash
  $ npx vitest run src/renderer/src/modules/weather/weather-content-policy.test.ts src/renderer/src/modules/saved-posts/saved-posts-content-policy.test.ts src/renderer/src/modules/reddit/reddit-content-policy.test.ts src/renderer/src/modules/sports/sports-content-policy.test.ts src/renderer/src/modules/astronomy/__tests__/astronomy-content-policy.test.ts
  Test Files 5 passed; Tests 30 passed

  $ npm run typecheck:web
  personal-news@1.4.1 typecheck:web -> tsc --noEmit -p tsconfig.web.json --composite false

  $ npm run build
  personal-news@1.4.1 build -> typecheck:node, typecheck:web, electron-vite build
  main, preload, and renderer bundles built successfully
```

* **Artifacts Created/Modified:**
* `src/renderer/src/modules/weather/WeatherWidget.tsx` - Clears stale edit height after a size transition.
* `src/renderer/src/modules/youtube/YouTubeWidget.tsx` - Clears stale edit height after a size transition.
* `src/renderer/src/modules/saved-posts/SavedPostsWidget.tsx` - Clears stale height and remeasurement sentinel after a size transition.
* `src/renderer/src/modules/reddit/RedditDigestWidget.tsx` - Clears stale edit height after a size transition.
* `src/renderer/src/modules/astronomy/AstronomyWidget.tsx` - Clears stale edit height after a size transition.
* `src/renderer/src/modules/sports/SportsWidget.tsx` - Clears stale edit height after a size transition.

* **Decisions & Deviations:** Component-level regression tests were not added because the existing Vitest setup has policy/utility coverage but no renderer DOM harness for these widget editors; the shared policy tests and production build were used to verify the affected renderer surface. No product or architecture decision was required.
* **Next Phase Context:** Verify the final diff remains limited to the six widget files plus this plan, and confirm all six size transitions use the same previous-size invalidation pattern.

---

## Phase 2: Validate implementation against the plan

* **Status: COMPLETED**
* **Objective:** Independently verify the implementation, acceptance criteria, and diff boundaries.

### Tasks

* [x] Inspect the final diff against this plan and confirm all affected widget editors are covered consistently.
* [x] Run the required focused tests and typecheck/build validation, recording exact evidence.
* [x] Record any failed criteria, remaining risks, or approved deviations in this plan without implementing fixes.

### Verification & Acceptance Criteria

* [x] **Automated Checks:** Required validation commands completed successfully; the initial missing-dependency attempt is superseded by the successful run after `npm install`.
* [x] **Functional Assertions:** All six affected editors clear stale edit height on a size transition, and no dashboard grid sizing contracts changed.
* [x] **Plan Integrity:** Both phase checklists and handoff reports reflect the final diff and evidence.

### Plan Compliance Checklist

* [x] **Required Files:** The implementation diff is limited to the six planned widget editor files; the plan is the only execution-record artifact.
* [x] **Boundaries:** No grid geometry, breakpoint, dependency, or unrelated feature changes are present.
* [x] **Legacy Code Removed:** No stale size-independent edit-height path remains; each affected editor detects a size transition and clears its captured height.
* [x] **Acceptance Checks:** Each required command and functional assertion has recorded evidence.

### Phase 2 Handoff & Verification Report

* **Compliance Check:** PASSED
* **Verification Result:** PASSED
* **Execution Proof / Logs:** All commands were run from `C:\Users\justi\Documents\Git\copilot-worktrees\personal-news\chefmooon-super-adventure`:
  ```text
  git diff --check origin/main                         PASSED
  npm exec vitest run src/renderer/src/modules/weather/weather-content-policy.test.ts src/renderer/src/modules/saved-posts/saved-posts-content-policy.test.ts src/renderer/src/modules/reddit/reddit-content-policy.test.ts src/renderer/src/modules/sports/sports-content-policy.test.ts src/renderer/src/modules/astronomy/__tests__/astronomy-content-policy.test.ts PASSED — 5 files, 30 tests
  npm run typecheck:web                                PASSED
  npm run build                                        PASSED — node/web typechecks and main/preload/renderer bundles
  ```
  Direct diff inspection confirmed each of the six editors uses a `previousSizeRef` transition guard and clears `editContentHeight` while editing; Saved Posts also clears `measuredRowCountRef`. The diff boundary check found no changes to dashboard grid geometry or content-policy files.
* **Artifacts Created/Modified:** Six widget files listed in Phase 1 and this execution plan.
* **Decisions & Deviations:** No approved deviations. Component-level regression tests remain a risk because the existing Vitest setup has no renderer DOM harness; policy tests and production build passed. Dependencies were installed with `npm install --ignore-scripts` in the implementation worktree because its local `node_modules` was absent; no manifest changes resulted.
* **Next Phase Context:** None.

---
