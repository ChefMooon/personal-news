import type {
  SportEvent,
  SportEventDetail,
  SportLeague,
  SportStandingRow,
  TeamSearchResult,
} from "../../../shared/ipc-types";
import { normalizeEventStatus } from "./status";
import { isElectronHarnessRun } from "../../harness-mode";

const SPORTS_DB_FREE_API_KEY = "123";
const DEFAULT_SPORTS_DB_BASE_URL = `https://www.thesportsdb.com/api/v1/json/${SPORTS_DB_FREE_API_KEY}`;
const SPORTS_DB_BASE_URL = (() => {
  const override = process.env.PERSONAL_NEWS_HARNESS_SPORTS_DB_BASE_URL?.trim();
  return isElectronHarnessRun() && override
    ? override.replace(/\/$/, "")
    : DEFAULT_SPORTS_DB_BASE_URL;
})();
const ESPN_CORE_BASE_URL = "https://sports.core.api.espn.com/v2";
// The free SportsDB key is quota limited; leave substantial headroom for bursts.
const SPORTS_DB_MIN_INTERVAL_MS = 2_500;
const ESPN_MIN_INTERVAL_MS = 300;
const SPORTS_API_MAX_RETRIES = 3;
const SPORTS_API_TIMEOUT_MS = 12_000;

function isTransientSportsApiStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

const requestState = new Map<
  string,
  { lastAt: number; cooldownUntil: number; queue: Promise<void> }
>();
const inFlightGets = new Map<string, Promise<string>>();
const responseCache = new Map<string, { expiresAt: number; body: string }>();
let leaguesCatalogPromise: Promise<SportLeague[]> | null = null;
const espnTeamCache = new Map<
  string,
  { expiresAt: number; promise: Promise<EspnTeam | null> }
>();

type SportsDbLeague = {
  idLeague?: string;
  strLeague?: string;
  strCountry?: string;
  strBadge?: string;
  strLogo?: string;
  strLogoWide?: string;
  strSport?: string;
};

type SportsDbTeam = {
  idTeam?: string;
  idLeague?: string;
  strTeam?: string;
  strTeamShort?: string;
  strLeague?: string;
  strSport?: string;
  strTeamBadge?: string;
  strBadge?: string;
  strTeamLogo?: string;
  strLogo?: string;
  strLogoWide?: string;
};

type SportsDbEvent = {
  idEvent?: string;
  idLeague?: string;
  strSport?: string;
  idHomeTeam?: string;
  idAwayTeam?: string;
  strHomeTeam?: string;
  strAwayTeam?: string;
  intHomeScore?: string | number | null;
  intAwayScore?: string | number | null;
  dateEvent?: string;
  strTime?: string | null;
  strStatus?: string | null;
  strVenue?: string | null;
  strProgress?: string | null;
  strDescriptionEN?: string | null;
};

type SportsDbStanding = {
  intRank?: string | number | null;
  idTeam?: string | null;
  strTeam?: string | null;
  intPlayed?: string | number | null;
  intWin?: string | number | null;
  intLoss?: string | number | null;
  intDraw?: string | number | null;
  intPoints?: string | number | null;
  intGoalsFor?: string | number | null;
  intGoalsAgainst?: string | number | null;
  intGoalDifference?: string | number | null;
  strForm?: string | null;
  strDescription?: string | null;
};

type EspnReference = {
  $ref?: string;
};

type EspnStat = {
  name?: string;
  displayName?: string;
  value?: string | number | null;
  displayValue?: string | null;
};

type EspnRecord = {
  name?: string;
  displayName?: string;
  summary?: string | null;
  stats?: EspnStat[];
};

type EspnStandingEntry = {
  team?: EspnReference;
  records?: EspnRecord[];
};

type EspnStandingsGroup = {
  $ref?: string;
  name?: string;
  displayName?: string;
  standings?: EspnReference | EspnStandingEntry[];
};

type EspnStandingsCollection = {
  $ref?: string;
  items?: EspnStandingsGroup[];
};

type EspnTeam = {
  id?: string | number;
  displayName?: string;
};

type EspnScoreboardTeam = {
  id?: string | number;
  displayName?: string;
};

