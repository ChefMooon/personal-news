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
        if (moduleId === "weather" || moduleId === "astronomy") {
          const actionName = moduleId === "weather" ? "Astronomy" : "Details";
          const details = widget.getByRole("link", {
            name: actionName,
            exact: true,
          });
          if (moduleId === "astronomy" && size === "large") {
            assert(
              (await details.count()) === 0,
              "Astronomy Large must not add a Details action",
            );
          } else {
            await details.waitFor({ state: "visible", timeout: 10000 });
            const fullyReachable = await details.evaluate((element) => {
              const widget = element.closest("[data-widget-instance-id]");
              if (!widget) return false;
              const bounds = element.getBoundingClientRect();
              const widgetBounds = widget.getBoundingClientRect();
              if (
                bounds.width <= 0 ||
                bounds.height <= 0 ||
                bounds.left < widgetBounds.left ||
                bounds.right > widgetBounds.right ||
                bounds.top < widgetBounds.top ||
                bounds.bottom > widgetBounds.bottom
              ) {
                return false;
              }
              let parent = element.parentElement;
              while (parent && parent !== widget) {
                const parentBounds = parent.getBoundingClientRect();
                const style = getComputedStyle(parent);
                if (
                  style.overflowX !== "visible" &&
                  (bounds.left < parentBounds.left ||
                    bounds.right > parentBounds.right)
                ) {
                  return false;
                }
                if (
                  style.overflowY !== "visible" &&
                  (bounds.top < parentBounds.top ||
                    bounds.bottom > parentBounds.bottom)
                ) {
                  return false;
                }
                parent = parent.parentElement;
              }
              return true;
            });
            assert(
              fullyReachable,
              `${moduleId}/${size} Details action is clipped at ${projection.columns} columns`,
            );
            if (moduleId === "weather") {
              const inHeader = await details.evaluate((element) => {
                const widget = element.closest("[data-widget-instance-id]");
                if (!widget) return false;
                const settings = widget.querySelector(
                  '[aria-label="Weather widget settings"]',
                );
                if (!settings) return false;
                const bounds = element.getBoundingClientRect();
                const widgetBounds = widget.getBoundingClientRect();
                const settingsBounds = settings.getBoundingClientRect();
                return (
                  bounds.top < widgetBounds.top + 80 &&
                  widgetBounds.right - bounds.right < 64 &&
                  bounds.right <= settingsBounds.left
                );
              });
              assert(
                inHeader,
                `Weather/${size} Astronomy action is not immediately left of settings in the top-right header`,
              );
            }
          }
        }
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
      if (moduleId === "astronomy") {
        for (const size of ["small", "medium", "large"]) {
          const widget = page.locator(
            `[data-widget-instance-id="pn_dev_fixture_widget_astronomy_${size}"]`,
          );
          // Capture each full card even when the dashboard scroll viewport is
          // shorter than its contents, and catch clipped data inside the card.
          const overflow = await widget.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return [...element.querySelectorAll("p, td, li, button")].some(
              (item) => {
                const box = item.getBoundingClientRect();
                return (
                  box.right > bounds.right + 1 || box.bottom > bounds.bottom + 1
                );
              },
            );
          });
          assert(
            !overflow,
            `Astronomy/${size} clips content at ${projection.columns} columns`,
          );
          await widget.screenshot({
            path: path.join(
              artifactDir,
              `astronomy-${size}-${projection.columns}-columns.png`,
            ),
          });
        }
      }
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
    .getByRole("link", { name: "Details", exact: true })
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

  const astronomyScenarioKey = "__rendererBrowserScenario";
  const setAstronomyScenario = async (scenario, event = null, payload = {}) => {
    await page.evaluate(
      ({ key, value, eventName, eventPayload }) => {
        const previous = JSON.parse(sessionStorage.getItem(key) ?? "{}");
        sessionStorage.setItem(key, JSON.stringify({ ...previous, ...value }));
        if (eventName) window.__rendererBrowserEmit(eventName, eventPayload);
      },
      {
        key: astronomyScenarioKey,
        value: scenario,
        eventName: event,
        eventPayload: payload,
      },
    );
  };
  const openAstronomyDetails = async (route, scenario = {}) => {
    const routeLocationId = new URL(
      route,
      "http://renderer-browser.local",
    ).searchParams.get("locationId");
    await page.evaluate(
      ({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)),
      {
        key: astronomyScenarioKey,
        value: {
          astronomyWidgetLocationId:
            scenario.astronomyWidgetLocationId ?? routeLocationId,
          ...scenario,
        },
      },
    );
    await page.setViewportSize({ width: 1600, height: 1400 });
    await page.goto(new URL("/", page.url()).toString(), {
      waitUntil: "networkidle",
    });
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page
      .locator('[data-dashboard-tab-id="pn_dev_fixture_dashboard_astronomy"]')
      .click();
    const widget = page.locator(
      '[data-widget-instance-id="pn_dev_fixture_widget_astronomy_medium"]',
    );
    const detailsButton = widget.getByRole("link", {
      name: "Details",
      exact: true,
    });
    await detailsButton.waitFor({ state: "visible", timeout: 10000 });
    await detailsButton.click();
    await page.getByText("Astronomy details", { exact: true }).waitFor({
      state: "visible",
      timeout: 10000,
    });
  };
  const easternId = "pn_dev_fixture_weather_location_east";
  const easternSnapshot = fixtureManifest.astronomyDetailsSnapshots[easternId];
  const easternDetailsPath = `/astronomy/details?locationId=${encodeURIComponent(easternId)}`;
  await openAstronomyDetails(easternDetailsPath, { timeFormat: "24h" });
  let astronomyDetailsText = await page.locator("body").innerText();
  for (const expected of [
    "Fixture Atoll",
    "Pacific/Kiritimati",
    "Target time",
    "Calculated at",
    "Fresh snapshot",
    "complete",
    "Moon: Fresh",
    "Horizon: Fresh",
    "Planets: Fresh",
    "Global events: Fresh",
    "Synodic progress",
    "Libration latitude",
    "Next perigee",
    "Next apogee",
    "Daylight",
    "Heliocentric distance",
    "Geocentric distance",
    "Ecliptic longitude",
    "Ecliptic latitude",
    "Past synthetic equinox",
    "Season",
    "Lunar eclipse",
    "Solar eclipse",
    "Transit",
    "global and do not indicate local visibility",
    "not live observations",
  ]) {
    assert(
      astronomyDetailsText.includes(expected),
      `Astronomy details is missing ${JSON.stringify(expected)}: ${astronomyDetailsText.slice(0, 500)}`,
    );
  }
  for (const planet of easternSnapshot.groups.planets.data) {
    assert(
      (await page
        .locator(`[aria-label="${planet.body} observing information"]`)
        .count()) === 1,
      `Astronomy details omitted supplied planet ${planet.body}`,
    );
  }
  for (const event of easternSnapshot.groups.events.data) {
    assert(
      astronomyDetailsText.includes(event.label),
      `Astronomy details omitted returned global event ${event.label}`,
    );
  }
  const expectedEasternRiseTimes = await page.evaluate(
    ({ timestamp, timezone }) =>
      [timestamp - 30, timestamp, timestamp + 30].map((candidate) =>
        new Intl.DateTimeFormat([], {
          timeZone: timezone,
          hour: "numeric",
          minute: "2-digit",
          hour12: false,
        }).format(new Date(candidate * 1000)),
      ),
    {
      timestamp: easternSnapshot.groups.horizon.data.sun.riseTime,
      timezone: "Pacific/Kiritimati",
    },
  );
  assert(
    expectedEasternRiseTimes.some((expected) =>
      astronomyDetailsText.includes(expected),
    ),
    `24-hour rise time did not use the selected location timezone (${expectedEasternRiseTimes.join(", ")})`,
  );
  for (const width of [1240, 1040, 840, 620]) {
    await page.setViewportSize({ width, height: 1200 });
    await page.waitForTimeout(40);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      page: document.documentElement.scrollWidth,
      mainViewport: document.querySelector("main")?.clientWidth ?? 0,
      mainContent: document.querySelector("main")?.scrollWidth ?? 0,
    }));
    assert(
      dimensions.page <= dimensions.viewport + 1 &&
        dimensions.mainContent <= dimensions.mainViewport + 1,
      `Astronomy details overflowed horizontally at ${width}px: ${JSON.stringify(dimensions)}`,
    );
    const screenshot = path.join(
      artifactDir,
      `astronomy-details-${width}px.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: true });
    routeMeasurements.push({
      path: easternDetailsPath,
      viewportWidth: width,
      horizontalOverflow: dimensions.page - dimensions.viewport,
      screenshot,
      evidence: ["Pacific/Kiritimati", "Global events"],
    });
  }

  await openAstronomyDetails(easternDetailsPath, { timeFormat: "12h" });
  const twelveHourText = await page.locator("body").innerText();
  const expectedEasternRiseTimes12h = await page.evaluate(
    ({ timestamp, timezone }) =>
      [timestamp - 30, timestamp, timestamp + 30].map((candidate) =>
        new Intl.DateTimeFormat([], {
          timeZone: timezone,
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(new Date(candidate * 1000)),
      ),
    {
      timestamp: easternSnapshot.groups.horizon.data.sun.riseTime,
      timezone: "Pacific/Kiritimati",
    },
  );
  assert(
    expectedEasternRiseTimes12h.some((expected) =>
      twelveHourText.includes(expected),
    ),
    `12-hour rise time did not use the selected location timezone (${expectedEasternRiseTimes12h.join(", ")})`,
  );

  await openAstronomyDetails("/astronomy/details", {
    defaultLocationId: easternId,
  });
  astronomyDetailsText = await page.locator("body").innerText();
  assert(
    astronomyDetailsText.includes("Fixture Atoll") &&
      astronomyDetailsText.includes("Pacific/Kiritimati"),
    "Astronomy details did not resolve the Weather default location without a query",
  );
  await openAstronomyDetails(
    "/astronomy/details?locationId=removed-or-invalid-location",
  );
  astronomyDetailsText = await page.locator("body").innerText();
  assert(
    astronomyDetailsText.includes("Fixture City") &&
      astronomyDetailsText.includes("America/New_York"),
    "Astronomy details did not fall back from an invalid query to the Weather default",
  );

  await setAstronomyScenario(
    { weatherLocations: [], defaultLocationId: null },
    "weather:updated",
  );
  await page
    .getByText("No saved Weather location is available.", { exact: true })
    .waitFor({ state: "visible", timeout: 10000 });

  await openAstronomyDetails("/astronomy/details", {
    astronomySnapshot: null,
  });
  await page
    .getByText("No cached astronomy data is available for this location yet.", {
      exact: true,
    })
    .waitFor({ state: "visible", timeout: 10000 });

  await openAstronomyDetails(easternDetailsPath, {
    astronomySnapshotDelayMs: 1200,
  });
  await page.getByText("Loading astronomy...", { exact: true }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page
    .getByText("Past synthetic equinox", { exact: true })
    .waitFor({ state: "visible", timeout: 10000 });

  const partialSnapshot = structuredClone(
    fixtureManifest.astronomyDetailsSnapshots[
      "pn_dev_fixture_weather_location"
    ],
  );
  partialSnapshot.stale = true;
  partialSnapshot.status = "partial";
  partialSnapshot.groups.moon.status = "stale";
  partialSnapshot.groups.moon.data.librationLatitude = null;
  partialSnapshot.groups.horizon.status = "unavailable";
  partialSnapshot.groups.horizon.data = null;
  partialSnapshot.groups.planets.data = [
    {
      ...partialSnapshot.groups.planets.data.find(
        (planet) => planet.body === "Jupiter",
      ),
      illuminationPercent: null,
      phaseAngle: null,
      heliocentricDistanceAu: null,
      geocentricDistanceAu: null,
      eclipticLongitude: null,
      eclipticLatitude: null,
    },
  ];
  partialSnapshot.groups.events.status = "unavailable";
  partialSnapshot.groups.events.data = [];
  await openAstronomyDetails("/astronomy/details", {
    astronomySnapshot: partialSnapshot,
  });
  astronomyDetailsText = await page.locator("body").innerText();
  for (const expected of [
    "Stale snapshot",
    "partial",
    "Moon: Stale",
    "Horizon: Unavailable",
    "Planets: Fresh",
    "Global events: Unavailable",
    "MOON DETAILS",
    "Potentially visible",
    "Global event data is unavailable.",
    "Unavailable",
  ]) {
    assert(
      astronomyDetailsText.includes(expected),
      `Astronomy partial snapshot lost expected state ${JSON.stringify(expected)}: ${astronomyDetailsText.slice(0, 500)}`,
    );
  }
  assert(
    !astronomyDetailsText.includes("Fixture Atoll"),
    "Partial fixture should exercise the default selected location",
  );

  const emptySnapshot = structuredClone(partialSnapshot);
  emptySnapshot.stale = false;
  emptySnapshot.groups.moon.status = "fresh";
  emptySnapshot.groups.planets.data = [];
  emptySnapshot.groups.events.status = "fresh";
  emptySnapshot.groups.events.data = [];
  await openAstronomyDetails("/astronomy/details", {
    astronomySnapshot: emptySnapshot,
  });
  astronomyDetailsText = await page.locator("body").innerText();
  assert(
    astronomyDetailsText.includes("No planets were returned.") &&
      astronomyDetailsText.includes("No global events were returned."),
    "Astronomy details did not distinguish empty groups from unavailable groups",
  );
  assert(
    astronomyDetailsText.includes("Unavailable"),
    "Astronomy details did not preserve null measurements as unavailable",
  );

  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "Sidebar", exact: true }).click();
  await page
    .getByRole("button", { name: "Move Astronomy up", exact: true })
    .click();
  await page.waitForFunction(
    () =>
      window
        .__rendererBrowserGetSidebarConfig()
        .itemOrder.indexOf("astronomy") <
      window.__rendererBrowserGetSidebarConfig().itemOrder.indexOf("scripts"),
  );
  const reorderedSidebarConfig = await page.evaluate(() =>
    window.__rendererBrowserGetSidebarConfig(),
  );
  assert(
    reorderedSidebarConfig.itemOrder.indexOf("astronomy") <
      reorderedSidebarConfig.itemOrder.indexOf("scripts"),
    "Settings did not persist the custom Astronomy sidebar order",
  );

  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("switch", { name: "Enable Astronomy" }).click();
  await page
    .getByRole("link", { name: "Astronomy", exact: true })
    .waitFor({ state: "detached" });
  await page.getByRole("tab", { name: "Sidebar", exact: true }).click();
  await page
    .getByText(
      "Feature disabled in General settings; will stay hidden until re-enabled",
      { exact: true },
    )
    .waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("switch", { name: "Enable Astronomy" }).click();
  await page
    .getByRole("link", { name: "Astronomy", exact: true })
    .waitFor({ state: "visible" });
  const visibleSidebarConfigAfterToggle = await page.evaluate(() =>
    window.__rendererBrowserGetSidebarConfig(),
  );
  assert(
    JSON.stringify(visibleSidebarConfigAfterToggle) ===
      JSON.stringify(reorderedSidebarConfig),
    "Disabling and re-enabling Astronomy changed saved sidebar preferences",
  );

  await page.getByRole("tab", { name: "Sidebar", exact: true }).click();
  await page.getByRole("switch", { name: "Show Astronomy in sidebar" }).click();
  await page.waitForFunction(() =>
    window
      .__rendererBrowserGetSidebarConfig()
      .hiddenItemIds.includes("astronomy"),
  );
  const hiddenAstronomyConfig = await page.evaluate(() =>
    window.__rendererBrowserGetSidebarConfig(),
  );
  await page.getByRole("tab", { name: "General", exact: true }).click();
  await page.getByRole("switch", { name: "Enable Astronomy" }).click();
  await page.getByRole("switch", { name: "Enable Astronomy" }).click();
  const hiddenConfigAfterToggle = await page.evaluate(() =>
    window.__rendererBrowserGetSidebarConfig(),
  );
  assert(
    JSON.stringify(hiddenConfigAfterToggle) ===
      JSON.stringify(hiddenAstronomyConfig),
    "Global Astronomy toggles erased the explicitly hidden sidebar preference",
  );
  await page
    .getByRole("link", { name: "Astronomy", exact: true })
    .waitFor({ state: "detached" });

  await page.getByRole("tab", { name: "Sidebar", exact: true }).click();
  await page.getByRole("switch", { name: "Show Astronomy in sidebar" }).click();
  await page
    .getByRole("link", { name: "Astronomy", exact: true })
    .waitFor({ state: "visible" });
  const restoredSidebarConfig = await page.evaluate(() =>
    window.__rendererBrowserGetSidebarConfig(),
  );
  assert(
    restoredSidebarConfig.itemOrder.join(",") ===
      reorderedSidebarConfig.itemOrder.join(",") &&
      !restoredSidebarConfig.hiddenItemIds.includes("astronomy"),
    "Restoring Astronomy visibility changed its saved sidebar position",
  );
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.locator("[data-dashboard-tab-id]").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Astronomy", exact: true })
    .click();
  await page.getByText("Astronomy details", { exact: true }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  astronomyDetailsText = await page.locator("body").innerText();
  assert(
    astronomyDetailsText.includes("Fixture City") &&
      astronomyDetailsText.includes("America/New_York"),
    "Astronomy sidebar navigation did not use the normal Weather default location",
  );

  await page.evaluate((key) => {
    const scenario = JSON.parse(sessionStorage.getItem(key) ?? "{}");
    sessionStorage.setItem(
      key,
      JSON.stringify({
        ...scenario,
        astronomyEnabled: true,
        astronomySettingsDelayMs: 250,
      }),
    );
  }, astronomyScenarioKey);
  const delayedEnabledPath = `/astronomy/details?locationId=${encodeURIComponent(easternId)}`;
  await page.goto(new URL(delayedEnabledPath, page.url()).toString(), {
    waitUntil: "networkidle",
  });
  await page.getByText("Astronomy details", { exact: true }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  assert(
    new URL(page.url()).pathname === "/astronomy/details" &&
      new URL(page.url()).search.includes(easternId),
    "Astronomy initialization redirected an enabled direct visit before loading its feature setting",
  );

  const setGlobalAstronomyEnabled = async (enabled) => {
    await page.evaluate(
      async ({ key, value }) => {
        const scenario = JSON.parse(sessionStorage.getItem(key) ?? "{}");
        sessionStorage.setItem(
          key,
          JSON.stringify({ ...scenario, astronomyEnabled: value }),
        );
        await window.api.invoke("astronomy:setSettings", { enabled: value });
        window.__rendererBrowserEmit("devTestData:updated");
      },
      { key: astronomyScenarioKey, value: enabled },
    );
  };
  await setGlobalAstronomyEnabled(false);
  await page.locator("[data-dashboard-tab-id]").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
  assert(
    (await page.getByText("Astronomy details", { exact: true }).count()) === 0,
    "Disabling Astronomy while viewing details retained the details page shell",
  );
  await page
    .getByRole("link", { name: "Astronomy", exact: true })
    .waitFor({ state: "detached" });

  const disabledDirectPath = `/astronomy/details?locationId=${encodeURIComponent(easternId)}`;
  await page.goto(new URL(disabledDirectPath, page.url()).toString(), {
    waitUntil: "networkidle",
  });
  await page.locator("[data-dashboard-tab-id]").first().waitFor({
    state: "visible",
    timeout: 10000,
  });
  assert(
    new URL(page.url()).pathname === "/astronomy/details" &&
      (await page.getByText("Astronomy details", { exact: true }).count()) ===
        0,
    "A location query bypassed the disabled Astronomy route guard",
  );
  await setGlobalAstronomyEnabled(true);
  await page
    .getByRole("link", { name: "Astronomy", exact: true })
    .waitFor({ state: "visible" });
  const configAfterDirectGuard = await page.evaluate(() =>
    window.__rendererBrowserGetSidebarConfig(),
  );
  assert(
    JSON.stringify(configAfterDirectGuard) ===
      JSON.stringify(restoredSidebarConfig),
    "Direct-route gating changed saved Astronomy sidebar preferences",
  );

  const defaultLocationId = "pn_dev_fixture_weather_location";
  const astronomyWidgetIds = {
    small: "pn_dev_fixture_widget_astronomy_small",
    medium: "pn_dev_fixture_widget_astronomy_medium",
    large: "pn_dev_fixture_widget_astronomy_large",
  };
  const weatherWidgetIds = {
    small: "pn_dev_fixture_widget_weather_small",
    medium: "pn_dev_fixture_widget_weather_medium",
    large: "pn_dev_fixture_widget_weather_large",
  };
  const openFixtureDashboard = async (moduleId, scenario = {}) => {
    await page.evaluate(
      ({ key, value }) => sessionStorage.setItem(key, JSON.stringify(value)),
      {
        key: astronomyScenarioKey,
        value: { astronomyEnabled: true, ...scenario },
      },
    );
    await page.goto(new URL("/", page.url()).toString(), {
      waitUntil: "networkidle",
    });
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page
      .locator(`[data-dashboard-tab-id="pn_dev_fixture_dashboard_${moduleId}"]`)
      .click();
  };
  const assertDetailsDestination = async (
    expectedLocationId,
    expectedContent,
  ) => {
    await page.getByText("Astronomy details", { exact: true }).waitFor({
      state: "visible",
      timeout: 10000,
    });
    await page.waitForFunction(
      (content) =>
        content.every((expected) => document.body.innerText.includes(expected)),
      expectedContent,
      { timeout: 10000 },
    );
    const text = await page.locator("body").innerText();
    for (const expected of expectedContent) {
      assert(
        text.includes(expected),
        `Details for ${expectedLocationId} omitted ${expected}: ${text.slice(0, 320)}`,
      );
    }
  };
  const checkWidgetDetails = async ({
    moduleId,
    size,
    expectedLocationId,
    expectedContent,
    scenario = {},
    keyboard = false,
  }) => {
    await openFixtureDashboard(moduleId, scenario);
    const widgetId =
      moduleId === "astronomy"
        ? astronomyWidgetIds[size]
        : weatherWidgetIds[size];
    const widget = page.locator(`[data-widget-instance-id="${widgetId}"]`);
    const actionName = moduleId === "weather" ? "Astronomy" : "Details";
    const action = widget.getByRole("link", {
      name: actionName,
      exact: true,
    });
    await action.waitFor({ state: "visible", timeout: 10000 });
    const actionHref = await action.getAttribute("href");
    const destination = new URL(actionHref, "http://renderer-browser.local");
    assert(
      destination.pathname === "/astronomy/details" &&
        destination.searchParams.get("locationId") === expectedLocationId,
      `${moduleId}/${size} Details link used ${destination.href}, expected location ${expectedLocationId}`,
    );
    await page.waitForFunction(
      ({ channel, locationId }) =>
        window.__rendererBrowserCalls.some(
          (call) => call.channel === channel && call.args[0] === locationId,
        ),
      {
        channel:
          moduleId === "astronomy"
            ? "astronomy:getSnapshot"
            : "weather:getSnapshot",
        locationId: expectedLocationId,
      },
    );
    if (keyboard) {
      await action.focus();
      await page.keyboard.press("Enter");
    } else {
      await action.click();
    }
    await assertDetailsDestination(expectedLocationId, expectedContent);
  };
  const easternAstronomyWidgetLocations = {
    [astronomyWidgetIds.small]: easternId,
    [astronomyWidgetIds.medium]: easternId,
  };
  const easternExpectedContent = [
    "Fixture Atoll",
    "Pacific/Kiritimati",
    "Mercury",
  ];
  const defaultExpectedContent = ["Fixture City", "America/New_York", "Venus"];
  await checkWidgetDetails({
    moduleId: "astronomy",
    size: "small",
    expectedLocationId: easternId,
    expectedContent: easternExpectedContent,
    scenario: {
      astronomyWidgetLocations: easternAstronomyWidgetLocations,
    },
  });
  await checkWidgetDetails({
    moduleId: "astronomy",
    size: "medium",
    expectedLocationId: easternId,
    expectedContent: easternExpectedContent,
    scenario: {
      astronomyWidgetLocations: easternAstronomyWidgetLocations,
    },
  });
  await checkWidgetDetails({
    moduleId: "weather",
    size: "small",
    expectedLocationId: easternId,
    expectedContent: easternExpectedContent,
  });
  await checkWidgetDetails({
    moduleId: "weather",
    size: "medium",
    expectedLocationId: defaultLocationId,
    expectedContent: defaultExpectedContent,
  });
  await checkWidgetDetails({
    moduleId: "weather",
    size: "large",
    expectedLocationId: easternId,
    expectedContent: easternExpectedContent,
  });
  await checkWidgetDetails({
    moduleId: "weather",
    size: "medium",
    expectedLocationId: defaultLocationId,
    expectedContent: defaultExpectedContent,
    keyboard: true,
  });

  await openFixtureDashboard("weather", {
    weatherWidgetConfigs: {
      [weatherWidgetIds.small]: {
        locationId: easternId,
        showAstronomy: false,
      },
    },
  });
  const gatedWeather = page.locator(
    `[data-widget-instance-id="${weatherWidgetIds.small}"]`,
  );
  assert(
    (await gatedWeather.getByRole("region", { name: "Astronomy" }).count()) ===
      0 &&
      (await gatedWeather
        .getByRole("link", {
          name: "Astronomy",
          exact: true,
        })
        .count()) === 0,
    "Weather showAstronomy=false did not hide that instance's section and action",
  );
  for (const size of ["medium", "large"]) {
    const weatherWidget = page.locator(
      `[data-widget-instance-id="${weatherWidgetIds[size]}"]`,
    );
    assert(
      (await weatherWidget.getByRole("region", { name: "Astronomy" }).count()) >
        0 &&
        (await weatherWidget
          .getByRole("link", {
            name: "Astronomy",
            exact: true,
          })
          .count()) === 1,
      `Weather ${size} lost its Astronomy section when another instance was disabled`,
    );
  }
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Astronomy", exact: true })
    .click();
  await page.getByText("Astronomy details", { exact: true }).waitFor({
    state: "visible",
    timeout: 10000,
  });
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page
    .locator('[data-dashboard-tab-id="pn_dev_fixture_dashboard_astronomy"]')
    .click();
  for (const size of ["small", "medium"]) {
    assert(
      (await page
        .locator(`[data-widget-instance-id="${astronomyWidgetIds[size]}"]`)
        .getByRole("link", { name: "Details", exact: true })
        .count()) === 1,
      `Weather instance setting incorrectly disabled Astronomy ${size} details`,
    );
  }
  const astronomyLargeWidget = page.locator(
    `[data-widget-instance-id="${astronomyWidgetIds.large}"]`,
  );
  assert(
    (await astronomyLargeWidget
      .getByRole("link", {
        name: "Details",
        exact: true,
      })
      .count()) === 0,
    "Astronomy Large must not add a Details action",
  );
  const easternLargeConfig = {
    astronomyWidgetLocations: {
      [astronomyWidgetIds.large]: easternId,
    },
    astronomyWidgetViewModes: {
      [astronomyWidgetIds.large]: "detailed",
    },
  };
  await openFixtureDashboard("astronomy", easternLargeConfig);
  const configuredLargeWidget = page.locator(
    `[data-widget-instance-id="${astronomyWidgetIds.large}"]`,
  );
  await page.waitForFunction(
    ({ locationId }) =>
      window.__rendererBrowserCalls.some(
        (call) =>
          call.channel === "astronomy:getSnapshot" &&
          call.args[0] === locationId,
      ),
    { locationId: easternId },
  );
  const largeAstronomyText = await configuredLargeWidget.innerText();
  const allEasternPlanetNames = easternSnapshot.groups.planets.data.map(
    (planet) => planet.body,
  );
  assert(
    allEasternPlanetNames.every((planet) =>
      largeAstronomyText.includes(planet),
    ) &&
      (await configuredLargeWidget
        .getByRole("link", {
          name: "Details",
          exact: true,
        })
        .count()) === 0,
    `Astronomy Large changed its uncapped content or gained a Details action: ${largeAstronomyText.slice(0, 320)}`,
  );

  await openFixtureDashboard("weather", {
    defaultLocationId: null,
    weatherWidgetConfigs: {
      [weatherWidgetIds.medium]: {
        locationId: null,
        showAstronomy: true,
      },
    },
  });
  const noLocationWeather = page.locator(
    `[data-widget-instance-id="${weatherWidgetIds.medium}"]`,
  );
  assert(
    (await noLocationWeather
      .getByRole("link", {
        name: "Astronomy",
        exact: true,
      })
      .count()) === 0,
    "Weather without an effective location exposed a Details action",
  );
  await openFixtureDashboard("weather", {
    weatherWidgetConfigs: {
      [weatherWidgetIds.medium]: {
        locationId: "removed-or-invalid-location",
        showAstronomy: true,
      },
    },
  });
  const invalidLocationWeather = page.locator(
    `[data-widget-instance-id="${weatherWidgetIds.medium}"]`,
  );
  assert(
    (await invalidLocationWeather
      .getByRole("link", {
        name: "Astronomy",
        exact: true,
      })
      .count()) === 0,
    "Weather with an unavailable configured location opened unrelated details",
  );

  await openFixtureDashboard("weather", { astronomyEnabled: false });
  assert(
    (await page
      .getByRole("link", { name: "Astronomy", exact: true })
      .count()) === 0,
    "Global Astronomy off left its sidebar entry visible",
  );
  for (const size of ["small", "medium", "large"]) {
    const weatherWidget = page.locator(
      `[data-widget-instance-id="${weatherWidgetIds[size]}"]`,
    );
    assert(
      (await weatherWidget
        .getByRole("region", { name: "Astronomy" })
        .count()) === 0 &&
        (await weatherWidget
          .getByRole("link", {
            name: "Astronomy",
            exact: true,
          })
          .count()) === 0,
      `Global Astronomy off left the Weather ${size} entry point visible`,
    );
  }
  await page
    .locator('[data-dashboard-tab-id="pn_dev_fixture_dashboard_astronomy"]')
    .click();
  for (const size of ["small", "medium", "large"]) {
    assert(
      (await page
        .locator(`[data-widget-instance-id="${astronomyWidgetIds[size]}"]`)
        .getByRole("link", { name: "Details", exact: true })
        .count()) === 0,
      `Global Astronomy off left the Astronomy ${size} entry point visible`,
    );
  }

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
