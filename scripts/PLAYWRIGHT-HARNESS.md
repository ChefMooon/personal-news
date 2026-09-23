# Interactive Electron Playwright scenarios

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