type EspnScoreboardCompetitor = {
  homeAway?: "home" | "away" | string;
  score?: string | number | null;
  team?: EspnScoreboardTeam;
};

type EspnScoreboardStatusType = {
  state?: string;
  shortDetail?: string;
  detail?: string;
  description?: string;
};

type EspnScoreboardCompetitionStatus = {
  type?: EspnScoreboardStatusType;
};

type EspnScoreboardCompetition = {
  competitors?: EspnScoreboardCompetitor[];
  status?: EspnScoreboardCompetitionStatus;
  venue?: {
    fullName?: string;
  };
};

type EspnScoreboardEvent = {
  id?: string | number;
  date?: string;
  competitions?: EspnScoreboardCompetition[];
};

type EspnScoreboardResponse = {
  events?: EspnScoreboardEvent[];
};

function parseInteger(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDecimal(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRemoteUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function normalizeClockTime(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : null;
}

function normalizeLookupKey(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function extractRefId(ref: string | undefined): string | null {
  if (!ref) {
    return null;
  }

  try {
    const url = new URL(ref);
    const parts = url.pathname.split("/").filter(Boolean);
    return parts.at(-1) ?? null;
  } catch {
    return null;
  }
}

function extractFirstArray<T>(payload: unknown): T[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      return value as T[];
    }
  }

  return [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const retryAt = Date.parse(value);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.max(0, retryAt - Date.now());
}

function cacheResponse(url: string, body: string, ttlMs: number): void {
  const now = Date.now();
  for (const [key, value] of responseCache) {
    if (value.expiresAt <= now) responseCache.delete(key);
  }
  while (responseCache.size >= 250) {
    const oldest = responseCache.keys().next().value;
    if (oldest === undefined) break;
    responseCache.delete(oldest);
  }
  responseCache.set(url, { body, expiresAt: now + ttlMs });
}

async function scheduleSportsRequest<T>(
  url: string,
  task: () => Promise<T>,
): Promise<T> {
  const host = new URL(url).hostname;
  const minimumInterval =
    isElectronHarnessRun() &&
    new URL(url).origin === new URL(SPORTS_DB_BASE_URL).origin
      ? 0
      : host === "www.thesportsdb.com"
        ? SPORTS_DB_MIN_INTERVAL_MS
        : ESPN_MIN_INTERVAL_MS;
  const state = requestState.get(host) ?? {
    lastAt: 0,
    cooldownUntil: 0,
    queue: Promise.resolve(),
  };
  requestState.set(host, state);
  const previous = state.queue;
  let releaseQueue!: () => void;
  state.queue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previous;

  const waitMs = Math.max(
    0,
    state.cooldownUntil - Date.now(),
    minimumInterval - (Date.now() - state.lastAt),
  );
  if (waitMs > 0) {
    await delay(waitMs);
  }

  state.lastAt = Date.now();

  try {
    const result = await task();
    if (result instanceof Response && result.status === 429) {
      const retryAfter =
        parseRetryAfterMs(result.headers.get("retry-after")) ?? 1_000;
      state.cooldownUntil = Math.max(
        state.cooldownUntil,
        Date.now() + retryAfter,
      );
    }
    return result;
  } finally {
    releaseQueue();
  }
}

function retryDelay(url: string, response: Response, attempt: number): number {
  const value = parseRetryAfterMs(response.headers.get("retry-after"));
  const wait = value ?? 1_000 * 2 ** attempt;
  const state = requestState.get(new URL(url).hostname);
  if (response.status === 429 && state)
    state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + wait);
  return Math.min(wait, 30_000);
}

async function fetchText(url: string): Promise<string> {
  const cached = responseCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.body;
  if (cached) responseCache.delete(url);
  const pending = inFlightGets.get(url);
  if (pending) return pending;
  const task = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= SPORTS_API_MAX_RETRIES; attempt += 1) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const response = await scheduleSportsRequest(url, () => {
          const controller = new AbortController();
          timeout = setTimeout(() => controller.abort(), SPORTS_API_TIMEOUT_MS);
          return fetch(url, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
        });
        const body = await response.text(); // deadline also bounds body consumption
        if (!response.ok) {
          if (
            isTransientSportsApiStatus(response.status) &&
            attempt < SPORTS_API_MAX_RETRIES
          ) {
            const wait = retryDelay(url, response, attempt);
            await delay(wait);
            continue;
          }
          throw new Error(
            `Sports provider ${new URL(url).hostname} returned HTTP ${response.status} for ${new URL(url).pathname}.`,
          );
        }
        const { hostname, pathname } = new URL(url);
        if (/\/lookupevent\.php$/.test(pathname)) {
          cacheResponse(url, body, 10_000);
        } else if (/\/scoreboard$/.test(pathname)) {
          cacheResponse(url, body, 15_000);
        } else if (
          /\/search_all_teams\.php|\/lookuptable\.php|\/standings/.test(
            pathname,
          )
        ) {
          cacheResponse(
            url,
            body,
            /lookuptable|standings/.test(url) ? 5 * 60_000 : 60 * 60_000,
          );
        } else if (
          hostname === "sports.core.api.espn.com" &&
          /\/teams\//.test(pathname)
        ) {
          cacheResponse(url, body, 15 * 60_000);
        }
        return body;
      } catch (error) {
        lastError = error;
        if (error instanceof Error && / returned HTTP \d+/.test(error.message))
          break;
        if (attempt >= SPORTS_API_MAX_RETRIES) break;
        await delay(Math.min(1_000 * 2 ** attempt, 8_000));
      } finally {
        if (timeout) clearTimeout(timeout);
      }
    }
    const reason =
      lastError instanceof Error
        ? lastError.name === "AbortError"
          ? "timed out"
          : lastError.message
        : "network failure";
    throw new Error(
      `Sports provider request failed (${new URL(url).hostname}${new URL(url).pathname}): ${reason}`,
    );
  })();
  inFlightGets.set(url, task);
  try {
    return await task;
  } finally {
    inFlightGets.delete(url);
  }
}

