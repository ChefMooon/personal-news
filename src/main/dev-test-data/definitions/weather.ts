import type {
  WeatherAlert,
  WeatherCurrentConditions,
  WeatherDailyPoint,
  WeatherHourlyPoint,
  WeatherSnapshot,
} from "../../../shared/ipc-types";
import {
  fixtureDate,
  fixtureTimestamp,
  type FixtureContext,
} from "../fixtures";

export const WEATHER_FIXTURE_LOCATION_ID = "pn_dev_fixture_weather_location";
export interface WeatherFixture {
  snapshot: WeatherSnapshot;
  currentJson: string;
  hourlyJson: string;
  dailyJson: string;
  alertsJson: string;
}

function makeDailyPoint(
  context: FixtureContext,
  offsetDays: number,
): WeatherDailyPoint {
  const date = fixtureDate(context, offsetDays);
  return {
    date,
    weatherCode: offsetDays === 1 ? 61 : 3,
    tempMin: 11 + offsetDays,
    tempMax: 20 + offsetDays,
    precipitationSum: offsetDays === 1 ? 4.2 : 0,
    snowfallSum: 0,
    precipitationProbabilityMax: offsetDays === 1 ? 65 : 10,
    windSpeedMax: 23,
    sunrise: Date.parse(`${date}T06:15:00Z`) / 1000,
    sunset: Date.parse(`${date}T17:45:00Z`) / 1000,
  };
}

export function buildWeatherFixture(context: FixtureContext): WeatherFixture {
  const fetchedAt = fixtureTimestamp(context);
  const current: WeatherCurrentConditions & { yesterday: WeatherDailyPoint } = {
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
    yesterday: makeDailyPoint(context, -1),
  };
  const hourly: WeatherHourlyPoint[] = Array.from(
    { length: 6 },
    (_, index) => ({
      time: fetchedAt + index * 3600,
      temperature: 18 + index,
      precipitation: index === 3 ? 0.4 : 0,
      precipitationProbability: index === 3 ? 35 : 5,
      weatherCode: index === 3 ? 61 : 2,
      windSpeed: 12 + index,
      relativeHumidity: 64 - index,
    }),
  );
  const daily = [
    makeDailyPoint(context, 0),
    makeDailyPoint(context, 1),
    makeDailyPoint(context, 2),
  ];
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
