import type Database from "better-sqlite3";
import type { WeatherLocation } from "../../../shared/ipc-types";

/**
 * Read-only access to saved Weather locations for cross-module consumers
 * (Astronomy). Avoids importing the Weather module itself, which would create
 * an initialization-order dependency. Callers must hold an open database.
 */
export function listWeatherLocationsWithDb(
  db: Database.Database,
): WeatherLocation[] {
  const rows = db
    .prepare(
      `SELECT wl.id, wl.name, wl.admin1, wl.country, wl.country_code,
              wl.latitude, wl.longitude, wl.timezone, wl.created_at,
              wc.fetched_at AS last_fetched_at
         FROM weather_locations wl
         LEFT JOIN weather_cache wc ON wc.location_id = wl.id
        ORDER BY wl.created_at ASC`,
    )
    .all() as Array<{
    id: string;
    name: string;
    admin1: string | null;
    country: string | null;
    country_code: string | null;
    latitude: number;
    longitude: number;
    timezone: string;
    created_at: number;
    last_fetched_at: number | null;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    admin1: row.admin1,
    country: row.country,
    countryCode: row.country_code,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: row.timezone,
    createdAt: row.created_at,
    lastFetchedAt: row.last_fetched_at,
  }));
}
