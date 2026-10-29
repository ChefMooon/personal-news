import { runElectronHarness } from "./electron-playwright-harness.mjs";
import path from "node:path";
import { writeFile } from "node:fs/promises";

const IPC = {
  devTestDataStatus: "devTestData:getStatus",
  redditDigest: "reddit:getDigestPosts",
  savedPosts: "reddit:getSavedPosts",
  weatherLocations: "weather:getLocations",
  weatherSnapshot: "weather:getSnapshot",
  sportsTeams: "sports:getTrackedTeams",
  sportsTeamEvents: "sports:getTeamEvents",
  sportsTodayEvents: "sports:getTodayEvents",
  sportsEventDetails: "sports:getEventDetails",
  youtubeChannels: "youtube:getChannels",
  youtubeVideos: "youtube:getVideos",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
  dashboardGet: "settings:getDashboardViews",
  dashboardSet: "settings:setDashboardViews",
};

const youtubeChannelIds = [
  "pn_dev_fixture_youtube_channel",
  "pn_dev_fixture_youtube_channel_2",
  "pn_dev_fixture_youtube_channel_3",
  "pn_dev_fixture_youtube_channel_4",
];

const fixtures = {
  digest: [
    ...Array.from(
      { length: 10 },
      (_, index) =>
        `pn_dev_fixture_digest_${String(index + 1).padStart(2, "0")}`,
    ),
  ],
  savedPosts: [
    "pn_dev_fixture_saved_read",
    "pn_dev_fixture_saved_unread",
    "pn_dev_fixture_saved_research",
    "pn_dev_fixture_saved_discussion",
    "pn_dev_fixture_saved_inspiration",
    "pn_dev_fixture_saved_reference",
  ],
  weather: "pn_dev_fixture_weather_location",
  sportsTeams: [
    "pn_dev_fixture_sports_home",
    "pn_dev_fixture_sports_away",
    "pn_dev_fixture_sports_basketball_home",
    "pn_dev_fixture_sports_basketball_away",
  ],
  basketballEvent: "pn_dev_fixture_sports_basketball_live",
  youtubeChannels: youtubeChannelIds,
  youtubeVideos: Array.from(
    { length: 30 },
    (_, index) =>
      `${youtubeChannelIds[index < 15 ? 0 : 1 + Math.floor((index - 15) / 5)]}_video_${String(index < 15 ? index + 1 : ((index - 15) % 5) + 1).padStart(2, "0")}`,
  ),
};

async function invoke(page, channel, ...args) {
  return page.evaluate(
    ({ channelName, callArgs }) => window.api.invoke(channelName, ...callArgs),
    { channelName: channel, callArgs: args },
  );
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function readSurfaces(page) {
  const [digest, savedPosts, locations, teams, channels, youtubeChannels] =
    await Promise.all([
      invoke(page, IPC.redditDigest),
      invoke(page, IPC.savedPosts),
      invoke(page, IPC.weatherLocations),
      invoke(page, IPC.sportsTeams),
      invoke(page, IPC.youtubeChannels),
      Promise.all(
        fixtures.youtubeChannels.map((channelId) =>
          invoke(page, IPC.youtubeVideos, channelId),
        ),
      ),
    ]);
  const youtubeVideos = youtubeChannels.flat();
  const fixtureLocation = locations.find(
    (location) => location.id === fixtures.weather,
  );
  const weather = fixtureLocation
    ? await invoke(page, IPC.weatherSnapshot, fixtures.weather)
    : null;
  const sportsEvents = await invoke(page, IPC.sportsTeamEvents, {
    teamId: fixtures.sportsTeams[0],
  });
  const basketballEvents = await invoke(page, IPC.sportsTeamEvents, {
    teamId: fixtures.sportsTeams[2],
  });
  const basketballToday = await invoke(page, IPC.sportsTodayEvents, {
    sport: "Basketball",
  });
  const basketballDetails = await invoke(page, IPC.sportsEventDetails, {
    eventId: fixtures.basketballEvent,
  });
  const astronomy = fixtureLocation
    ? await invoke(page, "astronomy:getSnapshot", fixtures.weather)
    : null;
  return {
    digest,
    savedPosts,
    locations,
    weather,
    teams,
    channels,
    sportsEvents,
    basketballEvents,
    basketballToday,
    basketballDetails,
    youtubeVideos,
    youtubeChannels,
    astronomy,
  };
}

function assertSeededSurfaces(surfaces) {
  assert(
    surfaces.digest.filter((post) => fixtures.digest.includes(post.post_id))
      .length === 10 &&
      fixtures.digest.every((id) =>
        surfaces.digest.some((post) => post.post_id === id),
      ),
    "Reddit Digest fixture posts were not readable",
  );
  assert(
    fixtures.savedPosts.every((id) =>
      surfaces.savedPosts.posts.some((post) => post.post_id === id),
    ),
    "Saved Posts fixture records were not readable",
  );
  assert(
    surfaces.savedPosts.posts
      .filter((post) => fixtures.savedPosts.includes(post.post_id))
      .every((post) => typeof post.note === "string" && post.note.trim()),
    "A Saved Posts fixture record is missing its note",
  );
  assert(
    surfaces.weather?.location?.id === fixtures.weather,
    "Weather fixture snapshot was not readable",
  );
  assert(
    fixtures.sportsTeams.every((id) =>
      surfaces.teams.some((team) => team.teamId === id),
    ) &&
      [...surfaces.sportsEvents.last, ...surfaces.sportsEvents.next].length > 0,
    "Sports fixture teams and events were not readable",
  );
  assert(
    surfaces.basketballToday.some(
      (event) =>
        event.eventId === fixtures.basketballEvent &&
        event.sport === "Basketball" &&
        event.status === "LIVE" &&
        event.homeScore === "62" &&
        event.awayScore === "58",
    ) &&
      surfaces.basketballDetails?.progress === "End of 3rd quarter" &&
      surfaces.basketballDetails?.descriptionEN.includes("Basketball"),
    "Basketball fixture game and quarter detail were not readable",
  );
  assert(
    surfaces.youtubeVideos.length === 30 &&
      fixtures.youtubeVideos.every((id) =>
        surfaces.youtubeVideos.some((video) => video.video_id === id),
      ) &&
      surfaces.youtubeChannels.every(
        (videos, index) => videos.length === (index === 0 ? 15 : 5),
      ),
    "YouTube fixture set did not contain 15 videos and three additional 5-video channels",
  );
  assert(
    fixtures.youtubeChannels.every((channelId) =>
      surfaces.channels.some((channel) => channel.channel_id === channelId),
    ),
    "YouTube fixture channels were not readable",
  );
}

function assertFixturesCleared(surfaces) {
  assert(
    !surfaces.digest.some((post) => fixtures.digest.includes(post.post_id)),
    "Reddit Digest fixture records remained after clear",
  );
  assert(
    !surfaces.savedPosts.posts.some((post) =>
      fixtures.savedPosts.includes(post.post_id),
    ),
    "Saved Posts fixture records remained after clear",
  );
  assert(
    !surfaces.locations.some((location) => location.id === fixtures.weather),
    "Weather fixture location remained after clear",
  );
  assert(
    !surfaces.teams.some((team) => fixtures.sportsTeams.includes(team.teamId)),
    "Sports fixture teams remained after clear",
  );
  assert(
    !surfaces.basketballToday.some(
      (event) => event.eventId === fixtures.basketballEvent,
    ) && !surfaces.basketballDetails,
    "Basketball fixture game remained after clear",
  );
  assert(
    !surfaces.youtubeVideos.some((video) =>
      fixtures.youtubeVideos.includes(video.video_id),
    ),
    "YouTube fixture videos remained after clear",
  );
  assert(
    !surfaces.channels.some((channel) =>
      fixtures.youtubeChannels.includes(channel.channel_id),
    ),
    "YouTube fixture channels remained after clear",
  );
}

const presetModules = [
  "youtube",
  "reddit_digest",
  "saved_posts",
  "sports",
  "weather",
  "astronomy",
];
const usage = `Usage: npm run test:local-test-data [-- --widget <moduleId>]

Available widget IDs: ${presetModules.join(", ")}
Use --help to show this message.`;

function parseArguments(args) {
  let widget = null;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") {
      return { help: true, widget: null };
    }
    if (argument !== "--widget") {
      return { error: `Unknown argument: ${argument}` };
    }
    if (widget !== null) {
      return { error: "Pass --widget only once." };
    }

    const moduleId = args[index + 1];
    if (!moduleId || moduleId.startsWith("--")) {
      return { error: "--widget requires a module ID." };
    }
    if (!presetModules.includes(moduleId)) {
      return {
        error: `Unknown widget ID "${moduleId}". Available IDs: ${presetModules.join(", ")}.`,
      };
    }
    widget = moduleId;
    index += 1;
  }

  return { help: false, widget };
}

