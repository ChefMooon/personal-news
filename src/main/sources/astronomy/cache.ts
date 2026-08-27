import type Database from "better-sqlite3";
import type {
  AstronomyGroups,
  AstronomySnapshot,
  AstronomySnapshotStatus,
  AstronomyGroupStatus,
} from "../../../shared/ipc-types";

/**
 * One-row-per-location astronomy cache. The full normalized snapshot payload
 * is stored as JSON; status/forTimestamp/calculatedAt are duplicated as scalar
 * columns for cheap status reads and staleness checks.
 */
export interface AstronomyCacheRow {
  locationId: string;
  snapshot: AstronomySnapshot | null;
}

interface CacheRowRecord {
  location_id: string;
  payload_json: string | null;
  status: string;
  for_timestamp: number | null;
  calculated_at: number | null;
}

const STALE_SECONDS = 60 * 60 * 26;

export function getAstronomyCacheRow(
  db: Database.Database,
  locationId: string,
): CacheRowRecord | undefined {
  return db
    .prepare(
      `SELECT location_id, payload_json, status, for_timestamp, calculated_at
         FROM astronomy_cache
        WHERE location_id = ?`,
    )
    .get(locationId) as CacheRowRecord | undefined;
}

export function readCachedSnapshot(
  db: Database.Database,
  locationId: string,
): AstronomySnapshot | null {
  const row = getAstronomyCacheRow(db, locationId);
  if (!row || !row.payload_json) {
    return null;
  }

  try {
    const parsed = JSON.parse(row.payload_json) as AstronomySnapshot;
    const now = Math.floor(Date.now() / 1000);
    const stale =
      row.calculated_at == null
        ? true
        : now - row.calculated_at > STALE_SECONDS;
    if (!stale) return { ...parsed, stale: false };
    const groups = { ...parsed.groups };
    for (const group of Object.values(groups)) {
      if (group.data != null && group.status === "fresh") {
        group.status = "stale";
      }
    }
    return {
      ...parsed,
      groups,
      status: parsed.status === "complete" ? "partial" : parsed.status,
      stale: true,
    };
  } catch (error) {
    console.error("[Astronomy] Failed to parse cached snapshot:", error);
    return null;
  }
}

export function listCachedLocationIds(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT location_id FROM astronomy_cache")
    .all() as Array<{ location_id: string }>;
  return rows.map((row) => row.location_id);
}

export function getLastCalculatedAt(db: Database.Database): number | null {
  const row = db
    .prepare("SELECT MAX(calculated_at) AS latest FROM astronomy_cache")
    .get() as { latest: number | null };
  return row?.latest ?? null;
}

function mergeGroups(
  prior: AstronomyGroups | null,
  next: AstronomyGroups,
): AstronomyGroups {
  if (!prior) {
    return next;
  }

  // Preserve prior successful group data when a later group failed.
  const merge = <T>(
    priorGroup: { status: AstronomyGroupStatus; data: T },
    nextGroup: { status: AstronomyGroupStatus; data: T },
  ): { status: AstronomyGroupStatus; data: T } => {
    if (
      nextGroup.status === "unavailable" &&
      priorGroup.data != null &&
      (priorGroup.status === "fresh" || priorGroup.status === "stale")
    ) {
      return { status: "stale", data: priorGroup.data };
    }
    return nextGroup;
  };

  return {
    moon: merge(prior.moon, next.moon),
    horizon: merge(prior.horizon, next.horizon),
    planets: merge(prior.planets, next.planets),
    events: merge(prior.events, next.events),
  };
}

function overallStatus(groups: AstronomyGroups): AstronomySnapshotStatus {
  const statuses = [
    groups.moon.status,
    groups.horizon.status,
    groups.planets.status,
    groups.events.status,
  ];
  if (statuses.every((status) => status === "fresh")) {
    return "complete";
  }
  if (statuses.every((status) => status === "unavailable")) {
    return "unavailable";
  }
  return "partial";
}

export function upsertAstronomySnapshot(
  db: Database.Database,
  locationId: string,
  forTimestamp: number,
  calculatedAt: number | null,
  groups: AstronomyGroups,
): void {
  const prior = readCachedSnapshot(db, locationId);
  const merged = mergeGroups(prior?.groups ?? null, groups);
  const status = overallStatus(merged);
  const effectiveCalculatedAt = calculatedAt ?? prior?.calculatedAt ?? null;

  const payload: AstronomySnapshot = {
    locationId,
    forTimestamp,
    calculatedAt: effectiveCalculatedAt ?? Math.floor(Date.now() / 1000),
    stale: false,
    status,
    groups: merged,
  };

  db.prepare(
    `INSERT INTO astronomy_cache (location_id, payload_json, status, for_timestamp, calculated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(location_id) DO UPDATE SET
       payload_json = excluded.payload_json,
       status = excluded.status,
       for_timestamp = excluded.for_timestamp,
       calculated_at = excluded.calculated_at`,
  ).run(
    locationId,
    JSON.stringify(payload),
    status,
    forTimestamp,
    payload.calculatedAt,
  );
}

export function markUnavailable(
  db: Database.Database,
  locationId: string,
  forTimestamp: number,
): void {
  const emptyGroups: AstronomyGroups = {
    moon: { status: "unavailable", data: null },
    horizon: { status: "unavailable", data: null },
    planets: { status: "unavailable", data: [] },
    events: { status: "unavailable", data: [] },
  };
  upsertAstronomySnapshot(db, locationId, forTimestamp, null, emptyGroups);
}

export function markStale(db: Database.Database, locationId: string): void {
  const row = getAstronomyCacheRow(db, locationId);
  if (!row?.payload_json) return;
  try {
    const snapshot = JSON.parse(row.payload_json) as AstronomySnapshot;
    for (const group of Object.values(snapshot.groups)) {
      if (group.status !== "unavailable" && group.data != null) {
        group.status = "stale";
      }
    }
    snapshot.status = "partial";
    snapshot.stale = true;
    db.prepare(
      "UPDATE astronomy_cache SET payload_json = ?, status = 'stale' WHERE location_id = ?",
    ).run(JSON.stringify(snapshot), locationId);
  } catch (error) {
    console.error("[Astronomy] Failed to mark cache stale:", error);
  }
}

export function deleteAstronomyCache(
  db: Database.Database,
  locationId: string,
): void {
  db.prepare("DELETE FROM astronomy_cache WHERE location_id = ?").run(
    locationId,
  );
}
