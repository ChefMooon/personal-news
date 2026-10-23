import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDevTestData,
  DEV_TEST_DATA_ACTIVE_SETTING_KEY,
  isDevTestDataActive,
  seedDevTestData,
} from "../dev-test-data";
import { AstronomyModule } from "../sources/astronomy";
import { RedditModule, triggerNtfyPoll } from "../sources/reddit";
import type { ScriptRunCompletion } from "../sources/scripts/executor";
import { runScriptById } from "../sources/scripts";
import { SportsModule, refreshSportsData } from "../sources/sports";
import { WeatherModule, triggerWeatherRefresh } from "../sources/weather";
import { YouTubeModule, triggerYouTubePollNow } from "../sources/youtube";

const mockedState = vi.hoisted(() => ({
  database: null as unknown,
  cronCallbacks: [] as Array<() => void>,
  runScript: vi.fn(),
  sportsApi: {
    fetchEventById: vi.fn(),
    fetchEventDetails: vi.fn(),
    fetchTeamBadgesForLeague: vi.fn(),
    fetchTeamDetails: vi.fn(),
    fetchLastEventsForTeam: vi.fn(),
    fetchLeagueStandings: vi.fn(),
    fetchLeagueEventsForDateWithFallback: vi.fn(),
    fetchLeaguesForSport: vi.fn(),
    fetchNextEventsForTeam: vi.fn(),
    fetchTeamDetailsInLeague: vi.fn(),
    searchTeams: vi.fn(),
  },
}));

vi.mock("../db/database", () => ({
  getDb: () => mockedState.database,
}));

vi.mock("electron", () => ({
  app: {
    isPackaged: false,
    getAppPath: () => process.cwd(),
  },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: {
    isEncryptionAvailable: () => false,
    decryptString: (value: Buffer) => value.toString(),
  },
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: (_expression: string, callback: () => void) => {
      mockedState.cronCallbacks.push(callback);
      return { stop: vi.fn(), destroy: vi.fn() };
    },
    validate: () => true,
  },
}));

vi.mock("../sources/sports/api", () => mockedState.sportsApi);

vi.mock("../sources/scripts/executor", () => ({
  runScript: mockedState.runScript,
}));

vi.mock("../notifications/notification-service", () => ({
  notifyWeatherAlerts: vi.fn(),
  notifySavedPostsSync: vi.fn(),
  notifyYoutubeNewVideos: vi.fn(),
  notifyYoutubeLiveStart: vi.fn(),
  notifyRedditDigest: vi.fn(),
  notifyScriptAutoRun: vi.fn(),
}));

const MIGRATIONS = [
  "001_initial.sql",
  "002_weather.sql",
  "003_sports.sql",
  "004_sports_team_cache.sql",
  "005_youtube_livestream_lifecycle.sql",
  "006_sports_team_name_normalization.sql",
  "007_weather_poll_interval_default.sql",
  "008_saved_posts_subreddit_tags.sql",
  "009_ingested_links.sql",
  "010_astronomy_cache.sql",
];
const PREVIOUS_HARNESS_VALUE = process.env.PERSONAL_NEWS_ELECTRON_HARNESS;
const previousResourcesPathDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "resourcesPath",
);

let database: Database.Database;
let fetchMock: ReturnType<typeof vi.fn>;
const intervalCallbacks: Array<() => void> = [];

function setSetting(key: string, value: string): void {
  database
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(key, value);
}

function getSetting(key: string): string | null {
  const row = database
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function addEnabledSportsLeague(leagueId: string, sport = "Basketball"): void {
  const now = Math.floor(Date.now() / 1000);
  database
    .prepare(
      `INSERT INTO sports_leagues (league_id, sport, name, enabled, sort_order, added_at)
    VALUES (?, ?, ?, 1, 0, ?)`,
    )
    .run(leagueId, sport, `${leagueId} League`, now);
  database
    .prepare(
      "INSERT INTO sports_cache_meta (sport, fetch_date, fetched_at) VALUES (?, 'badge-sync', ?)",
    )
    .run(`badge:${sport}:${leagueId}`, now);
}

function addLiveSportsEvent(
  leagueId: string,
  sport = "Basketball",
  eventId = "live-test-event",
): void {
  const date = new Date();
  const eventDate = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  database
    .prepare(
      `INSERT INTO sports_events (
    event_id, league_id, sport, home_team, away_team, home_score, away_score,
    event_date, status, fetched_date
  ) VALUES (?, ?, ?, ?, ?, '1', '0', ?, 'Live', ?)`,
    )
    .run(
      eventId,
      leagueId,
      sport,
      `Home ${eventId}`,
      `Away ${eventId}`,
      eventDate,
      eventDate,
    );
}

function response(body: unknown, contentType = "application/json"): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: 200,
    headers: { "content-type": contentType },
  });
}

