import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = process.cwd();
const artifactDir = path.join(
  root,
  "artifacts",
  "renderer-browser",
  `whats-new-${Date.now()}`,
);
const changelogUrl =
  "https://github.com/ChefMooon/personal-news/blob/main/CHANGELOG.md";
const notes = {
  sections: [
    { heading: "Added", items: ["Release notes before install", "Dismissible what's new dialog"] },
    { heading: "Fixed", items: ["Toast stays after closing the dialog"] },
  ],
};
const server = await createServer({
  configFile: path.join(root, "vite.renderer-browser.config.mts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
let browser;
const results = [];

// Every scenario gets its own context (own sessionStorage) so persistent toasts
// and acknowledgements cannot leak between scenarios.
async function openPage(url, options = {}) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    ...options,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.locator("[data-dashboard-tab-id]").first().waitFor();
  return { context, page, errors };
}

const setDownloaded = (page, downloadedReleaseNotes) =>
  page.evaluate((releaseNotes) => {
    const status = {
      state: "downloaded",
      downloadedReady: true,
      version: "99.1.0",
      downloadedVersion: "99.1.0",
      currentVersion: "99.0.0",
      message: "downloaded",
      downloadedReleaseNotes: releaseNotes,
    };
    window.__whatsNewStatus = status;
    if (!window.__whatsNewPatched) {
      window.__whatsNewPatched = true;
      const invoke = window.api.invoke.bind(window.api);
      window.api.invoke = (channel, ...args) =>
        channel === "updates:getStatus"
          ? Promise.resolve(window.__whatsNewStatus)
          : invoke(channel, ...args);
    }
    window.__rendererBrowserEmit("updates:status", status);
  }, downloadedReleaseNotes);

const callsFor = (page, channel) =>
  page.evaluate(
    (name) =>
      window.__rendererBrowserCalls.filter(
        (call) => call.kind === "invoke" && call.channel === name,
      ),
    channel,
  );

const checkClean = async (page, errors) => {
  const apiErrors = await page.evaluate(() => [...window.__rendererBrowserApiErrors]);
  assert(errors.length === 0, `Page errors: ${errors.join("; ")}`);
  assert(apiErrors.length === 0, `API errors: ${JSON.stringify(apiErrors)}`);
};

async function expectDialogContent(page, version, description) {
  const dialog = page.getByRole("dialog");
  await dialog.getByText(`What's new in ${version}`).waitFor();
  await dialog.getByText(description).waitFor();
  for (const section of notes.sections) {
    await dialog.getByRole("heading", { name: section.heading }).waitFor();
    for (const item of section.items) await dialog.getByText(item).waitFor();
  }
  return dialog;
}

const incomingText = "Included in the update that is ready to install.";
const scenarios = [];
const scenario = (name, run) => scenarios.push({ name, run });

scenario("pre-update toast", async (url) => {
  const { context, page, errors } = await openPage(url);
  try {
    await setDownloaded(page, notes);
    const toast = page.getByRole("listitem").filter({ hasText: "Update 99.1.0 is ready." });
    await toast.waitFor();
    await toast.getByRole("button", { name: "See what's new" }).click();
    const dialog = await expectDialogContent(page, "99.1.0", incomingText);
    await dialog.getByRole("button", { name: "View full changelog" }).click();
    await page.waitForFunction(
      (url) =>
        window.__rendererBrowserCalls.some(
          (call) => call.kind === "invoke" && call.channel === "shell:openExternal" && call.args[0] === url,
        ),
      changelogUrl,
    );
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await toast.waitFor();
    await toast.getByRole("button", { name: "Install and restart" }).waitFor();
    await checkClean(page, errors);
  } finally {
    await context.close();
  }
});

scenario("settings downloaded update", async (url) => {
  const { context, page, errors } = await openPage(url);
  try {
    await setDownloaded(page, notes);
    await page.getByRole("link", { name: "Settings" }).click();
    const label = page.getByText("Downloaded update 99.1.0");
    await label.waitFor();
    await label.locator("xpath=..").getByRole("button", { name: "See what's new" }).click();
    const dialog = await expectDialogContent(page, "99.1.0", incomingText);
    await dialog.getByRole("button", { name: "Got it" }).click();
    await dialog.waitFor({ state: "hidden" });
    await checkClean(page, errors);
  } finally {
    await context.close();
  }
});

for (const [label, empty] of [["null notes", null], ["empty sections", { sections: [] }]]) {
  scenario(`no button with ${label}`, async (url) => {
    const { context, page, errors } = await openPage(url);
    try {
      await setDownloaded(page, empty);
      const toast = page.getByRole("listitem").filter({ hasText: "Update 99.1.0 is ready." });
      await toast.getByRole("button", { name: "Install and restart" }).waitFor();
      assert(
        (await page.getByRole("button", { name: "See what's new" }).count()) === 0,
        `Toast showed See what's new for ${label}`,
      );
      await page.getByRole("link", { name: "Settings" }).click();
      await page.getByText("Downloaded update 99.1.0").waitFor();
      assert(
        (await page.getByRole("button", { name: "See what's new" }).count()) === 0,
        `Settings showed See what's new for ${label}`,
      );
      await checkClean(page, errors);
    } finally {
      await context.close();
    }
  });
}

const pendingScenario = (version) => ({
  whatsNewPending: { version, notes },
});
const installedText = (version) => `You are now on version ${version}.`;

async function openWithPending(url, version, options) {
  const opened = await openPage(url, options);
  await opened.page.evaluate((scenarioJson) => {
    const key = "__rendererBrowserScenario";
    const current = JSON.parse(sessionStorage.getItem(key) || "{}");
    sessionStorage.setItem(key, JSON.stringify({ ...current, ...scenarioJson }));
  }, pendingScenario(version));
  await opened.page.reload();
  await opened.page.locator("[data-dashboard-tab-id]").first().waitFor();
  return opened;
}

const acknowledgeCalls = (page) =>
  page.evaluate(() => window.__rendererBrowserCalls.filter(
    (call) => call.kind === "invoke" && call.channel === "updates:acknowledgeWhatsNew",
  ));

scenario("post-update dialog dismissed once (Got it)", async (url) => {
  const { context, page, errors } = await openWithPending(url, "99.2.0");
  try {
    const dialog = await expectDialogContent(page, "99.2.0", installedText("99.2.0"));
    await dialog.getByRole("button", { name: "Got it" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      window.__rendererBrowserCalls.some((call) => call.channel === "updates:acknowledgeWhatsNew"),
    );
    const calls = await acknowledgeCalls(page);
    assert(
      calls.length === 1 && calls[0].args[0] === "99.2.0",
      `Unexpected acknowledge calls: ${JSON.stringify(calls)}`,
    );
    await page.reload();
    await page.locator("[data-dashboard-tab-id]").first().waitFor();
    await page.waitForFunction(() =>
      window.__rendererBrowserCalls.some((call) => call.channel === "updates:getPendingWhatsNew"),
    );
    await page.waitForTimeout(300);
    assert((await page.getByRole("dialog").count()) === 0, "Dialog reappeared after acknowledgement");
    await checkClean(page, errors);
  } finally {
    await context.close();
  }
});

scenario("post-update dialog acknowledged by Escape", async (url) => {
  const { context, page, errors } = await openWithPending(url, "99.3.0");
  try {
    const dialog = await expectDialogContent(page, "99.3.0", installedText("99.3.0"));
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await page.waitForFunction(() =>
      window.__rendererBrowserCalls.some((call) => call.channel === "updates:acknowledgeWhatsNew"),
    );
    const calls = await acknowledgeCalls(page);
    assert(
      calls.length === 1 && calls[0].args[0] === "99.3.0",
      `Unexpected acknowledge calls: ${JSON.stringify(calls)}`,
    );
    await checkClean(page, errors);
  } finally {
    await context.close();
  }
});

scenario("XSS-shaped item renders as text", async (url) => {
  const { context, page, errors } = await openPage(url);
  try {
    const payload = "<img src=x onerror=window.__pwned=1>";
    await setDownloaded(page, { sections: [{ heading: "Fixed", items: [payload] }] });
    await page.getByRole("button", { name: "See what's new" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(payload, { exact: true }).waitFor();
    assert((await dialog.locator("img").count()) === 0, "An img element was rendered in the dialog");
    await page.waitForTimeout(200);
    assert(
      (await page.evaluate(() => window.__pwned)) === undefined,
      "XSS payload executed",
    );
    await checkClean(page, errors);
  } finally {
    await context.close();
  }
});

scenario("dark theme screenshot", async (url) => {
  const { context, page, errors } = await openWithPending(url, "99.4.0", {
    colorScheme: "dark",
  });
  try {
    await page.evaluate(() => {
      document.documentElement.dataset.theme = "dark";
    });
    const dialog = await expectDialogContent(page, "99.4.0", installedText("99.4.0"));
    await dialog.screenshot({ path: path.join(artifactDir, "whats-new-dialog-dark.png") });
    await checkClean(page, errors);
  } finally {
    await context.close();
  }
});

try {
  await mkdir(artifactDir, { recursive: true });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  const started = Date.now();
  for (const { name, run } of scenarios) {
    try {
      await run(url);
      results.push({ name, ok: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
      console.log(`FAIL ${name}: ${error.message}`);
    }
  }
  const failed = results.filter((result) => !result.ok);
  console.log(
    `${results.length - failed.length}/${results.length} scenarios passed in ${((Date.now() - started) / 1000).toFixed(1)}s; artifacts: ${artifactDir}`,
  );
  if (failed.length) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
