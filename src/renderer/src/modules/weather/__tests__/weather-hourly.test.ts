import { describe, expect, it } from "vitest";
import type { WeatherHourlyPoint } from "../../../../../shared/ipc-types";
import {
  hourlyChartCoordinates,
  hourlyMetricValue,
} from "../weather-hourly-chart";

const point = (values: Partial<WeatherHourlyPoint>): WeatherHourlyPoint => ({
  time: 1,
  temperature: null,
  precipitation: null,
  precipitationProbability: null,
  weatherCode: null,
  windSpeed: null,
  relativeHumidity: null,
  ...values,
});

describe("hourly chart helpers", () => {
  it("selects the value for each chart metric", () => {
    const weatherPoint = point({
      temperature: 12,
      precipitation: 2,
      windSpeed: 14,
      relativeHumidity: 71,
    });

    expect(hourlyMetricValue(weatherPoint, "overview")).toBe(12);
    expect(hourlyMetricValue(weatherPoint, "precipitation")).toBe(2);
    expect(hourlyMetricValue(weatherPoint, "wind")).toBe(14);
    expect(hourlyMetricValue(weatherPoint, "humidity")).toBe(71);
  });

  it("keeps null values as gaps and produces finite coordinates", () => {
    const chart = hourlyChartCoordinates(
      [
        point({ temperature: 10 }),
        point({ temperature: null }),
        point({ temperature: 14 }),
      ],
      "overview",
      67,
    );

    expect(chart.coordinates[1]).toBeNull();
    expect(chart.min).toBe(10);
    expect(chart.max).toBe(14);
    chart.coordinates.forEach((coordinate) => {
      if (coordinate) {
        expect(Number.isFinite(coordinate.x)).toBe(true);
        expect(Number.isFinite(coordinate.y)).toBe(true);
      }
    });
  });

  it("handles all-null and constant metric series without invalid geometry", () => {
    const allNull = hourlyChartCoordinates(
      [point({}), point({})],
      "humidity",
      85,
    );
    const constant = hourlyChartCoordinates(
      [point({ windSpeed: 8 }), point({ windSpeed: 8 })],
      "wind",
      85,
    );

    expect(allNull).toEqual({
      min: null,
      max: null,
      coordinates: [null, null],
    });
    expect(constant.min).toBe(8);
    expect(constant.max).toBe(8);
    constant.coordinates.forEach((coordinate) => {
      expect(coordinate).not.toBeNull();
      expect(Number.isFinite(coordinate?.y)).toBe(true);
    });
  });
});
