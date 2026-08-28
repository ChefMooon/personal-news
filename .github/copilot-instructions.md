# GitHub Copilot Instructions

## Priority Guidelines

When generating code for this repository:

1. Version Compatibility: Match detected versions from workspace files. Do not use features that require newer versions.
2. Context Files: If .github/copilot context files are later added, treat them as higher priority than this file.
3. Codebase Patterns: Prefer patterns already used in this repository over external conventions.
4. Architectural Consistency: Keep the established Electron layered architecture and module boundaries.
5. Code Quality: Prioritize maintainability, performance, security, accessibility, and testability as they are currently represented in this codebase.

## Detected Technology Versions

Observed from package metadata and lockfile:

- Node runtime target: Node 20+ (documented in docs/HOW-TO-RUN.md)
- npm: v9+ (documented in docs/HOW-TO-RUN.md)
- Electron: ^33.2.1
- electron-vite: ^2.3.0
- electron-builder: ^25.1.8
- TypeScript: ^5.6.3
- Vite: ^5.4.11
- React runtime: 19.2.4 (resolved in lockfile)
- React DOM runtime: 19.2.4 (resolved in lockfile)
- @types/react: ^18.3.12
- @types/react-dom: ^18.3.1
- React Router DOM: ^7.0.2
- Tailwind CSS: ^4.0.0 with @tailwindcss/vite ^4.0.0
- Radix UI packages: v1/v2 family as listed in package.json
- better-sqlite3: ^11.0.0
- fast-xml-parser: ^4.3.6
- node-cron: ^3.0.3
- DnD Kit: @dnd-kit/core ^6.3.1, @dnd-kit/sortable ^9.0.0, @dnd-kit/utilities ^3.2.2

Generation constraints:

- TypeScript code must remain compatible with tsconfig.node.json and tsconfig.web.json.
- Keep moduleResolution as bundler-style behavior.
- Use existing path aliases: @shared/* in node/web, and @renderer/* plus @/* in renderer.
- Prefer code that is compatible with the currently installed React type surface; do not assume React 19-only APIs unless nearby code already uses them and the typings support them.

## Architecture and Boundaries

This repository is an Electron monolith with clear layers:

1. Main process layer (src/main): lifecycle, DB access, settings persistence, source module registration, and IPC handler registration.
2. Preload bridge (src/preload): minimal contextBridge exposure with invoke/on wrapper, where on() returns an unsubscribe cleanup function; preload also applies the initial theme synchronously before the renderer mounts.
3. Shared contracts (src/shared): IPC channel constants and shared TypeScript interfaces.
4. Renderer layer (src/renderer/src): React UI, hooks, route screens, widget modules, provider/context logic, and settings-driven updater/theme flows.

Do not bypass these boundaries:

- Renderer code must not access Node APIs directly.
- New renderer-main communication must go through preload invoke/on and IPC constants in src/shared/ipc-types.ts.
- Main process persistence/query logic belongs in src/main (not in renderer).

## Codebase Pattern Rules

### TypeScript and Naming

- Use explicit return types on exported functions and many local helpers, matching existing style.
- Use PascalCase for React components and interfaces; camelCase for functions/variables; UPPER_SNAKE_CASE for channel constants.
- Shared data contracts use interface-first typing in src/shared/ipc-types.ts.

### Imports and Module Style

- Use ES module imports consistently.
- Use type-only imports where already practiced (import type ...).
- Prefer alias imports in renderer where configured; keep relative imports where already used in nearby files.

### IPC Pattern

- Before making IPC changes, use this file's Architecture and Boundaries and IPC Pattern sections as the first context anchor, then inspect `src/shared/ipc-types.ts` for the contract and `src/main/ipc/index.ts` for the registration exemplar.
- Define new channel names in IPC constant object in src/shared/ipc-types.ts.
- Register handlers in src/main/ipc/index.ts with ipcMain.handle.
- Use window.api.invoke in renderer hooks/components.
- For event subscriptions, use window.api.on and return the cleanup function from the surrounding effect.
- Keep payload/response typing aligned with shared interfaces.

### Database and Settings Pattern

- SQLite access is synchronous through better-sqlite3 in main process only.
- Open database once via openDatabase and read via getDb.
- Use prepared statements for queries and updates.
- Persist app settings using key/value JSON strings in settings table and parse/stringify at IPC boundary.
- Follow migration style in src/main/db/database.ts: schema version check and transactional migration execution.

### Renderer Composition Pattern

- Route composition is in App.tsx with React Router routes.
- Widget modules self-register through registerRendererModule from module files.
- Dashboard composition uses widget instance layout from useWidgetLayout hook.
- Drag and drop behavior uses DndContext + SortableContext + arrayMove pattern.
- Theme and updater status are coordinated through providers/effects and IPC events rather than direct renderer-side persistence.

### React Hook Pattern

- Data hooks generally return object shapes such as { data, loading }.
- Async loading typically uses useEffect with window.api.invoke(...).then(...).catch(console.error).
- IPC/event subscriptions typically use useEffect and return the cleanup function produced by window.api.on(...).
- Keep state local unless an existing context/provider already owns it.

### UI and Styling Pattern

- Tailwind utility classes with CSS variables are the primary styling approach.
- Reusable primitives in src/renderer/src/components/ui follow Radix + class-variance-authority + cn utility pattern.
- Theme handling uses data-theme plus CSS custom properties in src/renderer/src/assets/main.css.
- Initial theme hydration happens in preload to avoid a visible flash before React mounts.

### Error Handling and Logging

- Current pattern favors lightweight .catch(console.error) for renderer async operations.
- Main/source modules use console.log for lifecycle/status messages.
- Exceptions should be caught and logged at the point of occurrence; do not silently fail.
- For user-facing errors, ensure UI provides clear feedback about what went wrong.

### Documentation and Comments

- Documentation style is minimal-to-standard in code, with focused comments for non-obvious logic.
- Keep comments concise and practical; avoid restating obvious code.
- For complex migration/compatibility logic, brief multi-line JSDoc-style comments are acceptable and already used.

## Security and Platform Constraints

- Preserve BrowserWindow security defaults currently in use:
  - contextIsolation: true
  - nodeIntegration: false
  - sandbox: false (do not change unless requested)
- Keep external-link handling through shell.openExternal with deny return in setWindowOpenHandler.
- Respect renderer Content Security Policy pattern in src/renderer/index.html.

## Testing Reality and Guidance

Current state observed:

- Vitest is configured and used for focused unit-style tests.
- Current tests live under src/**/__tests__ and *.test.ts(x), with shared/main/renderer coverage already present.
- The current Vitest environment is node with shared setup in src/test/setup.ts.

