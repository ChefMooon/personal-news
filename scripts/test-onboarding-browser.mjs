import path from "node:path";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = process.cwd();
const server = await createServer({
  configFile: path.join(root, "vite.renderer-browser.config.mts"),
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});
let browser;
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function openPage(url, scenario) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const browserScenario =
    scenario.onboardingRequired === true
      ? {
          ...scenario,
          settingsOverrides: {
            youtube_enabled: null,
            reddit_digest_enabled: null,
            saved_posts_enabled: null,
            sports_enabled: null,
            weather_enabled: null,
            ...scenario.settingsOverrides,
          },
        }
      : scenario;
  await context.addInitScript((scenarioValue) => {
    if (sessionStorage.getItem("__rendererBrowserScenario") === null) {
      sessionStorage.setItem(
        "__rendererBrowserScenario",
        JSON.stringify(scenarioValue),
      );
    }
  }, browserScenario);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await page.locator("[data-dashboard-tab-id]").first().waitFor();
  if (scenario.onboardingRequired === true) {
    await page.getByRole("switch", { name: "Use YouTube" }).waitFor();
  }
  return { context, page, errors };
}

async function assertClean(page, errors) {
  const apiErrors = await page.evaluate(() => [
    ...window.__rendererBrowserApiErrors,
  ]);
  assert(errors.length === 0, `Page errors: ${errors.join("; ")}`);
  assert(apiErrors.length === 0, `Browser API errors: ${apiErrors.join("; ")}`);
}

