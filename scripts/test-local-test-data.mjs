import { runElectronHarness } from "./electron-playwright-harness.mjs";

const IPC = {
  devTestDataStatus: "devTestData:getStatus",
  redditDigest: "reddit:getDigestPosts",
  savedPosts: "reddit:getSavedPosts",
  weatherLocations: "weather:getLocations",
  weatherSnapshot: "weather:getSnapshot",
  sportsTeams: "sports:getTrackedTeams",
  sportsTeamEvents: "sports:getTeamEvents",
  youtubeVideos: "youtube:getVideos",
  settingsGet: "settings:get",
  settingsSet: "settings:set",
};

const fixtures = {
  digest: [
    "pn_dev_fixture_digest_current",
    "pn_dev_fixture_digest_previous",
    "pn_dev_fixture_digest_older",
  ],
  savedPosts: ["pn_dev_fixture_saved_read", "pn_dev_fixture_saved_unread"],
  weather: "pn_dev_fixture_weather_location",
  sportsTeams: ["pn_dev_fixture_sports_home", "pn_dev_fixture_sports_away"],
  youtubeChannel: "pn_dev_fixture_youtube_channel",
  youtubeVideos: [
    "pn_dev_fixture_youtube_unwatched",
    "pn_dev_fixture_youtube_watched",
    "pn_dev_fixture_youtube_upcoming",
  ],
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
  const [digest, savedPosts, locations, teams, youtubeVideos] =
    await Promise.all([
      invoke(page, IPC.redditDigest),
      invoke(page, IPC.savedPosts),
      invoke(page, IPC.weatherLocations),
      invoke(page, IPC.sportsTeams),
      invoke(page, IPC.youtubeVideos, fixtures.youtubeChannel),
    ]);
  const fixtureLocation = locations.find(
    (location) => location.id === fixtures.weather,
  );
  const weather = fixtureLocation
    ? await invoke(page, IPC.weatherSnapshot, fixtures.weather)
    : null;
  const sportsEvents = await invoke(page, IPC.sportsTeamEvents, {
    teamId: fixtures.sportsTeams[0],
  });
  return {
    digest,
    savedPosts,
    locations,
    weather,
    teams,
    sportsEvents,
    youtubeVideos,
  };
}

function assertSeededSurfaces(surfaces) {
  assert(
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
    fixtures.youtubeVideos.every((id) =>
      surfaces.youtubeVideos.some((video) => video.video_id === id),
    ),
    "YouTube fixture videos were not readable",
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
    !surfaces.youtubeVideos.some((video) =>
      fixtures.youtubeVideos.includes(video.video_id),
    ),
    "YouTube fixture videos remained after clear",
  );
}

await runElectronHarness({
  name: "local-test-data",
  scenario: async ({ page, record }) => {
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

    const sentinelKey = "phase3_local_test_data_sentinel";
    const previousSentinel = await invoke(page, IPC.settingsGet, sentinelKey);
    await invoke(page, IPC.settingsSet, sentinelKey, "preserve-me");

    await page.getByRole("button", { name: "Seed test data" }).click();
    await page
      .getByTestId("dev-test-data-status")
      .getByText("Synthetic data active")
      .waitFor();
    const seededStatus = await invoke(page, IPC.devTestDataStatus);
    assert(seededStatus.active, "Seed action did not persist active status");
    const seededSurfaces = await readSurfaces(page);
    assertSeededSurfaces(seededSurfaces);
    record(
      "surfaces-seeded",
      "Reddit Digest, Saved Posts, Weather, Sports, and YouTube fixture records were readable",
    );

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
    record(
      "fixtures-cleared",
      "All five fixture surfaces were cleared while the unrelated setting remained unchanged",
    );

    if (previousSentinel !== null) {
      await invoke(page, IPC.settingsSet, sentinelKey, previousSentinel);
    }
  },
});