Guidance:

- Do not invent a new project-wide testing framework in routine edits.
- When tests are requested or the touched logic is easy to isolate, prefer narrow Vitest coverage aligned with vitest.config.ts and the existing src/**/__tests__ pattern.
- Keep Electron/browser integration assumptions out of tests unless the task explicitly requires them.

## Versioning and Release Guidance

- Project version currently uses semantic-style number in package.json (currently 1.3.1). Re-check package.json instead of assuming an older example version when generating release steps.
- Follow existing script and packaging conventions in package.json for build/run operations.
- Windows release verification uses npm run verify:production:win.
- Release note generation uses npm run release:notes.
- GitHub publish configuration and packaged auto-update flow are already present; keep release guidance consistent with that workflow.

## Explicit Do and Do Not Rules

Do:

- Keep changes consistent with nearby file patterns.
- Reuse shared interfaces from src/shared/ipc-types.ts instead of ad hoc duplicate types.
- Keep renderer code declarative and hook-driven.
- Keep main process ownership of persistence and IPC registration.

Do Not:

- Introduce new architectural layers or frameworks without explicit request.
- Move business/data access logic into renderer components.
- Use language/framework features that exceed detected version compatibility.
- Break the established module boundaries (main/preload/renderer separation).

## Concrete Pattern References

Use these files as exemplars before generating new code:

- Main lifecycle and initialization flow: src/main/index.ts
- IPC registration and typed channel usage: src/main/ipc/index.ts
- Shared channel/type contracts: src/shared/ipc-types.ts
- Preload API bridge: src/preload/index.ts
- DB open/migration flow: src/main/db/database.ts
- Settings storage wrapper: src/main/settings/store.ts
- Auto-update state and Windows-only updater behavior: src/main/updates/service.ts
- Renderer route shell: src/renderer/src/App.tsx
- Dashboard DnD + widget instance orchestration: src/renderer/src/routes/Dashboard.tsx
- Renderer widget registration: src/renderer/src/modules/registry.ts
- Theme provider and runtime theme application: src/renderer/src/providers/ThemeProvider.tsx
- UI primitive variant pattern: src/renderer/src/components/ui/button.tsx

## Final Instruction for Copilot

When guidance is ambiguous, prioritize strict consistency with existing repository code and detected versions over external best practices, newer APIs, or generic scaffolding conventions.