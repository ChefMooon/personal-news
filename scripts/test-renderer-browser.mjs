import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(
  root,
  "artifacts",
  "renderer-browser",
  new Date().toISOString().replaceAll(":", "-"),
);
const server = await createServer({
  configFile: path.join(root, "vite.renderer-browser.config.mts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
const projections = [
  { columns: 12, width: 1240 },
  { columns: 8, width: 1040 },
  { columns: 4, width: 840 },
  { columns: 1, width: 620 },
];
const blockingContent =
  /loading(?:\.\.\.)?|failed to load|no posts|no videos|no weather|no data|no events|is empty|something went wrong|astronomy unavailable|moon data unavailable/i;
const routePages = [
  { label: "YouTube", path: "/youtube", moduleId: "youtube" },
  {
    label: "Reddit Digest",
    path: "/reddit-digest",
    moduleId: "reddit_digest",
  },
  { label: "Saved Posts", path: "/saved-posts", moduleId: "saved_posts" },
  { label: "Sports", path: "/sports", moduleId: "sports" },
  {
    label: "Settings",
    path: "/settings",
    evidence: ["Developer Test Data", "Synthetic data active"],
  },
];
const settingsTabs = [
  { name: "General", evidence: "Developer Test Data" },
  { name: "Sidebar", evidence: "Sidebar layout" },
  { name: "Notifications", evidence: "Enable Desktop Notifications" },
  { name: "YouTube", evidence: "YouTube Data API v3 Key" },
  { name: "Sports", evidence: "Data & Refresh" },
  { name: "Weather", evidence: "Weather Sync" },
  { name: "Astronomy", evidence: "Astronomy Refresh" },
  { name: "Reddit Digest", evidence: "Week starts on" },
  { name: "Saved Posts", evidence: "Set Up Mobile Post Saving" },
  { name: "Appearance", evidence: "Custom Themes" },
  { name: "Scripts", evidence: "Script Home Directory" },
];
let browser;
let page;
const browserErrors = [];
const measurements = [];
const routeMeasurements = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(
    address && typeof address !== "string",
    "Vite did not provide a usable local address",
  );
  await mkdir(artifactDir, { recursive: true });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1400 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) =>
    browserErrors.push(error.stack ?? error.message),
  );
  page.on("console", (message) => {
    if (message.type() === "error")
      browserErrors.push(`console.error: ${message.text()}`);
  });
  await page.goto(`http://127.0.0.1:${address.port}/`, {
    waitUntil: "networkidle",
  });
  await page
    .locator("[data-dashboard-tab-id]")
    .first()
    .waitFor({ timeout: 15000 });
  const fixtureManifest = await page.evaluate(
    () => window.__rendererBrowserFixtures,
  );
  assert(
    fixtureManifest.views.length === 6,
    `Expected six fixture pages; got ${fixtureManifest.views.length}`,
  );

  for (const projection of projections) {
    for (const view of fixtureManifest.views) {
      const firstInstance =
        view.layout.widget_instances[view.layout.widget_order[0]];
      const moduleId = firstInstance.moduleId;
      const pageInstances = Object.values(view.layout.widget_instances);
      assert(
        pageInstances.length === 3 &&
          pageInstances.every((instance) => instance.moduleId === moduleId) &&
          ["small", "medium", "large"].every((size) =>
            pageInstances.some((instance) => instance.size === size),
          ),
        `${view.name} must contain exactly one feature widget in each size`,
      );
      await page.locator(`[data-dashboard-tab-id="${view.id}"]`).click();
      const grid = page.locator(".dashboard-grid");
      await grid.waitFor();
      const initialGridWidth = await grid.evaluate(
        (element) => element.getBoundingClientRect().width,
      );
      const currentViewport = page.viewportSize();
      await page.setViewportSize({
        width: Math.round(
          currentViewport.width + projection.width - initialGridWidth,
        ),
        height: 1500,
      });
      await page.waitForFunction((target) => {
        const element = document.querySelector(".dashboard-grid");
        return (
          element &&
          Math.abs(element.getBoundingClientRect().width - target) < 20
        );
      }, projection.width);

      const gridWidth = await grid.evaluate(
        (element) => element.getBoundingClientRect().width,
      );
      const actualColumns =
        gridWidth >= 1200
          ? 12
          : gridWidth >= 996
            ? 8
            : gridWidth >= 768
              ? 4
              : 1;
      assert(
        actualColumns === projection.columns,
        `${moduleId}: expected ${projection.columns} columns, got ${actualColumns} at ${gridWidth}px`,
      );
      await page.waitForFunction(() => {
        const element = document.querySelector(".dashboard-grid");
        const rect = element?.getBoundingClientRect();
        return (
          rect &&
          [...element.querySelectorAll("[data-widget-instance-id]")].every(
            (widget) => {
              const box = widget.getBoundingClientRect();
              return box.x >= rect.x - 2 && box.right <= rect.right + 2;
            },
          )
        );
      });

      for (const size of ["small", "medium", "large"]) {
        const instance = Object.values(view.layout.widget_instances).find(
          (candidate) =>
            candidate.moduleId === moduleId && candidate.size === size,
        );
        assert(instance, `${view.name} is missing the seeded ${size} instance`);
        const widgetId = instance.instanceId;
        const widget = page.locator(`[data-widget-instance-id="${widgetId}"]`);
        await widget.waitFor({ state: "visible", timeout: 10000 });
        const evidence = fixtureManifest.evidence[moduleId];
        await page.waitForFunction(
          ({ id, candidates }) => {
            const element = document.querySelector(
              `[data-widget-instance-id="${CSS.escape(id)}"]`,
            );
            const text = element?.textContent ?? "";
            return candidates.some((candidate) => text.includes(candidate));
          },
          { id: widgetId, candidates: evidence },
          { timeout: 10000 },
        );
        const content = await widget.innerText();
        assert(
          Array.isArray(evidence) &&
            evidence.some(
              (candidate) =>
                typeof candidate === "string" && content.includes(candidate),
            ),
          `${moduleId}/${size} is missing fixture content ${JSON.stringify(evidence)}: ${content.slice(0, 260)}`,
        );
        assert(
          !blockingContent.test(content),
          `${moduleId}/${size} rendered a loading/error/empty state: ${content.slice(0, 260)}`,
        );
      }

      const geometry = await grid.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const widgets = [
          ...element.querySelectorAll("[data-widget-instance-id]"),
        ].map((widget) => {
          const rect = widget.getBoundingClientRect();
          return {
            id: widget.dataset.widgetInstanceId,
            x: rect.x,
            right: rect.right,
            width: rect.width,
          };
        });
        return {
          x: bounds.x,
          right: bounds.right,
          width: bounds.width,
          widgets,
        };
      });
      for (const widget of geometry.widgets) {
        assert(
          widget.x >= geometry.x - 2 && widget.right <= geometry.right + 2,
          `${widget.id} escaped the dashboard at ${projection.columns} columns: ${JSON.stringify({ geometry, widget })}`,
        );
      }

      const gridHeight = await grid.evaluate(
        (element) => element.getBoundingClientRect().height,
      );
      await page.setViewportSize({
        width: page.viewportSize().width,
        height: Math.ceil(gridHeight + 240),
      });
      await page.waitForTimeout(80);
      const screenshot = path.join(
        artifactDir,
        `${view.id}-${projection.columns}-columns.png`,
      );
      await page.screenshot({ path: screenshot, fullPage: true });
      measurements.push({
        moduleId,
        columns: actualColumns,
        viewport: page.viewportSize(),
        geometry,
        screenshot,
      });
    }
  }

  // Dashboard fixture pages cover every widget and size. These focused route
  // checks also exercise standalone feature pages and their initial settings/IPC
  // calls, which are not mounted while the dashboard route is active.
  for (const route of routePages) {
    await page.getByRole("link", { name: route.label, exact: true }).click();
    const evidence = route.evidence ?? fixtureManifest.evidence[route.moduleId];
    await page.waitForFunction(
      (candidates) =>
        candidates.some((candidate) =>
          document.body.innerText.includes(candidate),
        ),
      evidence,
      { timeout: 10000 },
    );
    await page.waitForTimeout(100);
    const content = await page.locator("body").innerText();
    assert(
      !blockingContent.test(content),
      `${route.path} rendered a loading/error/empty state: ${content.slice(0, 300)}`,
    );
    const apiErrors = await page.evaluate(
      () => window.__rendererBrowserApiErrors,
    );
    assert(
      apiErrors.length === 0,
      `${route.path} reported unhandled browser shim APIs:\n${apiErrors.join("\n")}`,
    );
    // A first-run Saved Posts preview may open the real onboarding dialog. The
    // fixture route is valid behind it; dismiss it through the visible action
    // so the next sidebar navigation can be exercised normally.
    if (route.moduleId === "saved_posts") {
      const skipSetup = page.getByRole("button", {
        name: "Skip Setup",
        exact: true,
      });
      if (await skipSetup.isVisible()) await skipSetup.click();
    }
    const screenshot = path.join(
      artifactDir,
      `route-${route.moduleId ?? "settings"}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    routeMeasurements.push({ path: route.path, screenshot, evidence });
  }

  for (const settingsTab of settingsTabs) {
    await page
      .getByRole("tab", { name: settingsTab.name, exact: true })
      .click();
    const tabPanel = page.getByRole("tabpanel");
    await tabPanel.waitFor({ state: "visible", timeout: 10000 });
    await page.getByText(settingsTab.evidence, { exact: true }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    const content = await tabPanel.innerText();
    assert(
      !blockingContent.test(content),
      `Settings > ${settingsTab.name} rendered a loading/error/empty state: ${content.slice(0, 300)}`,
    );
    const apiErrors = await page.evaluate(
      () => window.__rendererBrowserApiErrors,
    );
    assert(
      apiErrors.length === 0,
      `Settings > ${settingsTab.name} reported unhandled browser shim APIs:\n${apiErrors.join("\n")}`,
    );
    const screenshot = path.join(
      artifactDir,
      `settings-${settingsTab.name.toLowerCase().replaceAll(" ", "-")}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    routeMeasurements.push({
      path: `/settings?tab=${settingsTab.name.toLowerCase().replaceAll(" ", "-")}`,
      screenshot,
      evidence: [settingsTab.evidence],
    });
  }

  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page
    .locator('[data-dashboard-tab-id="pn_dev_fixture_dashboard_astronomy"]')
    .click();
  const astronomyWidget = page.locator(
    '[data-widget-instance-id="pn_dev_fixture_widget_astronomy_medium"]',
  );
  await astronomyWidget
    .getByRole("button", { name: "Details", exact: true })
    .click();
  await page.getByText("Astronomy details", { exact: true }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  const astronomyDetails = await page.locator("body").innerText();
  const astronomyEvidence = fixtureManifest.evidence.astronomy;
  assert(
    astronomyEvidence.some((candidate) => astronomyDetails.includes(candidate)),
    `Astronomy details route is missing fixture content: ${astronomyDetails.slice(0, 300)}`,
  );
  assert(
    !blockingContent.test(astronomyDetails),
    `Astronomy details route rendered a loading/error/empty state: ${astronomyDetails.slice(0, 300)}`,
  );
  const astronomyApiErrors = await page.evaluate(
    () => window.__rendererBrowserApiErrors,
  );
  assert(
    astronomyApiErrors.length === 0,
    `Astronomy details route reported unhandled browser shim APIs:\n${astronomyApiErrors.join("\n")}`,
  );
  const astronomyScreenshot = path.join(
    artifactDir,
    "route-astronomy-details.png",
  );
  await page.screenshot({ path: astronomyScreenshot, fullPage: true });
  routeMeasurements.push({
    path: "/astronomy/details",
    screenshot: astronomyScreenshot,
    evidence: astronomyEvidence,
  });

  const apiErrors = await page.evaluate(
    () => window.__rendererBrowserApiErrors,
  );
  assert(
    apiErrors.length === 0,
    `Unhandled browser shim APIs:\n${apiErrors.join("\n")}`,
  );
  assert(
    browserErrors.length === 0,
    `Browser errors occurred:\n${browserErrors.join("\n")}`,
  );
  await writeFile(
    path.join(artifactDir, "diagnostics.json"),
    JSON.stringify(
      {
        scenario: "six-fixture-dashboards",
        projections,
        measurements,
        routeMeasurements,
        calls: await page.evaluate(() => window.__rendererBrowserCalls),
        apiErrors,
        browserErrors,
      },
      null,
      2,
    ),
  );
  console.log(
    `Renderer browser matrix passed (6 dashboards × 3 sizes × 4 projections). Artifacts: ${artifactDir}`,
  );
} catch (error) {
  await mkdir(artifactDir, { recursive: true });
  if (page)
    await page
      .screenshot({
        path: path.join(artifactDir, "failure.png"),
        fullPage: true,
      })
      .catch(() => {});
  const calls = page
    ? await page.evaluate(() => window.__rendererBrowserCalls).catch(() => [])
    : [];
  const apiErrors = page
    ? await page
        .evaluate(() => window.__rendererBrowserApiErrors)
        .catch(() => [])
    : [];
  await writeFile(
    path.join(artifactDir, "failure.txt"),
    `${error instanceof Error ? error.stack : String(error)}\n${browserErrors.join("\n")}`,
  );
  await writeFile(
    path.join(artifactDir, "diagnostics.json"),
    JSON.stringify({ measurements, calls, apiErrors, browserErrors }, null, 2),
  );
  console.error(`Renderer browser matrix failed. Diagnostics: ${artifactDir}`);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await server.close();
}
