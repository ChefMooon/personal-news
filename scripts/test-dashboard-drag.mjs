import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const DEBUG_PORT = 9222;
const DEBUG_URL = `http://127.0.0.1:${DEBUG_PORT}`;
const ARTIFACT_DIR = "artifacts/dashboard-drag";
const DEV_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

const logs = [];
let devProcess;
let browser;
let initialDashboardState;

function record(type, message) {
  logs.push({ type, message, timestamp: new Date().toISOString() });
  console.log(`[${type}] ${message}`);
}

async function connectToDevTools(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await chromium.connectOverCDP(DEBUG_URL);
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Electron remote debugging did not open on ${DEBUG_URL}`);
}

async function stopDevProcess() {
  if (!devProcess?.pid) {
    return;
  }

  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(devProcess.pid), "/t", "/f"], {
      stdio: "ignore",
    });
    return;
  }

  devProcess.kill("SIGTERM");
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });

  devProcess = spawn(DEV_COMMAND, ["run", "dev"], {
    env: {
      ...process.env,
      ELECTRON_REMOTE_DEBUGGING_PORT: String(DEBUG_PORT),
    },
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    windowsHide: true,
  });

  devProcess.stdout.on("data", (chunk) => {
    record("electron", chunk.toString().trim());
  });
  devProcess.stderr.on("data", (chunk) => {
    record("electron-error", chunk.toString().trim());
  });

  browser = await connectToDevTools();
  const context = browser.contexts()[0];
  const page = context.pages()[0];
  if (!page) {
    throw new Error("Electron opened without a renderer page");
  }

  page.on("console", (message) => {
    record(`page-console:${message.type()}`, message.text());
  });
  page.on("pageerror", (error) => {
    record("page-error", error.stack ?? error.message);
  });

  initialDashboardState = await page.evaluate(async () => {
    return window.api.invoke("settings:getDashboardViews");
  });

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
    await page.waitForFunction(
      (expectedId) =>
        document
          .querySelector(`[data-dashboard-tab-id="${expectedId}"]`)
          ?.getAttribute("data-state") === "active",
      await tab.getAttribute("data-dashboard-tab-id"),
    );
    const metrics = await page.locator("main").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    if (metrics.scrollHeight > metrics.clientHeight) {
      selectedDashboardTabIndex = tabIndex;
      selectedDashboardViewId = await tab.getAttribute("data-dashboard-tab-id");
      break;
    }
  }

  if ((await page.getByRole("button", { name: "Drag widget" }).count()) !== 0) {
    throw new Error("Drag controls are exposed outside Dashboard edit mode");
  }
  await page.getByRole("button", { name: "Edit Layout" }).click();
  const grip = page.getByRole("button", { name: "Drag widget" }).first();
  await grip.waitFor({ state: "visible", timeout: 10000 });
  const activeTab = page.locator(
    '[data-dashboard-tab-id][data-state="active"]',
  );
  await activeTab.focus();
  await page.keyboard.press("Tab");
  const firstWidgetFocus = await page.evaluate(() => {
    const active = document.activeElement;
    return active?.getAttribute("data-widget-instance-id");
  });
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
  const selectedGrip = grip;
  const selectedGridItem = grip.locator(
    "xpath=ancestor::*[contains(@class, 'react-grid-item')][1]",
  );
  const selectedIndex = 0;
  await selectedGrip.waitFor({ state: "visible", timeout: 5000 });
  const gridItem = selectedGridItem;
  await gridItem.scrollIntoViewIfNeeded();
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
  await gridItem.scrollIntoViewIfNeeded();
  const before = await gridItem.boundingBox();
  if (!before) {
    throw new Error(
      "The first widget does not have a measurable RGL grid item bounding box",
    );
  }

  const start = await selectedGrip.boundingBox();
  if (!start) {
    throw new Error(
      "The first widget drag grip does not have a measurable bounding box",
    );
  }
  const stateBefore = await page.evaluate(async () => {
    return window.api.invoke("settings:getDashboardViews");
  });
  const activeViewBefore = stateBefore.views[selectedDashboardViewId];
  const instanceId = activeViewBefore.layout.widget_order[selectedIndex];
  const canonicalYBefore =
    activeViewBefore.layout.widget_geometry[instanceId].y;

  const targetX = start.x + start.width / 2;
  const targetY = start.y + start.height / 2 + 200;
  await selectedGrip.hover();
  await page.mouse.down();
  record(
    "drag-probe-after-down",
    JSON.stringify(
      await selectedGrip.evaluate((element) => ({
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
  await delay(500);
  const scrollBeforeFinalBottom = await main.evaluate(
    (element) => element.scrollTop,
  );
  await page.mouse.wheel(0, 180);
  await delay(200);
  const pointerCaptureDuring = await selectedGrip.evaluate((element) =>
    element.hasPointerCapture(window.__dashboardDragPointerId),
  );
  record(
    "drag-probe-during",
    JSON.stringify(
      await selectedGrip.evaluate((element) => ({
        pointerId: window.__dashboardDragPointerId ?? null,
        hasPointerCapture:
          window.__dashboardDragPointerId == null
            ? false
            : element.hasPointerCapture(window.__dashboardDragPointerId),
        events: window.__dashboardDragEvents,
      })),
    ),
  );
  const during = await gridItem.boundingBox();
  record(
    "dom-state-during",
    await gridItem.evaluate((element) =>
      JSON.stringify({
        className: element.className,
        style: element.getAttribute("style"),
      }),
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
  const after = await gridItem.boundingBox();
  const persistedState = await page.evaluate(async () => {
    const result = await window.api.invoke("settings:getDashboardViews");
    return result;
  });
  record("persisted-state", JSON.stringify(persistedState));
  const movedAfterReload = await (async () => {
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
    await reloadedGrip.waitFor({ state: "visible", timeout: 10000 });
    const reloadedItem = reloadedGrip.locator(
      "xpath=ancestor::*[contains(@class, 'react-grid-item')][1]",
    );
    const reloaded = await reloadedItem.boundingBox();
    const reloadedDocumentY = reloaded
      ? reloaded.y + (await page.evaluate(() => window.scrollY))
      : null;
    record(
      "reload-measurement",
      JSON.stringify({ reloaded, reloadedDocumentY }),
    );
    const stateAfter = await page.evaluate(async () => {
      return window.api.invoke("settings:getDashboardViews");
    });
    const activeViewAfter = stateAfter.views[selectedDashboardViewId];
    const canonicalYAfter =
      activeViewAfter.layout.widget_geometry[instanceId].y;
    record(
      "canonical-measurement",
      JSON.stringify({ canonicalYBefore, canonicalYAfter }),
    );
    return canonicalYAfter !== canonicalYBefore;
  })();

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
  const transferState = await page.evaluate(async () => {
    return window.api.invoke("settings:getDashboardViews");
  });
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

  const pageErrors = logs.filter((entry) => entry.type === "page-error");
  if (pageErrors.length > 0) {
    throw new Error(
      `Renderer errors occurred during drag: ${JSON.stringify(pageErrors)}`,
    );
  }

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

  console.log("Dashboard drag harness passed");
}

try {
  await main();
} catch (error) {
  record(
    "failure",
    error instanceof Error ? (error.stack ?? error.message) : String(error),
  );
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    try {
      await page.screenshot({
        path: `${ARTIFACT_DIR}/failure.png`,
        fullPage: true,
      });
    } catch (screenshotError) {
      record(
        "screenshot-error",
        screenshotError instanceof Error
          ? screenshotError.message
          : String(screenshotError),
      );
    }
  }
  await writeFile(`${ARTIFACT_DIR}/run.json`, JSON.stringify(logs, null, 2));
  process.exitCode = 1;
} finally {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page && initialDashboardState) {
    try {
      await page.evaluate(async (state) => {
        await window.api.invoke("settings:setDashboardViews", { state });
      }, initialDashboardState);
    } catch (restoreError) {
      record(
        "restore-error",
        restoreError instanceof Error
          ? restoreError.message
          : String(restoreError),
      );
    }
  }
  await browser?.close();
  await stopDevProcess();
}
