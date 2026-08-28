import type { WeatherViewConfig } from "../../../../shared/ipc-types";

export type WeatherWidgetSize = "small" | "medium" | "large";
export type WeatherLayoutMode = "small" | "medium" | "large";

export interface WeatherContentPolicy {
  layout: WeatherLayoutMode;
  hourlyCap: number;
  dailyCap: number;
  showDaily: boolean;
  showHourly: boolean;
  showAstronomy: boolean;
  showAlerts: boolean;
  alertDetail: "summary" | "detailed";
  summaryDetail: WeatherViewConfig["detailLevel"];
  hourlyPresentation: "compact" | "standard" | "tabbed";
  verticalOverflow: "none" | "weather-column" | "widget";
  horizontalTimeline: boolean;
}

export function getWeatherContentPolicy(
  size: WeatherWidgetSize,
  config: WeatherViewConfig,
  astronomyVisible: boolean,
  hasAlerts: boolean,
  availableWidth?: number,
): WeatherContentPolicy {
  if (size === "small") {
    return {
      layout: "small",
      hourlyCap: 12,
      dailyCap: 0,
      showDaily: false,
      showHourly: config.displayMode !== "current",
      showAstronomy: astronomyVisible,
      showAlerts: hasAlerts,
      alertDetail: "summary",
      summaryDetail: "summary",
      hourlyPresentation: "compact",
      verticalOverflow: "none",
      horizontalTimeline: true,
    };
  }

  if (size === "medium") {
    const stacked = availableWidth == null || availableWidth < 640;
    const dailyCap =
      config.detailLevel === "summary"
        ? 3
        : config.detailLevel === "detailed"
          ? config.showYesterday
            ? 6
            : 7
          : 5;
    return {
      layout: "medium",
      hourlyCap: 24,
      dailyCap,
      showDaily: config.displayMode !== "current",
      showHourly:
        config.displayMode === "current_all" ||
        config.displayMode === "current_hourly",
      showAstronomy: astronomyVisible,
      showAlerts: hasAlerts,
      alertDetail: config.detailLevel === "detailed" ? "detailed" : "summary",
      summaryDetail: config.detailLevel,
      hourlyPresentation: "standard",
      verticalOverflow: stacked ? "widget" : "weather-column",
      horizontalTimeline: true,
    };
  }

  return {
    layout: "large",
    hourlyCap: 24,
    dailyCap:
      config.detailLevel === "summary"
        ? 3
        : config.detailLevel === "detailed"
          ? 7
          : 5,
    showDaily: config.displayMode !== "current",
    showHourly:
      config.displayMode === "current_all" ||
      config.displayMode === "current_hourly",
    showAstronomy: astronomyVisible,
    showAlerts: hasAlerts,
    alertDetail: config.detailLevel === "detailed" ? "detailed" : "summary",
    summaryDetail: config.detailLevel,
    hourlyPresentation: "tabbed",
    verticalOverflow: "widget",
    horizontalTimeline: true,
  };
}
