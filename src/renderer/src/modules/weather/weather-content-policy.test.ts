import { describe, expect, it } from "vitest";
import { DEFAULT_WEATHER_VIEW_CONFIG } from "../../hooks/useWeatherConfig";
import { getWeatherContentPolicy } from "./weather-content-policy";

describe("Weather content policy", () => {
  it("uses the compact essentials contract for Small", () => {
    const policy = getWeatherContentPolicy(
      "small",
      { ...DEFAULT_WEATHER_VIEW_CONFIG, displayMode: "current_all" },
      true,
      true,
    );

    expect(policy).toMatchObject({
      hourlyCap: 12,
      dailyCap: 0,
      showDaily: false,
      showHourly: true,
      showAstronomy: true,
      hourlyPresentation: "compact",
      verticalOverflow: "none",
    });
  });

  it("uses an icon alert when Small is narrow or not measured yet", () => {
    expect(
      getWeatherContentPolicy("small", DEFAULT_WEATHER_VIEW_CONFIG, false, true)
        .alertPresentation,
    ).toBe("icon");
    expect(
      getWeatherContentPolicy(
        "small",
        DEFAULT_WEATHER_VIEW_CONFIG,
        false,
        true,
        500,
      ).alertPresentation,
    ).toBe("icon");
    expect(
      getWeatherContentPolicy(
        "small",
        DEFAULT_WEATHER_VIEW_CONFIG,
        false,
        true,
        640,
      ).alertPresentation,
    ).toBe("icon");
    expect(
      getWeatherContentPolicy(
        "small",
        DEFAULT_WEATHER_VIEW_CONFIG,
        false,
        true,
        641,
      ).alertPresentation,
    ).toBe("summary");
  });

  it("preserves Medium settings while selecting the 24-hour forecast cap", () => {
    const config = {
      ...DEFAULT_WEATHER_VIEW_CONFIG,
      detailLevel: "detailed" as const,
      displayMode: "current_all" as const,
      showAstronomy: false,
    };
    const policy = getWeatherContentPolicy("medium", config, false, false, 800);

    expect(policy).toMatchObject({
      hourlyCap: 24,
      dailyCap: 6,
      showDaily: true,
      showHourly: true,
      showAstronomy: false,
      verticalOverflow: "weather-column",
    });
    expect(config).toEqual({ ...DEFAULT_WEATHER_VIEW_CONFIG, ...config });
  });

  it("allows the full seven upcoming days when Medium hides yesterday", () => {
    const policy = getWeatherContentPolicy(
      "medium",
      {
        ...DEFAULT_WEATHER_VIEW_CONFIG,
        detailLevel: "detailed",
        showYesterday: false,
      },
      false,
      false,
      800,
    );

    expect(policy.dailyCap).toBe(7);
  });

  it("falls back to a stacked Medium layout below the readable width", () => {
    const policy = getWeatherContentPolicy(
      "medium",
      DEFAULT_WEATHER_VIEW_CONFIG,
      true,
      false,
      600,
    );

    expect(policy.verticalOverflow).toBe("widget");
    expect(policy.showAstronomy).toBe(true);
  });

  it("uses icon-only alerts until Medium has enough room for alert text", () => {
    expect(
      getWeatherContentPolicy(
        "medium",
        DEFAULT_WEATHER_VIEW_CONFIG,
        false,
        true,
        500,
      ).alertPresentation,
    ).toBe("icon");
    expect(
      getWeatherContentPolicy(
        "medium",
        DEFAULT_WEATHER_VIEW_CONFIG,
        false,
        true,
        640,
      ).alertPresentation,
    ).toBe("icon");
    expect(
      getWeatherContentPolicy(
        "medium",
        DEFAULT_WEATHER_VIEW_CONFIG,
        false,
        true,
        700,
      ).alertPresentation,
    ).toBe("summary");
    expect(
      getWeatherContentPolicy(
        "medium",
        DEFAULT_WEATHER_VIEW_CONFIG,
        false,
        true,
        800,
      ).alertPresentation,
    ).toBe("detailed");
  });

  it("accounts for the Astronomy column when selecting Medium alert density", () => {
    const policy = getWeatherContentPolicy(
      "medium",
      DEFAULT_WEATHER_VIEW_CONFIG,
      true,
      true,
      800,
    );

    expect(policy.verticalOverflow).toBe("weather-column");
    expect(policy.alertPresentation).toBe("icon");
  });

  it("uses the configured forecast mode and four-tab presentation for Large", () => {
    const policy = getWeatherContentPolicy(
      "large",
      { ...DEFAULT_WEATHER_VIEW_CONFIG, displayMode: "current_hourly" },
      true,
      true,
    );

    expect(policy).toMatchObject({
      hourlyCap: 24,
      dailyCap: 5,
      showDaily: true,
      showHourly: true,
      hourlyPresentation: "tabbed",
      verticalOverflow: "widget",
    });
  });

  it("suppresses alerts when the active alert input is false without changing config", () => {
    const config = { ...DEFAULT_WEATHER_VIEW_CONFIG, showAlerts: true };
    const before = { ...config };
    const policy = getWeatherContentPolicy("small", config, false, false);

    expect(policy.showAlerts).toBe(false);
    expect(config).toEqual(before);
  });

  it("uses a deterministic stacked fallback until Medium width is measured", () => {
    expect(
      getWeatherContentPolicy(
        "medium",
        DEFAULT_WEATHER_VIEW_CONFIG,
        true,
        false,
      ).verticalOverflow,
    ).toBe("widget");
  });

  it("keeps hourly and daily visibility tied to the saved display mode", () => {
    const config = {
      ...DEFAULT_WEATHER_VIEW_CONFIG,
      displayMode: "current_daily" as const,
    };
    const policy = getWeatherContentPolicy("large", config, false, false, 900);

    expect(policy.showDaily).toBe(true);
    expect(policy.showHourly).toBe(false);
    expect(policy.hourlyPresentation).toBe("tabbed");
  });
});
