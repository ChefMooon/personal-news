# Interactive Electron Playwright scenarios

## Renderer-only browser workflows

For front-end-only changes, use one of two browser workflows. Start a persistent
localhost preview with:

```powershell
npm run dev:renderer-browser
```

The preview is available at [http://127.0.0.1:4175/](http://127.0.0.1:4175/).
The preview runs standalone Vite with existing synthetic fixtures and a mocked
`window.api`. It remains running for direct or agent-driven Playwright
interaction and supports HMR. Stop it with Ctrl+C. It does not launch Electron
or access a database, and it does not automatically open a browser. It uses the
same fixture content as Electron and provides six feature-specific dashboard
pages, each with Small, Medium, and Large fixture widget instances.

For an automated headless smoke check, run:

```powershell
npm run test:renderer-browser
```

This headless Playwright Chromium scenario verifies all six fixture-backed
dashboard pages at 12-, 8-, 4-, and 1-column projections. It also navigates the
standalone YouTube, Reddit Digest, Saved Posts, Sports, and Settings routes and
checks their initial fixture content and browser-shim calls. It visits every
Settings tab and opens Astronomy details through the fixture dashboard. It saves
screenshots and diagnostics. It uses standalone Vite, the same fixture content
as Electron, and a mocked `window.api`, without Electron or a database.

Treat this fixture matrix as the starting browser check: if a renderer-only
change falls outside its coverage, add or adapt a focused automated browser
scenario before considering the change validated. The live preview lets an agent
interact with the UI; it does not by itself provide automated coverage for
behavior outside the matrix.

Follow up with an Electron scenario when the changed behavior crosses an
integration boundary such as IPC, persistence, preload or security, or main
process behavior. Electron is also appropriate for materially broader or
complex changes whose interactions are not represented by the standalone
renderer scenario. The browser run does not validate those integration paths.

Run the existing dashboard drag scenario with:

```powershell
npm run test:dashboard-drag
```

The shared runner in `electron-playwright-harness.mjs` starts an unpackaged
Electron session with its own temporary user-data profile, database, and
loopback-only CDP endpoint. It captures renderer console/page errors, writes
run logs, and captures failure screenshots when a renderer page is available
under
`artifacts/electron-harness/<scenario>-<uuid>/`, outside the disposable
profile. On a normal run, it removes the temporary profile only after the
launched process tree exits. If it cannot confirm termination, it preserves
that profile and fails with its path in the diagnostics.

The runner enables CDP only for the explicit unpackaged harness launch and
binds it to `127.0.0.1`; it verifies the renderer's per-run ownership token
before attaching. Harness mode also suppresses automatic source polling and
user-script startup. Scenarios should not rely on production credentials or
uncontrolled network services.

## Fixture UI scenario

Run the developer test-data scenario with:

```powershell
npm run test:local-test-data
```

It opens Settings > General, checks the initial inactive state, and seeds
through the visible Seed test data action. It verifies Reddit Digest, Saved
Posts, Weather, Sports, YouTube, and Astronomy, then visits the six preset
dashboard pages with Small, Medium, and Large widget instances. It exercises
the visible Update, confirmed Reset, and confirmed Clear actions and checks
that unrelated dashboard state, configuration, and settings survive.
It also reproduces version 3 factory Sports settings, upgrades them through
the visible Update action, and selects Fixture Pilots at Fixture Foxes to verify
the Basketball LIVE 62/58 scores in all three sizes. A subsequent Update checks
that a later intentional Baseball selection survives the one-time upgrade.

The visual matrix covers the 12-, 8-, 4-, and 1-column grid projections.
Screenshots remain with the run diagnostics under
`artifacts/electron-harness/local-test-data-<uuid>/`; inspect these when changing
widget content, size policies, or preset definitions. The harness database is
isolated for the run; no persistent Development or production database is used.

For a focused widget regression, pass one fixture module ID:

```powershell
npm run test:local-test-data -- --widget weather
```

Supported IDs are `youtube`, `reddit_digest`, `saved_posts`, `sports`,
`weather`, and `astronomy`. Focused mode seeds the isolated profile through the
visible Settings action, then checks only that widget page at all three sizes
and the four responsive projections. It skips the broader Update, Reset, and
Clear lifecycle; Sports also runs its Basketball fixture interaction check.
With no `--widget` argument, the full scenario above remains the default. Use
`--help` to print the command and supported IDs.

Use semantic Playwright locators for user-visible navigation and actions, such
as buttons, links, headings, status text, and confirmation dialogs. Use IPC
only for deterministic setup or state observation that has no suitable visible
interaction, such as reading fixture-backed source results or checking the
persisted status. Do not use IPC as a substitute for exercising the user-facing
Seed or Clear flow, and do not access SQLite or Node APIs from the renderer.

The fixture active marker and seeded records belong to the selected database:
for harness scenarios that is the per-run temporary database, not the shared
Development profile. Use `addCleanup` for scenario state that must be restored
before Electron exits. After the scenario and cleanup callbacks, the runner
confirms the Electron process tree has exited before deleting the isolated
profile. If it cannot confirm termination, it fails and preserves that profile
for diagnosis; run logs and failure screenshots remain in
`artifacts/electron-harness/<scenario>-<uuid>/` outside the profile.

## Add a scenario

Create a Node ESM script under `scripts/` and call `runElectronHarness`. Use
semantic Playwright locators for interactions visible to users. Use IPC only
to seed deterministic scenario state or observe persisted state; do not access
the database or Node APIs from the renderer.

```js
import { runElectronHarness } from "./electron-playwright-harness.mjs";

await runElectronHarness({
  name: "settings-flow",
  scenario: async ({ page, addCleanup, record }) => {
    const originalState = await page.evaluate(() =>
      window.api.invoke("settings:getDashboardViews"),
    );
    addCleanup(() =>
      page.evaluate(
        (state) => window.api.invoke("settings:setDashboardViews", { state }),
        originalState,
      ),
    );

    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("heading", { name: /settings/i }).waitFor();
    record("settings", "Opened Settings using the visible navigation");
  },
});
```

The runner provides `page`, its `context`, isolated profile paths, an artifact
directory, `record(type, message)`, and `addCleanup(callback)`. Cleanup
callbacks run before Electron exits, which is useful for restoring temporary
fixture state.
