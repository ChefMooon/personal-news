import type Database from "better-sqlite3";
import type {
  DashboardView,
  DashboardViewsState,
  WidgetLayout,
} from "../../shared/ipc-types";
import {
  getWidgetFootprint,
  getWidgetInsertionY,
  normalizeWidgetLayout,
} from "../../shared/dashboard-grid";
import {
  DASHBOARD_FIXTURE_PRESETS,
  DASHBOARD_FIXTURE_SIZES,
  fixtureConfigKey,
  fixtureViewId,
  fixtureWidgetId,
} from "./definitions/dashboard-presets";

export const DASHBOARD_VIEWS_SETTING_KEY = "dashboard_views_state";
export const SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY =
  "dev_test_data_sports_defaults_migration_version";
const LEGACY_SPORTS_FIXTURE_CONFIG = {
  sport: "Baseball",
  viewMode: "detailed",
  showVenue: true,
  showTime: true,
  showLiveStartTime: true,
};
const owned = (id: string): boolean => id.startsWith("pn_dev_fixture_");

function read(database: Database.Database, key: string): string | null {
  return (
    (
      database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
        { value: string } | undefined
    )?.value ?? null
  );
}

function write(database: Database.Database, key: string, value: string): void {
  database
    .prepare(
      "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    )
    .run(key, value);
}

function emptyLayout(): WidgetLayout {
  return {
    layout_version: 2,
    widget_order: [],
    widget_instances: {},
    widget_visibility: {},
    widget_geometry: {},
  };
}

function readViews(database: Database.Database): DashboardViewsState {
  const raw = read(database, DASHBOARD_VIEWS_SETTING_KEY);
  if (raw !== null) {
    const state = JSON.parse(raw) as DashboardViewsState;
    if (
      !state ||
      !Array.isArray(state.view_order) ||
      !state.views ||
      typeof state.views !== "object"
    )
      throw new Error(
        "Cannot modify test dashboards: saved dashboard state is invalid.",
      );
    return state;
  }
  // Match the existing legacy dashboard IPC fallback, retaining the legacy keys.
  const layout = normalizeWidgetLayout({
    widget_order: JSON.parse(
      read(database, "widget_order") ??
        '["youtube","reddit_digest","saved_posts"]',
    ),
    widget_visibility: JSON.parse(
      read(database, "widget_visibility") ??
        '{"youtube":true,"reddit_digest":true,"saved_posts":true}',
    ),
    widget_instances: JSON.parse(read(database, "widget_instances") ?? "{}"),
  });
  return {
    view_order: ["dashboard_home"],
    views: {
      dashboard_home: {
        id: "dashboard_home",
        name: "Home",
        icon: null,
        layout,
      },
    },
  };
}

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

export function mergeFixtureDashboardPresets(
  database: Database.Database,
): void {
  upgradeLegacySportsFixtureDefaults(database);
  clearFixtureDashboardPresets(database, true);
  const state = readViews(database);
  const usedIds = new Set(
    Object.values(state.views).flatMap((view) =>
      Object.keys(view.layout.widget_instances ?? {}),
    ),
  );
  for (const view of createFixtureDashboardViews()) {
    if (!state.views[view.id]) {
      // An instance moved to a user's page retains its identity and position.
      view.layout = removeInstances(view.layout, usedIds);
      state.views[view.id] = view;
    }
    if (!state.view_order.includes(view.id)) state.view_order.push(view.id);
  }
  for (const preset of DASHBOARD_FIXTURE_PRESETS) {
    for (const size of DASHBOARD_FIXTURE_SIZES) {
      const key = fixtureConfigKey(
        preset.moduleId,
        fixtureWidgetId(preset.moduleId, size),
      );
      if (read(database, key) === null)
        write(database, key, JSON.stringify(preset.config));
    }
  }
  write(database, DASHBOARD_VIEWS_SETTING_KEY, JSON.stringify(state));
}

/** Upgrade the former factory defaults once, preserving any customized config. */
export function upgradeLegacySportsFixtureDefaults(
  database: Database.Database,
): number {
  return database.transaction(() => {
    if (read(database, SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY) === "1")
      return 0;
    const preset = DASHBOARD_FIXTURE_PRESETS.find(
      (entry) => entry.moduleId === "sports",
    )!;
    let upgraded = 0;
    for (const size of DASHBOARD_FIXTURE_SIZES) {
      const key = fixtureConfigKey("sports", fixtureWidgetId("sports", size));
      const raw = read(database, key);
      if (raw === null) continue;
      let config: unknown;
      try {
        config = JSON.parse(raw);
      } catch {
        continue;
      }
      if (
        config === null ||
        typeof config !== "object" ||
        Array.isArray(config) ||
        Object.keys(config).length !==
          Object.keys(LEGACY_SPORTS_FIXTURE_CONFIG).length ||
        !Object.entries(LEGACY_SPORTS_FIXTURE_CONFIG).every(
          ([field, value]) =>
            (config as Record<string, unknown>)[field] === value,
        )
      )
        continue;
      write(database, key, JSON.stringify(preset.config));
      upgraded++;
    }
    // Fresh Seed completes this before edits; later Baseball choices survive Update.
    write(database, SPORTS_FIXTURE_DEFAULTS_MIGRATION_SETTING_KEY, "1");
    return upgraded;
  })();
}

function removeInstances(layout: WidgetLayout, ids: Set<string>): WidgetLayout {
  return {
    ...layout,
    widget_order: layout.widget_order.filter((id) => !ids.has(id)),
    widget_instances: Object.fromEntries(
      Object.entries(layout.widget_instances ?? {}).filter(
        ([id]) => !ids.has(id),
      ),
    ),
    widget_visibility: Object.fromEntries(
      Object.entries(layout.widget_visibility ?? {}).filter(
        ([id]) => !ids.has(id),
      ),
    ),
    widget_geometry: Object.fromEntries(
      Object.entries(layout.widget_geometry ?? {}).filter(
        ([id]) => !ids.has(id),
      ),
    ),
  };
}

export function clearFixtureDashboardPresets(
  database: Database.Database,
  retiredOnly = false,
): void {
  const currentViews = new Set(
    createFixtureDashboardViews().map((view) => view.id),
  );
  const currentWidgets = new Set(
    createFixtureDashboardViews().flatMap((view) => view.layout.widget_order),
  );
  const removeWidget = (id: string): boolean =>
    owned(id) && (!retiredOnly || !currentWidgets.has(id));
  const removeView = (id: string): boolean =>
    owned(id) && (!retiredOnly || !currentViews.has(id));
  // A profile predating presets need not acquire dashboard settings merely to Clear.
  if (read(database, DASHBOARD_VIEWS_SETTING_KEY) !== null) {
    const state = readViews(database);
    const foreign: WidgetLayout[] = [];
    for (const [id, view] of Object.entries(state.views)) {
      const ids = new Set(
        [
          ...Object.keys(view.layout.widget_instances ?? {}),
          ...view.layout.widget_order,
        ].filter(removeWidget),
      );
      if (removeView(id)) {
        foreign.push(removeInstances(view.layout, ids));
        delete state.views[id];
      } else if (ids.size) {
        view.layout = removeInstances(view.layout, ids);
      }
    }
    state.view_order = state.view_order.filter((id) => state.views[id]);
    // Preserve even unordered user views, and rescue foreign widgets on fixture pages.
    for (const id of Object.keys(state.views))
      if (!state.view_order.includes(id)) state.view_order.push(id);
    if (!state.view_order.length) {
      state.view_order.push("dashboard_home");
      state.views.dashboard_home = {
        id: "dashboard_home",
        name: "Home",
        icon: null,
        layout: emptyLayout(),
      };
    }
    const target = state.views[state.view_order[0]];
    for (const layout of foreign) {
      for (const id of new Set([
        ...layout.widget_order,
        ...Object.keys(layout.widget_instances),
      ])) {
        const instance = layout.widget_instances[id];
        if (!instance) continue;
        if (
          Object.values(state.views).some(
            (view) => view.layout.widget_instances?.[id],
          )
        )
          throw new Error(
            `Cannot preserve widget ${id}: its ID already exists in another dashboard.`,
          );
        // Append at the existing bottom without compacting user-positioned widgets.
        const canonical = target.layout;
        target.layout = {
          ...canonical,
          widget_order: [...canonical.widget_order, id],
          widget_instances: { ...canonical.widget_instances, [id]: instance },
          widget_visibility: {
            ...canonical.widget_visibility,
            [id]: layout.widget_visibility[id] ?? true,
          },
          widget_geometry: {
            ...canonical.widget_geometry,
            [id]: {
              x: 0,
              y: getWidgetInsertionY(canonical, "bottom"),
              ...getWidgetFootprint(instance.moduleId, instance.size),
            },
          },
        };
      }
    }
    write(database, DASHBOARD_VIEWS_SETTING_KEY, JSON.stringify(state));
  }
  const currentConfigs = new Set(
    DASHBOARD_FIXTURE_PRESETS.flatMap((preset) =>
      DASHBOARD_FIXTURE_SIZES.map((size) =>
        fixtureConfigKey(
          preset.moduleId,
          fixtureWidgetId(preset.moduleId, size),
        ),
      ),
    ),
  );
  const configs = database
    .prepare(
      "SELECT key FROM settings WHERE key GLOB '*_view_config:pn_dev_fixture_*'",
    )
    .all() as { key: string }[];
  for (const { key } of configs) {
    if (!retiredOnly || !currentConfigs.has(key))
      database.prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}

export function resetFixtureDashboardPresets(
  database: Database.Database,
): void {
  clearFixtureDashboardPresets(database);
  mergeFixtureDashboardPresets(database);
}
