---
title: "Astronomy Details Responsive Layout - Implementation Plan"
plan_profile: COMPACT
status: COMPLETED
verification_status: PASSED
current_phase: 1 / 1
created: 2026-10-17
last_updated: 2026-10-17
---

# Overall Plan Completion Status

* **Total Phases Completed:** 1 / 1
* **Summary of Outcome:** The details page uses the available main-content width, the sidebar collapses on narrow screens without changing the saved desktop preference, and all mandatory responsive layout and behavior checks passed.

# Specification & Overview

### Scope & Objective
- **Goal:** Make the Astronomy details page responsive and use the full width available in the app's main content area, while preserving readable gutters and the existing astronomy content.
- **In-Scope:** Adjust the route's page-level width and spacing; review and make only necessary layout-class changes to the detailed astronomy sections; collapse the sidebar on narrow screens so the main content remains usable; add or update browser coverage for available-width usage, narrow-screen reflow, and horizontal overflow.
- **Out-of-Scope:** Changes to astronomy calculations, data, loading/empty behavior, route/navigation behavior, unrelated app-shell/sidebar behavior, or the dashboard Astronomy widget's presentation.

### Constraints & Architecture
- `src/renderer/src/App.tsx` renders routes inside a flexible `<main className="flex-1 overflow-auto">`; treat the width available there, excluding the app shell, as the page's usable width.
- `src/renderer/src/components/Sidebar.tsx` already supports a persisted expanded width of 200px and a collapsed icon rail of 56px. At 390px viewport width, the expanded sidebar leaves too little room for the details page; use the existing icon-rail presentation below 640px without changing the saved preference.
- `src/renderer/src/routes/AstronomyDetails.tsx` currently wraps its card in `mx-auto w-full max-w-5xl p-4 md:p-6`, which caps the page width.
- `AstronomyDetailedPrimitives` in `src/renderer/src/modules/astronomy/AstronomyPrimitives.tsx` already uses min-width safeguards and container-query layouts for detailed sections. It is also reused by the Astronomy widget, so keep any changes to shared primitives scoped to the full-details presentation and avoid altering widget sizing.
- `scripts/test-renderer-browser.mjs` already exercises the details route and checks horizontal overflow at several viewport widths. Extend that existing coverage rather than creating a separate test harness; the standalone preview uses a mocked API and does not reproduce native Electron window chrome.

### Assumptions
- “Full width of the window” means the available main-content region inside the existing app shell, not the sidebar or title bar.
- Preserve responsive page gutters; full-width use does not mean content touches the edges of the main region.
- A loaded details page with fixture content is sufficient to verify layout behavior; existing content and route behavior remain unchanged.
- On narrow screens, use the existing collapsed icon-rail presentation without changing the user's saved desktop sidebar preference.

### Decisions & Change Log

| Decision | Source and date | Supersedes | Affected scope or acceptance criteria |
| --- | --- | --- | --- |
| Include narrow-screen sidebar collapse rather than treating 390px as unsupported; use the existing collapsed icon-rail presentation below 640px. | User direction, 2026-10-17 | App shell/sidebar geometry was out of scope; 390px usability was blocked. | Scope & Objective; Phase 1 tasks, guardrails, and UI validation. |

# Execution Plan & Handoffs

## Phase 1: Expand and Verify the Astronomy Details Layout
- **Status:** COMPLETED
- **Objective:** Remove the details page's unnecessary maximum-width restriction, collapse the sidebar on narrow screens, and verify that the details content adapts without horizontal overflow or changes to astronomy behavior.

### Tasks
- [x] Update the page-level wrapper in `src/renderer/src/routes/AstronomyDetails.tsx` so the card uses the available main-content width while retaining consistent responsive gutters.
- [x] Review the detailed sections in `src/renderer/src/modules/astronomy/AstronomyPrimitives.tsx` at narrow and wide container sizes; make only layout-specific adjustments needed for wrapping or width use, preserving the shared widget presentation. Existing container-responsive layouts were sufficient, so no shared primitive changes were needed.
- [x] Update `src/renderer/src/components/Sidebar.tsx` to use its existing collapsed icon-rail presentation below 640px without changing the saved desktop preference; keep icon-only navigation links accessible by name.
- [x] Extend the Astronomy details scenario in `scripts/test-renderer-browser.mjs` to measure the rendered page/card against the available `<main>` width, verify the sidebar's narrow-screen state, and assert no horizontal overflow at narrow and desktop viewport sizes.
- [x] Run the renderer browser suite and resolve any layout regressions caused by the page, sidebar, or scoped detailed-section changes.

