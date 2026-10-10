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
const previousResourcesPath = (
  process as NodeJS.Process & {
    resourcesPath?: string;
  }
).resourcesPath;

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
  (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath =
    process.cwd();

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
  if (previousResourcesPath == null) {
    Reflect.deleteProperty(process, "resourcesPath");
  } else {
    (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath =
      previousResourcesPath;
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