function forecastResponse(): Response {
  return response({
    current: {
      time: "2026-10-10T12:00",
      temperature_2m: 22,
      apparent_temperature: 23,
      relative_humidity_2m: 50,
      precipitation: 0,
      weather_code: 1,
      is_day: 1,
      wind_speed_10m: 8,
      wind_gusts_10m: 12,
      surface_pressure: 1012,
      visibility: 20000,
      uv_index: 2,
      dew_point_2m: 10,
    },
    hourly: { time: [], temperature_2m: [] },
    daily: { time: [] },
  });
}

function prepareDefaultFetch(): void {
  fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/forecast?")) {
      return forecastResponse();
    }
    if (url.includes("/air-quality?")) {
      return response({ current: { us_aqi: 12 } });
    }
    if (url.includes("youtube.com/feeds/videos.xml")) {
      return response("<feed></feed>", "application/xml");
    }
    if (url.includes("/json?poll=1")) {
      return response("");
    }
    return response({});
  });
  vi.stubGlobal("fetch", fetchMock);
}

function initializeModules(): void {
  AstronomyModule.initialize(database);
  WeatherModule.initialize(database);
  SportsModule.initialize(database);
  YouTubeModule.initialize(database);
  RedditModule.initialize(database);
}

function shutdownModules(): void {
  RedditModule.shutdown();
  YouTubeModule.shutdown();
  SportsModule.shutdown();
  WeatherModule.shutdown();
  AstronomyModule.shutdown();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mockedState.cronCallbacks.length = 0;
  intervalCallbacks.length = 0;
  const nativeSetInterval = globalThis.setInterval;
  vi.spyOn(globalThis, "setInterval").mockImplementation(
    (handler, timeout, ...args) => {
      if (typeof handler === "function") {
        intervalCallbacks.push(handler as () => void);
      }
      return nativeSetInterval(handler, timeout, ...args);
    },
  );
  process.env.PERSONAL_NEWS_ELECTRON_HARNESS = "0";
  // Electron exposes a read-only, configurable property; preserve its original
  // descriptor while replacing the resource root for this isolated test.
  Object.defineProperty(process, "resourcesPath", {
    value: process.cwd(),
    configurable: true,
    writable: true,
    enumerable: true,
  });

  database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  mockedState.database = database;
  for (const migration of MIGRATIONS) {
    database.exec(
      readFileSync(
        join(process.cwd(), "src", "main", "db", "migrations", migration),
        "utf8",
      ),
    );
  }
  setSetting("ntfy_topic", "fixture-test-topic");
  setSetting("sports_poll_interval_minutes", "1440");
  setSetting("weather_enabled", "true");
  setSetting("saved_posts_enabled", "true");
  prepareDefaultFetch();

  mockedState.sportsApi.fetchEventById.mockResolvedValue(null);
  mockedState.sportsApi.fetchEventDetails.mockResolvedValue(null);
  mockedState.sportsApi.fetchTeamBadgesForLeague.mockResolvedValue([]);
  mockedState.sportsApi.fetchTeamDetails.mockResolvedValue(null);
  mockedState.sportsApi.fetchLastEventsForTeam.mockResolvedValue([]);
  mockedState.sportsApi.fetchLeagueStandings.mockResolvedValue([]);
  mockedState.sportsApi.fetchLeagueEventsForDateWithFallback.mockResolvedValue(
    [],
  );
  mockedState.sportsApi.fetchLeaguesForSport.mockResolvedValue([]);
  mockedState.sportsApi.fetchNextEventsForTeam.mockResolvedValue([]);
  mockedState.sportsApi.fetchTeamDetailsInLeague.mockResolvedValue(null);
  mockedState.sportsApi.searchTeams.mockResolvedValue([]);
  mockedState.runScript.mockResolvedValue({
    runId: 1,
    scriptId: 1,
    startedAt: 1,
    finishedAt: 2,
    exitCode: 0,
    message: "Script completed.",
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
  } satisfies ScriptRunCompletion);
});

