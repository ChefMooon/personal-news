## Plan: Script Catch-Up + Run Complete Foundation

> Status: Historical implementation plan retained for context. It documents a specific follow-up planning pass and is not a maintained source of truth.
>
> Current maintained docs: [README](../../README.md), [docs/architecture/data-sources.md](../architecture/data-sources.md), [docs/architecture/frontend.md](../architecture/frontend.md), and [docs/ui-ux.md](../ui-ux.md).

Recommended approach is to implement two backend/platform upgrades together:  
1. Hybrid missed-window handling at startup (auto catch-up for short downtime, warning event for long downtime).  
2. Dedicated scripts:runComplete event plus notification-ready persistence and IPC scaffolding, with no notification UI yet.

This matches your decisions:
- Catch-up policy: Hybrid
- Scope: Event + persistence scaffolding
- UI notifications/dashboard tab: deferred, but supported by design now

**Steps**
1. Phase 1: Contract updates
2. Add scripts:runComplete constant and payload model in ipc-types.ts.
3. Define notification read model and IPC response shapes in ipc-types.ts so main/renderer can evolve independently.
4. Phase 2: Missed-window startup behavior (hybrid)
5. Extend startup scheduler logic in scheduler.ts with a decision helper that evaluates missed runs from existing schedule + last run data.
6. Apply hybrid decision at initialization in scheduler.ts: run one immediate catch-up when downtime is short, emit warning event when downtime is long, skip manual schedules.
7. Keep existing cron registration path unchanged after the decision so recurring behavior remains stable.
8. Phase 3: Run lifecycle event and persistence scaffolding
9. Emit scripts:runComplete in completion/error paths after run state is finalized in executor.ts.
10. Preserve scripts:updated emission for backward compatibility through index.ts.
11. Add a new migration under src/main/db/migrations to create script_notifications (run-linked, severity, message, read state, timestamps), then ensure migration pickup in database.ts.
12. Add IPC handlers in index.ts to fetch recent notifications and mark entries read.
13. Phase 4: Renderer compatibility (no new UI)
14. Keep current behavior in useScripts.ts working via scripts:updated.
15. Optionally add additive listener support for scripts:runComplete in useScripts.ts to enable future incremental UX without creating new pages now.
16. Phase 5: Verification
17. Add unit tests for scheduler decision logic (interval, fixed-time, on-app-start, manual).
18. Add integration checks for run-complete payload correctness and event ordering compatibility with scripts:updated.
19. Validate notification persistence and read-state IPC behavior under success, non-zero exit, and spawn-error runs.
20. Run manual startup downtime scenarios (short vs long) and multi-window event fan-out validation.

**Relevant files**
- scheduler.ts  
- executor.ts  
- index.ts  
- index.ts  
- ipc-types.ts  
- database.ts  
- useScripts.ts

**Scope boundaries**
- Included: Hybrid missed-window behavior, scripts:runComplete event, notification-ready persistence + IPC, compatibility preservation, tests.
- Excluded for now: dashboard notification UI, notifications tab route/UI, preference controls.

Plan is saved at /memories/session/plan.md and ready for handoff/implementation.