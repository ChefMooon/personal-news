import { describe, expect, it } from "vitest";
import type { WidgetLayout } from "../../../../shared/ipc-types";
import { getWidgetPositionOptions } from "../AddWidgetModal";

describe("getWidgetPositionOptions", () => {
  it("omits disabled and hidden feature widgets but keeps enabled and non-feature widgets", () => {
    const layout: WidgetLayout = {
      layout_version: 2,
      widget_order: ["disabled_youtube", "enabled_weather", "legacy", "hidden_sports"],
      widget_visibility: {
        disabled_youtube: true,
        enabled_weather: true,
        legacy: true,
        hidden_sports: false,
      },
      widget_instances: {
        disabled_youtube: {
          instanceId: "disabled_youtube",
          moduleId: "youtube",
          label: "YouTube",
          size: "small",
        },
        enabled_weather: {
          instanceId: "enabled_weather",
          moduleId: "weather",
          label: "Weather",
          size: "small",
        },
        legacy: {
          instanceId: "legacy",
          moduleId: "legacy_widget",
          label: "Legacy widget",
          size: "small",
        },
        hidden_sports: {
          instanceId: "hidden_sports",
          moduleId: "sports",
          label: "Sports",
          size: "small",
        },
      },
      widget_geometry: {},
    };

    const options = getWidgetPositionOptions(
      layout,
      (featureId) => featureId !== "youtube",
    );

    expect(options).toEqual([
      { value: "top", label: "Top of dashboard" },
      { value: "after:enabled_weather", label: 'After "Weather"' },
      { value: "after:legacy", label: 'After "Legacy widget"' },
      { value: "bottom", label: "Bottom of dashboard" },
    ]);
  });
});
