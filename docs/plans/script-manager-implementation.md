## Plan: Script Manager Full Implementation

> Status: Historical implementation plan retained for context. It is not a maintained source of truth for the current Script Manager implementation.
>
> Current maintained docs: [README](../../README.md), [docs/architecture/data-sources.md](../architecture/data-sources.md), [docs/architecture/frontend.md](../architecture/frontend.md), and [docs/ui-ux.md](../ui-ux.md).

The DB schema is already complete (`scripts` + `script_runs` tables, seeded). Everything else is stub/no-op. The approach mirrors the YouTube module's push event pattern (`emitYoutubeUpdated` → `BrowserWindow.webContents.send`) and follows `docs/architecture/data-sources.md §4`.

---

### Phase 1: Backend Infrastructure

**Step 1 — Extend ipc-types.ts** *(independent)*
- Add constants: `SCRIPTS_RUN`, `SCRIPTS_CANCEL`, `SCRIPTS_GET_RUN_HISTORY`, `SCRIPTS_OUTPUT`
- Add `is_stale: boolean` to `ScriptWithLastRun`
- Add `ScriptRunRecord` and `ScriptOutputChunk { runId, stream, text }` types

**Step 2 — Create `src/main/sources/scripts/executor.ts`** *(parallel with Step 3)*
- `runScript(db, script, onOutput, activeMap)` — `spawn(interpreter, [filePath, ...args], { cwd })`
- INSERT `script_runs` row on start; UPDATE with `finished_at`, `exit_code`, output on close
- Track `ChildProcess` in `activeMap: Map<scriptId, ChildProcess>` for cancellation
- 50 KB stdout/stderr cap (matches spec)

**Step 3 — Create `src/main/sources/scripts/scheduler.ts`** *(parallel with Step 2)*
- `ScriptScheduler` class with `Map<scriptId, CronJob>` (using `node-cron`)
- `initialize(db, runFn)` — runs `on_app_start` scripts immediately; registers crons for `interval`/`fixed_time`
- `toCronExpression()` — `*/N * * * *` for interval, `MM HH * * *` for fixed_time
- `registerScript()`, `unregisterScript()`, `shutdown()`

**Step 4 — Implement index.ts** *(depends on 2, 3)*
- Replace stub: wire `ScriptScheduler` + `runScript` in `initialize(db)`; implement `shutdown()`

**Step 5 — Add IPC handlers in index.ts** *(depends on 2)*
- `emitScriptsOutput(chunk)` helper (mirrors `emitYoutubeUpdated`)
- `scripts:run` — guard against already-running, call `runScript()`, emit `scripts:output` chunks, refresh on complete
- `scripts:cancel` — `child.kill()` via activeMap
- `scripts:getRunHistory` — `SELECT … WHERE script_id = ? ORDER BY started_at DESC LIMIT 50`

**Step 6 — Fix `scripts:getAll` stale logic** *(independent)*
- Add `isScriptStale(script, lastSuccessRun)` helper matching spec thresholds (not the 1.5× approximation currently in the frontend)
- JOIN last successful run (`exit_code = 0`) in SQL; compute and return `is_stale` per script

---

### Phase 2: Frontend

**Step 7 — Extend useScripts.ts** *(depends on Phase 1)*
- Add `runScript(id)`, `cancelScript(id)`, `getRunHistory(id)` actions
- Subscribe to `scripts:output` push events; expose output lines to the UI
- Refresh `scripts:getAll` after a run completes

**Step 8 — Build detail panel in ScriptManager.tsx** *(parallel with Step 9)*
- Expandable per-script panel (chevron click) with:
  - Amber stale callout if `script.is_stale` (now from backend)
  - Live output `<ScrollArea>` fed by `scripts:output` events
  - Run history table (Started, Duration, Exit Code) loaded on expand

**Step 9 — Wire Run Now button** *(parallel with Step 8)*
- Replace `console.log` with `runScript(id)` from the hook
- Spinner + disabled state during execution; refresh on complete

**Step 10 — Fix Sidebar.tsx stale badge** *(depends on 7)*
- Replace hardcoded `attention: true` with `scripts.some(s => s.is_stale)` from the hook (or a lightweight `useScriptsStaleness` hook like the existing `useNtfyStaleness.ts`)

---

### Relevant Files
- ipc-types.ts
- index.ts — stub to implement
- `src/main/sources/scripts/executor.ts` — new file
- `src/main/sources/scripts/scheduler.ts` — new file
- index.ts
- useScripts.ts
- ScriptManager.tsx
- Sidebar.tsx

---

### Verification
1. `npm run dev` launches without new errors
2. "Run Now" → `script_runs` row written to DB
3. stdout/stderr lines appear in real time in the detail panel
4. Exit code badge updates after run
5. Sidebar amber dot clears after successful run
6. Restart after missed interval → overdue script runs immediately
7. Cancel mid-run → child process terminates

---

### Decisions
- **Stale detection moved to backend** — returns `is_stale: boolean` on `ScriptWithLastRun`; removes need for the approximate 1.5× calculation currently in the frontend
- **Output chunks scoped by `runId`** — so the detail panel can filter to the current run only
- Phase 1 (backend) blocks Phase 2 (frontend); within each phase, paired steps can be done in parallel