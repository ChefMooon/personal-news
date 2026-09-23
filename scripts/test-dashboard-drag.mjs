import { setTimeout as delay } from "node:timers/promises";
import { runElectronHarness } from "./electron-playwright-harness.mjs";

function createLayout(prefix, count) {
  const moduleIds = ["youtube", "reddit_digest", "saved_posts"];
  const widgetOrder = Array.from(
    { length: count },
    (_, index) => `${prefix}_${index + 1}`,
  );
  const widgetInstances = Object.fromEntries(
    widgetOrder.map((instanceId, index) => [
      instanceId,
      {
        instanceId,
        moduleId: moduleIds[index % moduleIds.length],
        label: null,
        size: "large",
      },
    ]),
  );
  const widgetVisibility = Object.fromEntries(
    widgetOrder.map((instanceId) => [instanceId, true]),
  );
  const widgetGeometry = Object.fromEntries(
    widgetOrder.map((instanceId, index) => [
      instanceId,
      { x: 0, y: index * 12, w: 12, h: 12 },
    ]),
  );

  return {
    layout_version: 2,
    widget_order: widgetOrder,
    widget_visibility: widgetVisibility,
    widget_instances: widgetInstances,
    widget_geometry: widgetGeometry,
  };
}

function createDashboardFixture() {
  const sourceId = "dashboard_harness_source";
  const targetId = "dashboard_harness_target";
  return {
    view_order: [sourceId, targetId],
    views: {
      [sourceId]: {
        id: sourceId,
        name: "Harness Source",
        icon: "layout",
        layout: createLayout("harness_source_widget", 8),
      },
      [targetId]: {
        id: targetId,
        name: "Harness Target",
        icon: "star",
        layout: createLayout("harness_target_widget", 4),
      },
    },
  };
}

async function seedDashboardFixture(page, addCleanup) {
  const originalState = await page.evaluate(() =>
    window.api.invoke("settings:getDashboardViews"),
  );
  addCleanup(async () => {
    await page.evaluate(
      async (state) =>
        window.api.invoke("settings:setDashboardViews", { state }),
      originalState,
    );
  });

  const fixture = createDashboardFixture();
  await page.evaluate(
    async (state) => window.api.invoke("settings:setDashboardViews", { state }),
    fixture,
  );
  const seededState = await page.evaluate(() =>
    window.api.invoke("settings:getDashboardViews"),
  );
  if (
    seededState.view_order.length < 2 ||
    seededState.views[seededState.view_order[0]]?.layout.widget_order.length <
      6 ||
    seededState.views[seededState.view_order[1]]?.layout.widget_order.length < 2
  ) {
    throw new Error(
      "Dashboard fixture setup did not persist two populated views",
    );
  }
  await page.reload();
  await page.locator("[data-dashboard-tab-id]").nth(1).waitFor({
    state: "visible",
    timeout: 10_000,
  });
}