afterEach(() => {
  shutdownModules();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (database?.open) {
    database.close();
  }
  mockedState.database = null;
  if (PREVIOUS_HARNESS_VALUE == null) {
    delete process.env.PERSONAL_NEWS_ELECTRON_HARNESS;
  } else {
    process.env.PERSONAL_NEWS_ELECTRON_HARNESS = PREVIOUS_HARNESS_VALUE;
  }
  if (previousResourcesPathDescriptor == null) {
    Reflect.deleteProperty(process, "resourcesPath");
  } else {
    Object.defineProperty(
      process,
      "resourcesPath",
      previousResourcesPathDescriptor,
    );
  }
});

describe("automatic polling with development fixtures", () => {
  it("pauses startup and scheduled refreshes across restarts, then resumes after clear", async () => {
    seedDevTestData(database);
    initializeModules();
    WeatherModule.start?.();

    for (const callback of mockedState.cronCallbacks) {
      callback?.();
    }
    for (const callback of intervalCallbacks) {
      callback?.();
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      Object.values(mockedState.sportsApi).some(
        (mock) => mock.mock.calls.length,
      ),
    ).toBe(false);

    shutdownModules();
    initializeModules();
    WeatherModule.start?.();
    for (const callback of mockedState.cronCallbacks) {
      callback?.();
    }
    expect(fetchMock).not.toHaveBeenCalled();

    clearDevTestData(database);
    database
      .prepare(
        `INSERT INTO weather_locations (
          id, name, country, country_code, latitude, longitude, timezone, created_at
        ) VALUES ('user-weather', 'User City', 'US', 'US', 40, -73, 'UTC', 1)`,
      )
      .run();
    database
      .prepare(
        `INSERT INTO yt_channels (
          channel_id, name, added_at, enabled, sort_order,
          notify_new_videos, notify_live_start
        ) VALUES ('user-channel', 'User Channel', 1, 1, 0, 0, 0)`,
      )
      .run();
    for (const callback of mockedState.cronCallbacks) {
      callback?.();
    }
    for (const callback of intervalCallbacks) {
      callback?.();
    }

    expect(isDevTestDataActive(database)).toBe(false);
    expect(fetchMock).toHaveBeenCalled();
    expect(mockedState.sportsApi.fetchLeaguesForSport).toHaveBeenCalled();
    expect(getSetting("sports_poll_interval_minutes")).toBe("1440");
  });

  it("retains explicit refreshes while fixtures are active", async () => {
    seedDevTestData(database);
    initializeModules();

    await triggerWeatherRefresh();
    await refreshSportsData("Baseball");
    await triggerYouTubePollNow();
    await triggerNtfyPoll();

    expect(fetchMock).toHaveBeenCalled();
    expect(mockedState.sportsApi.fetchLeaguesForSport).toHaveBeenCalled();
    expect(isDevTestDataActive(database)).toBe(true);
  });

  it("discards an automatic Weather response if fixtures activate in flight", async () => {
    seedDevTestData(database);
    WeatherModule.initialize(database);
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(DEV_TEST_DATA_ACTIVE_SETTING_KEY);

    let releaseForecast!: (value: Response) => void;
    const pendingForecast = new Promise<Response>((resolve) => {
      releaseForecast = resolve;
    });
    fetchMock.mockImplementation((input: string | URL | Request) => {
      return String(input).includes("/forecast?")
        ? pendingForecast
        : Promise.resolve(response({ current: { us_aqi: 12 } }));
    });

    const before = database
      .prepare(
        "SELECT current_json, fetched_at FROM weather_cache WHERE location_id = 'pn_dev_fixture_weather_location'",
      )
      .get();
    const inFlightRefresh = triggerWeatherRefresh(undefined, "automatic");
    expect(fetchMock).toHaveBeenCalled();

    setSetting(DEV_TEST_DATA_ACTIVE_SETTING_KEY, "true");
    releaseForecast(forecastResponse());
    await inFlightRefresh;

    expect(
      database
        .prepare(
          "SELECT current_json, fetched_at FROM weather_cache WHERE location_id = 'pn_dev_fixture_weather_location'",
        )
        .get(),
    ).toEqual(before);
  });

  it("cancels Sports live-refresh timers when fixture mode activates", async () => {
    seedDevTestData(database);
    SportsModule.initialize(database);
    database
      .prepare("DELETE FROM settings WHERE key = ?")
      .run(DEV_TEST_DATA_ACTIVE_SETTING_KEY);
    await refreshSportsData("Fixture League");
    setSetting(DEV_TEST_DATA_ACTIVE_SETTING_KEY, "true");

    const before = database
      .prepare(
        "SELECT home_score, away_score, fetched_date FROM sports_events WHERE event_id = 'pn_dev_fixture_sports_live'",
      )
      .get();
    const liveFetchCount =
      mockedState.sportsApi.fetchEventById.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_001);

    expect(mockedState.sportsApi.fetchEventById).toHaveBeenCalledTimes(
      liveFetchCount,
    );
    expect(
      database
        .prepare(
          "SELECT home_score, away_score, fetched_date FROM sports_events WHERE event_id = 'pn_dev_fixture_sports_live'",
        )
        .get(),
    ).toEqual(before);
  });

  it("queues a manual forced refresh behind an in-flight nonforced refresh", async () => {
    addEnabledSportsLeague("force-semantics");
    setSetting("sports_enabled", "false");
    SportsModule.initialize(database);
    let releaseFirst!: (events: never[]) => void;
    mockedState.sportsApi.fetchLeagueEventsForDateWithFallback
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = resolve;
          }),
      )
      .mockResolvedValue([]);

    const initial = refreshSportsData("Basketball", false);
    await vi.waitFor(() =>
      expect(
        mockedState.sportsApi.fetchLeagueEventsForDateWithFallback,
      ).toHaveBeenCalledTimes(1),
    );
    const forced = refreshSportsData("Basketball", true);
    releaseFirst([]);
    await Promise.all([initial, forced]);

    expect(
      mockedState.sportsApi.fetchLeagueEventsForDateWithFallback,
    ).toHaveBeenCalledTimes(6);
  });

  it("isolates league failures and does not mark a partial refresh current", async () => {
    addEnabledSportsLeague("league-fails");
    addEnabledSportsLeague("league-succeeds");
    setSetting("sports_enabled", "false");
    SportsModule.initialize(database);
    mockedState.sportsApi.fetchLeagueEventsForDateWithFallback.mockImplementation(
      async (_date, leagueId) => {
        if (leagueId === "league-fails")
          throw new Error("simulated league failure");
        return [];
      },
    );

    await refreshSportsData("Basketball", true);

    expect(
      mockedState.sportsApi.fetchLeagueEventsForDateWithFallback,
    ).toHaveBeenCalledTimes(4);
    expect(
      database
        .prepare("SELECT 1 FROM sports_cache_meta WHERE sport = 'Basketball'")
        .get(),
    ).toBeUndefined();
  });

  it("does not advance cache metadata when all enabled leagues fail", async () => {
    addEnabledSportsLeague("all-fail");
    setSetting("sports_enabled", "false");
    SportsModule.initialize(database);
    mockedState.sportsApi.fetchLeagueEventsForDateWithFallback.mockRejectedValue(
      new Error("simulated provider outage"),
    );

    await expect(refreshSportsData("Basketball", true)).rejects.toThrow(
      "all enabled Basketball leagues",
    );
    expect(
      database
        .prepare("SELECT 1 FROM sports_cache_meta WHERE sport = 'Basketball'")
        .get(),
    ).toBeUndefined();
  });

  it("retains cached live scores and reschedules polling after provider errors", async () => {
    addEnabledSportsLeague("live-resilience");
    addLiveSportsEvent("live-resilience");
    setSetting("sports_enabled", "false");
    SportsModule.initialize(database);
    await refreshSportsData("Basketball", true);
    const metadataBefore = database
      .prepare(
        "SELECT fetched_at FROM sports_cache_meta WHERE sport = 'Basketball'",
      )
      .get();
    mockedState.sportsApi.fetchEventById.mockRejectedValue(
      new Error("simulated outage"),
    );
    mockedState.sportsApi.fetchLeagueEventsForDateWithFallback.mockRejectedValue(
      new Error("simulated outage"),
    );

    await vi.advanceTimersByTimeAsync(60_001);
    const retained = database
      .prepare(
        "SELECT home_score, away_score FROM sports_events WHERE event_id = 'live-test-event'",
      )
      .get();
    expect(retained).toEqual({ home_score: "1", away_score: "0" });
    expect(mockedState.sportsApi.fetchEventById).toHaveBeenCalledTimes(1);
    expect(
      database
        .prepare(
          "SELECT fetched_at FROM sports_cache_meta WHERE sport = 'Basketball'",
        )
        .get(),
    ).toEqual(metadataBefore);

    await vi.advanceTimersByTimeAsync(60_001);
    expect(mockedState.sportsApi.fetchEventById).toHaveBeenCalledTimes(2);
  });

  it("fetches the live fallback scoreboard once for multiple games in a league/date", async () => {
    addEnabledSportsLeague("live-batch");
    addLiveSportsEvent("live-batch", "Basketball", "batch-one");
    addLiveSportsEvent("live-batch", "Basketball", "batch-two");
    setSetting("sports_enabled", "false");
    SportsModule.initialize(database);
    await refreshSportsData("Basketball", true);
    mockedState.sportsApi.fetchEventById.mockResolvedValue(null);
    const today = [
      new Date().getFullYear(),
      String(new Date().getMonth() + 1).padStart(2, "0"),
      String(new Date().getDate()).padStart(2, "0"),
    ].join("-");
    mockedState.sportsApi.fetchLeagueEventsForDateWithFallback
      .mockClear()
      .mockResolvedValue([
        {
          eventId: "batch-one",
          leagueId: "live-batch",
          sport: "Basketball",
          homeTeamId: null,
          awayTeamId: null,
          homeTeam: "Home batch-one",
          awayTeam: "Away batch-one",
          homeTeamBadgeUrl: null,
          awayTeamBadgeUrl: null,
          homeScore: "1",
          awayScore: "0",
          eventDate: today,
          eventTime: null,
          status: "Live",
          venue: null,
        },
        {
          eventId: "batch-two",
          leagueId: "live-batch",
          sport: "Basketball",
          homeTeamId: null,
          awayTeamId: null,
          homeTeam: "Home batch-two",
          awayTeam: "Away batch-two",
          homeTeamBadgeUrl: null,
          awayTeamBadgeUrl: null,
          homeScore: "1",
          awayScore: "0",
          eventDate: today,
          eventTime: null,
          status: "Live",
          venue: null,
        },
      ]);

    await vi.advanceTimersByTimeAsync(60_001);

    expect(
      mockedState.sportsApi.fetchLeagueEventsForDateWithFallback,
    ).toHaveBeenCalledTimes(1);
    expect(
      mockedState.sportsApi.fetchLeagueEventsForDateWithFallback,
    ).toHaveBeenCalledWith(
      today,
      "live-batch",
      "Basketball",
      "live-batch League",
      { forceMergeEspn: true },
    );
  });

  it("keeps one live event failure from discarding another event's successful score", async () => {
    addEnabledSportsLeague("event-isolation");
    addLiveSportsEvent("event-isolation", "Basketball", "bad-event");
    addLiveSportsEvent("event-isolation", "Basketball", "good-event");
    setSetting("sports_enabled", "false");
    SportsModule.initialize(database);
    await refreshSportsData("Basketball", true);
    mockedState.sportsApi.fetchLeagueEventsForDateWithFallback.mockRejectedValue(
      new Error("fallback unavailable"),
    );
    mockedState.sportsApi.fetchEventById.mockImplementation(
      async (eventId: string) => {
        if (eventId === "bad-event") throw new Error("one event unavailable");
        const date = new Date();
        const eventDate = [
          date.getFullYear(),
          String(date.getMonth() + 1).padStart(2, "0"),
          String(date.getDate()).padStart(2, "0"),
        ].join("-");
        return {
          eventId,
          leagueId: "event-isolation",
          sport: "Basketball",
          homeTeamId: null,
          awayTeamId: null,
          homeTeam: `Home ${eventId}`,
          awayTeam: `Away ${eventId}`,
          homeTeamBadgeUrl: null,
          awayTeamBadgeUrl: null,
          homeScore: "5",
          awayScore: "0",
          eventDate,
          eventTime: null,
          status: "Live",
          venue: null,
        };
      },
    );

    await vi.advanceTimersByTimeAsync(60_001);

    expect(
      database
        .prepare(
          "SELECT home_score FROM sports_events WHERE event_id = 'bad-event'",
        )
        .get(),
    ).toEqual({ home_score: "1" });
    expect(
      database
        .prepare(
          "SELECT home_score FROM sports_events WHERE event_id = 'good-event'",
        )
        .get(),
    ).toEqual({ home_score: "5" });
  });

  it("waits for an active live write before starting a forced full refresh", async () => {
    addEnabledSportsLeague("refresh-order");
    addLiveSportsEvent("refresh-order");
    setSetting("sports_enabled", "false");
    SportsModule.initialize(database);
    await refreshSportsData("Basketball", true);
    let releaseLive!: (value: unknown) => void;
    mockedState.sportsApi.fetchEventById.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseLive = resolve;
        }),
    );
    mockedState.sportsApi.fetchLeagueEventsForDateWithFallback.mockClear();

    await vi.advanceTimersByTimeAsync(60_001);
    await vi.waitFor(() =>
      expect(mockedState.sportsApi.fetchEventById).toHaveBeenCalledTimes(1),
    );
    const forcedRefresh = refreshSportsData("Basketball", true);
    await Promise.resolve();
    expect(
      mockedState.sportsApi.fetchLeagueEventsForDateWithFallback,
    ).not.toHaveBeenCalled();

    const date = new Date();
    const eventDate = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    releaseLive({
      eventId: "live-test-event",
      leagueId: "refresh-order",
      sport: "Basketball",
      homeTeamId: null,
      awayTeamId: null,
      homeTeam: "Home live-test-event",
      awayTeam: "Away live-test-event",
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: null,
      homeScore: "2",
      awayScore: "0",
      eventDate,
      eventTime: null,
      status: "Live",
      venue: null,
    });
    await forcedRefresh;

    expect(
      mockedState.sportsApi.fetchLeagueEventsForDateWithFallback,
    ).toHaveBeenCalledTimes(3);
  });

  it("does not suppress unrelated user-authored scheduled scripts", async () => {
    seedDevTestData(database);
    const now = Math.floor(Date.now() / 1000);
    const insertScript = database.prepare(
      `INSERT INTO scripts (id, name, file_path, interpreter, enabled, created_at)
       VALUES (?, ?, ?, ?, 1, ?)`,
    );
    insertScript.run(801, "User Script", "C:\\scripts\\user.py", "python", now);
    insertScript.run(
      802,
      "Bundled Reddit Digest",
      "C:\\resources\\reddit_digest.py",
      "python",
      now,
    );
    setSetting("reddit_digest_script_id", "802");
    database
      .prepare(
        "INSERT INTO script_runs (id, script_id, started_at) VALUES (1, 801, ?), (2, 802, ?)",
      )
      .run(now, now);

    const userScript = {
      id: 801,
      name: "User Script",
      description: null,
      file_path: "C:\\scripts\\user.py",
      interpreter: "python",
      args: null,
      schedule: null,
      enabled: 1,
      created_at: now,
      started_at: null,
      finished_at: null,
      exit_code: null,
      is_stale: false,
    };
    const bundledScript = {
      ...userScript,
      id: 802,
      name: "Bundled Reddit Digest",
      file_path: "C:\\resources\\reddit_digest.py",
    };
    mockedState.runScript.mockImplementation(
      async (_db, script, _options, _onOutput, _activeRuns) => ({
        runId: script.id === 801 ? 1 : 2,
        scriptId: script.id,
        startedAt: now,
        finishedAt: now + 1,
        exitCode: 0,
        message: "Script completed.",
        stdout: '{"posts":[]}',
        stderr: "",
        stdoutTruncated: false,
      }),
    );

    await runScriptById(database, userScript, { trigger: "scheduled" });
    for (const trigger of ["scheduled", "on_app_start", "catch_up"] as const) {
      await runScriptById(database, bundledScript, { trigger });
    }
    await runScriptById(database, bundledScript, { trigger: "manual" });

    expect(mockedState.runScript).toHaveBeenCalledTimes(2);
    expect(mockedState.runScript).toHaveBeenCalledWith(
      database,
      userScript,
      expect.any(Object),
      expect.any(Function),
      expect.any(Map),
    );
  });
});
