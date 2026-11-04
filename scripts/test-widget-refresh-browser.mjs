import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const cases = [
  { id: "weather", channel: "weather:getSnapshot", event: "weather:updated" },
  {
    id: "astronomy",
    channel: "astronomy:getSnapshot",
    event: "astronomy:updated",
  },
  { id: "youtube", channel: "youtube:getChannels", event: "youtube:updated" },
  {
    id: "reddit_digest",
    channel: "reddit:getDigestPosts",
    event: "reddit:updated",
  },
  {
    id: "saved_posts",
    channel: "reddit:getSavedPosts",
    event: "reddit:updated",
  },
];
const server = await createServer({
  configFile: path.resolve("vite.renderer-browser.config.mts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0 },
});
let browser;
let scrolledWidgets = 0;
try {
  await server.listen();
  browser = await chromium.launch();
  for (const test of cases) {
    const page = await browser.newPage({
      viewport: { width: 1488, height: 1800 },
    });
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
    await page
      .locator(`[data-dashboard-tab-id="pn_dev_fixture_dashboard_${test.id}"]`)
      .click();
    const widgets = page.locator(
      `[data-widget-instance-id^="pn_dev_fixture_widget_${test.id}_"]`,
    );
    await widgets.first().waitFor();
    await page.waitForTimeout(800);
    await page.evaluate(({ channel, id }) => {
      const invoke = window.api.invoke.bind(window.api);
      window.fixtureMode = "unchanged";
      window.fixturePending = [];
      window.fixtureReads = 0;
      window.manualWeatherCalls = 0;
      window.api.invoke = async (name, ...args) => {
        if (name === "weather:refresh") window.manualWeatherCalls++;
        const result = await invoke(name, ...args);
        if (name !== channel) return result;
        window.fixtureReads++;
        if (window.fixtureMode === "pending")
          await new Promise((resolve) => window.fixturePending.push(resolve));
        if (window.fixtureMode !== "changed" || !result) return result;
        if (id === "weather")
          return { ...result, current: { ...result.current, temperature: 47 } };
        if (id === "astronomy")
          return {
            ...result,
            groups: {
              ...result.groups,
              moon: {
                ...result.groups.moon,
                data: { ...result.groups.moon.data, illuminationPercent: 17 },
              },
            },
          };
        if (id === "youtube")
          return result.map((item) => ({
            ...item,
            name: `${item.name} • Updated`,
          }));
        if (id === "reddit_digest")
          return result.map((item) => ({
            ...item,
            title: `${item.title} • Updated`,
          }));
        return {
          ...result,
          posts: result.posts.map((item) => ({
            ...item,
            title: `${item.title} • Updated`,
          })),
        };
      };
    }, test);
    const beforeLeaves = await widgets.evaluateAll((elements) =>
      elements.map((element) =>
        [...element.querySelectorAll("p, span")]
          .filter((node) => node.children.length === 0)
          .map((node) => node.textContent.trim())
          .filter((text) => text.length > 3),
      ),
    );
    await widgets.evaluateAll((elements) =>
      elements.forEach((element) => {
        element.__refreshControl = element.querySelector("button");
      }),
    );
    const focusButton = widgets
      .first()
      .locator("button:visible:enabled")
      .first();
    await focusButton.focus();
    const scrollCount = await widgets.evaluateAll(
      (elements) =>
        elements.filter((element) => {
          const node = [
            ...element.querySelectorAll("[data-radix-scroll-area-viewport]"),
          ].find(
            (node) =>
              node.scrollHeight > node.clientHeight + 2 ||
              node.scrollWidth > node.clientWidth + 2,
          );
          if (!node) return false;
          node.scrollTop = Math.min(20, node.scrollHeight - node.clientHeight);
          node.scrollLeft = Math.min(20, node.scrollWidth - node.clientWidth);
          element.__scrollLeft = node.scrollLeft;
          element.__scrollNode = node;
          element.__scrollPosition = node.scrollTop;
          return node.scrollTop > 0 || node.scrollLeft > 0;
        }).length,
    );
    scrolledWidgets += scrollCount;
    const sizes = await widgets.count();
    if (sizes !== 3)
      throw Error(`${test.id}: expected 3 widgets, got ${sizes}`);
    await page.evaluate(({ event }) => {
      window.fixtureMode = "pending";
      window.__rendererBrowserEmit(event, {});
    }, test);
    await page.waitForFunction(() => window.fixturePending.length >= 3);
    if (test.id === "weather") {
      if ((await focusButton.getAttribute("aria-disabled")) !== "true")
        throw Error("Weather refresh must be unavailable while pending");
      await page.keyboard.press("Enter");
      if ((await page.evaluate(() => window.manualWeatherCalls)) !== 0)
        throw Error("Pending weather refresh accepted duplicate activation");
    }
    const pendingStable = await widgets.evaluateAll((elements) =>
      elements.every(
        (element) =>
          !element.__refreshControl || element.__refreshControl.isConnected,
      ),
    );
    if (!pendingStable)
      throw Error(`${test.id}: content or controls replaced while pending`);
    await page.evaluate(() => {
      window.fixtureMode = "unchanged";
      for (const done of window.fixturePending.splice(0)) done();
    });
    await page.waitForTimeout(400);
    const unchanged = await widgets.allTextContents();
    const unchangedLeaves = await widgets.evaluateAll((elements) =>
      elements.map((element) =>
        [...element.querySelectorAll("p, span")]
          .filter((node) => node.children.length === 0)
          .map((node) => node.textContent.trim()),
      ),
    );
    for (let i = 0; i < 3; i++)
      if (!beforeLeaves[i].some((text) => unchangedLeaves[i].includes(text)))
        throw Error(`${test.id}: unchanged content not retained in size ${i}`);
    for (let i = 0; i < 3; i++)
      if (!unchanged[i].trim())
        throw Error(`${test.id}: empty unchanged content in size ${i}`);
    await page.evaluate(({ event }) => {
      window.fixtureMode = "changed";
      window.__rendererBrowserEmit(event, {});
    }, test);
    await page.waitForTimeout(500);
    if (
      !(await focusButton.evaluate((node) => document.activeElement === node))
    )
      throw Error(`${test.id}: focus lost on refresh`);
    if (
      !(await widgets.evaluateAll((elements) =>
        elements.every(
          (element) =>
            !element.__scrollNode ||
            (element.__scrollNode.isConnected &&
              element.__scrollNode.scrollTop === element.__scrollPosition &&
              element.__scrollNode.scrollLeft === element.__scrollLeft),
        ),
      ))
    )
      throw Error(`${test.id}: scroll position lost on refresh`);
    const changed = await widgets.allTextContents();

    for (let i = 0; i < 3; i++)
      if (unchanged[i] === changed[i])
        throw Error(`${test.id}: changed result not visible in size ${i}`);
    const marker =
      test.id === "weather"
        ? "47°C"
        : test.id === "astronomy"
          ? "17% illuminated"
          : "• Updated";
    for (let i = 0; i < 3; i++)
      if (!changed[i].includes(marker))
        throw Error(`${test.id}: changed value absent in size ${i}`);
    if (
      test.id === "weather" &&
      (!changed[1].includes("Synthetic wind advisory") ||
        !changed[2].includes("Synthetic wind advisory"))
    )
      throw Error("Weather advisory lost");
    console.log(
      `PASS ${test.id}: pending, unchanged, changed in small/medium/large; ${scrollCount} scroll positions`,
    );
    await page.close();
  }
  if (scrolledWidgets === 0) throw Error("No widget was actually scrolled");
} finally {
  await browser?.close();
  await server.close();
}
