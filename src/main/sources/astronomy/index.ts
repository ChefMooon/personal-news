import { BrowserWindow } from "electron";
import type Database from "better-sqlite3";
import {
  DEFAULT_ASTRONOMY_SETTINGS,
  IPC,
  normalizeAstronomySettings,
  type AstronomyRefreshResult,
  type AstronomySettings,
  type AstronomyStatus,
} from "../../../shared/ipc-types";
import { getSetting, setSetting } from "../../settings/store";
import type { DataSourceModule } from "../registry";
import { listWeatherLocationsWithDb } from "../weather/locations";
export { localDayIntervalUtc } from "./time";
import {
  deleteAstronomyCache,
  getLastCalculatedAt,
  listCachedLocationIds,
  markStale,
  readCachedSnapshot,
  upsertAstronomySnapshot,
} from "./cache";
import { calculateGroupsForLocation } from "./calculator";

const ASTRONOMY_SETTINGS_KEY = "astronomy_settings_json";

let dbRef: Database.Database | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;
const inFlight = new Map<string, Promise<void>>();

function ensureDb(): Database.Database {
  if (!dbRef) {
    throw new Error("Astronomy module not initialized.");
  }
  return dbRef;
}

function listWeatherLocations() {
  return listWeatherLocationsWithDb(ensureDb());
}

export function getAstronomySettings(): AstronomySettings {
  const raw = getSetting(ASTRONOMY_SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_ASTRONOMY_SETTINGS };
  }
  try {
    return normalizeAstronomySettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ASTRONOMY_SETTINGS };
  }
}

export function updateAstronomySettings(
  next: Partial<AstronomySettings>,
): AstronomySettings {
  const normalized = normalizeAstronomySettings({
    ...getAstronomySettings(),
    ...next,
  });
  setSetting(ASTRONOMY_SETTINGS_KEY, JSON.stringify(normalized));
  schedulePolling();
  emitAstronomyUpdated([]);
  return normalized;
}

function isAstronomyEnabled(): boolean {
  return getAstronomySettings().enabled;
}

function emitAstronomyUpdated(locationIds: string[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.ASTRONOMY_UPDATED, {
      locationIds,
      ok: true,
    });
  }
}

/** Local YYYY-MM-DD for a Unix timestamp in the given IANA timezone. */
export function localDateString(unixSeconds: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(unixSeconds * 1000));
}

async function refreshLocationInternal(
  locationId: string,
  weatherTimestamp?: number,
): Promise<void> {
  if (shuttingDown) {
    return;
  }
  const db = ensureDb();
  const location = listWeatherLocations().find(
    (candidate) => candidate.id === locationId,
  );
  if (!location) {
    return;
  }

  const forTimestamp =
    weatherTimestamp ??
    (() => {
      const row = db
        .prepare("SELECT current_json FROM weather_cache WHERE location_id = ?")
        .get(locationId) as { current_json?: string } | undefined;
      try {
        const current = row?.current_json
          ? (JSON.parse(row.current_json) as { time?: unknown })
          : null;
        return typeof current?.time === "number" &&
          Number.isFinite(current.time)
          ? Math.floor(current.time)
          : Math.floor(Date.now() / 1000);
      } catch {
        return Math.floor(Date.now() / 1000);
      }
    })();
  try {
    const groups = calculateGroupsForLocation(location, forTimestamp);
    upsertAstronomySnapshot(db, locationId, forTimestamp, forTimestamp, groups);
    emitAstronomyUpdated([locationId]);
  } catch (error) {
    console.error(`[Astronomy] Calculation failed for ${locationId}:`, error);
    // Leave prior data intact; only mark stale.
    markStale(db, locationId);
  }
}

/** Coalesced refresh: reuses in-flight work per location. */
export async function triggerAstronomyRefresh(
  locationId?: string,
  weatherTimestamp?: number,
): Promise<AstronomyRefreshResult> {
  if (!isAstronomyEnabled()) {
    return { ok: false, error: "Astronomy is disabled.", refreshedCount: 0 };
  }

  const db = ensureDb();
  const allLocations = listWeatherLocations();
  const targets = locationId
    ? allLocations.filter((location) => location.id === locationId)
    : allLocations;

  if (locationId && targets.length === 0) {
    return { ok: false, error: "Location not found.", refreshedCount: 0 };
  }

  let refreshedCount = 0;
  const pending: Array<Promise<void>> = [];
  for (const target of targets) {
    const existing = inFlight.get(target.id);
    if (existing) {
      pending.push(existing);
      continue;
    }
    const task = refreshLocationInternal(target.id, weatherTimestamp).finally(
      () => {
        inFlight.delete(target.id);
      },
    );
    inFlight.set(target.id, task);
    pending.push(task);
    refreshedCount += 1;
  }

  try {
    await Promise.all(pending);
  } catch (error) {
    console.error("[Astronomy] Refresh batch failed:", error);
    return { ok: false, error: String(error), refreshedCount };
  }

  void getLastCalculatedAt(db);
  return { ok: true, error: null, refreshedCount };
}

export function getAstronomySnapshot(locationId: string) {
  const db = ensureDb();
  if (!isAstronomyEnabled()) {
    return null;
  }
  const exists = listWeatherLocations().some(
    (location) => location.id === locationId,
  );
  if (!exists) {
    return null;
  }
  return readCachedSnapshot(db, locationId);
}

export function getAstronomyStatus(): AstronomyStatus {
  const db = ensureDb();
  const locations = listWeatherLocations();
  const cached = listCachedLocationIds(db);
  return {
    locationCount: locations.length,
    cachedLocationCount: cached.length,
    lastCalculatedAt: getLastCalculatedAt(db),
    enabled: isAstronomyEnabled(),
  };
}

function schedulePolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (!isAstronomyEnabled()) {
    return;
  }
  const settings = getAstronomySettings();
  if (listWeatherLocations().length === 0) {
    return;
  }
  pollTimer = setInterval(
    () => {
      void triggerAstronomyRefresh().catch((error) => {
        console.error("[Astronomy] Scheduled refresh failed:", error);
      });
    },
    settings.pollIntervalMinutes * 60 * 1000,
  );
}

// --- Location lifecycle hooks (called by Weather module) -------------------

export function onLocationSaved(locationId: string): void {
  if (!dbRef || !isAstronomyEnabled()) {
    return;
  }
  void triggerAstronomyRefresh(locationId).catch((error) => {
    console.error("[Astronomy] Post-save refresh failed:", error);
  });
}

export function onLocationRemoved(locationId: string): void {
  if (!dbRef) {
    return;
  }
  deleteAstronomyCache(ensureDb(), locationId);
  emitAstronomyUpdated([locationId]);
}

export function onLocationChanged(locationId: string): void {
  // Coordinate or timezone change invalidates the cache row.
  if (!dbRef) {
    return;
  }
  deleteAstronomyCache(ensureDb(), locationId);
  onLocationSaved(locationId);
}

export const AstronomyModule: DataSourceModule = {
  id: "astronomy",
  displayName: "Astronomy",
  initialize(db: Database.Database): void {
    dbRef = db;
    shuttingDown = false;
  },
  start(): void {
    schedulePolling();
    if (isAstronomyEnabled() && listWeatherLocations().length > 0) {
      void triggerAstronomyRefresh().catch((error) => {
        console.error("[Astronomy] Startup refresh failed:", error);
      });
    }
  },
  shutdown(): void {
    shuttingDown = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    inFlight.clear();
    dbRef = null;
  },
};
