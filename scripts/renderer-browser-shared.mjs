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
  const easternLocation = {
    ...weatherFixture.snapshot.location,
    id: "pn_dev_fixture_weather_location_east",
    name: "Fixture Atoll",
    admin1: "Line Islands",
    country: "Synthetic Country",
    timezone: "Pacific/Kiritimati",
  };
  const easternAstronomySnapshot = structuredClone(astronomySnapshot);
  easternAstronomySnapshot.locationId = easternLocation.id;
  easternAstronomySnapshot.forTimestamp += 3600;
  easternAstronomySnapshot.calculatedAt -= 1800;
  easternAstronomySnapshot.groups.planets.data = [
    ...easternAstronomySnapshot.groups.planets.data,
    ["Mercury", 13],
    ["Mars", 21],
    ["Uranus", 2],
    ["Neptune", 3],
  ].map((planet) => {
    if (!Array.isArray(planet)) return planet;
    const [body, altitude] = planet;
    return {
      body,
      altitude,
      azimuth: 222,
      riseTime: fixtureContext.now / 1000 + 5400,
      setTime: fixtureContext.now / 1000 + 18000,
      magnitude: 1.4,
      illuminationPercent: 67,
      phaseAngle: 47,
      heliocentricDistanceAu: 8.2,
      geocentricDistanceAu: 7.1,
      eclipticLongitude: 211,
      eclipticLatitude: -1.8,
      skyState: "up",
    };
  });
  easternAstronomySnapshot.groups.events.data.push({
    family: "season",
    label: "Past synthetic equinox",
    time: fixtureContext.now / 1000 - 86400,
    localVisibility: null,
  });
  // Weather snapshots reference the independently cached astronomy snapshot
  // for the same fixture location in the app's persisted data model.
  weatherFixture.snapshot.astronomy = astronomySnapshot;
  const easternWeatherSnapshot = structuredClone(weatherFixture.snapshot);
  easternWeatherSnapshot.location = easternLocation;
  easternWeatherSnapshot.astronomy = easternAstronomySnapshot;
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
  for (const size of dashboard.DASHBOARD_FIXTURE_SIZES) {
    const weatherConfigKey = dashboard.fixtureConfigKey(
      "weather",
      dashboard.fixtureWidgetId("weather", size),
    );
    widgetConfigs[weatherConfigKey] = {
      ...widgetConfigs[weatherConfigKey],
      locationId: size === "medium" ? null : easternLocation.id,
      showAstronomy: true,
    };
  }
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
      weather: [weatherFixture.snapshot.location.name, easternLocation.name],
      astronomy: [
        astronomySnapshot.groups.planets.data.find(
          (planet) => planet.body === "Jupiter",
        )?.body,
        String(astronomySnapshot.groups.moon.data.illuminationPercent),
        astronomySnapshot.groups.moon.data.phaseName.replaceAll("_", " "),
      ].filter(Boolean),
      astronomyDetails: [
        "Fixture Atoll",
        "Pacific/Kiritimati",
        "Past synthetic equinox",
        "Mercury",
      ],
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
    weatherSnapshots: {
      [weatherFixture.snapshot.location.id]: weatherFixture.snapshot,
      [easternLocation.id]: easternWeatherSnapshot,
    },
    astronomy: astronomySnapshot,
    astronomyLocations: [weatherFixture.snapshot.location, easternLocation],
    astronomyDetailsSnapshots: {
      [weatherFixture.snapshot.location.id]: astronomySnapshot,
      [easternLocation.id]: easternAstronomySnapshot,
    },
  };
}

export { installRendererBrowserApi } from "./renderer-browser-api.mjs";
