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
    {
      heading: "Added",
      blocks: [
        { type: "paragraph", inline: [{ type: "text", value: "Release notes before install" }] },
        {
          type: "list",
          items: [
            { inline: [{ type: "text", value: "Dismissible what's new dialog" }], children: [] },
            { inline: [{ type: "text", value: "Toast stays after closing the dialog" }], children: [] },
          ],
        },
      ],
    },
    { heading: "Fixed", blocks: [{ type: "list", items: [{ inline: [{ type: "text", value: "Stable update notifications" }], children: [] }] }] },
  ],
};

const inlineText = (inline) =>
  inline.map((part) => part.type === "text" || part.type === "code"
    ? part.value
    : inlineText(part.children ?? [])).join("");
const notesText = (document) => document.sections.flatMap((section) =>
  (section.blocks ?? []).flatMap((block) => block.type === "paragraph"
    ? [inlineText(block.inline)]
    : block.items.flatMap((item) => [inlineText(item.inline), ...item.children.map((child) => inlineText(child.inline))])),
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
  page.evaluate((name) => window.__rendererBrowserCalls.filter(
    (call) => call.kind === "invoke" && call.channel === name,
  ), channel);

const checkClean = async (page, errors) => {
  const apiErrors = await page.evaluate(() => [...window.__rendererBrowserApiErrors]);
  assert(errors.length === 0, `Page errors: ${errors.join("; ")}`);
  assert(apiErrors.length === 0, `API errors: ${JSON.stringify(apiErrors)}`);
};

async function expectDialogContent(page, version, description, releaseNotes = notes, checkText = true) {
  const dialog = page.getByRole("dialog");
  await dialog.getByText(`What's new in ${version}`).waitFor();
  await dialog.getByText(description).waitFor();
  for (const section of releaseNotes.sections) {
    if (section.heading) await dialog.getByRole("heading", { name: section.heading }).waitFor();
  }
  if (checkText) {
    for (const text of notesText(releaseNotes)) await dialog.getByText(text, { exact: true }).waitFor();
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

const pendingScenario = (version, releaseNotes = notes) => ({
  whatsNewPending: { version, notes: releaseNotes },
});
const installedText = (version) => `You are now on version ${version}.`;

async function openWithPending(url, version, options, releaseNotes = notes) {
  const opened = await openPage(url, options);
  await opened.page.evaluate((scenarioJson) => {
    const key = "__rendererBrowserScenario";
    const current = JSON.parse(sessionStorage.getItem(key) || "{}");
    sessionStorage.setItem(key, JSON.stringify({ ...current, ...scenarioJson }));
  }, pendingScenario(version, releaseNotes));
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

scenario("hostile content and unsafe links render as text", async (url) => {
  const { context, page, errors } = await openPage(url);
  try {
    const payload = "<img src=x onerror=window.__pwned=1>";
    const hostile = { sections: [{ heading: "Fixed", blocks: [{ type: "list", items: [
      { inline: [{ type: "text", value: payload }], children: [] },
      ...["javascript:window.__pwned=1", "http://example.com", "data:text/html,x", "mailto:a@b.co"].map((href) => ({
        inline: [{ type: "link", href, children: [{ type: "text", value: href }] }], children: [],
      })),
    ] }] }] };
    await setDownloaded(page, hostile);
    await page.getByRole("button", { name: "See what's new" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText(payload, { exact: true }).waitFor();
    assert((await dialog.locator("img").count()) === 0, "An img element was rendered in the dialog");
    assert((await dialog.locator("a").count()) === 0, "An unsafe link was rendered as an anchor");
    await page.waitForTimeout(200);
    assert((await page.evaluate(() => window.__pwned)) === undefined, "XSS payload executed");
    await checkClean(page, errors);
  } finally {
    await context.close();
  }
});

scenario("fallback text is escaped", async (url) => {
  const { context, page, errors } = await openPage(url);
  try {
    await setDownloaded(page, { sections: [], fallbackText: "<script>window.__pwned=1</script>" });
    await page.getByRole("button", { name: "See what's new" }).click();
    const dialog = page.getByRole("dialog");
    const fallback = dialog.getByText("<script>window.__pwned=1</script>", { exact: true });
    await fallback.waitFor();
    assert(await fallback.evaluate((el) => getComputedStyle(el).whiteSpace) === "pre-wrap", "Fallback did not preserve whitespace");
    assert((await dialog.locator("script").count()) === 0, "Fallback created a script element");
    assert((await page.evaluate(() => window.__pwned)) === undefined, "Fallback script executed");
    await checkClean(page, errors);
  } finally {
    await context.close();
  }
});

const allConstructs = { sections: [
  { heading: "Constructs", blocks: [
    { type: "paragraph", inline: [{ type: "text", value: "A short paragraph." }] },
    { type: "list", items: [
      { inline: [{ type: "text", value: "Code " }, { type: "code", value: "alpha()" }, { type: "text", value: ", " }, { type: "bold", children: [{ type: "text", value: "bold" }] }, { type: "text", value: ", " }, { type: "italic", children: [{ type: "text", value: "italic" }] }, { type: "text", value: " and " }, { type: "link", href: "https://example.com/release", children: [{ type: "text", value: "a link" }] }], children: [
        { inline: [{ type: "text", value: "Nested bullet" }], children: [] },
      ] },
    ] },
  ] },
  { heading: null, blocks: [{ type: "paragraph", inline: [{ type: "text", value: "Unheaded section" }] }] },
] };

scenario("all constructs, external link IPC, and keyboard", async (url) => {
  const { context, page, errors } = await openPage(url);
  try {
    await setDownloaded(page, allConstructs);
    await page.getByRole("button", { name: "See what's new" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Constructs" }).waitFor();
    await dialog.locator("p").getByText("A short paragraph.").waitFor();
    assert((await dialog.locator("ul > li").count()) > 0, "List items were not rendered");
    await dialog.locator("li > ul > li").getByText("Nested bullet").waitFor();
    await dialog.locator("strong").getByText("bold").waitFor();
    await dialog.locator("em").getByText("italic").waitFor();
    const code = dialog.locator("code");
    await code.getByText("alpha()").waitFor();
    assert((await code.evaluate((el) => getComputedStyle(el).fontFamily)).includes("monospace"), "Code font is not monospace");
    const link = dialog.getByRole("link", { name: "a link" });
    assert(await link.getAttribute("href") === "https://example.com/release", "Unexpected link href");
    assert(await link.getAttribute("rel") === "noopener noreferrer", "Unexpected link rel");
    assert(await link.getAttribute("title") === "https://example.com/release", "Unexpected link title");
    assert((await dialog.locator("img, script").count()) === 0, "Unexpected unsafe element in dialog");
    const initialUrl = page.url();
    await link.click();
    await page.waitForFunction(() => window.__rendererBrowserCalls.some(
      (call) => call.kind === "invoke" && call.channel === "shell:openExternal" && call.args[0] === "https://example.com/release",
    ));
    assert(page.url() === initialUrl && context.pages().length === 1, "Link navigated or opened a new page");
    // Start at the first content link to verify its position before the footer
    // controls in the dialog's tab cycle (Radix initially focuses the footer).
    await link.focus();
    const focused = [];
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      focused.push(await page.evaluate(() => document.activeElement?.textContent?.trim() || document.activeElement?.getAttribute("aria-label")));
    }
    assert(focused[0] === "View full changelog" && focused[1] === "Got it" && focused[2] === "Close" && focused[3] === "a link", `Unexpected focus order: ${JSON.stringify(focused)}`);
    await link.focus();
    assert(await link.evaluate((el) => getComputedStyle(el).boxShadow !== "none"), "Focused link has no visible ring");
    await link.focus();
    const callsBeforeEnter = (await callsFor(page, "shell:openExternal")).length;
    await page.keyboard.press("Enter");
    await page.waitForFunction((previousCount) => {
      const calls = window.__rendererBrowserCalls.filter(
        (call) => call.kind === "invoke" && call.channel === "shell:openExternal",
      );
      return calls.length > previousCount && calls.at(-1)?.args[0] === "https://example.com/release";
    }, callsBeforeEnter);
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });
    await checkClean(page, errors);
  } finally { await context.close(); }
});

scenario("link open failure keeps dialog open", async (url) => {
  const { context, page, errors } = await openPage(url);
  try {
    await setDownloaded(page, allConstructs);
    await page.evaluate(() => {
      const invoke = window.api.invoke.bind(window.api);
      window.api.invoke = (channel, ...args) => channel === "shell:openExternal"
        ? Promise.reject(new Error("blocked")) : invoke(channel, ...args);
    });
    await page.getByRole("button", { name: "See what's new" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("link", { name: "a link" }).click();
    await page.getByText("blocked", { exact: true }).waitFor();
    await dialog.waitFor();
    await checkClean(page, errors);
  } finally { await context.close(); }
});

scenario("malformed notes show empty state", async (url) => {
  const oldShape = { sections: [{ heading: "Old shape", items: ["Example"] }] };
  const { context, page, errors } = await openWithPending(url, "99.7.0", {}, oldShape);
  try {
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await dialog.getByText("Release notes are not available for this update.").waitFor();
    await checkClean(page, errors);
  } finally { await context.close(); }
});

const luminance = (rgb) => {
  const values = rgb.match(/[\d.]+/g).slice(0, 3).map((value) => Number(value) / 255).map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};
const contrast = (a, b) => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};
for (const theme of ["light", "dark"]) {
  for (const size of [{ width: 900, height: 600 }, { width: 1280, height: 800 }]) {
    scenario(`${theme} theme ${size.width}x${size.height}`, async (url) => {
      const { context, page, errors } = await openWithPending(url, `99.${theme === "dark" ? "5" : "6"}.0`, {
        viewport: size, colorScheme: theme,
      }, allConstructs);
      try {
        await page.evaluate((themeValue) => { document.documentElement.dataset.theme = themeValue; }, theme);
        const dialog = await expectDialogContent(page, `99.${theme === "dark" ? "5" : "6"}.0`, installedText(`99.${theme === "dark" ? "5" : "6"}.0`), allConstructs, false);
        const link = dialog.getByRole("link", { name: "a link" });
        const code = dialog.locator("code");
        const [linkColors, codeColors] = await Promise.all([
          link.evaluate((el) => {
            let current = el;
            let background = "rgb(0, 0, 0)";
            while (current) {
              const color = getComputedStyle(current).backgroundColor;
              if (!color.endsWith(", 0)")) { background = color; break; }
              current = current.parentElement;
            }
            return { foreground: getComputedStyle(el).color, background };
          }),
          code.evaluate((el) => {
            let current = el;
            let background = "rgb(0, 0, 0)";
            while (current) {
              const color = getComputedStyle(current).backgroundColor;
              if (!color.endsWith(", 0)")) { background = color; break; }
              current = current.parentElement;
            }
            return { foreground: getComputedStyle(el).color, background };
          }),
        ]);
        assert(contrast(linkColors.foreground, linkColors.background) >= 4.5, `Default link contrast is below 4.5: ${JSON.stringify(linkColors)}`);
        assert(contrast(codeColors.foreground, codeColors.background) >= 4.5, `Code contrast is below 4.5: ${JSON.stringify(codeColors)}`);
        await link.hover();
        const hoverContrast = await link.evaluate((el) => {
          let current = el;
          let background = "rgb(0, 0, 0)";
          while (current) {
            const color = getComputedStyle(current).backgroundColor;
            if (!color.endsWith(", 0)")) { background = color; break; }
            current = current.parentElement;
          }
          return { foreground: getComputedStyle(el).color, background };
        });
        console.log(`INFO ${theme} hover link contrast ${contrast(hoverContrast.foreground, hoverContrast.background).toFixed(2)}:1`);
        await dialog.screenshot({ path: path.join(artifactDir, `whats-new-${theme}-${size.width}x${size.height}.png`) });
        await checkClean(page, errors);
      } finally { await context.close(); }
    });
  }
}

scenario("900x600 long labels and scrolling", async (url) => {
  const { context, page, errors } = await openPage(url, { viewport: { width: 900, height: 600 } });
  try {
    const longLabel = "x".repeat(500);
    await setDownloaded(page, { sections: [{ heading: "Layout", blocks: [{ type: "list", items: [
      { inline: [{ type: "text", value: longLabel }], children: [] },
    ] }] }] });
    await page.getByRole("button", { name: "See what's new" }).click();
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 900 && bounds.y + bounds.height <= 600, "Dialog exceeds 900x600 viewport");
    await dialog.getByRole("button", { name: "Got it" }).waitFor();
    const scroll = dialog.locator(".max-h-\\[60vh\\]");
    assert(await scroll.evaluate((el) => el.scrollWidth <= el.clientWidth), "Long label causes horizontal overflow");
    await checkClean(page, errors);
    await context.close();

    const many = { sections: [{ heading: "Many bullets", blocks: [{ type: "list", items: Array.from({ length: 60 }, (_, index) => ({ inline: [{ type: "text", value: `Bullet ${index + 1}` }], children: [] })) }] }] };
    const second = await openPage(url, { viewport: { width: 900, height: 600 } });
    await setDownloaded(second.page, many);
    await second.page.getByRole("button", { name: "See what's new" }).click();
    const secondDialog = second.page.getByRole("dialog");
    const scrollBox = secondDialog.locator(".max-h-\\[60vh\\]");
    const metrics = await scrollBox.evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, overflowY: getComputedStyle(el).overflowY }));
    assert(metrics.scrollHeight > metrics.clientHeight && metrics.overflowY === "auto", `Expected internal vertical scrolling: ${JSON.stringify(metrics)}`);
    await second.page.screenshot({ path: path.join(artifactDir, "whats-new-layout-900x600.png") });
    await checkClean(second.page, second.errors);
    await second.context.close();
  } finally { await context.close().catch(() => {}); }
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
