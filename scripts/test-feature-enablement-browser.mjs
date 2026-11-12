import { createServer } from "vite";
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = await createServer({
  configFile: path.join(root, "vite.renderer-browser.config.mts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
let browser;
let context;
let page;
const pageErrors = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForWidgets(page, ids) {
  for (const id of ids) {
    await page.locator(`[data-widget-instance-id="${id}"]`).waitFor();
  }
}

async function assertVisibleLayoutHasNoGaps(page, expectedIds) {
  await page.waitForFunction((ids) => {
    const grid = document.querySelector(".dashboard-grid");
    if (!grid) return false;
    const gridTop = grid.getBoundingClientRect().top;
    const widgets = [...grid.querySelectorAll("[data-widget-instance-id]")]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.getAttribute("data-widget-instance-id"),
          top: rect.top,
          bottom: rect.bottom,
        };
      })
      .sort((left, right) => left.top - right.top);
    return (
      widgets.map(({ id }) => id).join(",") === ids.join(",") &&
      Math.abs(widgets[0].top - gridTop) <= 2 &&
      widgets.slice(1).every(
        (widget, index) =>
          Math.abs(widget.top - widgets[index].bottom - 16) <= 2,
      )
    );
  }, expectedIds);
  const measurements = await page.evaluate(() => {
    const grid = document.querySelector(".dashboard-grid");
    if (!grid) throw new Error("Dashboard grid is missing");
    return {
      gridTop: grid.getBoundingClientRect().top,
      widgets: [...grid.querySelectorAll("[data-widget-instance-id]")]
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            id: element.getAttribute("data-widget-instance-id"),
            top: rect.top,
            bottom: rect.bottom,
          };
        })
        .sort((left, right) => left.top - right.top),
    };
  });
  assert(
    measurements.widgets.map(({ id }) => id).join(",") ===
      expectedIds.join(","),
    `Unexpected rendered widget order: ${measurements.widgets.map(({ id }) => id).join(", ")}`,
  );
  assert(
    Math.abs(measurements.widgets[0].top - measurements.gridTop) <= 2,
    `First visible widget starts ${measurements.widgets[0].top - measurements.gridTop}px below the grid`,
  );
  for (let index = 1; index < measurements.widgets.length; index += 1) {
    const previous = measurements.widgets[index - 1];
    const current = measurements.widgets[index];
    const gap = current.top - previous.bottom;
    assert(
      Math.abs(gap - 16) <= 2,
      `${current.id} is separated from ${previous.id} by ${gap}px instead of the 16px grid gap`,
    );
  }
}