const sizes = ["small", "medium", "large"];
const isFixture = (id) => id.startsWith("pn_dev_fixture_");
const viewId = (moduleId) => `pn_dev_fixture_dashboard_${moduleId}`;
const instanceId = (moduleId, size) =>
  `pn_dev_fixture_widget_${moduleId}_${size}`;
const configKey = (moduleId, size) =>
  `${moduleId}_view_config:${instanceId(moduleId, size)}`;
const legacySportsConfig = {
  sport: "Baseball",
  viewMode: "detailed",
  showVenue: true,
  showTime: true,
  showLiveStartTime: true,
};
const sportsDefaultsMigrationKey =
  "dev_test_data_sports_defaults_migration_version";

async function assertBasketballWidgets(page) {
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("tab", { name: "Sports", exact: true }).click();
  for (const size of sizes) {
    const label = `Sports ${size[0].toUpperCase()}${size.slice(1)}`;
    const widget = page
      .getByText(label, { exact: true })
      .locator("xpath=ancestor::*[@data-widget-instance-id]");
    assert(
      (await widget
        .getByRole("button", { name: "Toggle mock live game" })
        .count()) === 0,
      `${label} still exposes the mock live game toggle`,
    );
    assert(
      (await widget.getByText(/mock/i).count()) === 0,
      `${label} still exposes mock data information`,
    );
    await widget
      .getByRole("button", {
        name: "Show Fixture Pilots at Fixture Foxes",
        exact: true,
      })
      .click();
    for (const text of ["Fixture Pilots", "Fixture Foxes", "LIVE", "62", "58"])
      await widget.getByText(text, { exact: true }).first().waitFor();
    for (const score of ["62", "58"])
      assert(
        await widget.getByText(score, { exact: true }).first().isVisible(),
        `${label} did not visibly render the Basketball live score ${score}`,
      );
  }
}

async function openSettings(page) {
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page
    .getByRole("heading", { name: "Developer Test Data", exact: true })
    .waitFor();
}

async function waitForIdleAction(page, name) {
  await page.getByRole("button", { name, exact: true }).waitFor();
  await page.waitForFunction(
    (buttonName) =>
      [...document.querySelectorAll("button")].some(
        (button) =>
          button.textContent.trim() === buttonName && !button.disabled,
      ),
    name,
  );
}

function assertPresetState(state, moduleIds = presetModules) {
  const ids = [];
  for (const moduleId of moduleIds) {
    const view = state.views[viewId(moduleId)];
    assert(
      view && state.view_order.includes(view.id),
      `Missing fixture dashboard: ${moduleId}`,
    );
    assert(
      view.layout.widget_order.length === 3,
      `${moduleId} did not have all three sizes`,
    );
    for (const size of sizes) {
      const id = instanceId(moduleId, size);
      const instance = view.layout.widget_instances[id];
      assert(
        instance?.size === size && instance.moduleId === moduleId,
        `Invalid fixture instance: ${id}`,
      );
      assert(
        instance.label.endsWith(` ${size[0].toUpperCase()}${size.slice(1)}`),
        `Missing size label: ${id}`,
      );
      ids.push(id);
    }
  }
  assert(
    new Set(ids).size === moduleIds.length * sizes.length,
    "Fixture widget IDs were not globally unique",
  );
}

