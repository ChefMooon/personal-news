import type {
  WeatherHourlyPoint,
  WeatherViewConfig,
} from "../../../../shared/ipc-types";

export type HourlyChartMetric = WeatherViewConfig["hourlyMetric"];

export interface HourlyChartCoordinate {
  x: number;
  y: number;
}

export function hourlyMetricValue(
  point: WeatherHourlyPoint,
  metric: HourlyChartMetric,
): number | null {
  return metric === "overview"
    ? point.temperature
    : metric === "precipitation"
      ? point.precipitation
      : metric === "wind"
        ? point.windSpeed
        : point.relativeHumidity;
}

export function hourlyChartCoordinates(
  points: WeatherHourlyPoint[],
  metric: HourlyChartMetric,
  height: number,
): {
  coordinates: Array<HourlyChartCoordinate | null>;
  min: number | null;
  max: number | null;
} {
  const chartTop = 7;
  const chartBottom = Math.max(chartTop, height - 3);
  const values = points.map((point) => hourlyMetricValue(point, metric));
  const finiteValues = values.filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  const min = finiteValues.length ? Math.min(...finiteValues) : null;
  const max = finiteValues.length ? Math.max(...finiteValues) : null;
  const range = min != null && max != null ? max - min || 1 : 1;
  const step = points.length > 1 ? 1 / (points.length - 1) : 0;

  return {
    min,
    max,
    coordinates: values.map((value, index) => {
      if (
        value == null ||
        !Number.isFinite(value) ||
        min == null ||
        max == null
      )
        return null;
      return {
        x: index * step,
        y: chartBottom - ((value - min) / range) * (chartBottom - chartTop),
      };
    }),
  };
}