### Outcome & Evidence Ledger
*Use one row per outcome. Keep checks beside the work they validate; classify each check as mandatory or optional.*

| Outcome / acceptance criterion | Check | Verification method | Result / evidence |
| --- | --- | --- | --- |
| At desktop widths, the details card uses the available main-content area rather than stopping at a fixed maximum width, with the intended gutters preserved. | Mandatory | Extend and run the Astronomy details browser scenario in `npm run test:renderer-browser`; compare the card's bounding box to the `<main>` content width at wide viewports. | PASS — At 1240px and 1600px, the card measured at least 90% of the available `<main>` width. |
| At narrow and intermediate widths, the details sections remain readable, reflow as needed, and do not create horizontal page or main-content overflow. | Mandatory | In the same browser scenario, check layout at 390px, 620px, 840px, 1240px, and 1600px viewport widths; verify the sidebar collapses below 640px, navigation links retain accessible names, and page and `<main>` scroll widths do not exceed their client widths. | PASS — Browser assertions confirmed the 56px sidebar and accessible Dashboard link at 390px and 620px, restoration of the saved desktop width at 840px and wider, and no page or main-content overflow at all five widths. Screenshots were visually inspected for responsive content reflow. |
| Existing astronomy details content and the reused Astronomy widget layout remain unchanged in behavior and presentation. | Mandatory | Run `npm run test:renderer-browser`; verify the existing details assertions and dashboard/widget matrix still pass. | PASS — `npm run test:renderer-browser` passed (6 dashboards × 3 sizes × 4 projections); the Astronomy details content assertions passed. `npm run typecheck` also passed for both TypeScript projects. |

### Scope & Diff Guardrails
- Keep changes limited to the Astronomy details page layout, narrow-screen sidebar presentation, any necessary full-details-only layout classes, and existing renderer-browser coverage.
- Do not change data, calculations, route behavior, desktop sidebar sizing/preferences, or unrelated page layouts. If a shared primitive needs a layout change, preserve its non-details widget presentation.

### UI Validation
- **Viewport(s):** 390px, 620px, 840px, 1240px, and 1600px browser widths.
- **Interactions/states:** Open Astronomy details with the existing fixture snapshot and inspect the rendered content at each viewport; verify the sidebar uses its collapsed icon rail below 640px, retains its saved desktop behavior, and keeps icon-only links accessible by name; preserve the route's existing content and loading behavior.
- **Requested measurements:** Compare the card's horizontal bounds with the available `<main>` content bounds at desktop widths; verify narrow-screen sidebar width, no horizontal overflow, and readable section reflow at every tested width.
- **Preview limitations/fallbacks:** The renderer-browser preview uses synthetic fixtures and a mocked `window.api`, and does not reproduce native Electron window chrome. Use its responsive viewport checks for page layout; if actual window geometry is in question, verify the same page in the Electron app after implementation.

### Phase Record
- **Artifacts created/modified:** `src/renderer/src/routes/AstronomyDetails.tsx` removes the maximum-width cap; `src/renderer/src/components/Sidebar.tsx` collapses the sidebar below 640px while preserving the saved desktop preference and accessible link names; `scripts/test-renderer-browser.mjs` checks width use, narrow sidebar state, desktop restoration, and overflow. Reviewed `src/renderer/src/modules/astronomy/AstronomyPrimitives.tsx`; its existing responsive layouts required no changes. Final browser artifacts: `artifacts/renderer-browser/2026-10-17T05-14-51.620Z`.
- **Decisions/deviations:** Narrow-screen sidebar collapse was added at the user's direction; no other deviations.