async function inspectPresetMatrix(
  page,
  artifacts,
  record,
  state,
  surfaces,
  moduleIds = presetModules,
) {
  await page.setViewportSize({ width: 1600, height: 1100 });
  const anyTitle = (posts) =>
    new RegExp(
      `^(?:${posts.map((post) => post.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`,
    );
  const values = {
    youtube: surfaces.channels.find(
      (channel) => channel.channel_id === fixtures.youtubeChannels[0],
    ).name,
    reddit_digest: anyTitle(
      surfaces.digest.filter((post) => fixtures.digest.includes(post.post_id)),
    ),
    saved_posts: surfaces.savedPosts.posts.find(
      (post) => post.post_id === fixtures.savedPosts[0],
    ).title,
    sports: surfaces.teams.find(
      (team) => team.teamId === fixtures.sportsTeams[0],
    ).name,
    weather: [
      surfaces.weather.location.name,
      surfaces.weather.location.admin1,
      surfaces.weather.location.country,
    ]
      .filter(Boolean)
      .join(", "),
    astronomy: new RegExp(
      `${Math.round(surfaces.astronomy.groups.moon.data.illuminationPercent)}%`,
    ),
  };
  const measurements = [];
  for (const projection of [
    { columns: 12, width: 1240 },
    { columns: 8, width: 1040 },
    { columns: 4, width: 840 },
    { columns: 1, width: 620 },
  ]) {
    for (const moduleId of moduleIds) {
      const view = state.views[viewId(moduleId)];
      await page.getByRole("tab", { name: view.name, exact: true }).click();
      await page
        .getByText(
          view.layout.widget_instances[instanceId(moduleId, "small")].label,
          { exact: true },
        )
        .waitFor();
      const initialWidth = await page
        .locator(".dashboard-grid")
        .evaluate((grid) => grid.getBoundingClientRect().width);
      const viewport = page.viewportSize() ?? { width: 1600, height: 1100 };
      await page.setViewportSize({
        width: Math.round(viewport.width + projection.width - initialWidth),
        height: 1100,
      });
      // Inner-main scrollbars can change available width after its height changes.
      await page.waitForFunction(
        (targetWidth) =>
          Math.abs(
            document.querySelector(".dashboard-grid")?.getBoundingClientRect()
              .width - targetWidth,
          ) < 20,
        projection.width,
      );
      await page.waitForFunction(() => {
        const grid = document.querySelector(".dashboard-grid");
        const rect = grid?.getBoundingClientRect();
        return (
          rect &&
          [...grid.querySelectorAll("[data-widget-instance-id]")].every(
            (widget) => {
              const box = widget.getBoundingClientRect();
              return box.x >= rect.x - 2 && box.right <= rect.right + 2;
            },
          )
        );
      });
      for (const size of sizes) {
        const label =
          view.layout.widget_instances[instanceId(moduleId, size)].label;
        const widget = page
          .getByText(label, { exact: true })
          .locator("xpath=ancestor::*[@data-widget-instance-id]");
        await widget
          .getByText(values[moduleId], {
            exact: typeof values[moduleId] === "string",
          })
          .first()
          .waitFor();
        assert(
          await widget
            .getByText(values[moduleId], {
              exact: typeof values[moduleId] === "string",
            })
            .first()
            .isVisible(),
          `${label} did not visibly render fixture content`,
        );
        assert(
          (await widget
            .getByText(
              /Loading (astronomy|weather)|Something went wrong|No cached astronomy data|No weather data cached/,
            )
            .count()) === 0,
          `${label} remained empty/loading/error`,
        );
        if (moduleId === "weather") {
          const initialGeometry = await widget.evaluate((root) => {
            const preview = root.querySelector(".weather-card-preview");
            const content = preview?.parentElement?.parentElement;
            const finalSection = [...root.querySelectorAll("section")].at(-1);
            const previewRect = preview?.getBoundingClientRect();
            const contentRect = content?.getBoundingClientRect();
            const paddingBottom = content
              ? Number.parseFloat(getComputedStyle(content).paddingBottom)
              : 0;
            const viewports = [
              ...root.querySelectorAll("[data-weather-vertical-viewport]"),
            ].map((element) => ({
              className: element.className,
              clientHeight: element.clientHeight,
              scrollHeight: element.scrollHeight,
              scrollTop: element.scrollTop,
            }));
            const previewTop = preview?.getBoundingClientRect().top;
            const previewBottom = preview?.getBoundingClientRect().bottom;
            const sections = [...root.querySelectorAll("section")].map(
              (section) => {
                const rect = section.getBoundingClientRect();
                return {
                  label: section.getAttribute("aria-label"),
                  top: rect.top,
                  bottom: rect.bottom,
                };
              },
            );
            const finalRect = finalSection?.getBoundingClientRect();
            const hourlyRect = root
              .querySelector('[aria-label="Hourly forecast"]')
              ?.getBoundingClientRect();
            const astronomyRect = root
              .querySelector('section[aria-label="Astronomy"]')
              ?.getBoundingClientRect();
            return {
              viewports,
              sections,
              previewTop,
              previewBottom,
              finalSection: finalSection?.getAttribute("aria-label"),
              finalBottom: finalRect?.bottom,
              previewBottom: previewRect?.bottom,
              contentBottom: contentRect?.bottom,
              paddingBottom,
              hourlyBottom: hourlyRect?.bottom,
              astronomyBottom: astronomyRect?.bottom,
            };
          });
          assert(
            initialGeometry.viewports.length > 0 &&
              initialGeometry.viewports.every(
                (viewport) =>
                  viewport.scrollHeight <= viewport.clientHeight + 1 &&
                  viewport.scrollTop === 0,
              ),
            `${label} vertically overflows at its initial scroll position: ${JSON.stringify(initialGeometry)}`,
          );
          assert(
            initialGeometry.finalBottom <= initialGeometry.previewBottom + 1 &&
              initialGeometry.sections.every(
                (section) =>
                  section.top >= initialGeometry.previewTop - 1 &&
                  section.bottom <= initialGeometry.previewBottom + 1,
              ) &&
              initialGeometry.previewBottom <=
                initialGeometry.contentBottom -
                  initialGeometry.paddingBottom +
                  1,
            `${label} final section is outside the padded card at its initial position: ${JSON.stringify(initialGeometry)}`,
          );
          if (size === "small" || size === "large") {
            assert(
              initialGeometry.hourlyBottom != null &&
                Math.abs(
                  initialGeometry.hourlyBottom - initialGeometry.previewBottom,
                ) <= 2,
              `${label} hourly section did not fill the preview height: ${JSON.stringify(initialGeometry)}`,
            );
          }
          if (size === "medium") {
            const layoutMode = await widget
              .locator(".weather-card-preview > div.grid")
              .evaluate((grid) => ({
                width: grid.parentElement.clientWidth,
                stacked: grid.classList.contains("grid-cols-1"),
              }));
            assert(
              layoutMode.stacked === layoutMode.width < 640,
              `${label} selected the wrong layout around the 640px content breakpoint: ${JSON.stringify(layoutMode)}`,
            );
            if (!layoutMode.stacked) {
              assert(
                initialGeometry.hourlyBottom != null &&
                  initialGeometry.astronomyBottom != null &&
                  Math.abs(
                    initialGeometry.hourlyBottom -
                      initialGeometry.astronomyBottom,
                  ) <= 2,
                `${label} wide medium hourly and astronomy sections do not align: ${JSON.stringify(initialGeometry)}`,
              );
            }
            await widget.getByText("Moonrise", { exact: true }).waitFor();
            await widget.getByText("Moonset", { exact: true }).waitFor();
          }
          if (size !== "small") {
            const precipitationTab = widget.getByRole("button", {
              name: "Precipitation",
              exact: true,
            });
            await precipitationTab.click();
            assert(
              (await precipitationTab.getAttribute("aria-pressed")) === "true",
              `${label} hourly precipitation tab did not activate`,
            );
            const overviewTab = widget.getByRole("button", {
              name: "Overview",
              exact: true,
            });
            await overviewTab.click();
            assert(
              (await overviewTab.getAttribute("aria-pressed")) === "true",
              `${label} hourly overview tab did not reactivate`,
            );
            await widget
              .getByRole("button", { name: "Weather widget settings" })
              .click();
            const closeSettings = widget.getByRole("button", {
              name: "Close settings",
            });
            await closeSettings.waitFor();
            await closeSettings.click();
            await widget
              .getByRole("button", { name: "Weather widget settings" })
              .waitFor();
          }
        }
        if (moduleId === "sports") {
          const initialGeometry = await widget.evaluate((root) => {
            const card = root.firstElementChild;
            const content = card?.querySelector(":scope > .p-6");
            const viewport = root.querySelector(
              "[data-sports-content-viewport]",
            );
            const layout =
              root.querySelector("[data-sports-layout]") ?? viewport;
            const rect = (element) => {
              if (!element) return null;
              const box = element.getBoundingClientRect();
              return {
                top: box.top,
                bottom: box.bottom,
                height: box.height,
                clientHeight: element.clientHeight,
                scrollHeight: element.scrollHeight,
                scrollTop: element.scrollTop,
              };
            };
            return {
              card: rect(card),
              content: rect(content),
              layout: rect(layout),
              viewport: rect(viewport),
              layoutMode: layout?.getAttribute("data-sports-layout"),
            };
          });
          assert(
            initialGeometry.card &&
              initialGeometry.content &&
              initialGeometry.viewport &&
              initialGeometry.content.bottom <= initialGeometry.card.bottom + 1,
            `${label} Sports body did not stay within its assigned card: ${JSON.stringify(initialGeometry)}`,
          );
          if (size === "small" || size === "medium") {
            assert(
              initialGeometry.layout &&
                initialGeometry.layout.scrollHeight <=
                  initialGeometry.layout.clientHeight + 1 &&
                initialGeometry.viewport.scrollHeight <=
                  initialGeometry.viewport.clientHeight + 1 &&
                initialGeometry.viewport.scrollTop === 0,
              `${label} Sports summary overflows or clips at its initial position: ${JSON.stringify(initialGeometry)}`,
            );
          }
          if (size === "medium") {
            if (projection.columns === 12) {
              const originalConfig = JSON.parse(
                await invoke(
                  page,
                  IPC.settingsGet,
                  configKey("sports", "medium"),
                ),
              );
              const selectViewMode = async (mode) => {
                await widget
                  .getByRole("button", { name: "Sports widget settings" })
                  .click();
                await widget.getByRole("combobox").nth(1).click();
                await page
                  .getByRole("option", {
                    name: {
                      today: "Today",
                      summarized: "Summarized",
                      standard: "Standard",
                      detailed: "Detailed",
                      all_games: "All Games",
                    }[mode],
                  })
                  .click();
                await widget
                  .getByRole("button", { name: "Close settings" })
                  .click();
              };
              await selectViewMode("today");
              const teamCarousel = widget.locator(
                "[data-sports-team-carousel]",
              );
              assert(
                Number(
                  await widget
                    .locator("[data-sports-today-team-count]")
                    .getAttribute("data-sports-today-team-count"),
                ) === surfaces.teams.filter((team) => team.enabled).length,
                `${label} Today view dropped tracked teams before separating playing and resting teams`,
              );
              if ((await teamCarousel.count()) === 1) {
                const teamPage = teamCarousel.getByText(/^\d+\/\d+$/);
                const teamPageBefore = await teamPage.textContent();
                const nextTeam = teamCarousel.getByRole("button", {
                  name: "Next team",
                });
                assert(
                  !(await nextTeam.isDisabled()),
                  `${label} Today view reduced the tracked-team carousel to one item (${teamPageBefore})`,
                );
                await nextTeam.click();
                assert(
                  (await teamPage.textContent()) !== teamPageBefore,
                  `${label} Today team carousel could not advance`,
                );
              }
              await selectViewMode(originalConfig.viewMode);
            }
            const disclosure = widget.getByRole("button", {
              name: /View all (games|teams)/,
            });
            if ((await disclosure.count()) > 0) {
              await disclosure.click();
              assert(
                (await widget
                  .getByRole("button", { name: "Show less" })
                  .getAttribute("aria-expanded")) === "true",
                `${label} Medium Sports disclosure did not expand`,
              );
              const expanded = await widget
                .locator('[data-sports-content-viewport="medium"]')
                .evaluate((viewport) => {
                  viewport.scrollTop = viewport.scrollHeight;
                  const last = viewport.lastElementChild;
                  const viewportRect = viewport.getBoundingClientRect();
                  const lastRect = last?.getBoundingClientRect();
                  return {
                    scrollHeight: viewport.scrollHeight,
                    clientHeight: viewport.clientHeight,
                    scrollTop: viewport.scrollTop,
                    lastBottom: lastRect?.bottom,
                    viewportBottom: viewportRect.bottom,
                  };
                });
              assert(
                expanded.scrollTop >= 0 &&
                  expanded.lastBottom <= expanded.viewportBottom + 1,
                `${label} expanded Medium Sports content could not reach its end: ${JSON.stringify(expanded)}`,
              );
              await widget.getByRole("button", { name: "Show less" }).click();
            }
          }
          if (size === "large") {
            const viewport = widget.locator(
              '[data-sports-content-viewport="large"]',
            );
            const reachability = await viewport.evaluate((element) => {
              element.scrollTop = element.scrollHeight;
              const last = element.lastElementChild;
              const viewportRect = element.getBoundingClientRect();
              const lastRect = last?.getBoundingClientRect();
              return {
                scrollHeight: element.scrollHeight,
                clientHeight: element.clientHeight,
                scrollTop: element.scrollTop,
                lastBottom: lastRect?.bottom,
                viewportTop: viewportRect.top,
                viewportBottom: viewportRect.bottom,
              };
            });
            assert(
              reachability.lastBottom == null ||
                (reachability.lastBottom <= reachability.viewportBottom + 1 &&
                  reachability.lastBottom >= reachability.viewportTop - 1),
              `${label} Large Sports list end is unreachable in its viewport: ${JSON.stringify(reachability)}`,
            );
            if (projection.columns === 12) {
              await widget.screenshot({
                path: path.join(
                  artifacts,
                  `sports-${projection.columns}-columns-large-scrolled.png`,
                ),
              });
            }
            await viewport.evaluate((element) => {
              element.scrollTop = 0;
            });
          }
          if (size === "small") {
            const nextPage = widget.getByRole("button", {
              name: "Next sports teams and games",
            });
            if (
              (await nextPage.count()) > 0 &&
              !(await nextPage.isDisabled())
            ) {
              const pageLabel = widget.getByText(/^\d+\/\d+$/).first();
              const before = await pageLabel.textContent();
              await nextPage.click();
              assert(
                (await pageLabel.textContent()) !== before,
                `${label} compact Sports secondary paging did not advance`,
              );
              await widget
                .getByRole("button", {
                  name: "Previous sports teams and games",
                })
                .click();
            }
          }
          if (projection.columns === 12 && size === "small") {
            const originalHeight = initialGeometry.card.height;
            await page.getByRole("button", { name: "Edit Layout" }).click();
            await widget
              .getByRole("button", { name: "Sports widget settings" })
              .click();
            const sizeControl = widget.getByRole("group", {
              name: "Widget size",
            });
            const mediumSize = sizeControl.getByRole("button", {
              name: "Set widget size to Medium",
            });
            await mediumSize.click();
            assert(
              (await mediumSize.getAttribute("aria-pressed")) === "true",
              "Sports size control did not select Medium",
            );
            await page.waitForFunction(
              ({ widgetId, originalHeight }) => {
                const widget = [
                  ...document.querySelectorAll("[data-widget-instance-id]"),
                ].find(
                  (element) => element.dataset.widgetInstanceId === widgetId,
                );
                return (
                  widget &&
                  widget.getBoundingClientRect().height > originalHeight + 80
                );
              },
              { widgetId: instanceId(moduleId, size), originalHeight },
            );
            const smallSize = sizeControl.getByRole("button", {
              name: "Set widget size to Small",
            });
            await smallSize.click();
            assert(
              (await smallSize.getAttribute("aria-pressed")) === "true",
              "Sports size control did not restore Small",
            );
            await page
              .getByRole("button", { name: "Done editing layout" })
              .click();
            await widget
              .getByRole("button", { name: "Close settings" })
              .click();
            const restoredHeight = await widget
              .locator(":scope > .rounded-lg.border")
              .evaluate((card) => card.getBoundingClientRect().height);
            assert(
              Math.abs(restoredHeight - originalHeight) <= 2,
              `Sports Small height did not restore after size transition: ${restoredHeight}/${originalHeight}`,
            );
          }
        }
      }
      if (moduleId === "saved_posts") {
        const large = page
          .getByText(
            view.layout.widget_instances[instanceId(moduleId, "large")].label,
            { exact: true },
          )
          .locator("xpath=ancestor::*[@data-widget-instance-id]");
        for (const post of surfaces.savedPosts.posts.filter((post) =>
          fixtures.savedPosts.includes(post.post_id),
        )) {
          await large.getByText(post.title, { exact: true }).waitFor();
          await large.getByText(post.note, { exact: true }).waitFor();
          await large
            .getByText(post.note, { exact: true })
            .scrollIntoViewIfNeeded();
          const containment = await large
            .getByText(post.note, { exact: true })
            .evaluate((note) => {
              const root = note.closest("[data-widget-instance-id]");
              const widget = root.getBoundingClientRect();
              const heading = root.querySelector("h3").getBoundingClientRect();
              const rect = note.getBoundingClientRect();
              return (
                rect.top >= widget.top &&
                rect.bottom <= widget.bottom &&
                heading.top >= widget.top &&
                heading.bottom <= widget.bottom
              );
            });
          assert(
            containment,
            `Saved Posts Large note could not scroll into its viewport: ${post.post_id}`,
          );
        }
        await large.screenshot({
          path: path.join(
            artifacts,
            `saved_posts-${projection.columns}-columns-large-scrolled.png`,
          ),
        });
        await large.evaluate((widget) => {
          for (const element of widget.querySelectorAll("*"))
            if (element.scrollTop) element.scrollTop = 0;
        });
      }
      const dimensions = await page
        .locator(".dashboard-grid")
        .evaluate((grid) => {
          const rect = grid.getBoundingClientRect();
          const widgets = [
            ...grid.querySelectorAll("[data-widget-instance-id]"),
          ].map((widget) => {
            const box = widget.getBoundingClientRect();
            return {
              id: widget.dataset.widgetInstanceId,
              x: box.x,
              right: box.right,
              width: box.width,
              clientWidth: widget.clientWidth,
              scrollWidth: widget.scrollWidth,
            };
          });
          return { width: rect.width, x: rect.x, right: rect.right, widgets };
        });
      const actualColumns =
        dimensions.width >= 1200
          ? 12
          : dimensions.width >= 996
            ? 8
            : dimensions.width >= 768
              ? 4
              : 1;
      assert(
        actualColumns === projection.columns,
        `Expected ${projection.columns} columns, measured ${actualColumns} at ${dimensions.width}px`,
      );
      for (const widget of dimensions.widgets) {
        assert(
          widget.x >= dimensions.x - 2 && widget.right <= dimensions.right + 2,
          `${widget.id} escaped the dashboard horizontally`,
        );
        assert(
          widget.scrollWidth <= widget.clientWidth + 2,
          `${widget.id} overflowed horizontally (${widget.scrollWidth}/${widget.clientWidth})`,
        );
      }
      const screenshot = path.join(
        artifacts,
        `${moduleId}-${projection.columns}-columns.png`,
      );
      // Dashboard scrolls inside <main>; grow the viewport so all three sizes
      // appear in the overview, then also retain complete per-widget captures.
      const gridHeight = await page
        .locator(".dashboard-grid")
        .evaluate((grid) => grid.getBoundingClientRect().height);
      await page.setViewportSize({
        width: page.viewportSize().width,
        height: Math.ceil(gridHeight + 240),
      });
      await page.locator("main").evaluate((main) => main.scrollTo(0, 0));
      await page.screenshot({ path: screenshot, fullPage: true });
      for (const size of sizes) {
        const label =
          view.layout.widget_instances[instanceId(moduleId, size)].label;
        await page
          .getByText(label, { exact: true })
          .locator("xpath=ancestor::*[@data-widget-instance-id]")
          .screenshot({
            path: path.join(
              artifacts,
              `${moduleId}-${projection.columns}-columns-${size}.png`,
            ),
          });
      }
      measurements.push({
        moduleId,
        columns: actualColumns,
        viewport: page.viewportSize(),
        screenshot,
        ...dimensions,
      });
      record(
        "preset-projection",
        `${view.name}: three populated sizes, ${actualColumns} columns at ${dimensions.width}px; ${screenshot}`,
      );
    }
  }
  await writeFile(
    path.join(artifacts, "preset-projections.json"),
    JSON.stringify(measurements, null, 2),
  );
}