async function request<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const search = new URLSearchParams(params);
  const url = `${SPORTS_DB_BASE_URL}/${path}?${search.toString()}`;

  const raw = await fetchText(url);
  if (!raw.trim()) {
    return [];
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(
      `Sports API returned invalid JSON for ${path}: ${error instanceof Error ? error.message : "Unknown parse error."}`,
    );
  }

  return extractFirstArray<T>(payload);
}

async function requestJsonFromUrl<T>(url: string): Promise<T> {
  const raw = await fetchText(url);
  if (!raw.trim()) {
    throw new Error(`Sports API returned an empty response for ${url}.`);
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(
      `Sports API returned invalid JSON for ${url}: ${error instanceof Error ? error.message : "Unknown parse error."}`,
    );
  }
}

function getEspnStat(
  record: EspnRecord | undefined,
  names: string[],
): EspnStat | null {
  if (!record?.stats) {
    return null;
  }

  const wanted = new Set(names.map((name) => normalizeLookupKey(name)));
  return (
    record.stats.find((stat) =>
      wanted.has(normalizeLookupKey(stat.name ?? stat.displayName ?? "")),
    ) ?? null
  );
}

function getEspnStatInteger(
  record: EspnRecord | undefined,
  names: string[],
): number | null {
  const stat = getEspnStat(record, names);
  return parseInteger(stat?.value ?? stat?.displayValue);
}

function getEspnStatDecimal(
  record: EspnRecord | undefined,
  names: string[],
): number | null {
  const stat = getEspnStat(record, names);
  return parseDecimal(stat?.value ?? stat?.displayValue);
}

function getEspnStatDisplay(
  record: EspnRecord | undefined,
  names: string[],
): string | null {
  const stat = getEspnStat(record, names);
  const display = stat?.displayValue?.trim();
  if (display) {
    return display;
  }

  if (stat?.value == null || stat.value === "") {
    return null;
  }

  return String(stat.value);
}

function getEspnPrimaryRecord(
  records: EspnRecord[] | undefined,
): EspnRecord | undefined {
  if (!records || records.length === 0) {
    return undefined;
  }

  return (
    records.find((record) => {
      const key = normalizeLookupKey(record.name ?? record.displayName ?? "");
      return (
        key === "overall" ||
        key === "leaguestandings" ||
        key === "teamseasonrecord"
      );
    }) ?? records[0]
  );
}

