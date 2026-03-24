## Plan: Script Manager Editable Scheduling and Config

> Status: Historical implementation plan retained for context. It is not a maintained source of truth for the current Script Manager behavior.
>
> Current maintained docs: [README](../../README.md), [docs/architecture/data-sources.md](../architecture/data-sources.md), [docs/architecture/frontend.md](../architecture/frontend.md), and [docs/ui-ux.md](../ui-ux.md).

Yes, this is very possible with the current architecture. The scheduler and script persistence are already in place; the main missing pieces are mutation IPCs and Script Manager editing UI.  
You asked for all schedule types plus full script editing and description support, so this plan includes all of that.

**Steps**
1. Phase 1: Lock UX behavior and constraints.
2. Define editable fields as: name, description, file path, interpreter, args, schedule type (manual, on app start, interval, fixed time), and auto-run toggle.
3. Enforce the rule you requested: when schedule is manual (unset), auto-run is grayed out and unusable.
4. Add matching backend guard so manual schedule cannot be persisted with auto-run enabled.
5. Phase 2: Data model and shared contracts.
6. Add DB migration for scripts.description (nullable text).
7. Extend shared IPC types to include description and update payloads.
8. Add IPC channels for script config updates, schedule updates, and enabled toggle updates.
9. Phase 3: Main process update handlers plus live scheduler reconfiguration.
10. Implement/update handlers in index.ts for all editable fields with validation.
11. Reuse scheduler runtime methods so changes take effect immediately without app restart.
12. Keep existing run, cancel, output streaming, history, and stale detection behavior unchanged.
13. Phase 4: Script Manager UI and hook integration.
14. Extend useScripts.ts with update methods.
15. Add Edit UI in ScriptManager.tsx for all fields.
16. Add schedule-specific controls:
17. Manual: clear schedule; disable auto-run control.
18. On app start: show no time/minutes inputs.
19. Interval: minutes input.
20. Fixed time: hour/minute input.
21. Add description field in editor and display it in script list/detail.
22. Phase 5: Verification and docs alignment.
23. Update architecture/UI docs for new script edit capabilities and semantics.
24. Run static checks and complete manual end-to-end verification.

**Relevant files**
- ScriptManager.tsx - Add edit interface, schedule controls, toggle disabled behavior, description display.
- useScripts.ts - Add mutation methods and refresh flow.
- ipc-types.ts - Add/extend IPC contracts and script shapes.
- index.ts - Add update handlers, validation, normalization, scheduler rewire.
- scheduler.ts - Reuse register/unregister for hot updates.
- index.ts - Confirm scheduler wiring and module integration points.
- 001_initial.sql - Baseline schema reference for scripts table.
- New migration file to add description column (planned).
- ipc.md - Document new mutation channels.
- data-model.md - Document description field and schedule/enable normalization.
- ui-ux.md - Document Script Manager editing behavior.

**Verification**
1. Run npm typecheck and lint.
2. In dev app, edit one script for each schedule mode and confirm save/reload persistence.
3. Confirm manual schedule disables auto-run control and backend rejects invalid enabled+manual combinations.
4. Confirm toggling auto-run on scheduled scripts stops/resumes scheduling without restart.
5. Confirm on-app-start schedule triggers on app launch.
6. Confirm interval/fixed-time validation and error messaging.
7. Confirm description persists and renders.
8. Regression-check run now, cancel, live output, run history, stale warning.

**Other useful user-editable script settings**
1. Description (you requested this, and it is high value for clarity).
2. Name alias separate from filename (already implied by editable name).
3. Args presets or quick profiles (later enhancement; useful for scripts with common modes).
4. Max output retention per script (later enhancement; helpful for noisy scripts).
5. Last-run notification preference per script (later enhancement; reduces noise).

Session plan has been saved and is ready for handoff once you approve.