const cliOptions = parseArguments(process.argv.slice(2));
if (cliOptions.error) {
  console.error(`Error: ${cliOptions.error}\n\n${usage}`);
  process.exit(1);
}
if (cliOptions.help) {
  console.log(usage);
  process.exit(0);
}

await runElectronHarness({
  name: "local-test-data",
  scenario: async ({ page, record, artifacts }) => {
    await page.getByRole("link", { name: "Settings" }).click();
    await page.getByRole("heading", { name: "Settings" }).waitFor();
    await page.getByRole("heading", { name: "Developer Test Data" }).waitFor();

    const initialStatus = await invoke(page, IPC.devTestDataStatus);
    assert(initialStatus.available, "Developer controls were not available");
    assert(
      !initialStatus.active,
      "Harness fixture database was not initially clean",
    );
    await page
      .getByTestId("dev-test-data-status")
      .getByText("Inactive")
      .waitFor();
    record("status", "Settings reports synthetic test data as inactive");

    if (cliOptions.widget) {
      await page.getByRole("button", { name: "Seed test data" }).click();
      await page
        .getByTestId("dev-test-data-status")
        .getByText("Synthetic data active")
        .waitFor();
      const seededStatus = await invoke(page, IPC.devTestDataStatus);
      assert(
        seededStatus.active &&
          seededStatus.appliedVersion === seededStatus.latestVersion &&
          seededStatus.latestVersion > 0 &&
          !seededStatus.updateAvailable,
        "Seed action did not persist the latest fixture version",
      );

      const seededSurfaces = await readSurfaces(page);
      const seededViews = await invoke(page, IPC.dashboardGet);
      assertPresetState(seededViews, [cliOptions.widget]);
      await page.getByRole("link", { name: "Dashboard" }).click();
      await inspectPresetMatrix(
        page,
        artifacts,
        record,
        seededViews,
        seededSurfaces,
        [cliOptions.widget],
      );
      if (cliOptions.widget === "sports") {
        await assertBasketballWidgets(page);
      }
      record(
        "widget-focused",
        `Focused ${cliOptions.widget} widget checks passed across all sizes and responsive projections`,
      );
      return;
    }

    const sentinelKey = "local_test_data_sentinel";
    await invoke(page, IPC.settingsSet, sentinelKey, "preserve-me");
    const sentinelConfigKey = "youtube_view_config:sentinel_widget";
    const sentinelConfig = JSON.stringify({
      hideWatched: true,
      channelMode: "selected",
      selectedChannelIds: [],
    });
    await invoke(page, IPC.settingsSet, sentinelConfigKey, sentinelConfig);
    const initialViews = await invoke(page, IPC.dashboardGet);
    const sentinelView = {
      id: "sentinel_view",
      name: "Sentinel",
      icon: null,
      layout: {
        layout_version: 2,
        widget_order: ["sentinel_widget"],
        widget_instances: {
          sentinel_widget: {
            instanceId: "sentinel_widget",
            moduleId: "youtube",
            size: "small",
            label: "Sentinel widget",
          },
        },
        widget_visibility: { sentinel_widget: true },
        widget_geometry: { sentinel_widget: { x: 0, y: 0, w: 6, h: 6 } },
      },
    };
    await invoke(page, IPC.dashboardSet, {
      state: {
        view_order: [...initialViews.view_order, sentinelView.id],
        views: { ...initialViews.views, [sentinelView.id]: sentinelView },
      },
    });
    // Start with disabled persisted gates to prove Seed rehydrates mounted providers.
    for (const gate of [
      "saved_posts_enabled",
      "reddit_digest_enabled",
      "weather_enabled",
      "sports_enabled",
    ])
      await invoke(page, IPC.settingsSet, gate, "false");
    await invoke(
      page,
      IPC.settingsSet,
      "astronomy_settings_json",
      JSON.stringify({ enabled: false }),
    );
    await page.reload();
    await openSettings(page);

    await page.getByRole("button", { name: "Seed test data" }).click();
    await page
      .getByTestId("dev-test-data-status")
      .getByText("Synthetic data active")
      .waitFor();
    const seededStatus = await invoke(page, IPC.devTestDataStatus);
    const latestVersion = seededStatus.latestVersion;
    assert(
      seededStatus.active &&
        seededStatus.appliedVersion === latestVersion &&
        latestVersion > 0 &&
        !seededStatus.updateAvailable,
      "Seed action did not persist the latest fixture version",
    );
    const seededSurfaces = await readSurfaces(page);
    assertSeededSurfaces(seededSurfaces);
    assert(
      seededSurfaces.astronomy?.groups.moon.data,
      "Astronomy fixture snapshot was not readable",
    );
    const seededViews = await invoke(page, IPC.dashboardGet);
    assertPresetState(seededViews);
    assert(
      JSON.stringify(seededViews.views.sentinel_view) ===
        JSON.stringify(sentinelView),
      "Seed changed the sentinel dashboard",
    );
    record(
      "surfaces-seeded",
      `All six fixture surfaces, including Basketball, and eighteen preset widget instances were readable at fixture version ${latestVersion}`,
    );

    await page.getByRole("link", { name: "Dashboard" }).click();
    await inspectPresetMatrix(
      page,
      artifacts,
      record,
      seededViews,
      seededSurfaces,
    );

    // Reproduce an existing v3 profile whose factory Baseball configs survived v4.
    for (const size of sizes)
      await invoke(
        page,
        IPC.settingsSet,
        configKey("sports", size),
        JSON.stringify(legacySportsConfig),
      );
    await invoke(page, IPC.settingsSet, sportsDefaultsMigrationKey, "0");
    await invoke(page, IPC.settingsSet, "dev_test_data_applied_version", "3");
    await page.reload();
    await openSettings(page);
    await page
      .getByRole("button", { name: "Update test data", exact: true })
      .click();
    await waitForIdleAction(page, "Update test data");
    for (const size of sizes)
      assert(
        JSON.parse(
          await invoke(page, IPC.settingsGet, configKey("sports", size)),
        ).sport === "all",
        `Update did not upgrade the legacy Sports ${size} factory default`,
      );
    await assertBasketballWidgets(page);
    record(
      "legacy-sports-defaults-upgraded",
      "Visible Update upgraded the old factory defaults; selecting Fixture Pilots at Fixture Foxes rendered LIVE 62/58 in all three Sports sizes",
    );

    await openSettings(page);
    const editedPost = seededSurfaces.savedPosts.posts.find(
      (post) => post.post_id === fixtures.savedPosts[0],
    );
    await invoke(
      page,
      "reddit:updateSavedPostNote",
      editedPost.post_id,
      "Harness edited note",
    );
    await invoke(page, "reddit:setSavedPostViewed", editedPost.post_id, false);
    const editedDigest = seededSurfaces.digest.find(
      (post) => post.post_id === fixtures.digest[0],
    );
    await invoke(
      page,
      "reddit:setDigestPostViewed",
      editedDigest.post_id,
      editedDigest.week_start_date,
      true,
    );
    const editedVideo = seededSurfaces.youtubeVideos[0];
    await invoke(page, "youtube:setVideoWatched", editedVideo.video_id, true);
    const editedViews = structuredClone(seededViews);
    editedViews.views[viewId("youtube")].name = "Edited fixture dashboard";
    editedViews.views[viewId("youtube")].layout.widget_visibility[
      instanceId("youtube", "small")
    ] = false;
    editedViews.views[viewId("youtube")].layout.widget_instances[
      instanceId("youtube", "small")
    ].label = "My edited fixture";
    await invoke(page, IPC.dashboardSet, { state: editedViews });
    const editedConfig = JSON.stringify({
      hideWatched: true,
      maxVideosPerChannel: 2,
    });
    const sportsEditedConfig = JSON.stringify({ sport: "Baseball" });
    const sportsIntentionalConfig = JSON.stringify(legacySportsConfig);
    await invoke(
      page,
      IPC.settingsSet,
      configKey("youtube", "small"),
      editedConfig,
    );
    await invoke(
      page,
      IPC.settingsSet,
      configKey("sports", "small"),
      sportsEditedConfig,
    );
    await invoke(
      page,
      IPC.settingsSet,
      configKey("sports", "medium"),
      sportsIntentionalConfig,
    );
    // Deterministically emulate an older installed fixture version before the visible Update.
    await invoke(
      page,
      IPC.settingsSet,
      "dev_test_data_applied_version",
      String(latestVersion - 1),
    );
    await page.reload();
    await openSettings(page);
    await page
      .getByTestId("dev-test-data-status")
      .getByText(/Update available/)
      .waitFor();
    await page
      .getByRole("button", { name: "Update test data", exact: true })
      .click();
    await waitForIdleAction(page, "Update test data");
    const updatedStatus = await invoke(page, IPC.devTestDataStatus);
    assert(
      updatedStatus.appliedVersion === latestVersion &&
        !updatedStatus.updateAvailable,
      "Update did not apply the latest fixture version",
    );
    const updatedSurfaces = await readSurfaces(page);
    assertSeededSurfaces(updatedSurfaces);
    assert(
      updatedSurfaces.savedPosts.posts.find(
        (post) => post.post_id === editedPost.post_id,
      ).note === "Harness edited note",
      "Update discarded a saved-post note",
    );
    assert(
      updatedSurfaces.digest.find(
        (post) => post.post_id === editedDigest.post_id,
      ).viewed_at !== null,
      "Update discarded Digest read state",
    );
    assert(
      updatedSurfaces.youtubeVideos.find(
        (video) => video.video_id === editedVideo.video_id,
      ).watched_at !== null,
      "Update discarded video watched state",
    );
    assert(
      JSON.stringify(
        (await invoke(page, IPC.dashboardGet)).views[viewId("youtube")],
      ) === JSON.stringify(editedViews.views[viewId("youtube")]),
      "Update discarded preset page/layout edits",
    );
    assert(
      (await invoke(page, IPC.settingsGet, configKey("youtube", "small"))) ===
        editedConfig,
      "Update discarded fixture config edits",
    );
    assert(
      (await invoke(page, IPC.settingsGet, configKey("sports", "small"))) ===
        sportsEditedConfig,
      "Update discarded the Sports preset selection",
    );
    assert(
      (await invoke(page, IPC.settingsGet, configKey("sports", "medium"))) ===
        sportsIntentionalConfig,
      "Update repeated the migration and discarded a later intentional Baseball selection",
    );
    record(
      "fixtures-updated",
      `Visible Update upgraded fixtures to version ${latestVersion} and preserved notes/read/watched state, fixture layout edits, and config edits`,
    );

    await page
      .getByRole("button", { name: "Reset test data", exact: true })
      .click();
    const resetConfirmation = page.getByRole("alertdialog");
    await resetConfirmation
      .getByRole("heading", { name: "Reset synthetic test data?" })
      .waitFor();
    await resetConfirmation
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    assert(
      (await invoke(page, IPC.settingsGet, configKey("youtube", "small"))) ===
        editedConfig,
      "Cancel reset changed fixture config",
    );
    await page
      .getByRole("button", { name: "Reset test data", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Reset test data", exact: true })
      .click();
    await waitForIdleAction(page, "Reset test data");
    const resetViews = await invoke(page, IPC.dashboardGet);
    assertPresetState(resetViews);
    assert(
      JSON.stringify(resetViews.views[viewId("youtube")]) ===
        JSON.stringify(seededViews.views[viewId("youtube")]),
      "Reset did not restore fixture layout defaults",
    );
    assert(
      JSON.stringify(resetViews.views.sentinel_view) ===
        JSON.stringify(sentinelView),
      "Reset changed the sentinel dashboard",
    );
    assert(
      JSON.parse(
        await invoke(page, IPC.settingsGet, configKey("sports", "small")),
      ).sport === "all",
      "Reset did not restore the Sports All Sports default",
    );
    const resetSurfaces = await readSurfaces(page);
    assert(
      resetSurfaces.savedPosts.posts.find(
        (post) => post.post_id === editedPost.post_id,
      ).note === editedPost.note,
      "Reset did not restore the fixture note",
    );
    assert(
      resetSurfaces.digest.find((post) => post.post_id === editedDigest.post_id)
        .viewed_at === editedDigest.viewed_at,
      "Reset did not restore Digest read defaults",
    );
    assert(
      resetSurfaces.youtubeVideos.find(
        (video) => video.video_id === editedVideo.video_id,
      ).watched_at === null,
      "Reset did not restore video watched defaults",
    );
    assert(
      JSON.parse(
        await invoke(page, IPC.settingsGet, configKey("youtube", "small")),
      ).hideWatched === false,
      "Reset did not restore fixture config defaults",
    );
    record(
      "fixtures-reset",
      "Cancelled Reset was inert; confirmed Reset restored fixture notes/read/watched states and preset/config defaults, preserving the sentinel dashboard",
    );

    // Set up moved fixture and foreign user widgets to exercise ownership in the UI Clear action.
    const movedId = instanceId("youtube", "small");
    const movedInstance =
      resetViews.views[viewId("youtube")].layout.widget_instances[movedId];
    resetViews.views.sentinel_view.layout.widget_order.push(movedId);
    resetViews.views.sentinel_view.layout.widget_instances[movedId] =
      movedInstance;
    resetViews.views.sentinel_view.layout.widget_visibility[movedId] = true;
    resetViews.views.sentinel_view.layout.widget_geometry[movedId] = {
      x: 0,
      y: 6,
      w: 6,
      h: 6,
    };
    const source = resetViews.views[viewId("youtube")].layout;
    source.widget_order = source.widget_order.filter((id) => id !== movedId);
    delete source.widget_instances[movedId];
    delete source.widget_visibility[movedId];
    delete source.widget_geometry[movedId];
    const foreignId = "sentinel_foreign_widget";
    const foreignInstance = {
      instanceId: foreignId,
      moduleId: "saved_posts",
      label: "Preserved user widget",
      size: "small",
    };
    source.widget_order.push(foreignId);
    source.widget_instances[foreignId] = foreignInstance;
    source.widget_visibility[foreignId] = true;
    source.widget_geometry[foreignId] = { x: 0, y: 21, w: 6, h: 6 };
    const foreignConfigKey = `saved_posts_view_config:${foreignId}`;
    const foreignConfig = JSON.stringify({ hideViewed: false });
    await invoke(page, IPC.settingsSet, foreignConfigKey, foreignConfig);
    await invoke(page, IPC.dashboardSet, { state: resetViews });
    await page.getByRole("button", { name: "Clear test data" }).click();
    const confirmation = page.getByRole("alertdialog");
    await confirmation.waitFor();
    await confirmation.getByRole("button", { name: "Clear test data" }).click();
    await page
      .getByTestId("dev-test-data-status")
      .getByText("Inactive")
      .waitFor();
    const clearedStatus = await invoke(page, IPC.devTestDataStatus);
    assert(!clearedStatus.active, "Clear action did not remove active status");
    const clearedSurfaces = await readSurfaces(page);
    assertFixturesCleared(clearedSurfaces);
    assert(
      (await invoke(page, IPC.settingsGet, sentinelKey)) === "preserve-me",
      "Fixture clear changed an unrelated setting",
    );
    const clearedViews = await invoke(page, IPC.dashboardGet);
    assert(
      !Object.keys(clearedViews.views).some(isFixture),
      "Clear left fixture dashboard pages",
    );
    assert(
      !Object.values(clearedViews.views).some((view) =>
        Object.keys(view.layout.widget_instances).some(isFixture),
      ),
      "Clear left fixture widgets moved into user dashboards",
    );
    assert(
      JSON.stringify(clearedViews.views.sentinel_view) ===
        JSON.stringify(sentinelView),
      "Clear changed the unrelated sentinel view",
    );
    assert(
      Object.values(clearedViews.views).some(
        (view) =>
          view.layout.widget_instances[foreignId]?.label ===
          foreignInstance.label,
      ),
      "Clear lost a foreign user widget added to a fixture page",
    );
    assert(
      (await invoke(page, IPC.settingsGet, sentinelConfigKey)) ===
        sentinelConfig,
      "Clear changed the sentinel config",
    );
    assert(
      (await invoke(page, IPC.settingsGet, foreignConfigKey)) === foreignConfig,
      "Clear changed the rescued user widget config",
    );
    for (const moduleId of presetModules)
      for (const size of sizes)
        assert(
          (await invoke(page, IPC.settingsGet, configKey(moduleId, size))) ===
            null,
          "Clear left fixture config keys",
        );
    for (const gate of [
      "saved_posts_enabled",
      "reddit_digest_enabled",
      "weather_enabled",
      "sports_enabled",
    ])
      assert(
        (await invoke(page, IPC.settingsGet, gate)) === "false",
        `Clear did not restore ${gate}`,
      );
    assert(
      JSON.parse(await invoke(page, IPC.settingsGet, "astronomy_settings_json"))
        .enabled === false,
      "Clear did not restore Astronomy feature gate",
    );

    await page.getByRole("link", { name: "Dashboard" }).click();
    for (const title of seededSurfaces.savedPosts.posts
      .filter((post) => fixtures.savedPosts.includes(post.post_id))
      .map((post) => post.title)) {
      assert(
        (await page.getByText(title, { exact: true }).count()) === 0,
        `Cleared Saved Posts title remained visible: ${title}`,
      );
    }
    for (const note of seededSurfaces.savedPosts.posts
      .filter((post) => fixtures.savedPosts.includes(post.post_id))
      .map((post) => post.note)) {
      assert(
        (await page.getByText(note, { exact: true }).count()) === 0,
        `Cleared Saved Posts note remained visible: ${note}`,
      );
    }
    record(
      "fixtures-cleared",
      "All six fixture surfaces/pages/configs and moved fixture widgets cleared; foreign widgets rescued; user dashboard/config and disabled gate preferences preserved",
    );

    // Re-enable the real Saved Posts surface after Clear to inspect its honest empty state.
    await openSettings(page);
    await invoke(page, IPC.settingsSet, "saved_posts_enabled", "true");
    await page.reload();
    await page.getByRole("link", { name: "Dashboard", exact: true }).click();
    await page.getByRole("tab", { name: "Home", exact: true }).click();
    await page
      .getByText(/No saved posts yet\.|Set up mobile saving to get started\./)
      .first()
      .waitFor();
    await page.screenshot({
      path: path.join(artifacts, "cleared-empty-dashboard.png"),
      fullPage: true,
    });
    record(
      "empty-state",
      "Clear left the real Saved Posts empty prompt with no synthetic empty/error/loading database records",
    );
  },
});
