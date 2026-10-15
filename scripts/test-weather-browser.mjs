import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";
const artifactDir = path.resolve(
  "artifacts/renderer-browser/weather-polish-" + Date.now(),
);
const server = await createServer({
  configFile: path.resolve("vite.renderer-browser.config.mts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
const assert = (ok, message) => {
  if (!ok) throw Error(message);
};
let browser;
const results = [];
const browserErrors = [];
try {
  await mkdir(artifactDir, { recursive: true });
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1488, height: 1800 },
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator("[data-dashboard-tab-id]").first().waitFor();
  await page.evaluate(() => {
    const invoke = window.api.invoke.bind(window.api),
      on = window.api.on.bind(window.api);
    window.weatherTest = { mode: "normal", listeners: [], pending: [] };
    window.api.invoke = (channel, ...args) => {
      if (channel === "weather:getSnapshot") {
        if (window.weatherTest.mode === "failure")
          return Promise.reject(
            Error("Weather service unavailable. Please try again."),
          );
        if (window.weatherTest.mode === "pending")
          return new Promise((resolve) =>
            window.weatherTest.pending.push(() =>
              invoke(channel, ...args).then(resolve),
            ),
          );
      }
      if (
        channel === "weather:refresh" &&
        window.weatherTest.mode === "manual-failure"
      )
        return Promise.resolve({
          ok: false,
          error: "Weather service unavailable. Please try again.",
        });
      if (
        channel === "weather:getSnapshot" &&
        window.weatherTest.longForecast
      ) {
        return invoke(channel, ...args).then((snapshot) => ({
          ...snapshot,
          // Test-only long timeline: repeat existing fixture values without changing
          // the shared fixture or app data. Distinct timestamps exercise all 24 slots.
          hourly: Array.from({ length: 24 }, (_, index) => ({
            ...snapshot.hourly[index % snapshot.hourly.length],
            time: snapshot.hourly[0].time + index * 3600,
          })),
        }));
      }
      return invoke(channel, ...args);
    };
    window.api.on = (channel, callback) => {
      if (channel === "weather:updated")
        window.weatherTest.listeners.push(callback);
      const cleanup = on(channel, callback);
      return () => {
        window.weatherTest.listeners = window.weatherTest.listeners.filter(
          (x) => x !== callback,
        );
        cleanup();
      };
    };
  });
  const weatherTab = page.locator(
    '[data-dashboard-tab-id="pn_dev_fixture_dashboard_weather"]',
  );
  await weatherTab.click();
  await page.getByLabel("Current weather", { exact: true }).first().waitFor();
  const widgets = page.locator(
    '[data-widget-instance-id^="pn_dev_fixture_widget_weather_"]',
  );
  async function check(state, columns, theme) {
    await page.waitForTimeout(150);
    const geometry = await widgets.evaluateAll((elements) =>
      elements.map((element) => {
        const viewport = element.querySelector(".weather-card-preview"),
          rect = viewport.getBoundingClientRect();
        const hourly = element.querySelector('[aria-label="Hourly forecast"]');
        const hourlyBottom = hourly?.getBoundingClientRect().bottom;
        const hourlyClipped =
          hourly &&
          [...hourly.querySelectorAll("span")].some(
            (e) => e.getBoundingClientRect().bottom > hourlyBottom + 1,
          );
        const chart = hourly?.querySelector('svg[role="img"]');
        const host = chart?.parentElement;
        return {
          id: element.dataset.widgetInstanceId,
          overflow: viewport.scrollHeight - viewport.clientHeight,
          bottom:
            Math.max(
              ...[...viewport.querySelectorAll("section")].map(
                (e) => e.getBoundingClientRect().bottom,
              ),
            ) - rect.bottom,
          chartWidth: chart?.getBoundingClientRect().width,
          hostWidth: host?.clientWidth,
          hourlyClipped,
          timelineOverflow: hourly
            ? Math.max(
                ...[...hourly.querySelectorAll(".weather-timeline-scroll")].map(
                  (e) => e.scrollHeight - e.clientHeight,
                ),
              )
            : 0,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
        };
      }),
    );
    for (const item of geometry) {
      assert(
        item.overflow <= 1 && item.bottom <= 1,
        `${state}/${columns}/${theme}: clipped content ${JSON.stringify(item)}`,
      );
      assert(
        !item.hourlyClipped,
        "Hourly values clipped " + JSON.stringify(item),
      );
      assert(
        item.timelineOverflow <= 1,
        "Unexpected vertical timeline scrolling " + JSON.stringify(item),
      );
      assert(item.pageOverflow <= 1, "Page horizontal overflow");
      if (item.chartWidth)
        assert(
          Math.abs(item.chartWidth - item.hostWidth) <= 1,
          "Chart does not fill hourly width " + JSON.stringify(item),
        );
    }
    await page.screenshot({
      path: path.join(
        artifactDir,
        `${theme}-${columns}-${page.viewportSize().width}-${state}.png`,
      ),
      fullPage: true,
    });
    results.push({ state, columns, theme, geometry });
  }
  for (const theme of ["light", "dark"])
    for (const [columns, width] of [
      [12, 1240],
      [8, 1040],
      [4, 840],
      [1, 620],
      [1, 680],
      [1, 710],
    ]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      const gridWidth = await page
        .locator(".dashboard-grid")
        .evaluate((e) => e.clientWidth);
      await page.setViewportSize({
        width: page.viewportSize().width + width - gridWidth,
        height: 1850,
      });
      await check("normal", columns, theme);
      // Existing cached values remain visible through a push-triggered refresh.
      await page.evaluate(() => {
        window.weatherTest.mode = "pending";
        window.weatherTest.listeners.forEach((fn) => fn({}));
      });
      await page
        .getByRole("status")
        .filter({ hasText: "Refreshing weather" })
        .first()
        .waitFor();
      assert(
        (await widgets
          .getByLabel("Current weather", { exact: true })
          .count()) === 3,
        "Refresh hid snapshot",
      );
      await check("refreshing", columns, theme);
      await page.evaluate(async () => {
        window.weatherTest.mode = "normal";
        await Promise.all(
          window.weatherTest.pending.splice(0).map((fn) => fn()),
        );
      });
      await page
        .getByRole("status")
        .filter({ hasText: "Refreshing weather" })
        .first()
        .waitFor({ state: "hidden" });
      await page.evaluate(() => {
        window.weatherTest.mode = "failure";
        window.weatherTest.listeners.forEach((fn) => fn({}));
      });
      await widgets
        .getByRole("alert")
        .filter({ hasText: "Refresh failed" })
        .first()
        .waitFor();
      assert(
        (await widgets
          .getByLabel("Current weather", { exact: true })
          .count()) === 3,
        "Failure hid snapshot",
      );
      await check("failure", columns, theme);
      await page.evaluate(() => {
        window.weatherTest.mode = "normal";
        window.weatherTest.listeners.forEach((fn) => fn({}));
      });
      await widgets
        .getByRole("alert")
        .filter({ hasText: "Refresh failed" })
        .first()
        .waitFor({ state: "hidden" });
      await page
        .locator('[data-dashboard-tab-id="pn_dev_fixture_dashboard_youtube"]')
        .click();
      await page.evaluate(() => (window.weatherTest.mode = "pending"));
      await weatherTab.click();
      await widgets
        .getByText("Loading weather...", { exact: true })
        .first()
        .waitFor();
      await check("initial-loading", columns, theme);
      await page.evaluate(async () => {
        window.weatherTest.mode = "normal";
        await Promise.all(
          window.weatherTest.pending.splice(0).map((fn) => fn()),
        );
      });
      await widgets
        .getByLabel("Current weather", { exact: true })
        .first()
        .waitFor();
    }
  // Failure before any usable snapshot remains distinguishable from empty data.
  const gridWidth = await page
    .locator(".dashboard-grid")
    .evaluate((e) => e.clientWidth);
  await page.setViewportSize({
    width: page.viewportSize().width + 620 - gridWidth,
    height: 1850,
  });
  await page
    .locator('[data-dashboard-tab-id="pn_dev_fixture_dashboard_youtube"]')
    .click();
  await page.evaluate(() => (window.weatherTest.mode = "failure"));
  await weatherTab.click();
  await widgets
    .getByRole("alert")
    .filter({ hasText: "Weather unavailable" })
    .first()
    .waitFor();
  await check("initial-failure", 1, "dark");
  await page.evaluate(() => {
    window.weatherTest.mode = "normal";
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await widgets
    .getByLabel("Current weather", { exact: true })
    .first()
    .waitFor();
  // Compact warning disclosure and local forecast navigation remain operable.
  const small = page.locator(
    '[data-widget-instance-id="pn_dev_fixture_widget_weather_small"]',
  );
  await small
    .getByRole("button", { name: "Show weather alert", exact: true })
    .click();
  await small.getByRole("dialog", { name: "Weather alerts" }).waitFor();
  await page.screenshot({
    path: path.join(artifactDir, "warning-disclosure.png"),
    fullPage: true,
  });
  await page.keyboard.press("Escape");
  const medium = page.locator(
    '[data-widget-instance-id="pn_dev_fixture_widget_weather_medium"]',
  );
  for (const name of ["Precipitation", "Wind", "Humidity", "Overview"]) {
    await medium.getByRole("button", { name, exact: true }).click();
    await medium
      .getByRole("img", {
        name: `Hourly ${name === "Overview" ? "temperature" : name.toLowerCase()} trend`,
      })
      .waitFor();
  }
  await small
    .getByRole("button", { name: "Weather widget settings", exact: true })
    .click();
  await small
    .getByRole("button", { name: "Close settings", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  await small
    .getByRole("button", { name: "Weather widget settings", exact: true })
    .waitFor();
  // Manual refresh failures stay in each widget after the toast has expired.
  await page.evaluate(() => (window.weatherTest.mode = "manual-failure"));
  for (const widget of await widgets.all()) {
    await widget
      .getByRole("button", { name: "Refresh weather data", exact: true })
      .click();
    await widget
      .getByRole("alert")
      .filter({ hasText: "Refresh failed" })
      .waitFor();
  }
  await page.waitForTimeout(5500);
  assert(
    (await widgets
      .getByRole("alert")
      .filter({ hasText: "Refresh failed" })
      .count()) === 3,
    "Manual failure disappeared with its toast",
  );
  await check("manual-failure", 1, "dark");
  // Exercise overflowing forecasts, including scroll controls and the true endpoint.
  await page
    .locator('[data-dashboard-tab-id="pn_dev_fixture_dashboard_youtube"]')
    .click();
  await page.evaluate(() => {
    window.weatherTest.mode = "normal";
    window.weatherTest.longForecast = true;
  });
  await weatherTab.click();
  for (const theme of ["light", "dark"]) {
    for (const [columns, width] of [
      [12, 1240],
      [8, 1040],
      [4, 840],
      [1, 620],
    ]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      const currentWidth = await page
        .locator(".dashboard-grid")
        .evaluate((e) => e.clientWidth);
      await page.setViewportSize({
        width: page.viewportSize().width + width - currentWidth,
        height: 1850,
      });
      for (const widget of await widgets.all()) {
        await widget
          .getByRole("region", {
            name: "Hourly forecast timeline",
            exact: true,
          })
          .evaluate((e) => (e.scrollLeft = 0));
      }
      await check("long-forecast-start", columns, theme);
      for (const widget of await widgets.all()) {
        const timeline = widget.getByRole("region", {
          name: "Hourly forecast timeline",
          exact: true,
        });
        const overflow = await timeline.evaluate(
          (e) => e.scrollWidth > e.clientWidth + 1,
        );
        const later = widget.getByRole("button", {
          name: "Show later hours",
          exact: true,
        });
        if (!overflow) {
          assert((await later.count()) === 0, "Unnecessary hourly navigation");
          continue;
        }
        await later.click();
        await page.waitForTimeout(400);
        assert(
          await timeline.evaluate((e) => e.scrollLeft > 0),
          "Later hours button did not scroll",
        );
        await widget
          .getByRole("button", { name: "Show earlier hours", exact: true })
          .waitFor();
        for (
          let remaining = 0;
          remaining < 8 && (await later.count());
          remaining++
        ) {
          await later.click();
          await page.waitForTimeout(400);
        }
        assert(
          (await later.count()) === 0,
          "Later hours button remains at forecast end",
        );
        assert(
          await timeline.evaluate((e) => {
            const last =
              e.firstElementChild.lastElementChild.getBoundingClientRect();
            return last.right <= e.getBoundingClientRect().right + 1;
          }),
          "Last hourly entry is clipped",
        );
        const earlier = widget.getByRole("button", {
          name: "Show earlier hours",
          exact: true,
        });
        await earlier.click();
        await page.waitForTimeout(400);
        await timeline.evaluate((e) => (e.scrollLeft = 0));
        await page.waitForTimeout(100);
        await timeline.focus();
        await page.keyboard.press("ArrowRight");
        await page.waitForTimeout(400);
        assert(
          await timeline.evaluate((e) => e.scrollLeft > 0),
          "Timeline cannot scroll with the keyboard",
        );
        await timeline.evaluate((e) => (e.scrollLeft = e.scrollWidth));
      }
      await check("long-forecast-end", columns, theme);
    }
  }
  assert(browserErrors.length === 0, browserErrors.join("\n"));
  await writeFile(
    path.join(artifactDir, "results.json"),
    JSON.stringify(results, null, 2),
  );
  console.log(
    `Passed ${results.length} Weather state/width/theme checks. Artifacts: ${artifactDir}`,
  );
} finally {
  await browser?.close();
  await server.close();
}