function getEspnDescription(record: EspnRecord | undefined): string | null {
  const clincher = getEspnStatDisplay(record, ["clincher"]);
  if (clincher) {
    return clincher;
  }

  const gamesBehind = getEspnStatDisplay(record, [
    "gamesBehind",
    "divisionGamesBehind",
  ]);
  if (gamesBehind && gamesBehind !== "0" && gamesBehind !== "0.0") {
    return `GB ${gamesBehind}`;
  }

  const gamesAhead = getEspnStatDisplay(record, ["gamesAhead"]);
  if (gamesAhead && gamesAhead !== "0" && gamesAhead !== "0.0") {
    return `GA ${gamesAhead}`;
  }

  return null;
}

function resolveEspnStandingsLeague(
  leagueId: string,
  sport: string,
  leagueName?: string,
): { sportPath: string; leaguePath: string } | null {
  const normalizedName = leagueName?.trim() ?? "";

  if (
    sport === "Baseball" &&
    (leagueId === "4424" ||
      /major league baseball|\bmlb\b/i.test(normalizedName))
  ) {
    return { sportPath: "baseball", leaguePath: "mlb" };
  }

  if (
    sport === "Basketball" &&
    (leagueId === "4387" ||
      /national basketball association|\bnba\b/i.test(normalizedName))
  ) {
    return { sportPath: "basketball", leaguePath: "nba" };
  }

  if (
    sport === "Ice Hockey" &&
    (leagueId === "4380" ||
      /national hockey league|\bnhl\b/i.test(normalizedName))
  ) {
    return { sportPath: "hockey", leaguePath: "nhl" };
  }

  return null;
}

function toEspnDateParam(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return null;
  }

  return date.replace(/-/g, "");
}

function normalizeHomeAway(
  value: string | null | undefined,
): "home" | "away" | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "home" || normalized === "away") {
    return normalized;
  }

  return null;
}

function toDatePartsFromIso(
  isoDate: string,
): { eventDate: string; eventTime: string | null } | null {
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getUTCFullYear();
  const month = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const hour = String(parsed.getUTCHours()).padStart(2, "0");
  const minute = String(parsed.getUTCMinutes()).padStart(2, "0");

  return {
    eventDate: `${year}-${month}-${day}`,
    eventTime: `${hour}:${minute}`,
  };
}

function mapEspnScoreboardEvent(
  row: EspnScoreboardEvent,
  leagueId: string,
  sport: string,
): SportEvent | null {
  const competition = row.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find(
    (entry) => normalizeHomeAway(entry.homeAway) === "home",
  );
  const away = competitors.find(
    (entry) => normalizeHomeAway(entry.homeAway) === "away",
  );
  const homeName = home?.team?.displayName?.trim();
  const awayName = away?.team?.displayName?.trim();
  const dateParts = row.date ? toDatePartsFromIso(row.date) : null;

  if (
    !row.id ||
    competitors.length < 2 ||
    !homeName ||
    !awayName ||
    !dateParts
  ) {
    return null;
  }

  const statusType = competition?.status?.type;
  const state = (statusType?.state ?? "").toLowerCase();
  const statusText =
    statusType?.shortDetail?.trim() ||
    statusType?.detail?.trim() ||
    statusType?.description?.trim() ||
    null;
  const isPre = state === "pre";

  return {
    eventId: `espn:${row.id}`,
    leagueId,
    sport,
    homeTeamId: home?.team?.id == null ? null : String(home.team.id),
    awayTeamId: away?.team?.id == null ? null : String(away.team.id),
    homeTeam: homeName,
    awayTeam: awayName,
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: isPre ? null : home?.score == null ? null : String(home.score),
    awayScore: isPre ? null : away?.score == null ? null : String(away.score),
    eventDate: dateParts.eventDate,
    eventTime: dateParts.eventTime,
    status: isPre ? "Scheduled" : statusText,
    venue: competition?.venue?.fullName ?? null,
  };
}

