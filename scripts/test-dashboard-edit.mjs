import assert from "node:assert/strict";
import path from "node:path";
import { runElectronHarness } from "./electron-playwright-harness.mjs";

try {
  const result = await runElectronHarness({
    name: "dashboard-edit",
    async scenario({ page, record, artifacts }) {
      const actions = page.getByRole("button", {
        name: "Dashboard actions",
        exact: true,
      });
      const menu = page.getByRole("dialog", { name: "Dashboard actions" });
      const edit = page.getByRole("button", {
        name: "Edit Layout",
        exact: true,
      });
      const done = page.getByRole("button", {
        name: "Done editing layout",
        exact: true,
      });
      await edit.waitFor();
      await actions.click();
      const initialActions = await menu.getByRole("button").allTextContents();
      assert.equal(initialActions.length, 7);
      await page.keyboard.press("Escape");
      await edit.click();
      await done.waitFor();
      assert.equal(await edit.count(), 0);
      assert.equal((await done.textContent()).trim(), "");
      await actions.click();
      assert.deepEqual(
        await menu.getByRole("button").allTextContents(),
        initialActions,
      );
      await page.screenshot({ path: path.join(artifacts, "editing.png") });
      await menu.getByRole("button", { name: "Dashboard details" }).click();
      await page.getByLabel("Name", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await done.getAttribute("aria-pressed"), "true");
      await actions.click();
      await menu
        .getByRole("button", { name: "Add Widget", exact: true })
        .click();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await done.click();
      await edit.waitFor();
      assert.equal(
        await page.getByRole("status").filter({ hasText: "Editing" }).count(),
        0,
      );
      assert.equal(
        await page
          .getByRole("button", { name: "Drag widget", exact: true })
          .count(),
        0,
      );
      await actions.click();
      assert.deepEqual(
        await menu.getByRole("button").allTextContents(),
        initialActions,
      );
      await menu
        .getByRole("button", { name: "Add Widget", exact: true })
        .click();
      await page.getByRole("button", { name: "Close", exact: true }).click();
      assert.equal(await done.getAttribute("aria-pressed"), "true");
      await done.click();
      record(
        "edit-flow",
        "Stable actions, dashboard details, add-widget entry, and Done passed",
      );
    },
  });
  console.log(`Dashboard edit harness passed; artifacts: ${result.artifacts}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
