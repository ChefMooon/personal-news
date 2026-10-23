import { createServer } from "node:http";
import { runElectronHarness } from "./electron-playwright-harness.mjs";

let providerState = "healthy";
let score = "1";
let lookupRequests = 0;
const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  response.setHeader("content-type", "application/json");
  if (url.pathname.endsWith("/all_leagues.php")) {
    response.end(
      JSON.stringify({
        leagues: [
          {
            idLeague: "harness-soccer",
            strLeague: "Harness Soccer",
            strSport: "Soccer",
          },
        ],
      }),
    );
    return;
  }
  if (url.pathname.endsWith("/eventsday.php")) {
    response.end(JSON.stringify({ events: [event(score)] }));
    return;
  }
  if (url.pathname.endsWith("/lookupevent.php")) {
    lookupRequests += 1;
    if (providerState === "outage") {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: "simulated provider outage" }));
      return;
    }
    response.end(JSON.stringify({ events: [event(score)] }));
    return;
  }
  response.end(JSON.stringify({ teams: [] }));
});

function event(homeScore) {
  const date = new Date();
  const eventDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return {
    idEvent: "harness-live-event",
    idLeague: "harness-soccer",
    strSport: "Soccer",
    strHomeTeam: "Harness Home",
    strAwayTeam: "Harness Away",
    intHomeScore: homeScore,
    intAwayScore: "0",
    dateEvent: eventDate,
    strStatus: "Live",
  };
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const providerBase = `http://127.0.0.1:${address.port}/api`;

try {
  const result = await runElectronHarness({
    name: "sports-provider-resilience",
    extraEnv: {
      PERSONAL_NEWS_HARNESS_SPORTS_DB_BASE_URL: providerBase,
      PERSONAL_NEWS_HARNESS_SPORTS_LIVE_INTERVAL_MS: "250",
    },
    scenario: async ({ page, record }) => {
      const invoke = (channel, args) =>
        page.evaluate(({ channel, args }) => window.api.invoke(channel, args), {
          channel,
          args,
        });
      const leagues = await invoke("sports:getLeagues", { sport: "Soccer" });
      if (!leagues.some((league) => league.leagueId === "harness-soccer"))
        throw new Error("Harness provider league was not loaded");
      await invoke("sports:addLeague", {
        leagueId: "harness-soccer",
        sport: "Soccer",
      });

      const waitForScore = async (expected) => {
        const deadline = Date.now() + 12_000;
        while (Date.now() < deadline) {
          const events = await invoke("sports:getTodayEvents", {
            sport: "Soccer",
          });
          if (
            events.some(
              (item) =>
                item.eventId === "harness-live-event" &&
                item.homeScore === expected,
            )
          )
            return events;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        throw new Error(`Timed out waiting for cached home score ${expected}`);
      };

      await waitForScore("1");
      providerState = "outage";
      const requestsBeforeOutage = lookupRequests;
      const outageDeadline = Date.now() + 8_000;
      while (
        lookupRequests === requestsBeforeOutage &&
        Date.now() < outageDeadline
      )
        await new Promise((resolve) => setTimeout(resolve, 50));
      if (lookupRequests === requestsBeforeOutage)
        throw new Error(
          "Live poll did not reach the simulated provider outage",
        );
      const retained = await invoke("sports:getTodayEvents", {
        sport: "Soccer",
      });
      if (
        !retained.some(
          (item) =>
            item.eventId === "harness-live-event" && item.homeScore === "1",
        )
      )
        throw new Error("Cached score was lost during provider outage");
      record(
        "sports-resilience",
        "Cached score remained available during provider outage",
      );

      const requestsAtRecovery = lookupRequests;
      providerState = "healthy";
      score = "2";
      const updated = await waitForScore("2");
      if (lookupRequests <= requestsAtRecovery)
        throw new Error("Live polling did not resume after provider recovery");
      record(
        "sports-resilience",
        "Automatic live polling updated cached score after provider recovery",
      );
      if (
        !updated.some(
          (item) =>
            item.eventId === "harness-live-event" && item.homeScore === "2",
        )
      )
        throw new Error("Recovered score was not persisted through IPC");
    },
  });
  console.log(
    `Sports provider resilience harness passed; artifacts: ${result.artifacts}`,
  );
} finally {
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
