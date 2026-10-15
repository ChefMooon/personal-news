import type { DashboardView, WidgetLayout } from "../../../shared/ipc-types";
import {
  getWidgetFootprint,
  getWidgetInsertionY,
  normalizeWidgetLayout,
} from "../../../shared/dashboard-grid";
import {
  DASHBOARD_FIXTURE_PRESETS,
  DASHBOARD_FIXTURE_SIZES,
  fixtureViewId,
  fixtureWidgetId,
} from "./dashboard-presets";

function emptyLayout(): WidgetLayout {
  return {
    layout_version: 2,
    widget_order: [],
    widget_instances: {},
    widget_visibility: {},
    widget_geometry: {},
  };
}

/** Pure fixture page/layout builder shared by DB seeding and browser preview. */
export function createFixtureDashboardViews(): DashboardView[] {
  return DASHBOARD_FIXTURE_PRESETS.map((preset) => {
    let layout = emptyLayout();
    for (const size of DASHBOARD_FIXTURE_SIZES) {
      const instanceId = fixtureWidgetId(preset.moduleId, size);
      layout = normalizeWidgetLayout({
        ...layout,
        widget_order: [...layout.widget_order, instanceId],
        widget_instances: {
          ...layout.widget_instances,
          [instanceId]: {
            instanceId,
            moduleId: preset.moduleId,
            label: `${preset.name} ${size[0].toUpperCase()}${size.slice(1)}`,
            size,
          },
        },
        widget_visibility: { ...layout.widget_visibility, [instanceId]: true },
        widget_geometry: {
          ...layout.widget_geometry,
          [instanceId]: {
            x: 0,
            y: getWidgetInsertionY(layout, "bottom"),
            ...getWidgetFootprint(preset.moduleId, size),
          },
        },
      });
    }
    return {
      id: fixtureViewId(preset.moduleId),
      name: preset.name,
      icon: preset.icon,
      layout,
    };
  });
}
