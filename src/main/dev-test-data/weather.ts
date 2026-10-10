import type {
  WeatherAlert,
  WeatherCurrentConditions,
  WeatherDailyPoint,
  WeatherHourlyPoint,
  WeatherSnapshot,
} from "../../shared/ipc-types";
import { fixtureDate, fixtureTimestamp } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export const WEATHER_FIXTURE_LOCATION_ID = "pn_dev_fixture_weather_location";

interface WeatherFixture {
  snapshot: WeatherSnapshot;
  currentJson: string;
  hourlyJson: string;
  dailyJson: string;
  alertsJson: string;
}

function makeDailyPoint(offsetDays: number): WeatherDailyPoint {
  const date = fixtureDate(offsetDays);
  const sunrise = Date.parse(`${date}T06:15:00Z`) / 1000;
  const sunset = Date.parse(`${date}T17:45:00Z`) / 1000;
  return {
    date,
    weatherCode: offsetDays === 1 ? 61 : 3,
    tempMin: 11 + offsetDays,
    tempMax: 20 + offsetDays,
    precipitationSum: offsetDays === 1 ? 4.2 : 0,
    snowfallSum: 0,
    precipitationProbabilityMax: offsetDays === 1 ? 65 : 10,
    windSpeedMax: 23,
    sunrise,
    sunset,
  };
}

function getFixture(): WeatherFixture {
  const fetchedAt = fixtureTimestamp();
  const current: WeatherCurrentConditions & {
    yesterday: WeatherDailyPoint;
  } = {
    time: fetchedAt,
    temperature: 18.4,
    apparentTemperature: 18,
    relativeHumidity: 64,
    precipitation: 0,
    weatherCode: 2,
    isDay: true,
    windSpeed: 13.2,
    windGusts: 21,
    surfacePressure: 1014.8,
    visibility: 24000,
    uvIndex: 3.1,
    dewPoint: 11.2,
    airQuality: 24,
    yesterday: makeDailyPoint(-1),
  };
  const hourly: WeatherHourlyPoint[] = Array.from(
    { length: 6 },
    (_, index) => ({
      time: fetchedAt + index * 60 * 60,
      temperature: 18 + index,
      precipitation: index === 3 ? 0.4 : 0,
      precipitationProbability: index === 3 ? 35 : 5,
      weatherCode: index === 3 ? 61 : 2,
      windSpeed: 12 + index,
      relativeHumidity: 64 - index,
    }),
  );
  const daily = [makeDailyPoint(0), makeDailyPoint(1), makeDailyPoint(2)];
  const alerts: WeatherAlert[] = [
    {
      id: "pn-dev-fixture-wind-alert",
      kind: "wind",
      severity: "warning",
      title: "Synthetic wind advisory",
      message: "Synthetic fixture alert for the demonstration location.",
    },
  ];
  const snapshot: WeatherSnapshot = {
    location: {
      id: WEATHER_FIXTURE_LOCATION_ID,
      name: "Fixture City",
      admin1: "Fixture State",
      country: "Synthetic Country",
      countryCode: "FX",
      latitude: 40.7128,
      longitude: -74.006,
      timezone: "America/New_York",
      createdAt: fetchedAt,
      lastFetchedAt: fetchedAt,
    },
    fetchedAt,
    stale: false,
    current: {
      time: current.time,
      temperature: current.temperature,
      apparentTemperature: current.apparentTemperature,
      relativeHumidity: current.relativeHumidity,
      precipitation: current.precipitation,
      weatherCode: current.weatherCode,
      isDay: current.isDay,
      windSpeed: current.windSpeed,
      windGusts: current.windGusts,
      surfacePressure: current.surfacePressure,
      visibility: current.visibility,
      uvIndex: current.uvIndex,
      dewPoint: current.dewPoint,
      airQuality: current.airQuality,
    },
    hourly,
    daily,
    yesterday: current.yesterday,
    airQuality: current.airQuality,
    alerts,
    astronomy: null,
  };

  return {
    snapshot,
    currentJson: JSON.stringify(current),
    hourlyJson: JSON.stringify(hourly),
    dailyJson: JSON.stringify(daily),
    alertsJson: JSON.stringify(alerts),
  };
}

export const weatherFixtureContributor: DevTestDataContributor = {
  id: "weather",
  seed(database): void {
    const fixture = getFixture();
    const location = fixture.snapshot.location;
    database
      .prepare(
        `
        INSERT INTO weather_locations (
          id, name, admin1, country, country_code, latitude, longitude,
          timezone, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          admin1 = excluded.admin1,
          country = excluded.country,
          country_code = excluded.country_code,
          latitude = excluded.latitude,
          longitude = excluded.longitude,
          timezone = excluded.timezone
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
        fixtureTimestamp(),
      );
    database
      .prepare(
        `
        INSERT INTO weather_cache (
          location_id, current_json, hourly_json, daily_json, alerts_json,
          fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(location_id) DO UPDATE SET
          current_json = excluded.current_json,
          hourly_json = excluded.hourly_json,
          daily_json = excluded.daily_json,
          alerts_json = excluded.alerts_json,
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
        ON CONFLICT(location_id) DO UPDATE SET
          alert_hash = excluded.alert_hash,
          last_notified_at = NULL
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
