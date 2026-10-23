import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../harness-mode", () => ({ isElectronHarnessRun: () => false }));

describe("sports API request reuse", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shares concurrent league catalog requests", async () => {
    vi.resetModules();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            leagues: [
              { idLeague: "4387", strLeague: "NBA", strSport: "Basketball" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchLeaguesForSport } = await import("../api");

    const [first, second] = await Promise.all([
      fetchLeaguesForSport("Basketball"),
      fetchLeaguesForSport("Basketball"),
    ]);

    expect(first).toEqual(second);
    expect(first).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries transient provider responses and returns the recovered payload", async () => {
    vi.resetModules();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("temporary", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            teams: [
              {
                idTeam: "1",
                idLeague: "4387",
                strTeam: "Example",
                strLeague: "NBA",
                strSport: "Basketball",
              },
            ],
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { searchTeams } = await import("../api");

    await expect(searchTeams("Example", "Basketball")).resolves.toMatchObject([
      { teamId: "1", name: "Example" },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors a shared provider Retry-After cooldown across different requests", async () => {
    vi.resetModules();
    const starts: number[] = [];
    const fetchMock = vi.fn(async () => {
      starts.push(Date.now());
      if (starts.length === 1)
        return new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "3" },
        });
      return new Response(JSON.stringify({ teams: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { searchTeams } = await import("../api");

    await Promise.all([
      searchTeams("First", "Basketball"),
      searchTeams("Second", "Basketball"),
    ]);

    expect(starts.length).toBeGreaterThanOrEqual(3);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(2_900);
  }, 15_000);

  it("uses ESPN when SportsDB fails, and SportsDB when ESPN fails", async () => {
    vi.resetModules();
    const sportsDbEvent = {
      idEvent: "db-1",
      idLeague: "4387",
      strSport: "Basketball",
      strHomeTeam: "DB Home",
      strAwayTeam: "DB Away",
      dateEvent: "2026-10-23",
    };
    const espnPayload = {
      events: [
        {
          id: "7",
          date: "2026-10-23T17:00:00Z",
          competitions: [
            {
              competitors: [
                {
                  homeAway: "home",
                  score: "70",
                  team: { id: "h", displayName: "ESPN Home" },
                },
                {
                  homeAway: "away",
                  score: "65",
                  team: { id: "a", displayName: "ESPN Away" },
                },
              ],
              status: { type: { state: "in", shortDetail: "Q3" } },
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("thesportsdb.com"))
        return new Response(JSON.stringify({ events: [sportsDbEvent] }), {
          status: 200,
        });
      return new Response(JSON.stringify(espnPayload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { fetchLeagueEventsForDateWithFallback } = await import("../api");
    const merged = await fetchLeagueEventsForDateWithFallback(
      "2026-10-23",
      "4387",
      "Basketball",
      "NBA",
    );
    expect(merged.map((event) => event.eventId)).toContain("espn:7");

    vi.resetModules();
    const dbOnlyFetch = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("thesportsdb.com")
        ? new Response(JSON.stringify({ events: [sportsDbEvent] }), {
            status: 200,
          })
        : new Response("unavailable", { status: 404 }),
    );
    vi.stubGlobal("fetch", dbOnlyFetch);
    const dbOnlyApi = await import("../api");
    await expect(
      dbOnlyApi.fetchLeagueEventsForDateWithFallback(
        "2026-10-23",
        "4387",
        "Basketball",
        "NBA",
      ),
    ).resolves.toMatchObject([{ eventId: "db-1" }]);
  });

  it("returns ESPN results when the SportsDB provider fails", async () => {
    vi.resetModules();
    const espnPayload = {
      events: [
        {
          id: "provider-fallback",
          date: "2026-10-23T17:00:00Z",
          competitions: [
            {
              competitors: [
                {
                  homeAway: "home",
                  score: "3",
                  team: { id: "h", displayName: "Home" },
                },
                {
                  homeAway: "away",
                  score: "2",
                  team: { id: "a", displayName: "Away" },
                },
              ],
              status: { type: { state: "in", shortDetail: "Live" } },
            },
          ],
        },
      ],
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) =>
      String(input).includes("thesportsdb.com")
        ? new Response("provider unavailable", { status: 404 })
        : new Response(JSON.stringify(espnPayload), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchLeagueEventsForDateWithFallback } = await import("../api");

    await expect(
      fetchLeagueEventsForDateWithFallback(
        "2026-10-23",
        "4387",
        "Basketball",
        "NBA",
      ),
    ).resolves.toMatchObject([{ eventId: "espn:provider-fallback" }]);
  });

  it("reports an aggregate error when both providers fail", async () => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 404 })),
    );
    const { fetchLeagueEventsForDateWithFallback } = await import("../api");
    await expect(
      fetchLeagueEventsForDateWithFallback(
        "2026-10-23",
        "4387",
        "Basketball",
        "NBA",
      ),
    ).rejects.toThrow("Both sports providers failed");
  });

  it("reuses SportsDB event details briefly, then refetches after the 10 second TTL", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            events: [
              {
                idEvent: "details-1",
                idLeague: "4387",
                strSport: "Basketball",
                strHomeTeam: "Home",
                strAwayTeam: "Away",
                dateEvent: "2026-10-23",
                strDescriptionEN: "Details",
              },
            ],
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchEventDetails } = await import("../api");

    await fetchEventDetails("details-1");
    await fetchEventDetails("details-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_001);
    await fetchEventDetails("details-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches ESPN scoreboards for 15 seconds and refetches promptly after expiry", async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-23T12:00:00Z"));
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ events: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { fetchEspnEventDetails } = await import("../api");
    const event = {
      eventId: "espn:scoreboard-1",
      leagueId: "4387",
      sport: "Basketball",
      homeTeamId: null,
      awayTeamId: null,
      homeTeam: "Home",
      awayTeam: "Away",
      homeTeamBadgeUrl: null,
      awayTeamBadgeUrl: null,
      homeScore: "1",
      awayScore: "0",
      eventDate: "2026-10-23",
      eventTime: null,
      status: "Live",
      venue: null,
    };

    await fetchEspnEventDetails(event);
    await fetchEspnEventDetails(event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_001);
    await fetchEspnEventDetails(event);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
