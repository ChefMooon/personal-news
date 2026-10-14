# Repository Guidance

This file contains the shared project instructions for coding agents. Check `package.json` and `package-lock.json` for current dependency versions; do not rely on version numbers copied into older notes.

Use Node.js 20 or later (24 also works) and npm 9 or later. See `docs/HOW-TO-RUN.md` for setup and native dependency instructions.

## Project Structure and Boundaries

Personal News is an Electron desktop application with four main layers:

- `src/main`: app lifecycle, SQLite access, settings, data sources, scheduled work, notifications, and IPC handlers.
- `src/preload`: the small `contextBridge` API exposed to the renderer.
- `src/shared`: IPC channel names and data contracts shared across processes.
- `src/renderer/src`: React routes, providers, hooks, dashboard widgets, and UI components.

Keep these boundaries intact. Renderer code must not access Node APIs, SQLite, or the filesystem directly. Route renderer-to-main communication through the preload API and typed IPC contracts in `src/shared/ipc-types.ts`.

## Implementation Patterns

- Follow nearby code and the installed versions in `package.json` and the lockfile. TypeScript must satisfy both `tsconfig.node.json` and `tsconfig.web.json`; use the configured aliases where established.
- Use ES module imports and type-only imports where the surrounding code does. Match the existing naming style: PascalCase for React components and interfaces, camelCase for functions and variables, and uppercase names for IPC channels. Follow the installed React typings rather than assuming newer APIs.
- For IPC work, inspect `src/shared/ipc-types.ts` and `src/main/ipc/index.ts`. Define channel and payload contracts in shared code, register handlers in the main process, and call them through `window.api.invoke` or `window.api.on` in the renderer. Event subscriptions should return their unsubscribe cleanup from the owning effect.
- Keep database access in `src/main`. SQLite uses `better-sqlite3`; follow the existing database open/migration flow and use prepared statements. Persist app settings through the settings store and serialize values at IPC boundaries.
- Renderer routes are composed in `src/renderer/src/App.tsx`; widget modules register through the existing module registry. Follow the dashboard layout and drag-and-drop patterns, and keep reusable UI consistent with `src/renderer/src/components/ui`.
- Keep React state local unless an existing context/provider owns it. Follow nearby hook patterns for loading and IPC subscriptions, including effect cleanup. Theme changes should use the existing provider and CSS variable system.
- Preserve the current BrowserWindow security settings, including `contextIsolation: true`, `nodeIntegration: false`, and the configured sandbox value. Keep external-link handling and do not weaken the renderer Content Security Policy.
- Follow existing error handling and logging patterns. Do not silently swallow failures; give user-facing errors clear feedback.
- Keep comments focused on non-obvious behavior. For migration or compatibility logic, document the reason and expected behavior.

Useful references include `src/main/index.ts`, `src/main/ipc/index.ts`, `src/shared/ipc-types.ts`, `src/preload/index.ts`, `src/main/db/database.ts`, `src/main/settings/store.ts`, `src/renderer/src/App.tsx`, `src/renderer/src/routes/Dashboard.tsx`, and `src/renderer/src/modules/registry.ts`.

## Test and Validation Commands

- `npm test` runs the Vitest suite using Electron's embedded Node runtime. Use it instead of invoking Vitest directly through standalone Node; this lets tests load the Electron-built `better-sqlite3` binary.
- `npm test -- <file-or-filter>` runs a focused unit-test selection. Prefer focused tests for localized logic and use the full suite for broader validation.
- Keep tests within the existing Vitest configuration and patterns; do not introduce a new project-wide test framework for routine changes. Keep Electron/browser behavior in integration scenarios when the change requires it.
- `npm run test:local-test-data` runs the complete isolated Electron fixture scenario: seed, all six fixture dashboard pages, and the Update, Reset, and Clear lifecycle checks.
- `npm run test:local-test-data -- --widget <moduleId>` runs a focused widget regression. Supported IDs are `youtube`, `reddit_digest`, `saved_posts`, `sports`, `weather`, and `astronomy`. It seeds the isolated profile and checks the selected page at all three sizes across the 12-, 8-, 4-, and 1-column projections; it skips the broader Update, Reset, and Clear lifecycle. The focused Sports run also checks the Basketball fixture interaction.
- `npm run test:dashboard-drag` and `npm run test:dashboard-edit` run the other interactive Electron scenarios.
- `npm run typecheck` checks both Node and web TypeScript projects. `npm run build` runs typechecking and the Electron Vite production build.
- Use a focused widget command during widget work and the full local-test-data command when validating fixture lifecycle or cross-widget integration.

Interactive harness scenarios should follow `scripts/PLAYWRIGHT-HARNESS.md`: use semantic Playwright locators for visible user actions, and use IPC only for deterministic setup or state observation when no suitable UI interaction exists. Do not access SQLite or Node APIs from the renderer.

Each harness run uses its own temporary profile and database. Logs and screenshots are stored under `artifacts/electron-harness/<scenario>-<uuid>/`. The runner removes the profile only after confirming the Electron process tree exited; if termination cannot be confirmed, it preserves the profile for diagnosis. Harness mode alone enables loopback CDP and suppresses automatic source polling and user-script startup. Do not add these settings to normal app launches.

Never use the live production database for tests or test writes. Harness scripts must use the profile and database provided by the runner. `PERSONAL_NEWS_DB_PATH` is an explicit database override; dev and harness reject paths that resolve to the protected production database.

## Profiles, Releases, and Worktrees

- Packaged production uses its existing Electron `userData` profile. `npm run dev` and `npm run start` share a persistent Development profile and its single-instance lock; they cannot run as separate instances at the same time.
- Use `docs/HOW-TO-RUN.md` for setup and packaging details and `docs/HOW-TO-RELEASE.md` for the release process. Run `npm run verify:production:win` for the documented Windows production smoke verification.
- Use `npm run release:notes` for changelog-based release note generation. Check the current `package.json` before writing version-specific release guidance.
- Never create a Git worktree unless the user asks for one or grants permission.