async function runDashboardDragScenario({ page, addCleanup, record }) {
  await seedDashboardFixture(page, addCleanup);

  const dashboardTabs = page.locator("[data-dashboard-tab-id]");
  let selectedDashboardTabIndex = 0;
  let selectedDashboardViewId = await dashboardTabs
    .first()
    .getAttribute("data-dashboard-tab-id");

  for (
    let tabIndex = 0;
    tabIndex < (await dashboardTabs.count());
    tabIndex += 1
  ) {
    const tab = dashboardTabs.nth(tabIndex);
    await tab.click();
    const expectedId = await tab.getAttribute("data-dashboard-tab-id");
    await page.waitForFunction(
      (viewId) =>
        document
          .querySelector(`[data-dashboard-tab-id="${viewId}"]`)
          ?.getAttribute("data-state") === "active",
      expectedId,
    );
    const metrics = await page.locator("main").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    if (metrics.scrollHeight > metrics.clientHeight) {
      selectedDashboardTabIndex = tabIndex;
      selectedDashboardViewId = expectedId;
      break;
    }
  }

  if ((await page.getByRole("button", { name: "Drag widget" }).count()) !== 0) {
    throw new Error("Drag controls are exposed outside Dashboard edit mode");
  }
  await page.getByRole("button", { name: "Edit Layout" }).click();
  const grip = page.getByRole("button", { name: "Drag widget" }).first();
  await grip.waitFor({ state: "visible", timeout: 10_000 });
  const activeTab = page.locator(
    '[data-dashboard-tab-id][data-state="active"]',
  );
  await activeTab.focus();
  await page.keyboard.press("Tab");
  const firstWidgetFocus = await page.evaluate(() =>
    document.activeElement?.getAttribute("data-widget-instance-id"),
  );
  const firstWidgetId = await page
    .locator("[data-widget-instance-id]")
    .first()
    .getAttribute("data-widget-instance-id");
  record("focus-order", JSON.stringify({ firstWidgetFocus, firstWidgetId }));
  if (firstWidgetFocus !== firstWidgetId) {
    throw new Error(
      "Tab from the active dashboard tab did not enter the first widget",
    );
  }

  await page.evaluate(() => {
    window.__dashboardDragEvents = [];
    const report = (target, event) => {
      const handle = event.target?.closest?.('[aria-label="Drag widget"]');
      window.__dashboardDragEvents.push({
        target,
        type: event.type,
        pointerId: event.pointerId ?? null,
        targetLabel: handle?.getAttribute("aria-label") ?? null,
      });
    };
    for (const eventType of ["pointerdown", "pointermove", "pointerup"]) {
      document.addEventListener(
        eventType,
        (event) => {
          if (eventType === "pointerdown") {
            window.__dashboardDragPointerId = event.pointerId;
          }
          report("document-capture", event);
        },
        true,
      );
    }
    document.addEventListener(
      "lostpointercapture",
      (event) => report("document-capture", event),
      true,
    );
  });

  if ((await page.locator(".react-resizable-handle:visible").count()) !== 0) {
    throw new Error(
      "Resize affordances are exposed even though resizing is disabled",
    );
  }
  const gridBox = await page.locator(".react-grid-layout").boundingBox();
  if (!gridBox) {
    throw new Error(
      "The RGL container does not have a measurable bounding box",
    );
  }
  const selectedIndex = 0;
  const selectedGridItem = grip.locator(
    "xpath=ancestor::*[contains(@class, 'react-grid-item')][1]",
  );
  await selectedGridItem.scrollIntoViewIfNeeded();
  const main = page.locator("main");
  const scrollMetrics = await main.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  if (scrollMetrics.scrollHeight <= scrollMetrics.clientHeight) {
    throw new Error("Dashboard fixture is not vertically scrollable");
  }
  await main.evaluate((element) => {
    element.scrollTop = Math.floor(
      (element.scrollHeight - element.clientHeight) / 2,
    );
  });
  await selectedGridItem.scrollIntoViewIfNeeded();
  const before = await selectedGridItem.boundingBox();
  if (!before) {
    throw new Error("The first widget does not have a measurable bounding box");
  }

  const start = await grip.boundingBox();
  if (!start) {
    throw new Error("The first widget drag grip does not have a bounding box");
  }
  const stateBefore = await page.evaluate(() =>
    window.api.invoke("settings:getDashboardViews"),
  );
  const activeViewBefore = stateBefore.views[selectedDashboardViewId];
  const instanceId = activeViewBefore.layout.widget_order[selectedIndex];
  const canonicalYBefore =
    activeViewBefore.layout.widget_geometry[instanceId].y;

  const targetX = start.x + start.width / 2;
  const targetY = start.y + start.height / 2 + 200;
  await grip.hover();
  await page.mouse.down();
  record(
    "drag-probe-after-down",
    JSON.stringify(
      await grip.evaluate((element) => ({
        pointerId: window.__dashboardDragPointerId ?? null,
        hasPointerCapture:
          window.__dashboardDragPointerId == null
            ? false
            : element.hasPointerCapture(window.__dashboardDragPointerId),
        events: window.__dashboardDragEvents,
      })),
    ),
  );
  await page.mouse.move(targetX, targetY, { steps: 12 });
  const mainBox = await main.boundingBox();
  if (!mainBox) {
    throw new Error("The dashboard main element does not have a bounding box");
  }
  const scrollBeforeBottom = await main.evaluate(
    (element) => element.scrollTop,
  );
  await page.mouse.move(targetX, mainBox.y + mainBox.height - 10, { steps: 4 });
  await delay(500);
  const scrollAfterBottom = await main.evaluate((element) => element.scrollTop);
  const scrollBeforeTop = scrollAfterBottom;
  await page.mouse.move(targetX, mainBox.y + 10, { steps: 4 });
  await delay(500);
  const scrollAfterTop = await main.evaluate((element) => element.scrollTop);
  await page.mouse.move(targetX, mainBox.y + mainBox.height - 10, { steps: 4 });
  const scrollBeforeFinalBottom = await main.evaluate(
    (element) => element.scrollTop,
  );
  await page.mouse.wheel(0, 180);
  await delay(200);
  const pointerCaptureDuring = await grip.evaluate((element) =>
    element.hasPointerCapture(window.__dashboardDragPointerId),
  );
  const during = await selectedGridItem.boundingBox();
  record(
    "drag-probe-during",
    JSON.stringify(
      await grip.evaluate((element) => ({
        pointerId: window.__dashboardDragPointerId ?? null,
        hasPointerCapture:
          window.__dashboardDragPointerId == null
            ? false
            : element.hasPointerCapture(window.__dashboardDragPointerId),
        events: window.__dashboardDragEvents,
      })),
    ),
  );
  record(
    "auto-scroll-measurement",
    JSON.stringify({
      scrollBeforeBottom,
      scrollAfterBottom,
      scrollBeforeTop,
      scrollAfterTop,
      scrollBeforeFinalBottom,
    }),
  );
  await page.mouse.up();
  await delay(1500);
  const after = await selectedGridItem.boundingBox();
  const persistedState = await page.evaluate(() =>
    window.api.invoke("settings:getDashboardViews"),
  );
  record("persisted-state", JSON.stringify(persistedState));
  await page.reload();
  const reloadedSourceTab = page.locator(
    `[data-dashboard-tab-id="${selectedDashboardViewId}"]`,
  );
  await reloadedSourceTab.click();
  await page.waitForFunction(
    (expectedId) =>
      document
        .querySelector(`[data-dashboard-tab-id="${expectedId}"]`)
        ?.getAttribute("data-state") === "active",
    selectedDashboardViewId,
  );
  await page.getByRole("button", { name: "Edit Layout" }).click();
  const reloadedGrip = page
    .getByRole("button", { name: "Drag widget" })
    .nth(selectedIndex);
  await reloadedGrip.waitFor({ state: "visible", timeout: 10_000 });
  const reloadedItem = reloadedGrip.locator(
    "xpath=ancestor::*[contains(@class, 'react-grid-item')][1]",
  );
  const reloaded = await reloadedItem.boundingBox();
  const reloadedDocumentY = reloaded
    ? reloaded.y + (await page.evaluate(() => window.scrollY))
    : null;
  record("reload-measurement", JSON.stringify({ reloaded, reloadedDocumentY }));
  const stateAfter = await page.evaluate(() =>
    window.api.invoke("settings:getDashboardViews"),
  );
  const canonicalYAfter =
    stateAfter.views[selectedDashboardViewId].layout.widget_geometry[instanceId]
      .y;
  const movedAfterReload = canonicalYAfter !== canonicalYBefore;

  const movedDuringDrag =
    during && (during.x !== before.x || during.y !== before.y);
  const targetDashboardTabIndex = selectedDashboardTabIndex === 0 ? 1 : 0;
  const transferGrip = page
    .locator(`[data-widget-instance-id="${instanceId}"]`)
    .getByRole("button", { name: "Drag widget" });
  await transferGrip.scrollIntoViewIfNeeded();
  const transferTarget = dashboardTabs.nth(targetDashboardTabIndex);
  const transferStart = await transferGrip.boundingBox();
  const transferTargetBox = await transferTarget.boundingBox();
  if (!transferStart || !transferTargetBox) {
    throw new Error("Could not measure the cross-dashboard transfer controls");
  }
  await transferGrip.hover();
  await page.mouse.down();
  await page.mouse.move(
    transferTargetBox.x + transferTargetBox.width / 2,
    transferTargetBox.y + transferTargetBox.height / 2,
    { steps: 16 },
  );
  await page.mouse.up();
  await delay(1000);
  const transferState = await page.evaluate(() =>
    window.api.invoke("settings:getDashboardViews"),
  );
  const sourceView = transferState.views[selectedDashboardViewId];
  const targetViewId = await dashboardTabs
    .nth(targetDashboardTabIndex)
    .getAttribute("data-dashboard-tab-id");
  const targetView = targetViewId ? transferState.views[targetViewId] : null;
  const transferred =
    Boolean(sourceView) &&
    Boolean(targetView) &&
    !sourceView.layout.widget_instances[instanceId] &&
    Boolean(targetView.layout.widget_instances[instanceId]);
  record(
    "transfer-measurement",
    JSON.stringify({
      instanceId,
      transferred,
      targetViewId,
      targetBox: transferTargetBox,
    }),
  );
  record(
    "measurement",
    JSON.stringify({
      before,
      during,
      after,
      movedAfterReload,
      pointerCaptureDuring,
    }),
  );

  if (
    !movedDuringDrag ||
    !movedAfterReload ||
    !pointerCaptureDuring ||
    scrollAfterBottom <= scrollBeforeBottom ||
    scrollAfterTop >= scrollBeforeTop ||
    !transferred
  ) {
    throw new Error(
      "Dashboard drag, persistence, wheel handling, and transfer did not all pass",
    );
  }
}

try {
  const result = await runElectronHarness({
    name: "dashboard-drag",
    scenario: runDashboardDragScenario,
  });
  console.log(`Dashboard drag harness passed; artifacts: ${result.artifacts}`);
} catch (error) {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exitCode = 1;
}
