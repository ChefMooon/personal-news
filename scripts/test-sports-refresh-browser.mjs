import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const server = await createServer({
  configFile: path.resolve("vite.renderer-browser.config.mts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1488, height: 1800 },
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page
    .locator('[data-dashboard-tab-id="pn_dev_fixture_dashboard_sports"]')
    .click();
  await page.locator("[data-live-score]").first().waitFor();
  const count = await page.locator("[data-live-score]").count();
  console.log(
    "score nodes by size",
    await page
      .locator(`[data-widget-instance-id^="pn_dev_fixture_widget_sports_"]`)
      .evaluateAll((elements) =>
        elements.map((e) => [
          e.dataset.widgetInstanceId,
          e.querySelectorAll("[data-live-score]").length,
        ]),
      ),
  );
  if (count < 2) throw Error(`Expected live scores, got ${count}`);
  await page.evaluate(() => {
    const invoke = window.api.invoke.bind(window.api);
    window.scoreOffset = 0;
    window.scoreAnimations = 0;
    window.holdSports = false;
    window.heldSports = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.hasAttribute("data-live-score")) {
        window.scoreAnimations++;
        this.__scoreAnimations = (this.__scoreAnimations ?? 0) + 1;
      }
      return animate.apply(this, args);
    };
    const change = (event, offset) => ({
      ...event,
      homeScore: String(Number(event.homeScore ?? 0) + offset),
      awayScore: String(Number(event.awayScore ?? 0) + offset),
    });
    window.api.invoke = async (channel, ...args) => {
      const offset = window.scoreOffset;
      const result = await invoke(channel, ...args);
      if (channel === "sports:getTodayEvents" && window.holdSports)
        await new Promise((resolve) => window.heldSports.push(resolve));
      if (channel === "sports:getTodayEvents")
        return result.map((event) => change(event, offset));
      if (channel === "sports:getTeamEvents")
        return {
          ...result,
          last: result.last.map((event) => change(event, offset)),
          next: result.next.map((event) => change(event, offset)),
        };
      return result;
    };
    window.refreshScores = () => {
      for (const sport of [
        "Basketball",
        "Ice Hockey",
        "Soccer",
        "Baseball",
        "Football",
      ])
        window.__rendererBrowserEmit("sports:dataUpdated", { sport, ok: true });
    };
  });
  const sportsWidgets = page.locator(
    `[data-widget-instance-id^="pn_dev_fixture_widget_sports_"]`,
  );
  for (const widget of await sportsWidgets.all())
    if (
      (await widget
        .getByRole("button", { name: "Refresh sports data", exact: true })
        .count()) !== 1
    )
      throw Error("Refresh control is not unique");
  const gameButton = sportsWidgets
    .first()
    .getByRole("button", { name: /^Show / })
    .first();
  await gameButton.click();
  if ((await gameButton.getAttribute("aria-pressed")) !== "true")
    throw Error("Game selection failed");
  await page.evaluate(() => window.refreshScores());
  await page.waitForTimeout(300);
  if (!(await gameButton.evaluate((node) => document.activeElement === node)))
    throw Error("Focus was lost during refresh");
  if ((await gameButton.getAttribute("aria-pressed")) !== "true")
    throw Error("Selection was lost during refresh");
  const baseline = await page.evaluate(() => window.scoreAnimations);
  await page.evaluate(() => window.refreshScores());
  await page.waitForTimeout(300);
  if ((await page.evaluate(() => window.scoreAnimations)) !== baseline)
    throw Error("Unchanged scores animated");
  const initialScores = await page
    .locator("[data-live-score]")
    .allTextContents();
  await page.evaluate(() =>
    document
      .querySelectorAll("[data-live-score]")
      .forEach((node) => (node.__scoreAnimations = 0)),
  );
  await page.evaluate(() => {
    window.scoreOffset = 1;
    window.refreshScores();
  });
  await page.waitForFunction((n) => window.scoreAnimations > n, baseline);
  await page.waitForTimeout(300);
  const changedScores = await page
    .locator("[data-live-score]")
    .allTextContents();
  if (changedScores.some((value, i) => value === initialScores[i]))
    throw Error("A score did not change");
  if (
    !(await page
      .locator("[data-live-score]")
      .evaluateAll((nodes) =>
        nodes.every((node) => node.__scoreAnimations > 0),
      ))
  )
    throw Error("A score did not animate");
  const firstAnimations = await page
    .locator("[data-live-score]")
    .evaluateAll((nodes) => nodes.map((node) => node.__scoreAnimations));
  await page.evaluate(() => {
    window.scoreOffset = 2;
    window.refreshScores();
  });
  await page.waitForTimeout(300);
  const updated = await page.evaluate(() => window.scoreAnimations);
  const twiceScores = await page.locator("[data-live-score]").allTextContents();
  if (
    twiceScores.some(
      (value, i) => Number(value) !== Number(initialScores[i]) + 2,
    )
  )
    throw Error("Repeated update did not display latest scores");
  if (
    !(await page
      .locator("[data-live-score]")
      .evaluateAll(
        (nodes, counts) =>
          nodes.every((node, i) => node.__scoreAnimations > counts[i]),
        firstAnimations,
      ))
  )
    throw Error("Repeated update did not animate every score");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.scoreOffset = 3;
    window.refreshScores();
  });
  await page.waitForTimeout(300);
  if ((await page.evaluate(() => window.scoreAnimations)) !== updated)
    throw Error("Reduced motion still animated");
  const reducedScores = await page
    .locator("[data-live-score]")
    .allTextContents();
  if (
    reducedScores.some(
      (value, i) => Number(value) !== Number(initialScores[i]) + 3,
    )
  )
    throw Error("Reduced motion update did not display latest scores");
  await page.evaluate(() => {
    window.scoreOffset = 4;
    window.holdSports = true;
    for (const sport of [
      "Basketball",
      "Ice Hockey",
      "Soccer",
      "Baseball",
      "Football",
    ])
      window.__rendererBrowserEmit("sports:dataUpdated", {
        sport,
        ok: false,
        error: "Old fixture failure",
      });
  });
  await page.waitForFunction(() => window.heldSports.length > 0);
  await page.evaluate(() => {
    window.scoreOffset = 5;
    window.holdSports = false;
    window.refreshScores();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() =>
    window.heldSports.splice(0).forEach((resolve) => resolve()),
  );
  await page.waitForTimeout(300);
  if (
    await page
      .getByText("Sports data update failed: Old fixture failure")
      .count()
  )
    throw Error("Stale failure replaced newer success");
  const overlapScores = await page
    .locator("[data-live-score]")
    .allTextContents();
  if (
    overlapScores.some(
      (value, i) => Number(value) !== Number(initialScores[i]) + 5,
    )
  )
    throw Error("Older response replaced latest scores");
  await page.evaluate(() => {
    for (const sport of [
      "Basketball",
      "Ice Hockey",
      "Soccer",
      "Baseball",
      "Football",
    ])
      window.__rendererBrowserEmit("sports:dataUpdated", {
        sport,
        ok: false,
        error: "Current fixture failure",
      });
  });
  await page.waitForTimeout(300);
  if (
    (await page
      .getByRole("alert")
      .filter({ hasText: "Current fixture failure" })
      .count()) !== 3
  )
    throw Error("Current failure alert missing");
  await page.evaluate(() => window.refreshScores());
  await page.waitForTimeout(300);
  if (
    await page
      .getByRole("alert")
      .filter({ hasText: "Current fixture failure" })
      .count()
  )
    throw Error("Successful refresh did not clear alert");
  await page.evaluate(() => {
    window.__rendererBrowserEmit("sports:dataUpdated", {
      sport: "Basketball",
      ok: false,
      error: "Basketball failed",
    });
    window.__rendererBrowserEmit("sports:dataUpdated", {
      sport: "Ice Hockey",
      ok: true,
    });
  });
  await page.waitForTimeout(300);
  if (
    (await page
      .getByRole("alert")
      .filter({ hasText: "Basketball failed" })
      .count()) !== 3
  )
    throw Error("Unrelated sport success cleared failure");
  await page.evaluate(() =>
    window.__rendererBrowserEmit("sports:dataUpdated", {
      sport: "Basketball",
      ok: true,
    }),
  );
  await page.waitForTimeout(300);
  if (
    await page
      .getByRole("alert")
      .filter({ hasText: "Basketball failed" })
      .count()
  )
    throw Error("Same sport success failed to clear failure");
  await page.evaluate(() => {
    window.__rendererBrowserEmit("sports:dataUpdated", {
      sport: "Basketball",
      ok: false,
      error: "Basketball failed again",
    });
    window.__rendererBrowserEmit("sports:dataUpdated", {
      sport: "Ice Hockey",
      ok: false,
      error: "Hockey failed",
    });
    window.__rendererBrowserEmit("sports:dataUpdated", {
      sport: "Basketball",
      ok: true,
    });
  });
  await page.waitForTimeout(300);
  if (
    (await page
      .getByRole("alert")
      .filter({ hasText: "Hockey failed" })
      .count()) !== 3
  )
    throw Error("Other sport failure was lost");
  await page.evaluate(() =>
    window.__rendererBrowserEmit("sports:dataUpdated", {
      sport: "Ice Hockey",
      ok: true,
    }),
  );
  await page.waitForTimeout(300);
  if (
    await page.getByRole("alert").filter({ hasText: "Hockey failed" }).count()
  )
    throw Error("Hockey recovery did not clear failure");
  console.log(
    `PASS: ${count} score nodes, changed and repeated refresh, reduced motion`,
  );
} finally {
  await browser?.close();
  await server.close();
}
