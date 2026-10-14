import {
  buildWeatherFixture,
  WEATHER_FIXTURE_LOCATION_ID,
} from "./definitions/weather";
import { createFixtureContext, type FixtureContext } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export { WEATHER_FIXTURE_LOCATION_ID } from "./definitions/weather";

export const weatherFixtureContributor: DevTestDataContributor = {
  id: "weather",
  seed(database, context: FixtureContext = createFixtureContext()): void {
    const fixture = buildWeatherFixture(context);
    const location = fixture.snapshot.location;
    database
      .prepare(
        `
      INSERT INTO weather_locations (
        id, name, admin1, country, country_code, latitude, longitude, timezone, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name, admin1 = excluded.admin1, country = excluded.country,
        country_code = excluded.country_code, latitude = excluded.latitude,
        longitude = excluded.longitude, timezone = excluded.timezone
    `,
      )
      .run(
        location.id,
        location.name,
        location.admin1,
        location.country,
        location.countryCode,
        location.latitude,
        location.longitude,
        location.timezone,
        fixture.snapshot.fetchedAt,
      );
    database
      .prepare(
        `
      INSERT INTO weather_cache (location_id, current_json, hourly_json, daily_json, alerts_json, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(location_id) DO UPDATE SET
        current_json = excluded.current_json, hourly_json = excluded.hourly_json,
        daily_json = excluded.daily_json, alerts_json = excluded.alerts_json,
        fetched_at = excluded.fetched_at
    `,
      )
      .run(
        location.id,
        fixture.currentJson,
        fixture.hourlyJson,
        fixture.dailyJson,
        fixture.alertsJson,
        fixture.snapshot.fetchedAt,
      );
    database
      .prepare(
        `
      INSERT INTO weather_alert_state (location_id, alert_hash, last_notified_at)
      VALUES (?, ?, NULL)
      ON CONFLICT(location_id) DO UPDATE SET alert_hash = excluded.alert_hash, last_notified_at = NULL
    `,
      )
      .run(location.id, "pn-dev-fixture-alert-state");
  },
  clear(database): void {
    database
      .prepare("DELETE FROM astronomy_cache WHERE location_id = ?")
      .run(WEATHER_FIXTURE_LOCATION_ID);
    database
      .prepare("DELETE FROM weather_alert_state WHERE location_id = ?")
      .run(WEATHER_FIXTURE_LOCATION_ID);
    database
      .prepare("DELETE FROM weather_cache WHERE location_id = ?")
      .run(WEATHER_FIXTURE_LOCATION_ID);
    database
      .prepare("DELETE FROM weather_locations WHERE id = ?")
      .run(WEATHER_FIXTURE_LOCATION_ID);
  },
};