async function fetchEspnLeagueEventsForDate(
  date: string,
  leagueId: string,
  sport: string,
  leagueName?: string,
): Promise<SportEvent[] | null> {
  const espnLeague = resolveEspnStandingsLeague(leagueId, sport, leagueName);
  if (!espnLeague) {
    return null;
  }

  const dateParam = toEspnDateParam(date);
  if (!dateParam) {
    return [];
  }

  const url = `https://site.api.espn.com/apis/site/v2/sports/${espnLeague.sportPath}/${espnLeague.leaguePath}/scoreboard?dates=${dateParam}`;
  const payload = await requestJsonFromUrl<EspnScoreboardResponse>(url);
  const events = payload.events ?? [];

  return events
    .map((event) => mapEspnScoreboardEvent(event, leagueId, sport))
    .filter((item): item is SportEvent => item !== null);
}

function supportsLeagueFallback(sport: string, leagueId: string): boolean {
  return (
    (sport === "Baseball" && leagueId === "4424") ||
    (sport === "Basketball" && leagueId === "4387") ||
    (sport === "Ice Hockey" && leagueId === "4380")
  );
}

async function fetchEspnTeam(teamRef: string): Promise<EspnTeam | null> {
  const cached = espnTeamCache.get(teamRef);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.promise;
  }
  if (cached) espnTeamCache.delete(teamRef);

  const pending = requestJsonFromUrl<EspnTeam>(teamRef)
    .catch(() => null)
    .then((team) => {
      if (!team) espnTeamCache.delete(teamRef);
      return team;
    });
  if (espnTeamCache.size >= 300)
    espnTeamCache.delete(espnTeamCache.keys().next().value!);
  espnTeamCache.set(teamRef, {
    expiresAt: Date.now() + 15 * 60_000,
    promise: pending,
  });
  return pending;
}

async function fetchEspnStandings(
  leagueId: string,
  sport: string,
  season: string,
  leagueName?: string,
): Promise<SportStandingRow[] | null> {
  const espnLeague = resolveEspnStandingsLeague(leagueId, sport, leagueName);
  if (!espnLeague) {
    return null;
  }

  const rootUrl = `${ESPN_CORE_BASE_URL}/sports/${espnLeague.sportPath}/leagues/${espnLeague.leaguePath}/standings`;
  const root = await requestJsonFromUrl<EspnStandingsCollection>(rootUrl);
  const collection = root.$ref
    ? await requestJsonFromUrl<EspnStandingsCollection>(root.$ref)
    : root;
  const selectedGroup =
    collection.items?.find((item) => {
      const key = normalizeLookupKey(item.displayName ?? item.name ?? "");
      return key === "standings" || key === "overall";
    }) ?? collection.items?.[0];

  const group = selectedGroup?.$ref
    ? await requestJsonFromUrl<EspnStandingsGroup>(selectedGroup.$ref)
    : selectedGroup;

  if (!group) {
    return [];
  }

  const standings = Array.isArray(group.standings)
    ? group.standings
    : group.standings?.$ref
      ? await requestJsonFromUrl<EspnStandingEntry[]>(group.standings.$ref)
      : [];

  const rows = await Promise.all(
    standings.map(async (entry, index): Promise<SportStandingRow | null> => {
      const teamRef = entry.team?.$ref;
      const team = teamRef ? await fetchEspnTeam(teamRef) : null;
      const primaryRecord = getEspnPrimaryRecord(entry.records);
      const teamId =
        extractRefId(teamRef) ?? (team?.id == null ? null : String(team.id));
      const teamName = team?.displayName?.trim();

      if (!teamId || !teamName || !primaryRecord) {
        return null;
      }

      const winPercent = getEspnStatDecimal(primaryRecord, [
        "winPercent",
        "leagueWinPercent",
      ]);
      const points =
        sport === "Ice Hockey"
          ? (getEspnStatInteger(primaryRecord, ["points"]) ?? 0)
          : winPercent == null
            ? 0
            : Math.round(winPercent * 1000);

      return {
        rank:
          getEspnStatInteger(primaryRecord, [
            "playoffSeed",
            "position",
            "rank",
          ]) ?? index + 1,
        teamId,
        teamName,
        played: getEspnStatInteger(primaryRecord, ["gamesPlayed"]) ?? 0,
        win: getEspnStatInteger(primaryRecord, ["wins"]) ?? 0,
        loss: getEspnStatInteger(primaryRecord, ["losses"]) ?? 0,
        draw:
          sport === "Ice Hockey"
            ? 0
            : (getEspnStatInteger(primaryRecord, ["ties"]) ?? 0),
        points,
        goalsFor: getEspnStatInteger(primaryRecord, [
          "goalsFor",
          "pointsFor",
          "runsScored",
          "avgPointsFor",
        ]),
        goalsAgainst: getEspnStatInteger(primaryRecord, [
          "goalsAgainst",
          "pointsAgainst",
          "runsAllowed",
          "avgPointsAgainst",
        ]),
        goalDifference: getEspnStatInteger(primaryRecord, [
          "goalDifference",
          "pointsDiff",
          "pointDifferential",
          "differential",
        ]),
        form: null,
        description: getEspnDescription(primaryRecord),
        leagueId,
        season,
      };
    }),
  );

  return rows
    .filter((item): item is SportStandingRow => item !== null)
    .sort(
      (left, right) =>
        left.rank - right.rank || left.teamName.localeCompare(right.teamName),
    );
}

