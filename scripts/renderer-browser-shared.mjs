import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function loadRendererBrowserFixtures(vite) {
  const source = (file) =>
    path.join(root, "src", "main", "dev-test-data", file).replaceAll("\\", "/");
  const shared = await vite.ssrLoadModule(
    path.join(root, "src", "shared", "dev-test-data.ts").replaceAll("\\", "/"),
  );
  const context = await vite.ssrLoadModule(source("fixtures.ts"));
  const reddit = await vite.ssrLoadModule(
    source("definitions/reddit-digest.ts"),
  );
  const saved = await vite.ssrLoadModule(source("definitions/saved-posts.ts"));
  const youtube = await vite.ssrLoadModule(source("definitions/youtube.ts"));
  const sports = await vite.ssrLoadModule(source("definitions/sports.ts"));
  const weather = await vite.ssrLoadModule(source("definitions/weather.ts"));
  const astronomy = await vite.ssrLoadModule(
    source("definitions/astronomy.ts"),
  );
  const dashboard = await vite.ssrLoadModule(
    source("definitions/dashboard-presets.ts"),
  );
  const dashboardLayout = await vite.ssrLoadModule(
    source("definitions/dashboard-layout.ts"),
  );
  const fixtureContext = context.createFixtureContext(Date.now());
  const youtubeData = youtube.buildYouTubeFixtures(fixtureContext);
  const posts = reddit.buildRedditDigestFixtures(fixtureContext);
  const savedPosts = saved.buildSavedPostFixtures(fixtureContext);
  const sportsEvents = sports.buildSportsFixture(fixtureContext);
  const weatherFixture = weather.buildWeatherFixture(fixtureContext);
  const astronomySnapshot = astronomy.buildAstronomyFixture(fixtureContext);
  // Weather snapshots reference the independently cached astronomy snapshot
  // for the same fixture location in the app's persisted data model.
  weatherFixture.snapshot.astronomy = astronomySnapshot;
  const weeks = [...new Set(posts.map((post) => post.week_start_date))]
    .sort()
    .reverse()
    .map((week_start_date) => ({
      week_start_date,
      post_count: posts.filter(
        (post) => post.week_start_date === week_start_date,
      ).length,
    }));
  const presetConfigs = Object.fromEntries(
    dashboard.DASHBOARD_FIXTURE_PRESETS.map((preset) => [
      preset.moduleId,
      preset.config,
    ]),
  );
  const views = dashboardLayout.createFixtureDashboardViews();
  const widgetConfigs = Object.fromEntries(
    dashboard.DASHBOARD_FIXTURE_PRESETS.flatMap((preset) =>
      dashboard.DASHBOARD_FIXTURE_SIZES.map((size) => [
        dashboard.fixtureConfigKey(
          preset.moduleId,
          dashboard.fixtureWidgetId(preset.moduleId, size),
        ),
        preset.config,
      ]),
    ),
  );
  const teams = sports.SPORTS_FIXTURE_LEAGUES.flatMap((league, leagueIndex) =>
    [league.home, league.away].map((team, teamIndex) => ({
      teamId: team.teamId,
      leagueId: league.leagueId,
      sport: league.sport,
      name: team.name,
      shortName: team.shortName,
      badgeUrl: null,
      enabled: true,
      sortOrder: leagueIndex * 2 + teamIndex,
    })),
  );
  const leagues = sports.SPORTS_FIXTURE_LEAGUES.map((league, sortOrder) => ({
    leagueId: league.leagueId,
    sport: league.sport,
    name: league.name,
    country: "Synthetic",
    logoUrl: null,
    enabled: true,
    sortOrder,
  }));
  const today = context.fixtureDate(fixtureContext);
  const sportsTodayEvents = sportsEvents.filter(
    (event) => event.eventDate === today,
  );
  return {
    devTestDataVersion: shared.DEV_TEST_DATA_VERSION,
    now: fixtureContext.now,
    views,
    widgetConfigs,
    presetConfigs,
    fixtureEvidence: {
      youtube: youtubeData.channels.map((channel) => channel.name),
      reddit_digest: posts.map((post) => post.title),
      saved_posts: savedPosts.map((post) => post.title),
      sports: teams.map((team) => team.name),
      weather: [weatherFixture.snapshot.location.name],
      astronomy: [
        astronomySnapshot.groups.planets.data.find(
          (planet) => planet.body === "Jupiter",
        )?.body,
        String(astronomySnapshot.groups.moon.data.illuminationPercent),
        astronomySnapshot.groups.moon.data.phaseName.replaceAll("_", " "),
      ].filter(Boolean),
    },
    youtube: youtubeData,
    posts,
    weeks,
    savedPosts,
    savedTags: [...new Set(savedPosts.flatMap((post) => post.tags ?? []))],
    sports: {
      teams,
      leagues,
      events: sportsEvents,
      todayEvents: sportsTodayEvents,
      status: sports.SPORTS_FIXTURE_SPORTS.map((sportName) => ({
        sport: sportName,
        lastFetchedAt: context.fixtureTimestamp(fixtureContext),
        lastBadgeFetchedAt: null,
        fetchDate: today,
        enabledLeagueCount: leagues.filter(
          (league) => league.sport === sportName,
        ).length,
        trackedTeamCount: teams.filter((team) => team.sport === sportName)
          .length,
      })),
      details: Object.fromEntries(
        sportsEvents.map((event) => [
          event.eventId,
          sports.getSportsFixtureEventDetail(event),
        ]),
      ),
    },
    weather: weatherFixture,
    astronomy: astronomySnapshot,
  };
}

export { installRendererBrowserApi } from "./renderer-browser-api.mjs";
