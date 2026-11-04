import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = process.cwd();
const artifactDir = path.join(
  root,
  "artifacts",
  "renderer-browser",
  `update-notifications-${Date.now()}`,
);
const server = await createServer({
  configFile: path.join(root, "vite.renderer-browser.config.mts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
let browser;

try {
  await mkdir(artifactDir, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  await page.locator("[data-dashboard-tab-id]").first().waitFor();

  await page.evaluate(() => {
    window.updateNoticeTest = { installCalls: 0, failInstall: false, status: { state: "idle", supported: true, currentVersion: "99.1.0", downloadedReady: false } };
    const invoke = window.api.invoke.bind(window.api);
    window.api.invoke = (channel, ...args) => {
      if (channel === "updates:installUpdate") {
        window.updateNoticeTest.installCalls += 1;
        if (window.updateNoticeTest.failInstall) {
          const failure = {
            state: "error",
            downloadedReady: true,
            downloadedVersion: "99.1.1",
            failedDuring: "ready",
            message: "Installer could not start.",
            friendlyMessage: "Installer could not start.",
          };
          window.updateNoticeTest.status = failure;
          window.__rendererBrowserEmit("updates:status", failure);
          return Promise.resolve({
            ok: false,
            error: "Installer could not start.",
          });
        }
        const requested = {
          ...window.updateNoticeTest.status,
          state: "downloaded",
          installRequested: true,
          operationPhase: "install-requested",
          message: "Install and restart requested.",
        };
        window.updateNoticeTest.status = requested;
        window.__rendererBrowserEmit("updates:status", requested);
        return Promise.resolve({ ok: true });
      }
      if (channel === "updates:getStatus") return Promise.resolve(window.updateNoticeTest.status);
      return invoke(channel, ...args);
    };
  });

  const emit = (state) =>
    page.evaluate(
      (payload) => {
        window.updateNoticeTest.status = payload;
        window.__rendererBrowserEmit("updates:status", payload);
      },
      state,
    );
  await emit({ state: "available", operationOrigin: "manual", version: "99.1.0", message: "available" });
  const notice = page
    .getByRole("listitem")
    .filter({ hasText: "Update 99.1.0 is available." });
  await notice.getByText("Update 99.1.0 is available.").waitFor();
  const initialWidth = await notice.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).width),
  );
  assert(initialWidth <= 420, `Wide update notice was ${initialWidth}px`);
  const lightNoticeColors = await notice.evaluate((element) => {
    const expected = document.createElement("div");
    expected.style.background = "hsl(var(--card))";
    document.body.append(expected);
    const expectedBackground = getComputedStyle(expected).backgroundColor;
    expected.remove();
    return {
      actual: getComputedStyle(element).backgroundColor,
      expected: expectedBackground,
    };
  });
  assert(
    lightNoticeColors.actual === lightNoticeColors.expected,
    `Light theme notice did not use the card token: ${JSON.stringify(lightNoticeColors)}`,
  );

  await emit({ state: "downloaded", downloadedReady: true, version: "99.1.0", message: "downloaded" });
  const downloadedNotice = page
    .getByRole("listitem")
    .filter({ hasText: "Update 99.1.0 is ready." });
  const action = downloadedNotice.getByRole("button", {
    name: "Install and restart",
  });
  await action.waitFor();
  await page.evaluate(() => {
    document.documentElement.dataset.theme = "dark";
  });
  await page.setViewportSize({ width: 360, height: 640 });
  const narrowNoticeWidth = await downloadedNotice.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).width),
  );
  assert(
    narrowNoticeWidth <= 336,
    `Narrow update notice was ${narrowNoticeWidth}px`,
  );
  const themeColors = await action.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    foreground: getComputedStyle(element).color,
  }));
  assert(
    themeColors.background !== "rgba(0, 0, 0, 0)" &&
      themeColors.background !== "rgb(255, 255, 255)",
    `Dark theme action did not use the theme primary color: ${JSON.stringify(themeColors)}`,
  );

  await action.focus();
  await downloadedNotice.screenshot({
    path: path.join(artifactDir, "update-ready-dark-narrow-focused.png"),
  });
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => window.updateNoticeTest.installCalls === 1);
  await page.getByText("Install and restart requested.").waitFor();
  await page.getByRole("listitem").filter({ hasText: "Update 99.1.0 is ready." }).waitFor({ state: "hidden" });
  assert(
    !(await page.getByRole("listitem").filter({ hasText: "Update 99.1.0 is ready." }).count()),
    "An accepted install request recreated the persistent ready notice",
  );
  await page.evaluate(() => {
    window.updateNoticeTest.failInstall = true;
  });
  await emit({
    state: "downloaded",
    downloadedReady: true,
    version: "99.1.1",
    message: "downloaded-failure",
  });
  const failedInstallNotice = page
    .getByRole("listitem")
    .filter({ hasText: "Update 99.1.1 is ready." });
  await failedInstallNotice
    .getByRole("button", { name: "Install and restart" })
    .click();
  const installError = page
    .getByRole("listitem")
    .filter({ hasText: "Installer could not start." });
  await installError.waitFor();
  assert(
    await installError.evaluate((element) =>
      element.classList.contains("update-toast"),
    ),
    "Install failure toast did not use update styling",
  );
  await emit({ state: "not-available", operationOrigin: "manual", currentVersion: "99.1.0", message: "latest" });
  await page
    .getByText("You are already on the latest version.")
    .first()
    .waitFor();
  const longMessage = "Update failed: " + "X".repeat(220);
  await emit({ state: "error", message: longMessage });
  const errorNotice = page
    .getByRole("listitem")
    .filter({ hasText: longMessage });
  await errorNotice.waitFor();
  await page.waitForTimeout(450);
  const errorNoticeBackground = await errorNotice.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  assert(
    errorNoticeBackground !== "rgb(255, 240, 240)",
    `Error notice kept Sonner's rich error background: ${errorNoticeBackground}`,
  );
  const longMessageGeometry = await errorNotice.evaluate((element) => ({
    width: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  assert(
    longMessageGeometry.scrollWidth <= longMessageGeometry.width,
    `Long update error overflowed its toast: ${JSON.stringify(longMessageGeometry)}`,
  );

  await errorNotice.screenshot({
    path: path.join(artifactDir, "update-error-dark-narrow.png"),
  });
  await emit({ state: "checking", operationOrigin: "automatic", message: "Checking for updates..." });
  await page.waitForTimeout(100);
  assert(!(await page.getByRole("listitem").filter({ hasText: "Checking for updates" }).count()), "A transient background check produced a toast");
  await emit({ state: "error", downloadedReady: true, message: "A later check failed", friendlyMessage: "Network check failed" });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("link", { name: "Settings" }).click();
  await page.getByText("Update status").waitFor();
  await page.getByRole("button", { name: "Install and restart" }).waitFor();
  assert(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  console.log(
    JSON.stringify({
      result: "passed",
      initialWidth,
      narrowNoticeWidth,
      keyboardInstallCalls: 1,
      lightNoticeColors,
      themeColors,
      longMessageGeometry,
      errorNoticeBackground,
      readinessAfterFailure: true,
      screenshot: path.join(artifactDir, "update-error-dark-narrow.png"),
    }),
  );
} finally {
  await browser?.close();
  await server.close();
}