function mapLeague(row: SportsDbLeague): SportLeague | null {
  if (!row.idLeague || !row.strLeague || !row.strSport) {
    return null;
  }

  return {
    leagueId: String(row.idLeague),
    sport: row.strSport,
    name: row.strLeague,
    country: row.strCountry ?? null,
    logoUrl: normalizeRemoteUrl(
      row.strBadge ?? row.strLogo ?? row.strLogoWide ?? null,
    ),
    enabled: false,
    sortOrder: 0,
  };
}

function mapEvent(row: SportsDbEvent): SportEvent | null {
  if (
    !row.idEvent ||
    !row.idLeague ||
    !row.strSport ||
    !row.strHomeTeam ||
    !row.strAwayTeam ||
    !row.dateEvent
  ) {
    return null;
  }

  return {
    eventId: row.idEvent,
    leagueId: String(row.idLeague),
    sport: row.strSport,
    homeTeamId: row.idHomeTeam ?? null,
    awayTeamId: row.idAwayTeam ?? null,
    homeTeam: row.strHomeTeam,
    awayTeam: row.strAwayTeam,
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: row.intHomeScore == null ? null : String(row.intHomeScore),
    awayScore: row.intAwayScore == null ? null : String(row.intAwayScore),
    eventDate: row.dateEvent,
    eventTime: normalizeClockTime(row.strTime),
    status: normalizeEventStatus(row.strStatus, row.strProgress),
    venue: row.strVenue ?? null,
  };
}

function mapEventDetail(row: SportsDbEvent): SportEventDetail | null {
  const base = mapEvent(row);
  if (!base) {
    return null;
  }

  return {
    ...base,
    progress: row.strProgress?.trim() || null,
    descriptionEN: row.strDescriptionEN?.trim() || null,
  };
}

function mapStandingRow(
  row: SportsDbStanding,
  leagueId: string,
  season: string,
): SportStandingRow | null {
  if (!row.idTeam || !row.strTeam) {
    return null;
  }

  return {
    rank: parseInteger(row.intRank) ?? 0,
    teamId: row.idTeam,
    teamName: row.strTeam,
    played: parseInteger(row.intPlayed) ?? 0,
    win: parseInteger(row.intWin) ?? 0,
    loss: parseInteger(row.intLoss) ?? 0,
    draw: parseInteger(row.intDraw) ?? 0,
    points: parseInteger(row.intPoints) ?? 0,
    goalsFor: parseInteger(row.intGoalsFor),
    goalsAgainst: parseInteger(row.intGoalsAgainst),
    goalDifference: parseInteger(row.intGoalDifference),
    form: row.strForm?.trim() || null,
    description: row.strDescription?.trim() || null,
    leagueId,
    season,
  };
}

function mapTeamSearchResult(row: SportsDbTeam): TeamSearchResult | null {
  if (
    !row.idTeam ||
    !row.idLeague ||
    !row.strTeam ||
    !row.strLeague ||
    !row.strSport
  ) {
    return null;
  }

  return {
    teamId: row.idTeam,
    name: row.strTeam,
    leagueId: String(row.idLeague),
    leagueName: row.strLeague,
    sport: row.strSport,
    badgeUrl: normalizeRemoteUrl(
      row.strTeamBadge ??
        row.strBadge ??
        row.strTeamLogo ??
        row.strLogo ??
        row.strLogoWide ??
        null,
    ),
  };
}