try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== "string", "Vite has no local address");
  browser = await chromium.launch({ headless: true });
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) =>
    pageErrors.push(error.stack ?? error.message),
  );
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.locator("[data-dashboard-tab-id]").first().waitFor();

  const delayedYouTubePage = await context.newPage();
  await delayedYouTubePage.addInitScript((scenario) => {
    sessionStorage.setItem(
      "__rendererBrowserScenario",
      JSON.stringify(scenario),
    );
  }, {
    settingsOverrides: { youtube_enabled: "false" },
    youtubeEnabledLoadDelayMs: 1000,
  });
  await delayedYouTubePage.goto(
    `http://127.0.0.1:${address.port}/youtube`,
  );
  await delayedYouTubePage
    .getByText("Loading YouTube settings...", { exact: true })
    .waitFor();
  assert(
    (await delayedYouTubePage.getByText("YouTube is disabled.", { exact: true }).count()) ===
      0,
    "YouTube displayed its disabled state before the feature setting loaded",
  );
  assert(
    (await delayedYouTubePage.getByRole("link", { name: "YouTube" }).count()) ===
      0,
    "Sidebar displayed YouTube before the feature setting loaded",
  );
  await delayedYouTubePage
    .getByText("YouTube is disabled.", { exact: true })
    .waitFor();
  assert(
    (await delayedYouTubePage.getByRole("link", { name: "YouTube" }).count()) ===
      0,
    "Sidebar displayed YouTube after its setting resolved disabled",
  );
  await delayedYouTubePage.close();

  const fixtures = await page.evaluate(
    () => window.__rendererBrowserFixtures,
  );
  const instances = fixtures.views.flatMap((view) =>
    view.layout.widget_order
      .map((id) => view.layout.widget_instances[id])
      .filter(Boolean),
  );
  const oneInstance = (moduleId) =>
    instances.find((instance) => instance.moduleId === moduleId);
  const sportsInstances = instances.filter(
    (instance) => instance.moduleId === "sports",
  );
  const weather = oneInstance("weather");
  const savedPosts = oneInstance("saved_posts");
  const youtube = oneInstance("youtube");
  const redditDigest = oneInstance("reddit_digest");
  assert(weather, "Weather fixture instance is unavailable");
  assert(savedPosts, "Saved Posts fixture instance is unavailable");
  assert(youtube, "YouTube fixture instance is unavailable");
  assert(redditDigest, "Reddit Digest fixture instance is unavailable");
  assert(
    sportsInstances.length >= 2,
    "Two Sports fixture instances are required",
  );

  const selected = [
    sportsInstances[0],
    weather,
    sportsInstances[1],
    savedPosts,
    youtube,
    redditDigest,
  ];
  assert(
    new Set(selected.map((instance) => instance.instanceId)).size ===
      selected.length,
    "Selected fixture widget IDs must be unique",
  );
  const widgetOrder = selected.map((instance) => instance.instanceId);
  const widgetInstances = Object.fromEntries(
    selected.map((instance) => [instance.instanceId, instance]),
  );
  const widgetVisibility = Object.fromEntries(
    widgetOrder.map((id) => [id, true]),
  );
  let nextY = 0;
  const widgetGeometry = Object.fromEntries(
    selected.map((instance) => {
      const height =
        instance.size === "small" ? 6 : instance.size === "medium" ? 9 : 12;
      const width = instance.size === "small" ? 6 : 12;
      const geometry = { x: 0, y: nextY, w: width, h: height };
      nextY += height;
      return [instance.instanceId, geometry];
    }),
  );
  const fixtureView = fixtures.views.find((view) =>
    view.layout.widget_order.includes(sportsInstances[0].instanceId),
  );
  assert(fixtureView, "Sports dashboard fixture view is unavailable");
  const scenarioView = {
    ...fixtureView,
    layout: {
      layout_version: fixtureView.layout.layout_version,
      widget_order: widgetOrder,
      widget_visibility: widgetVisibility,
      widget_instances: widgetInstances,
      widget_geometry: widgetGeometry,
    },
  };
  await page.evaluate((view) => {
    const scenario = JSON.parse(
      sessionStorage.getItem("__rendererBrowserScenario") ?? "{}",
    );
    scenario.dashboardViewsOverride = {
      view_order: [view.id],
      views: { [view.id]: view },
    };
    sessionStorage.setItem(
      "__rendererBrowserScenario",
      JSON.stringify(scenario),
    );
  }, scenarioView);
  await page.reload();
  await page.locator(`[data-dashboard-tab-id="${scenarioView.id}"]`).waitFor();
  await waitForWidgets(page, widgetOrder);

  const weatherLocator = page.locator(
    `[data-widget-instance-id="${weather.instanceId}"]`,
  );
  const originalWeatherHeight = await weatherLocator.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  const visibleBeforeDisable = [
    sportsInstances[0].instanceId,
    sportsInstances[1].instanceId,
    savedPosts.instanceId,
    youtube.instanceId,
    redditDigest.instanceId,
  ];

  await page.evaluate(async () => {
    await window.api.invoke("settings:set", "weather_enabled", "false");
    window.__rendererBrowserEmit("devTestData:updated");
  });
  await weatherLocator.waitFor({ state: "detached" });
  await assertVisibleLayoutHasNoGaps(page, visibleBeforeDisable);

  await page.getByRole("button", { name: "Edit Layout" }).click();
  await page
    .locator(`[data-widget-instance-id="${sportsInstances[0].instanceId}"]`)
    .getByRole("button", { name: "Move widget down" })
    .click();
  const visibleAfterMove = [
    sportsInstances[1].instanceId,
    sportsInstances[0].instanceId,
    savedPosts.instanceId,
    youtube.instanceId,
    redditDigest.instanceId,
  ];
  await page.waitForFunction(
    async ({ viewId, expectedOrder }) => {
      const state = await window.api.invoke("settings:getDashboardViews");
      return (
        state.views[viewId]?.layout?.widget_order?.join(",") ===
        expectedOrder.join(",")
      );
    },
    {
      viewId: scenarioView.id,
      expectedOrder: [
        sportsInstances[1].instanceId,
        weather.instanceId,
        sportsInstances[0].instanceId,
        savedPosts.instanceId,
        youtube.instanceId,
        redditDigest.instanceId,
      ],
    },
  );
  await assertVisibleLayoutHasNoGaps(page, visibleAfterMove);

  await page.evaluate(async () => {
    await window.api.invoke("settings:set", "weather_enabled", "true");
    window.__rendererBrowserEmit("devTestData:updated");
  });
  await weatherLocator.waitFor();
  const restoredViews = await page.evaluate(() =>
    window.api.invoke("settings:getDashboardViews"),
  );
  const restoredWeather =
    restoredViews.views[scenarioView.id].layout.widget_instances[
      weather.instanceId
    ];
  assert(
    restoredWeather?.instanceId === weather.instanceId,
    "Re-enabled Weather instance ID changed",
  );
  assert(
    restoredWeather?.size === weather.size,
    "Re-enabled Weather instance size changed",
  );
  const restoredWeatherHeight = await weatherLocator.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  assert(
    restoredWeatherHeight === originalWeatherHeight,
    "Re-enabled Weather widget geometry changed",
  );

  await page.getByRole("link", { name: "YouTube" }).click();
  await page.getByRole("heading", { name: "YouTube" }).waitFor();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("tab", { name: "YouTube" }).waitFor();
  await page.setViewportSize({ width: 640, height: 800 });
  await page.getByRole("link", { name: "Dashboard" }).click();
  await waitForWidgets(page, widgetOrder);

  const layoutBeforeFeatureDisable = await page.evaluate(async (viewId) => {
    const state = await window.api.invoke("settings:getDashboardViews");
    return JSON.stringify(state.views[viewId]?.layout);
  }, scenarioView.id);
  await page.getByRole("link", { name: "YouTube" }).click();
  await page.getByRole("heading", { name: "YouTube" }).waitFor();
  await page.evaluate(async () => {
    await window.api.invoke("settings:set", "youtube_enabled", "false");
    await window.api.invoke("settings:set", "reddit_digest_enabled", "false");
    window.__rendererBrowserEmit("devTestData:updated");
  });
  await page
    .locator(`[data-widget-instance-id="${youtube.instanceId}"]`)
    .waitFor({ state: "detached" });
  await page
    .locator(`[data-widget-instance-id="${redditDigest.instanceId}"]`)
    .waitFor({ state: "detached" });
  await page.getByRole("link", { name: "YouTube" }).waitFor({ state: "detached" });
  await page
    .getByRole("link", { name: "Reddit Digest" })
    .waitFor({ state: "detached" });

  await page.getByText("YouTube is disabled.", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Dashboard" }).click();
  await page
    .locator(`[data-widget-instance-id="${youtube.instanceId}"]`)
    .waitFor({ state: "detached" });
  await page
    .locator(`[data-widget-instance-id="${redditDigest.instanceId}"]`)
    .waitFor({ state: "detached" });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  assert(
    (await page.getByRole("tab", { name: "YouTube" }).count()) === 0,
    "Disabled YouTube Settings tab is still available",
  );

  await page.getByRole("link", { name: "Dashboard" }).click();
  await page.getByRole("button", { name: "Edit Layout" }).click();
  await page.getByRole("button", { name: "Dashboard actions" }).click();
  await page.getByRole("button", { name: "Add Widget" }).click();
  await page.getByRole("heading", { name: "Add Widget" }).waitFor();
  assert(
    (await page.getByText(
      "Recent videos and live streams from your subscribed channels.",
      { exact: true },
    ).count()) === 0,
    "Add Widget still lists YouTube while disabled",
  );
  assert(
    (await page.getByText(
      "Top posts from your subreddits, with per-instance filters.",
      { exact: true },
    ).count()) === 0,
    "Add Widget still lists Reddit Digest while disabled",
  );
  await page
    .getByText(
      "Current conditions plus forecast detail for your saved locations.",
      { exact: true },
    )
    .click();
  await page.getByRole("combobox", { name: "Widget position" }).click();
  const positionTargets = await page.getByRole("option").allTextContents();
  assert(
    !positionTargets.some(
      (label) => label.includes("YouTube") || label.includes("Reddit Digest"),
    ),
    `Disabled feature widgets are still position targets: ${positionTargets.join(", ")}`,
  );
  assert(
    positionTargets.includes(
      `After "${weather.label ?? "Weather"}"`,
    ),
    "An enabled feature widget is missing from the position targets",
  );
  await page.keyboard.press("Escape");
  const layoutAfterFeatureDisable = await page.evaluate(async (viewId) => {
    const state = await window.api.invoke("settings:getDashboardViews");
    return JSON.stringify(state.views[viewId]?.layout);
  }, scenarioView.id);
  assert(
    layoutAfterFeatureDisable === layoutBeforeFeatureDisable,
    "Disabling features changed stored widget instances or layout",
  );

  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    const scenario = JSON.parse(
      sessionStorage.getItem("__rendererBrowserScenario") ?? "{}",
    );
    scenario.settingsOverrides = {
      ...scenario.settingsOverrides,
      youtube_enabled: "false",
    };
    sessionStorage.setItem(
      "__rendererBrowserScenario",
      JSON.stringify(scenario),
    );
  });
  await page.goto(
    `http://127.0.0.1:${address.port}/settings?tab=youtube`,
  );
  const featuresTab = page.getByRole("tab", { name: "Features" });
  await featuresTab.waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent === "Features",
  );
  assert(
    (await page.getByRole("tab", { name: "YouTube" }).count()) === 0,
    "A disabled feature tab did not fall back to Features",
  );

  await page.evaluate(() => {
    sessionStorage.setItem(
      "__rendererBrowserScenario",
      JSON.stringify({ unseenFeatureIds: ["youtube"] }),
    );
  });
  await page.goto(
    `http://127.0.0.1:${address.port}/settings?tab=features`,
  );
  await page.getByRole("tab", { name: "Features" }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent === "Features",
  );

  const featureSwitchNames = await page
    .getByRole("switch")
    .evaluateAll((switches) =>
      switches.map((control) => control.getAttribute("aria-label")),
    );
  assert(
    featureSwitchNames.join(",") ===
      "Enable YouTube,Enable Reddit Digest,Enable Saved Posts,Enable Sports,Enable Weather,Enable Astronomy",
    `Features tab should have exactly the six manifest switches, got ${featureSwitchNames.join(", ")}`,
  );
  assert(
    (await page.getByRole("switch", { name: "Enable Scripts" }).count()) === 0,
    "Scripts must not appear as a feature switch",
  );
  const youtubeRow = page.locator('[data-feature-id="youtube"]');
  const savedPostsRow = page.locator('[data-feature-id="saved_posts"]');
  assert(
    (await youtubeRow.getByText("New", { exact: true }).count()) === 1,
    "Unseen YouTube should show a New badge",
  );
  assert(
    (await youtubeRow.getByText("Needs setup", { exact: true }).count()) === 1 &&
      (await savedPostsRow.getByText("Needs setup", { exact: true }).count()) ===
        1,
    "Enabled YouTube and Saved Posts should show Needs setup",
  );
  assert(
    (await page.getByText("Needs setup", { exact: true }).count()) === 2,
    "Only enabled YouTube and Saved Posts should show Needs setup",
  );
  assert(
    await page.evaluate(() =>
      window.__rendererBrowserCalls.some(
        (call) =>
          call.kind === "invoke" &&
          call.channel === "settings:getOnboardingState",
      ),
    ),
    "Features tab should load unseen IDs from onboarding state",
  );
  assert(
    (await youtubeRow.getByRole("link", { name: "Open settings" }).count()) ===
      1,
    "Enabled YouTube should show its Open settings link",
  );
  await youtubeRow.getByRole("switch", { name: "Enable YouTube" }).click();
  await youtubeRow.getByText("Needs setup", { exact: true }).waitFor({
    state: "detached",
  });
  await youtubeRow.getByRole("link", { name: "Open settings" }).waitFor({
    state: "detached",
  });
  await youtubeRow.getByRole("switch", { name: "Enable YouTube" }).click();
  await youtubeRow.getByText("Needs setup", { exact: true }).waitFor();
  await youtubeRow.getByRole("link", { name: "Open settings" }).waitFor();

  await savedPostsRow
    .getByRole("switch", { name: "Enable Saved Posts" })
    .click();
  await savedPostsRow.getByText("Needs setup", { exact: true }).waitFor({
    state: "detached",
  });
  await savedPostsRow.getByRole("link", { name: "Open settings" }).waitFor({
    state: "detached",
  });
  await savedPostsRow
    .getByRole("switch", { name: "Enable Saved Posts" })
    .click();
  await savedPostsRow.getByText("Needs setup", { exact: true }).waitFor();

  assert(
    (await page.evaluate(() =>
      window.__rendererBrowserCalls.filter(
        (call) =>
          call.kind === "invoke" &&
          call.channel === "settings:markFeaturesSeen",
      ),
    )).length === 0,
    "Features must not mark IDs as seen before leaving the tab",
  );
  await page.getByRole("tab", { name: "General" }).click();
  await page.waitForFunction(() =>
    window.__rendererBrowserCalls.some(
      (call) =>
        call.kind === "invoke" &&
        call.channel === "settings:markFeaturesSeen" &&
        call.args[0]?.join(",") === "youtube",
    ),
  );
  const seenCalls = await page.evaluate(() =>
    window.__rendererBrowserCalls.filter(
      (call) =>
        call.kind === "invoke" &&
        call.channel === "settings:markFeaturesSeen",
    ),
  );
  assert(
    seenCalls.length === 1 && seenCalls[0].args[0].join(",") === "youtube",
    "Leaving Features should mark only the displayed New features as seen",
  );

  await page.goto(
    `http://127.0.0.1:${address.port}/settings?tab=app-behavior`,
  );
  await page.waitForFunction(
    () =>
      document.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent === "General",
  );
  await page.getByText("Developer Test Data", { exact: true }).waitFor();

  await page.goto(
    `http://127.0.0.1:${address.port}/settings?tab=features`,
  );
  await page.getByRole("tab", { name: "Features" }).waitFor();
  await page
    .locator('[data-feature-id="sports"]')
    .getByRole("switch", { name: "Enable Sports" })
    .click();
  await page.getByRole("tab", { name: "Sports" }).waitFor({ state: "detached" });
  await page.getByRole("link", { name: "Sports", exact: true }).waitFor({
    state: "detached",
  });
  await page.evaluate(() => {
    const scenario = JSON.parse(
      sessionStorage.getItem("__rendererBrowserScenario") ?? "{}",
    );
    scenario.settingsOverrides = { sports_enabled: "false" };
    sessionStorage.setItem(
      "__rendererBrowserScenario",
      JSON.stringify(scenario),
    );
  });
  await page.goto(`http://127.0.0.1:${address.port}/settings?tab=sports`);
  await page.getByRole("tab", { name: "Features" }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent === "Features",
  );

  const apiErrors = await page.evaluate(() => [
    ...window.__rendererBrowserApiErrors,
  ]);
  assert(pageErrors.length === 0, `Page errors: ${pageErrors.join("; ")}`);
  assert(apiErrors.length === 0, `Browser API errors: ${apiErrors.join("; ")}`);
  console.log("PASS hidden widget layout and manifest-driven feature gating");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await context?.close();
  await browser?.close();
  await server.close();
}
