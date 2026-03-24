## Plan: Script Manager Polish — 4 Features

> Status: Historical implementation plan retained for context. It documents an earlier polish pass and is not a maintained source of truth.
>
> Current maintained docs: [README](../../README.md), [docs/architecture/frontend.md](../architecture/frontend.md), [docs/architecture/data-sources.md](../architecture/data-sources.md), and [docs/ui-ux.md](../ui-ux.md).

**TL;DR:** Four targeted changes across the IPC layer, Settings page, and ScriptManager page. One new IPC channel needed (`SHELL_OPEN_PATH`); everything else builds on existing infrastructure.

---

### Phase 1 — IPC Layer

**Step 1.** Add `SHELL_OPEN_PATH: 'shell:openPath'` to the `IPC` const in ipc-types.ts (after `SHELL_OPEN_EXTERNAL`).

**Step 2.** Add handler in index.ts near the existing `SHELL_OPEN_EXTERNAL` handler:
```ts
ipcMain.handle(IPC.SHELL_OPEN_PATH, (_event, folderPath) => shell.openPath(folderPath))
```

---

### Phase 2 — Settings: Scripts Tab

**Step 3.** Add a `ScriptsTab` component to Settings.tsx:
- One setting: "Script Home Directory" — `Input` + Save button
- Load/save via existing generic `IPC.SETTINGS_GET` / `IPC.SETTINGS_SET` with key `script_home_dir`
- Same pattern as the poll-interval block in `YouTubeTab`

**Step 4.** In `Settings()`:
- Add `useSearchParams` from `react-router-dom`
- Change `<Tabs defaultValue="api-keys">` → `<Tabs defaultValue={searchParams.get('tab') ?? 'api-keys'}>`
- Add `<TabsTrigger value="scripts">Scripts</TabsTrigger>` and its `TabsContent`

---

### Phase 3 — ScriptManager Header Buttons

**Step 5.** In ScriptManager.tsx, in `ScriptManager()`:
- Add `useNavigate` (react-router-dom), `FolderOpen` + `Settings` icons (lucide-react)
- On mount, fetch `script_home_dir` from `IPC.SETTINGS_GET`
- Add two buttons in the page header:
  - **Open Folder** (FolderOpen icon) → `window.api.invoke(IPC.SHELL_OPEN_PATH, scriptHomeDir)` — disabled when dir is unset
  - **Script Settings** (Settings icon) → `navigate('/settings?tab=scripts')`

---

### Phase 4 — Per-Run Output in History Table *(parallel with Phase 3)*

**Step 6.** In `ScriptDetailPanel`:
- Add `selectedRunId: number | null` state
- Make history rows clickable (toggle expand), add a chevron indicator column
- Below the expanded row, show `run.stdout` / `run.stderr` in a `ScrollArea` block matching the live-output styling; fallback "No output captured."
- Live-output section above history stays unchanged

---

### Phase 5 — Remove Redundant Button *(independent)*

**Step 7.** Delete the `{/* Action buttons */}` `<div>` at the bottom of `ScriptDetailPanel` (the "Run Now / Cancel" block). The always-visible buttons on the `ScriptRow` header are sufficient.

---

**Relevant files:**
- ipc-types.ts — add `SHELL_OPEN_PATH`
- index.ts — add `SHELL_OPEN_PATH` handler
- Settings.tsx — `ScriptsTab` + tab registration + search-param driven default
- ScriptManager.tsx — header buttons, history output expansion, remove bottom action buttons

**Verification:**
1. Settings → "Scripts" tab appears; directory setting round-trips correctly
2. Set dir → Open Folder button opens Explorer to that path; disabled when empty
3. Script Settings button lands on `/settings?tab=scripts` (Scripts tab active, not API Keys)
4. Expand a script → click a history row → stored stdout/stderr shown inline
5. No "Run Now" button inside expanded panel; top-right row button still works

---

**Key decisions:**
- Using existing generic `SETTINGS_GET`/`SETTINGS_SET` for `script_home_dir` — no new dedicated IPC needed
- Tab deep-link via `?tab=scripts` query param; since Settings remounts on navigation, `defaultValue` from `useSearchParams` is enough (no controlled state)
- Out of scope: directory existence validation, add/edit/delete scripts from UI

Does this look good? Any adjustments before handing off to implementation?