export type SportsTeamDetails = {
  teamId: string;
  leagueId: string;
  sport: string;
  name: string;
  shortName: string | null;
  badgeUrl: string | null;
};

export async function fetchLeaguesForSport(
  sport: string,
  forceRefresh = false,
): Promise<SportLeague[]> {
  if (forceRefresh) {
    leaguesCatalogPromise = null;
  }

  if (!leaguesCatalogPromise) {
    leaguesCatalogPromise = request<SportsDbLeague>("all_leagues.php", {})
      .then((rows) =>
        rows
          .map(mapLeague)
          .filter((item): item is SportLeague => item !== null),
      )
      .catch((error) => {
        leaguesCatalogPromise = null;
        throw error;
      });
  }

  const leagues = await leaguesCatalogPromise;
  return leagues.filter((item) => item.sport === sport);
}

export async function fetchLeagueEventsForDate(
  date: string,
  leagueName: string,
): Promise<SportEvent[]> {
  const rows = await request<SportsDbEvent>("eventsday.php", {
    d: date,
    l: leagueName,
  });
  return rows.map(mapEvent).filter((item): item is SportEvent => item !== null);
}

export async function fetchLeagueEventsForDateWithFallback(
  date: string,
  leagueId: string,
  sport: string,
  leagueName: string,
  options?: { forceMergeEspn?: boolean },
): Promise<SportEvent[]> {
  const forceMergeEspn = options?.forceMergeEspn === true;
  const supportsFallback =
    forceMergeEspn || supportsLeagueFallback(sport, leagueId);
  const [sportsDbResult, espnResult] = await Promise.allSettled([
    fetchLeagueEventsForDate(date, leagueName),
    supportsFallback
      ? fetchEspnLeagueEventsForDate(date, leagueId, sport, leagueName)
      : Promise.resolve(null),
  ]);
  const sportsDbEvents =
    sportsDbResult.status === "fulfilled" ? sportsDbResult.value : [];
  if (!supportsFallback) {
    if (sportsDbResult.status === "rejected") throw sportsDbResult.reason;
    return sportsDbEvents;
  }
  if (
    sportsDbResult.status === "rejected" &&
    espnResult.status === "rejected"
  ) {
    throw new AggregateError(
      [sportsDbResult.reason, espnResult.reason],
      `Both sports providers failed for ${leagueName} on ${date}.`,
    );
  }
  const espnEvents =
    espnResult.status === "fulfilled" ? espnResult.value : null;
  if (!espnEvents || espnEvents.length === 0) {
    return sportsDbEvents;
  }

  const byId = new Map<string, SportEvent>();
  for (const event of sportsDbEvents) {
    byId.set(event.eventId, event);
  }
  for (const event of espnEvents) {
    byId.set(event.eventId, event);
  }

  return Array.from(byId.values());
}

export async function fetchEventById(
  eventId: string,
): Promise<SportEvent | null> {
  const rows = await request<SportsDbEvent>("lookupevent.php", { id: eventId });
  return (
    rows.map(mapEvent).find((item): item is SportEvent => item !== null) ?? null
  );
}

export async function fetchEventDetails(
  eventId: string,
): Promise<SportEventDetail | null> {
  const rows = await request<SportsDbEvent>("lookupevent.php", { id: eventId });
  return (
    rows
      .map(mapEventDetail)
      .find((item): item is SportEventDetail => item !== null) ?? null
  );
}

export async function fetchEspnEventDetails(
  event: SportEvent,
): Promise<SportEventDetail | null> {
  if (!event.eventId.startsWith("espn:")) return null;
  const events = await fetchEspnLeagueEventsForDate(
    event.eventDate,
    event.leagueId,
    event.sport,
  );
  const match = events?.find((item) => item.eventId === event.eventId);
  return match ? { ...match, progress: null, descriptionEN: null } : null;
}