async function verifyWizardFlow(url) {
  const { context, page, errors } = await openPage(url, {
    onboardingRequired: true,
    onboardingCompletionFailures: 1,
    currentReleaseNotes: {
      version: "99.0.0",
      notes: { sections: [{ heading: "Added", items: ["Example item"] }] },
    },
    settingsOverrides: {
      reddit_digest_subreddits: "[]",
      ntfy_topic: "",
    },
    weatherLocations: [],
    sportsTeamsOverride: [],
    youtubeChannelsOverride: [],
  });
  try {
    const wizardDialog = page.getByRole("dialog", {
      name: "Welcome to Personal News",
    });
    await wizardDialog.waitFor();
    assert(
      (await page.getByRole("switch", { name: "Use YouTube" }).getAttribute(
        "aria-checked",
      )) === "false",
      "YouTube should be unchecked by default",
    );
    assert(
      (await page
        .getByRole("switch", { name: "Use Saved Posts" })
        .getAttribute("aria-checked")) === "false",
      "Saved Posts should be unchecked by default",
    );
    for (const name of ["Reddit Digest", "Sports", "Weather", "Astronomy"]) {
      assert(
        (await page
          .getByRole("switch", { name: `Use ${name}` })
          .getAttribute("aria-checked")) === "true",
        `${name} should be checked by default`,
      );
    }
    assert(
      (await page.getByText("Needs setup", { exact: true }).count()) === 2,
      "Only YouTube and Saved Posts should show Needs setup",
    );
    assert(
      (await page.getByText("Scripts", { exact: true }).count()) === 0,
      "Scripts must not appear in the feature picker",
    );
    await page.keyboard.press("Escape");
    await page.mouse.click(10, 10);
    await wizardDialog.waitFor();

    await page.getByRole("switch", { name: "Use YouTube" }).click();
    await page.getByRole("switch", { name: "Use Saved Posts" }).click();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("heading", { name: "Where are you?" }).waitFor();
    await page
      .getByText("Weather and Astronomy use this location.", { exact: true })
      .waitFor();
    await page.getByLabel("Search for a city").fill("Testville");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("Testville, Test County, Testland", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("region", { name: "Saved locations" })
      .getByText("Testville, Test County, Testland", { exact: true })
      .waitFor();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Search for a team").fill("Tigers");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("Testville Tigers", { exact: true }).waitFor();
    await page.getByRole("region", { name: "Team search results" })
      .getByRole("button", { name: "Add", exact: true })
      .click();
    await page.getByRole("region", { name: "Added teams" })
      .getByText("Testville Tigers", { exact: false })
      .waitFor();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("Add a subreddit").fill("r/News_Test");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByText("r/news_test", { exact: true }).waitFor();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();

    await page.getByLabel("YouTube Data API key").fill("test-api-key");
    await page.getByRole("button", { name: "Save key" }).click();
    await page
      .getByLabel("Add a channel (URL, handle, or ID)")
      .waitFor();
    await page
      .getByLabel("Add a channel (URL, handle, or ID)")
      .fill("@testchannel");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("region", { name: "YouTube channels" })
      .getByText("Test Channel", { exact: true })
      .waitFor();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("button", { name: "Set up now" }).waitFor();
    await page.getByRole("button", { name: "Later", exact: true }).waitFor();
    await page.getByRole("button", { name: "Set up now" }).click();
    const ntfyDialog = page.getByRole("dialog", {
      name: "Set Up Mobile Post Saving",
    });
    await ntfyDialog.waitFor();
    await ntfyDialog.getByRole("button", { name: "Next →" }).click();
    await ntfyDialog.getByRole("button", { name: "Next →" }).click();
    await ntfyDialog.getByRole("button", { name: "Skip Test" }).click();
    await ntfyDialog.getByRole("button", { name: "Done" }).click();
    await ntfyDialog.waitFor({ state: "hidden" });
    await page.getByText("ntfy topic saved", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Later", exact: true }).click();

    await page.getByRole("heading", { name: "You're all set" }).waitFor();
    const readySection = page.locator(
      'section[aria-labelledby="onboarding-ready-heading"]',
    );
    const readyText = await readySection.innerText();
    for (const feature of [
      "Weather",
      "Astronomy",
      "Sports",
      "Reddit Digest",
      "YouTube",
      "Saved Posts",
    ]) {
      assert(
        readyText.includes(feature),
        `${feature} should be ready after its setup step; got: ${readyText}`,
      );
    }

    await page.getByRole("button", { name: "What's in this version" }).click();
    const whatsNewDialog = page.getByRole("dialog", {
      name: "What's new in 99.0.0",
    });
    await whatsNewDialog.getByText("Example item").waitFor();
    await whatsNewDialog.getByRole("button", { name: "Got it" }).click();
    await whatsNewDialog.waitFor({ state: "hidden" });
    await wizardDialog.waitFor();
    assert(
      (await page.getByRole("button", { name: "Finish" }).count()) === 1,
      "Closing release notes must leave the wizard open",
    );
    assert(
      (await page.evaluate(() =>
        window.__rendererBrowserCalls.some(
          (call) =>
            call.kind === "invoke" &&
            call.channel === "updates:acknowledgeWhatsNew",
        ),
      )) === false,
      "Opening wizard release notes must not acknowledge the release",
    );
    const setupCalls = await page.evaluate(() => [
      ...window.__rendererBrowserCalls,
    ]);
    assert(
      setupCalls.some(
        (call) =>
          call.channel === "reddit:validateDigestSubreddit" &&
          call.args[0] === "news_test",
      ),
      "Reddit setup did not validate the normalized subreddit",
    );
    assert(
      setupCalls.some(
        (call) =>
          call.channel === "settings:set" &&
          call.args[0] === "reddit_digest_subreddits" &&
          call.args[1] === '["news_test"]',
      ),
      "Reddit setup did not persist the normalized subreddit list",
    );
    assert(
      !setupCalls.some(
        (call) => call.channel === "reddit:syncDigestSubreddits",
      ),
      "Onboarding must not invoke an immediate Reddit Digest sync",
    );

    const featureSetCallsBeforeFinish = await page.evaluate(() =>
      window.__rendererBrowserCalls.filter(
        (call) =>
          call.kind === "invoke" &&
          ((call.channel === "settings:set" &&
            [
              "youtube_enabled",
              "reddit_digest_enabled",
              "saved_posts_enabled",
              "sports_enabled",
              "weather_enabled",
            ].includes(call.args[0])) ||
            call.channel === "astronomy:setSettings"),
      ),
    );
    assert(
      featureSetCallsBeforeFinish
        .map((call) =>
          call.channel === "astronomy:setSettings"
            ? `astronomy:${call.args[0]?.enabled}`
            : `${call.args[0]}:${call.args[1]}`,
        )
        .join(",") ===
        "youtube_enabled:true,reddit_digest_enabled:true,saved_posts_enabled:true,sports_enabled:true,weather_enabled:true,astronomy:true",
      `Feature values were not applied in manifest order: ${JSON.stringify(featureSetCallsBeforeFinish)}`,
    );

    await page.getByRole("button", { name: "Finish" }).click();
    await page.getByText("Unable to complete onboarding.").waitFor();
    await wizardDialog.waitFor();
    await page.getByRole("button", { name: "Finish" }).click();
    await wizardDialog.waitFor({ state: "hidden" });
    const calls = await page.evaluate(() =>
      window.__rendererBrowserCalls.filter(
        (call) =>
          call.kind === "invoke" &&
          call.channel === "settings:completeOnboarding",
      ),
    );
    assert(calls.length === 2, `Expected completion retry, got ${calls.length} calls`);
    await page.reload();
    await page.locator("[data-dashboard-tab-id]").first().waitFor();
    await page.waitForTimeout(150);
    assert(
      (await page.getByRole("dialog").count()) === 0,
      "Wizard reappeared after onboarding completion and reload",
    );
    await assertClean(page, errors);
  } finally {
    await context.close();
  }
}

async function verifySkipSetup(url) {
  const { context, page, errors } = await openPage(url, {
    onboardingRequired: true,
  });
  try {
    await page
      .getByRole("dialog", { name: "Welcome to Personal News" })
      .waitFor();
    await page.getByRole("button", { name: "Skip setup" }).click();
    await page
      .getByRole("dialog", { name: "Welcome to Personal News" })
      .waitFor({ state: "hidden" });
    const calls = await page.evaluate(() =>
      window.__rendererBrowserCalls.filter(
        (call) =>
          call.kind === "invoke" &&
          call.channel === "settings:set" &&
          ["youtube_enabled", "saved_posts_enabled"].includes(call.args[0]),
      ),
    );
    assert(
      calls.some(
        (call) =>
          call.args[0] === "youtube_enabled" && call.args[1] === "false",
      ),
      "Skip setup must persist the YouTube default as disabled",
    );
    assert(
      calls.some(
        (call) =>
          call.args[0] === "saved_posts_enabled" && call.args[1] === "false",
      ),
      "Skip setup must persist the Saved Posts default as disabled",
    );
    assert(
      (await page.evaluate(() =>
        window.__rendererBrowserCalls.some(
          (call) =>
            call.kind === "invoke" &&
            call.channel === "settings:completeOnboarding",
        ),
      )) === true,
      "Skip setup must complete onboarding",
    );
    await page.reload();
    await page.locator("[data-dashboard-tab-id]").first().waitFor();
    await page.waitForTimeout(150);
    assert(
      (await page.getByRole("dialog").count()) === 0,
      "Wizard reappeared after Skip setup and reload",
    );
    await assertClean(page, errors);
  } finally {
    await context.close();
  }
}

async function verifyAstronomyOnlyLocationCopy(url) {
  const { context, page, errors } = await openPage(url, {
    onboardingRequired: true,
    weatherLocations: [],
  });
  try {
    const wizardDialog = page.getByRole("dialog", {
      name: "Welcome to Personal News",
    });
    await wizardDialog.waitFor();
    for (const name of ["Weather", "Sports", "Reddit Digest"]) {
      await page.getByRole("switch", { name: `Use ${name}` }).click();
    }
    await wizardDialog.getByRole("button", { name: "Continue" }).click();

    await page
      .getByRole("heading", { name: "Pick a location for Astronomy" })
      .waitFor();
    await page
      .getByText(
        "Astronomy uses saved Weather locations. This saves one even though Weather is off.",
        { exact: true },
      )
      .waitFor();
    assert(
      (await page.getByRole("heading", { name: "Where are you?" }).count()) ===
        0,
      "Astronomy-only selection showed the Weather location heading",
    );
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByRole("heading", { name: "You're all set" }).waitFor();
    await page
      .locator('section[aria-labelledby="onboarding-needs-setup-heading"]')
      .getByText("Astronomy — Finish in Settings → Astronomy", {
        exact: true,
      })
      .waitFor();
    await page.getByRole("button", { name: "Finish" }).click();
    await wizardDialog.waitFor({ state: "hidden" });
    await assertClean(page, errors);
  } finally {
    await context.close();
  }
}

async function verifySkippedDetailsAndEmptyStates(url) {
  const { context, page, errors } = await openPage(url, {
    onboardingRequired: true,
    currentReleaseNotes: null,
    settingsOverrides: {
      reddit_digest_subreddits: "[]",
    },
    weatherLocations: [],
    sportsTeamsOverride: [],
  });
  try {
    const wizardDialog = page.getByRole("dialog", {
      name: "Welcome to Personal News",
    });
    await wizardDialog.waitFor();
    await page.getByRole("switch", { name: "Use YouTube" }).click();
    await page.getByRole("switch", { name: "Use Saved Posts" }).click();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();

    await page.getByRole("heading", { name: "Where are you?" }).waitFor();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByLabel("Search for a team").waitFor();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByLabel("Add a subreddit").waitFor();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByLabel("YouTube Data API key").waitFor();
    await page.getByRole("button", { name: "Skip for now" }).click();
    await page.getByRole("button", { name: "Set up now" }).waitFor();
    await page.getByRole("button", { name: "Later", exact: true }).click();

    await page.getByRole("heading", { name: "You're all set" }).waitFor();
    const needsSetupSection = page.locator(
      'section[aria-labelledby="onboarding-needs-setup-heading"]',
    );
    const needsSetupText = await needsSetupSection.innerText();
    for (const feature of [
      "Weather",
      "Astronomy",
      "Sports",
      "Reddit Digest",
      "YouTube",
      "Saved Posts",
    ]) {
      assert(
        needsSetupText.includes(feature),
        `${feature} was not listed under Needs setup after skipping: ${needsSetupText}`,
      );
    }
    await page.getByRole("button", { name: "Finish" }).click();
    await wizardDialog.waitFor({ state: "hidden" });

    const youtubeTab = page.locator(
      '[data-dashboard-tab-id="pn_dev_fixture_dashboard_youtube"]',
    );
    const redditTab = page.locator(
      '[data-dashboard-tab-id="pn_dev_fixture_dashboard_reddit_digest"]',
    );
    const youtubeFixture = await page.evaluate(
      () => window.__rendererBrowserFixtures.evidence.youtube[0],
    );
    const redditFixture = await page.evaluate(
      () => window.__rendererBrowserFixtures.evidence.reddit_digest[0],
    );
    await youtubeTab.click();
    await page.getByText(youtubeFixture, { exact: true }).first().waitFor();
    await redditTab.click();
    await page.getByText(redditFixture, { exact: true }).first().waitFor();

    await page.evaluate(() => {
      const invoke = window.api.invoke.bind(window.api);
      window.api.invoke = (channel, ...args) => {
        if (channel === "youtube:getChannels") return Promise.resolve([]);
        if (channel === "reddit:getDigestPosts") return Promise.resolve([]);
        if (
          channel === "settings:get" &&
          args[0] === "reddit_digest_subreddits"
        ) {
          return Promise.resolve("[]");
        }
        return invoke(channel, ...args);
      };
    });

    await youtubeTab.click();
    await page.evaluate(() => window.__rendererBrowserEmit("youtube:updated"));
    await page
      .getByText(
        "Finish YouTube setup: add your API key and channels in Settings → YouTube.",
        { exact: true },
      )
      .first()
      .waitFor();
    await redditTab.click();
    await page.evaluate(() => window.__rendererBrowserEmit("reddit:updated"));
    await page
      .getByText(
        "Finish Reddit Digest setup: add subreddits in Settings → Reddit Digest.",
        { exact: true },
      )
      .first()
      .waitFor();

    const calls = await page.evaluate(() => [
      ...window.__rendererBrowserCalls,
    ]);
    assert(
      !calls.some(
        (call) =>
          call.kind === "invoke" &&
          call.channel === "reddit:syncDigestSubreddits",
      ),
      "Skipping onboarding steps must not invoke an immediate Reddit Digest sync",
    );
    await assertClean(page, errors);
  } finally {
    await context.close();
  }
}

async function verifyDefaultSelectionSummary(url) {
  const { context, page, errors } = await openPage(url, {
    onboardingRequired: true,
    currentReleaseNotes: null,
    weatherLocations: [{ id: "test-location" }],
    settingsOverrides: {
      reddit_digest_subreddits: "[]",
    },
  });
  try {
    const wizardDialog = page.getByRole("dialog", {
      name: "Welcome to Personal News",
    });
    await wizardDialog.waitFor();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Where are you?" }).waitFor();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Search for a team").waitFor();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Add a subreddit").waitFor();
    await page.getByRole("button", { name: "Skip for now" }).click();

    await page.getByRole("heading", { name: "You're all set" }).waitFor();
    const readySection = page.locator(
      'section[aria-labelledby="onboarding-ready-heading"]',
    );
    const needsSetupSection = page.locator(
      'section[aria-labelledby="onboarding-needs-setup-heading"]',
    );
    const offSection = page.locator(
      'section[aria-labelledby="onboarding-off-heading"]',
    );
    const readyText = await readySection.innerText();
    assert(
      readyText.includes("Weather"),
      `Weather should be ready with a saved location; got: ${readyText}`,
    );
    await needsSetupSection
      .getByText("Reddit Digest — Finish in Settings → Reddit Digest", {
        exact: true,
      })
      .waitFor();
    const offText = await offSection.innerText();
    assert(
      offText.includes("YouTube") && offText.includes("Saved Posts"),
      `Off features were not listed: ${offText}`,
    );
    assert(
      (await page.getByRole("button", { name: "What's in this version" }).count()) ===
        0,
      "The release-notes button must be hidden when notes are null",
    );

    await page.setViewportSize({ width: 900, height: 600 });
    const finishButton = page.getByRole("button", { name: "Finish" });
    const finishButtonRect = await finishButton.evaluate((element) => {
      const { top, bottom } = element.getBoundingClientRect();
      return { top, bottom, viewportHeight: window.innerHeight };
    });
    assert(
      finishButtonRect.top >= 0 &&
        finishButtonRect.bottom <= finishButtonRect.viewportHeight,
      "Finish button is clipped at the 900x600 viewport",
    );
    await finishButton.click();
    await wizardDialog.waitFor({ state: "hidden" });
    await assertClean(page, errors);
  } finally {
    await context.close();
  }
}

async function verifyInterruptedWizardResumesSelection(url) {
  const { context, page, errors } = await openPage(url, {
    onboardingRequired: true,
    currentReleaseNotes: null,
    weatherLocations: [],
    settingsOverrides: {
      reddit_digest_subreddits: "[]",
      ntfy_topic: "",
    },
  });
  try {
    const wizardDialog = page.getByRole("dialog", {
      name: "Welcome to Personal News",
    });
    await page.getByRole("switch", { name: "Use YouTube" }).click();
    await page.getByRole("switch", { name: "Use Sports" }).click();
    await wizardDialog.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("heading", { name: "Where are you?" }).waitFor();

    const savedSelection = await page.evaluate(async () => {
      const keys = [
        "youtube_enabled",
        "reddit_digest_enabled",
        "saved_posts_enabled",
        "sports_enabled",
        "weather_enabled",
      ];
      const settings = Object.fromEntries(
        await Promise.all(
          keys.map(async (key) => [
            key,
            await window.api.invoke("settings:get", key),
          ]),
        ),
      );
      const astronomy = await window.api.invoke("astronomy:getSettings");
      const scenario = JSON.parse(
        sessionStorage.getItem("__rendererBrowserScenario") ?? "{}",
      );
      scenario.settingsOverrides = {
        ...scenario.settingsOverrides,
        ...settings,
      };
      scenario.astronomyEnabled = astronomy.enabled;
      sessionStorage.setItem(
        "__rendererBrowserScenario",
        JSON.stringify(scenario),
      );
      return { settings, astronomy };
    });
    assert(
      savedSelection.settings.youtube_enabled === "true" &&
        savedSelection.settings.sports_enabled === "false",
      "Leaving Pick did not persist the selected feature flags",
    );
    assert(
      (await page.evaluate(() =>
        window.__rendererBrowserCalls.some(
          (call) =>
            call.kind === "invoke" &&
            call.channel === "settings:completeOnboarding",
        ),
      )) === false,
      "Continuing from Pick must not complete onboarding",
    );

    await page.reload();
    await page.locator("[data-dashboard-tab-id]").first().waitFor();
    await wizardDialog.waitFor();
    await page.getByRole("switch", { name: "Use YouTube" }).waitFor();
    for (const [feature, expectedEnabled] of [
      ["YouTube", true],
      ["Reddit Digest", true],
      ["Saved Posts", false],
      ["Sports", false],
      ["Weather", true],
      ["Astronomy", true],
    ]) {
      assert(
        (await page
          .getByRole("switch", { name: `Use ${feature}` })
          .getAttribute("aria-checked")) === String(expectedEnabled),
        `${feature} selection was not restored after reloading`,
      );
    }
    assert(
      (await page.evaluate(() =>
        window.__rendererBrowserCalls.some(
          (call) =>
            call.kind === "invoke" &&
            call.channel === "settings:completeOnboarding",
        ),
      )) === false,
      "Reloading an incomplete wizard must not complete onboarding",
    );

    await wizardDialog.getByRole("button", { name: "Skip setup" }).click();
    await wizardDialog.waitFor({ state: "hidden" });
    const completedState = await page.evaluate(() =>
      window.api.invoke("settings:getOnboardingState"),
    );
    assert(
      completedState.required === false,
      "Skip setup should complete onboarding",
    );
    for (const [key, expected] of [
      ["youtube_enabled", "true"],
      ["reddit_digest_enabled", "true"],
      ["saved_posts_enabled", "false"],
      ["sports_enabled", "false"],
      ["weather_enabled", "true"],
    ]) {
      const actual = await page.evaluate(
        (settingKey) => window.api.invoke("settings:get", settingKey),
        key,
      );
      assert(
        actual === expected,
        `Skip setup overwrote the resumed ${key} selection: got ${actual}`,
      );
    }
    const astronomySettings = await page.evaluate(() =>
      window.api.invoke("astronomy:getSettings"),
    );
    assert(
      astronomySettings.enabled === true,
      "Skip setup overwrote the resumed Astronomy selection",
    );
    await assertClean(page, errors);
  } finally {
    await context.close();
  }
}

async function verifyNoWizardByDefault(url) {
  const { context, page, errors } = await openPage(url, {});
  try {
    await page.waitForTimeout(150);
    assert(
      (await page.getByRole("dialog").count()) === 0,
      "Wizard appeared without onboardingRequired opt-in",
    );
    await assertClean(page, errors);
  } finally {
    await context.close();
  }
}

try {
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  for (const [name, run] of [
    [
      "detailed setup flows, Saved Posts dialog, release notes and finish retry",
      verifyWizardFlow,
    ],
    ["skip setup persists defaults and completes", verifySkipSetup],
    ["Astronomy-only location guidance", verifyAstronomyOnlyLocationCopy],
    [
      "skippable detail steps and widget finish-setup empty states",
      verifySkippedDetailsAndEmptyStates,
    ],
    [
      "default selection readiness groups and missing release notes",
      verifyDefaultSelectionSummary,
    ],
    [
      "interrupted wizard reloads and resumes its saved feature selection",
      verifyInterruptedWizardResumesSelection,
    ],
    ["wizard disabled by default", verifyNoWizardByDefault],
  ]) {
    try {
      await run(url);
      results.push({ name, ok: true });
      console.log(`PASS ${name}`);
    } catch (error) {
      results.push({ name, ok: false, error: error.message });
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
  const failed = results.filter((result) => !result.ok);
  console.log(`${results.length - failed.length}/${results.length} onboarding browser scenarios passed`);
  if (failed.length > 0) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
