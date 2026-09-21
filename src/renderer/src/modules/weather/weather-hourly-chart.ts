import type {
  WeatherHourlyPoint,
  WeatherViewConfig,
} from "../../../../shared/ipc-types";

export type HourlyChartMetric = WeatherViewConfig["hourlyMetric"];

export interface HourlyChartCoordinate {
  x: number;
  y: number;
}

export interface HourlyTemperatureTrendColor {
  line: string;
  fill: string;
}

const neutralTemperatureTrendColor: HourlyTemperatureTrendColor = {
  line: "hsl(38 72% 58% / 0.9)",
  fill: "hsl(38 72% 58% / 0.38)",
};

export function hourlyTemperatureTrendColors(
  points: WeatherHourlyPoint[],
): Array<HourlyTemperatureTrendColor | null> {
  const temperatures = points.map((point) => point.temperature);
  const coolingRange = Math.max(
    1,
    ...temperatures.flatMap((temperature, index) => {
      const nextTemperature = temperatures[index + 1];
      return temperature != null &&
        Number.isFinite(temperature) &&
        nextTemperature != null &&
        Number.isFinite(nextTemperature) &&
        nextTemperature < temperature
        ? [temperature - nextTemperature]
        : [];
    }),
  );

  let previousTrendColor: HourlyTemperatureTrendColor | null = null;

  return temperatures.map((temperature, index) => {
    const nextTemperature = temperatures[index + 1];
    if (
      temperature == null ||
      !Number.isFinite(temperature) ||
      nextTemperature == null ||
      !Number.isFinite(nextTemperature)
    ) {
      previousTrendColor = null;
      return null;
    }

    const delta = nextTemperature - temperature;
    if (delta >= 0) {
      const trendColor =
        delta === 0
          ? (previousTrendColor ?? neutralTemperatureTrendColor)
          : {
              line: "hsl(38 92% 62% / 0.9)",
              fill: "hsl(38 92% 60% / 0.46)",
            };
      previousTrendColor = trendColor;
      return trendColor;
    }

    const blueStrength = Math.min(1, Math.abs(delta) / coolingRange);
    const lineOpacity = 0.72 + blueStrength * 0.18;
    const fillOpacity = 0.24 + blueStrength * 0.18;
    const trendColor = {
      line: `hsl(199 89% 55% / ${lineOpacity.toFixed(2)})`,
      fill: `hsl(199 89% 55% / ${fillOpacity.toFixed(2)})`,
    };
    previousTrendColor = trendColor;
    return trendColor;
  });
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

export function clampRainProbability(value: number | null): number | null {
  return value == null ? null : Math.min(100, Math.max(0, value));
}

export function formatRainProbability(value: number | null): string {
  const clamped = clampRainProbability(value);
  return clamped == null ? "-" : `${Math.round(clamped)}%`;
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