export async function fetchLeagueStandings(
  leagueId: string,
  season: string,
  sport: string,
  leagueName?: string,
): Promise<SportStandingRow[]> {
  let espnRows: SportStandingRow[] | null = null;
  try {
    espnRows = await fetchEspnStandings(leagueId, sport, season, leagueName);
  } catch (error) {
    console.warn(
      `[Sports] ESPN standings unavailable for ${leagueName ?? leagueId}; trying SportsDB:`,
      error,
    );
  }
  if (espnRows) {
    return espnRows;
  }

  const rows = await request<SportsDbStanding>("lookuptable.php", {
    l: leagueId,
    s: season,
  });
  return rows
    .map((row) => mapStandingRow(row, leagueId, season))
    .filter((item): item is SportStandingRow => item !== null)
    .sort(
      (left, right) =>
        left.rank - right.rank || left.teamName.localeCompare(right.teamName),
    );
}

export async function fetchNextEventsForTeam(
  teamId: string,
): Promise<SportEvent[]> {
  const rows = await request<SportsDbEvent>("eventsnext.php", { id: teamId });
  return rows.map(mapEvent).filter((item): item is SportEvent => item !== null);
}

export async function fetchLastEventsForTeam(
  teamId: string,
): Promise<SportEvent[]> {
  const rows = await request<SportsDbEvent>("eventslast.php", { id: teamId });
  return rows.map(mapEvent).filter((item): item is SportEvent => item !== null);
}

export async function searchTeams(
  query: string,
  sport: string,
): Promise<TeamSearchResult[]> {
  const rows = await request<SportsDbTeam>("searchteams.php", {
    t: query.trim(),
  });
  return rows
    .map(mapTeamSearchResult)
    .filter(
      (item): item is TeamSearchResult => item !== null && item.sport === sport,
    );
}

export async function fetchTeamDetailsInLeague(
  teamId: string,
  leagueName: string,
  sport: string,
): Promise<SportsTeamDetails | null> {
  const rows = await request<SportsDbTeam>("search_all_teams.php", {
    l: leagueName,
  });
  const match = rows.find(
    (row) => row.idTeam === teamId && row.strSport === sport,
  );
  if (
    !match ||
    !match.idTeam ||
    !match.idLeague ||
    !match.strTeam ||
    !match.strSport
  ) {
    return null;
  }

  return {
    teamId: match.idTeam,
    leagueId: String(match.idLeague),
    sport: match.strSport,
    name: match.strTeam,
    shortName: match.strTeamShort ?? null,
    badgeUrl: normalizeRemoteUrl(
      match.strTeamBadge ??
        match.strBadge ??
        match.strTeamLogo ??
        match.strLogo ??
        match.strLogoWide ??
        null,
    ),
  };
}

export async function fetchTeamDetails(
  teamId: string,
  sport: string,
): Promise<SportsTeamDetails | null> {
  const rows = await request<SportsDbTeam>("lookupteam.php", { id: teamId });
  const match = rows.find(
    (row) => row.idTeam === teamId && row.strSport === sport,
  );
  if (
    !match ||
    !match.idTeam ||
    !match.idLeague ||
    !match.strTeam ||
    !match.strSport
  ) {
    return null;
  }

  return {
    teamId: match.idTeam,
    leagueId: String(match.idLeague),
    sport: match.strSport,
    name: match.strTeam,
    shortName: match.strTeamShort ?? null,
    badgeUrl: normalizeRemoteUrl(
      match.strTeamBadge ??
        match.strBadge ??
        match.strTeamLogo ??
        match.strLogo ??
        match.strLogoWide ??
        null,
    ),
  };
}

export async function fetchTeamBadgesForLeague(
  leagueName: string,
): Promise<{ teamId: string; name: string; badgeUrl: string | null }[]> {
  const rows = await request<SportsDbTeam>("search_all_teams.php", {
    l: leagueName,
  });
  return rows
    .filter((row): row is SportsDbTeam & { idTeam: string; strTeam: string } =>
      Boolean(row.idTeam && row.strTeam),
    )
    .map((row) => ({
      teamId: row.idTeam,
      name: row.strTeam,
      badgeUrl: normalizeRemoteUrl(
        row.strTeamBadge ??
          row.strBadge ??
          row.strTeamLogo ??
          row.strLogo ??
          row.strLogoWide ??
          null,
      ),
    }));
}
