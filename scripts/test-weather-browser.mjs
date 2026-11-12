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
          hourly: Array.from(
            { length: window.weatherTest.count ?? 24 },
            (_, index) => ({
              ...snapshot.hourly[index % snapshot.hourly.length],
              time: snapshot.hourly[0].time + (index + (window.weatherTest.timeShift ?? 0)) * 3600,
              temperature:
                index === 2 && window.weatherTest.nullPoint
                  ? null
                  : (snapshot.hourly[index % snapshot.hourly.length]
                      .temperature ?? 0) +
                    (window.weatherTest.offset ?? 0) * (index % 3),
            }),
          ),
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
  await small
    .getByRole("button", { name: "Weather widget settings", exact: true })
    .click();
  await small.getByRole("combobox").first().click();
  const locationListbox = page.getByRole("listbox");
  await locationListbox.waitFor();
  await page.keyboard.press("Escape");
  await locationListbox.waitFor({ state: "hidden" });
  assert(
    await small
      .getByRole("button", { name: "Close settings", exact: true })
      .isVisible(),
    "Weather editor closed when dismissing the displayed location select",
  );
  await page.keyboard.press("Escape");
  await small
    .getByRole("button", { name: "Weather widget settings", exact: true })
    .waitFor();

  await small
    .getByRole("button", { name: "Weather widget settings", exact: true })
    .click();
  await small.getByRole("button", { name: "Restore default settings" }).click();
  const restoreDialog = page.getByRole("alertdialog");
  await restoreDialog.waitFor();
  await page.keyboard.press("Escape");
  await restoreDialog.waitFor({ state: "hidden" });
  assert(
    await small
      .getByRole("button", { name: "Close settings", exact: true })
      .isVisible(),
    "Weather editor closed when dismissing the restore defaults dialog",
  );
  await page.keyboard.press("Escape");
  await small
    .getByRole("button", { name: "Weather widget settings", exact: true })
    .waitFor();

  await small
    .getByRole("button", { name: "Weather widget settings", exact: true })
    .click();
  await small.locator("#weather-location-search").focus();
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
  const refreshTimeline = medium.getByRole("region", {
    name: "Hourly forecast timeline",
  });
  await refreshTimeline.waitFor();
  await refreshTimeline.evaluate((element) => {
    element.scrollLeft = 100;
  });
  const scrollBefore = await refreshTimeline.evaluate(
    (element) => element.scrollLeft,
  );
  const refreshChart = medium.getByRole("img", {
    name: "Hourly temperature trend",
  });
  const oldPath = await refreshChart
    .locator('path[fill="none"]')
    .first()
    .getAttribute("d");
  await page.evaluate(() => {
    window.weatherTest.offset = 12;
    window.weatherTest.nullPoint = true;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await page.waitForFunction((old) => {
    const widget = document.querySelector(
      '[data-widget-instance-id="pn_dev_fixture_widget_weather_medium"]',
    );
    return (
      widget
        ?.querySelector('svg[role="img"] path[fill="none"]')
        ?.getAttribute("d") !== old &&
      !!widget.querySelector("[data-weather-outgoing-chart]")
    );
  }, oldPath);
  assert(
    (await refreshTimeline.evaluate((element) => element.scrollLeft)) ===
      scrollBefore,
    "Refresh changed timeline scroll position",
  );
  assert(
    (await medium
      .getByRole("img", { name: "Hourly temperature trend" })
      .count()) === 1,
    "Outgoing chart exposed duplicate accessible content",
  );
  // Freeze a real fade halfway through, then interrupt it with the same hours.
  // The old paths and their rendered opacities must survive the interruption.
  const beforeInterrupt = await medium.evaluate((widget) => {
    const timeline = widget.querySelector('[aria-label="Hourly forecast timeline"]');
    for (const animation of timeline.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 160;
    }
    return [...timeline.querySelectorAll('svg[role="img"], [data-weather-outgoing-chart] svg')].map((svg) => ({
      paths: [...svg.querySelectorAll('path')].map((path) => path.getAttribute('d')),
      axis: [...svg.querySelectorAll('text')].map((text) => text.textContent),
      grid: svg.querySelectorAll('line').length,
      firstLine: svg.querySelector('path[fill="none"]')?.getAttribute('d'),
      opacity: Number(getComputedStyle(svg.parentElement).opacity),
    }));
  });
  assert(beforeInterrupt.length === 2 && beforeInterrupt.every((layer) => layer.opacity > 0 && layer.opacity < 1),
    "Expected two visible layers halfway through the fade");
  await page.evaluate(() => {
    window.weatherTest.offset = 16;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await page.waitForFunction(() =>
    document.querySelectorAll('[data-widget-instance-id="pn_dev_fixture_widget_weather_medium"] [data-weather-outgoing-chart]').length === 2,
  );
  const afterInterrupt = await medium.evaluate((widget) => {
    const timeline = widget.querySelector('[aria-label="Hourly forecast timeline"]');
    for (const animation of timeline.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 0;
    }
    return [...timeline.querySelectorAll('svg[role="img"], [data-weather-outgoing-chart] svg')].map((svg) => ({
      paths: [...svg.querySelectorAll('path')].map((path) => path.getAttribute('d')),
      axis: [...svg.querySelectorAll('text')].map((text) => text.textContent),
      grid: svg.querySelectorAll('line').length,
      firstLine: svg.querySelector('path[fill="none"]')?.getAttribute('d'),
      opacity: Number(getComputedStyle(svg.parentElement).opacity),
    }));
  });
  assert(afterInterrupt[0].opacity === 0, "Latest chart did not start transparent");
  assert(beforeInterrupt.every((layer, index) =>
    JSON.stringify(layer.paths) === JSON.stringify(afterInterrupt[index + 1].paths) &&
    JSON.stringify(layer.axis) === JSON.stringify(afterInterrupt[index + 1].axis) &&
    layer.grid > 0 && layer.grid === afterInterrupt[index + 1].grid &&
    Math.abs(layer.opacity - afterInterrupt[index + 1].opacity) < 0.01),
    "Interrupted fade changed the visible composite: " + JSON.stringify({ beforeInterrupt, afterInterrupt }));
  const latestValues = await medium.evaluate((widget) => {
    const timeline = widget.querySelector('[aria-label="Hourly forecast timeline"]');
    const values = [...timeline.firstElementChild.children]
      .map((cell) => parseFloat(cell.querySelectorAll('span')[1].textContent))
      .filter(Number.isFinite);
    const axis = [...timeline.querySelector('svg[role="img"]').querySelectorAll('text')]
      .map((item) => parseFloat(item.textContent));
    return { min: Math.min(...values), max: Math.max(...values), axis };
  });
  assert(latestValues.axis[0] === latestValues.min && latestValues.axis.at(-1) === latestValues.max,
    "Interrupted fade did not expose the latest chart values: " + JSON.stringify(latestValues));
  await medium.evaluate((widget) =>
    widget.querySelector('[aria-label="Hourly forecast timeline"]').getAnimations({ subtree: true }).forEach((animation) => animation.finish()),
  );
  await medium.locator("[data-weather-outgoing-chart]").first().waitFor({ state: "detached" });
  assert((await refreshChart.locator('path[fill="none"]').first().getAttribute("d")) === afterInterrupt[0].firstLine,
    "The latest forecast did not remain after the interrupted fade");
  // Repeated interrupted fades are bounded, with an immediate latest-data
  // fallback once the maximum number of layers is reached.
  for (const offset of [17, 18, 19, 20]) {
    const previousPath = await refreshChart.locator('path[fill="none"]').first().getAttribute("d");
    await page.evaluate((value) => {
      window.weatherTest.offset = value;
      window.weatherTest.listeners.forEach((fn) => fn({}));
    }, offset);
    await page.waitForFunction((previous) =>
      document.querySelector('[data-widget-instance-id="pn_dev_fixture_widget_weather_medium"] svg[role="img"] path[fill="none"]')?.getAttribute("d") !== previous,
      previousPath,
    );
    const count = await medium.locator('[data-weather-outgoing-chart]').count();
    assert(count <= 3, `Too many outgoing chart layers: ${count}`);
    await medium.evaluate((widget) =>
      widget.querySelector('[aria-label="Hourly forecast timeline"]').getAnimations({ subtree: true }).forEach((animation) => {
        animation.pause();
        animation.currentTime = 160;
      }),
    );
  }
  assert((await medium.locator('[data-weather-outgoing-chart]').count()) === 0,
    'Layer limit did not fall back to the latest chart');
  await page.evaluate(() => {
    window.weatherTest.offset = 18;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await medium.locator("[data-weather-outgoing-chart]").first().waitFor();
  await medium.evaluate((widget) =>
    widget.querySelector('[aria-label="Hourly forecast timeline"]').getAnimations({ subtree: true }).forEach((animation) => animation.pause()),
  );
  const previousTimelineText = await refreshTimeline.textContent();
  await page.evaluate(() => {
    window.weatherTest.offset = 20;
    window.weatherTest.count = 8;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await page.waitForFunction((previous) =>
    document.querySelector('[data-widget-instance-id="pn_dev_fixture_widget_weather_medium"] [aria-label="Hourly forecast timeline"]')?.textContent !== previous,
    previousTimelineText,
  );
  const currentChart = await medium.evaluate((widget) => {
    const timeline = widget.querySelector('[aria-label="Hourly forecast timeline"]');
    const cells = [...timeline.firstElementChild.children];
    const svg = timeline.querySelector('svg[role="img"]');
    const axis = [...svg.querySelectorAll('text')].map((item) => item.textContent);
    const values = cells.map((cell) => cell.querySelectorAll('span')[1].textContent).filter((value) => value !== '-');
    const numbers = values.map((value) => parseFloat(value));
    const firstPoint = svg.querySelector('path[fill="none"]').getAttribute('d').match(/^M ([\d.]+)/);
    const svgRect = svg.getBoundingClientRect();
    const firstCell = cells[0].getBoundingClientRect();
    return {
      axis,
      min: Math.min(...numbers),
      max: Math.max(...numbers),
      pointX: svgRect.left + Number(firstPoint[1]) / svg.viewBox.baseVal.width * svgRect.width,
      cellX: firstCell.left + firstCell.width / 2,
    };
  });
  assert(Math.abs(currentChart.pointX - currentChart.cellX) < 2, "Chart point no longer aligns with its hourly cell: " + JSON.stringify(currentChart));
  assert(parseFloat(currentChart.axis[0]) === currentChart.min && parseFloat(currentChart.axis.at(-1)) === currentChart.max,
    "Accessible chart axis does not reflect the latest hourly values: " + JSON.stringify(currentChart));
  assert((await medium.locator("[data-weather-outgoing-chart]").count()) === 0,
    "Incompatible point count retained a stale outgoing chart");
  const queuedPath = await refreshChart.locator('path[fill="none"]').first().getAttribute("d");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.weatherTest.offset = 21;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    window.weatherTest.offset = 20;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await page.waitForTimeout(100);
  assert(
    (await refreshChart.locator('path[fill="none"]').first().getAttribute("d")) === queuedPath,
    "Reduced motion did not display the latest forecast data",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  assert(
    (await refreshTimeline.locator('[aria-current="time"]').count()) === 1,
    "Changed point count lost the current hour",
  );
  assert(
    (await refreshTimeline.evaluate(
      (element) => element.firstElementChild.children.length,
    )) === 8,
    "Changed point count did not update the timeline",
  );
  assert(
    (await medium.locator("[data-weather-outgoing-chart]").count()) === 0,
    "Outgoing chart did not finish after rapid refresh",
  );
  await page.evaluate(() =>
    window.weatherTest.listeners.forEach((fn) => fn({})),
  );
  await page.waitForTimeout(100);
  assert(
    (await medium.locator("[data-weather-outgoing-chart]").count()) === 0,
    "Unchanged refresh animated",
  );
  await page.evaluate(() => {
    window.weatherTest.offset = 22;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await medium.locator("[data-weather-outgoing-chart]").waitFor();
  await medium.evaluate((widget) =>
    widget.querySelector('[aria-label="Hourly forecast timeline"]').getAnimations({ subtree: true }).forEach((animation) => animation.pause()),
  );
  const labelsBeforeShift = await refreshTimeline.textContent();
  await page.evaluate(() => {
    window.weatherTest.timeShift = 1;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await page.waitForFunction((previous) =>
    document.querySelector('[data-widget-instance-id="pn_dev_fixture_widget_weather_medium"] [aria-label="Hourly forecast timeline"]')?.textContent !== previous,
    labelsBeforeShift,
  );
  assert((await medium.locator("[data-weather-outgoing-chart]").count()) === 0,
    "Changed timestamps retained a stale outgoing chart");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => {
    window.weatherTest.offset = 30;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
  await page.waitForTimeout(100);
  assert(
    (await medium.locator("[data-weather-outgoing-chart]").count()) === 0,
    "Reduced motion refresh animated",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    window.weatherTest.count = 24;
    window.weatherTest.listeners.forEach((fn) => fn({}));
  });
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
