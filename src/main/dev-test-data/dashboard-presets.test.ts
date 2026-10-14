import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DashboardViewsState, WidgetLayout } from "../../shared/ipc-types";
import {
  getWidgetFootprint,
  normalizeWidgetLayout,
} from "../../shared/dashboard-grid";
import {
  clearFixtureDashboardPresets,
  createFixtureDashboardViews,
  DASHBOARD_VIEWS_SETTING_KEY,
  mergeFixtureDashboardPresets,
  resetFixtureDashboardPresets,
} from "./dashboard-presets";
import {
  DASHBOARD_FIXTURE_PRESETS,
  fixtureConfigKey,
  fixtureWidgetId,
} from "./definitions/dashboard-presets";

let db: Database.Database;
const fixtureView = "pn_dev_fixture_dashboard_youtube";
const widgetId = fixtureWidgetId("youtube", "small");
const configKey = fixtureConfigKey("youtube", widgetId);
const sportsConfigKey = fixtureConfigKey(
  "sports",
  fixtureWidgetId("sports", "small"),
);
const userLayout = (): WidgetLayout =>
  normalizeWidgetLayout({
    widget_order: ["user_widget"],
    widget_instances: {
      user_widget: {
        instanceId: "user_widget",
        moduleId: "youtube",
        label: "Mine",
        size: "small",
      },
    },
  });
const userState = (): DashboardViewsState => ({
  view_order: ["mine"],
  views: {
    mine: {
      id: "mine",
      name: "My dashboard",
      icon: null,
      layout: userLayout(),
    },
  },
});
function put(key: string, value: unknown): void {
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)").run(
    key,
    JSON.stringify(value),
  );
}
function get(key: string): unknown {
  const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key) as
    { value: string } | undefined;
  return row ? JSON.parse(row.value) : null;
}
function state(): DashboardViewsState {
  return get(DASHBOARD_VIEWS_SETTING_KEY) as DashboardViewsState;
}
beforeEach(() => {
  db = new Database(":memory:");
  db.exec("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)");
});
afterEach(() => db.close());

describe("fixture dashboard presets", () => {
  it("defines six pages and eighteen unique labeled instances using canonical geometry", () => {
    const views = createFixtureDashboardViews();
    expect(views).toHaveLength(6);
    expect(
      new Set(views.flatMap((view) => view.layout.widget_order)).size,
    ).toBe(18);
    for (const view of views) {
      expect(view.layout.widget_order).toHaveLength(3);
      expect(view.layout).toEqual(normalizeWidgetLayout(view.layout));
      for (const id of view.layout.widget_order) {
        const instance = view.layout.widget_instances[id];
        expect(instance.label).toMatch(/ (Small|Medium|Large)$/);
        expect(view.layout.widget_geometry?.[id]).toMatchObject(
          getWidgetFootprint(instance.moduleId, instance.size),
        );
      }
    }
    expect(
      DASHBOARD_FIXTURE_PRESETS.find((preset) => preset.moduleId === "sports")
        ?.config,
    ).toMatchObject({ sport: "all" });
  });

  it("preserves existing user views, layouts, legacy keys, and unrelated configs", () => {
    const initial = userState();
    put(DASHBOARD_VIEWS_SETTING_KEY, initial);
    put("widget_order", ["weather"]);
    put("youtube_view_config:user_widget", { hideWatched: true });
    mergeFixtureDashboardPresets(db);
    expect(state().views.mine).toEqual(initial.views.mine);
    expect(state().view_order[0]).toBe("mine");
    expect(get("widget_order")).toEqual(["weather"]);
    expect(get("youtube_view_config:user_widget")).toEqual({
      hideWatched: true,
    });
    expect(state().view_order).toHaveLength(7);
    expect(
      db
        .prepare(
          "SELECT key FROM settings WHERE key GLOB '*_view_config:pn_dev_fixture_*'",
        )
        .all(),
    ).toHaveLength(18);
  });

  it("retains legacy Home order and visibility without changing legacy settings", () => {
    put("widget_order", ["weather", "youtube"]);
    put("widget_visibility", { weather: false, youtube: true });
    mergeFixtureDashboardPresets(db);
    expect(state().views.dashboard_home.layout.widget_order).toEqual([
      "weather_1",
      "youtube_1",
    ]);
    // Canonical legacy visibility behavior is owned by normalizeWidgetLayout.
    expect(state().views.dashboard_home.layout).toEqual(
      normalizeWidgetLayout({
        widget_order: ["weather", "youtube"],
        widget_visibility: { weather: false, youtube: true },
        widget_instances: {},
      }),
    );
    expect(get("widget_order")).toEqual(["weather", "youtube"]);
  });

  it("Update fills missing pages/configs and preserves renamed, resized, hidden or deleted widgets", () => {
    mergeFixtureDashboardPresets(db);
    const edited = state();
    edited.views[fixtureView].name = "Edited";
    edited.views[fixtureView].layout.widget_instances[widgetId].size = "large";
    edited.views[fixtureView].layout.widget_visibility[widgetId] = false;
    edited.views[fixtureView].layout.widget_order = [widgetId];
    delete edited.views.pn_dev_fixture_dashboard_weather;
    edited.view_order = edited.view_order.filter(
      (id) => id !== "pn_dev_fixture_dashboard_weather",
    );
    put(DASHBOARD_VIEWS_SETTING_KEY, edited);
    put(configKey, { hideWatched: true });
    put(sportsConfigKey, { sport: "Baseball" });
    db.prepare("DELETE FROM settings WHERE key=?").run(
      "weather_view_config:pn_dev_fixture_widget_weather_small",
    );
    mergeFixtureDashboardPresets(db);
    expect(state().views[fixtureView]).toEqual(edited.views[fixtureView]);
    expect(get(configKey)).toEqual({ hideWatched: true });
    expect(get(sportsConfigKey)).toEqual({ sport: "Baseball" });
    expect(
      state().views.pn_dev_fixture_dashboard_weather.layout.widget_order,
    ).toHaveLength(3);
    expect(
      get("weather_view_config:pn_dev_fixture_widget_weather_small"),
    ).toMatchObject({ locationId: "pn_dev_fixture_weather_location" });
  });

  it("does not duplicate moved instance IDs when recreating a missing preset page", () => {
    put(DASHBOARD_VIEWS_SETTING_KEY, userState());
    mergeFixtureDashboardPresets(db);
    const edited = state();
    edited.views.mine.layout.widget_order.push(widgetId);
    edited.views.mine.layout.widget_instances[widgetId] =
      edited.views[fixtureView].layout.widget_instances[widgetId];
    delete edited.views[fixtureView];
    put(DASHBOARD_VIEWS_SETTING_KEY, edited);
    mergeFixtureDashboardPresets(db);
    expect(state().views[fixtureView].layout.widget_order).not.toContain(
      widgetId,
    );
    expect(
      Object.values(state().views).filter(
        (view) => view.layout.widget_instances[widgetId],
      ),
    ).toHaveLength(1);
  });

  it("Reset restores fixture defaults and preserves user widgets added to fixture pages", () => {
    const original = userState();
    original.views.mine.layout.widget_geometry!.user_widget = {
      x: 6,
      y: 15,
      w: 6,
      h: 6,
    };
    put(DASHBOARD_VIEWS_SETTING_KEY, original);
    mergeFixtureDashboardPresets(db);
    const edited = state();
    edited.views[fixtureView].name = "Edited";
    edited.views[fixtureView].layout.widget_order.push("foreign");
    edited.views[fixtureView].layout.widget_instances.foreign = {
      instanceId: "foreign",
      moduleId: "weather",
      label: "My weather",
      size: "medium",
    };
    put(DASHBOARD_VIEWS_SETTING_KEY, edited);
    put(configKey, { hideWatched: true });
    put("weather_view_config:foreign", { locationId: "user-location" });
    resetFixtureDashboardPresets(db);
    expect(state().views[fixtureView]).toEqual(
      createFixtureDashboardViews()[0],
    );
    expect(state().views.mine.layout.widget_order).toContain("foreign");
    expect(state().views.mine.layout.widget_geometry!.user_widget).toEqual(
      original.views.mine.layout.widget_geometry!.user_widget,
    );
    expect(get("weather_view_config:foreign")).toEqual({
      locationId: "user-location",
    });
    expect(get(configKey)).toEqual(DASHBOARD_FIXTURE_PRESETS[0].config);
  });

  it("Clear removes fixture widgets in user views and only fixture config keys", () => {
    const initial = userState();
    put(DASHBOARD_VIEWS_SETTING_KEY, initial);
    mergeFixtureDashboardPresets(db);
    const edited = state();
    edited.views.mine.layout.widget_order.push(widgetId);
    edited.views.mine.layout.widget_instances[widgetId] =
      edited.views[fixtureView].layout.widget_instances[widgetId];
    delete edited.views[fixtureView].layout.widget_instances[widgetId];
    edited.views[fixtureView].layout.widget_order = edited.views[
      fixtureView
    ].layout.widget_order.filter((id) => id !== widgetId);
    put(DASHBOARD_VIEWS_SETTING_KEY, edited);
    put("sports_view_config:pn_dev_fixture_retired", { sport: "Baseball" });
    put("youtube_view_config:user_widget", { hideWatched: true });
    clearFixtureDashboardPresets(db);
    expect(state()).toEqual(initial);
    expect(get(configKey)).toBeNull();
    expect(get("sports_view_config:pn_dev_fixture_retired")).toBeNull();
    expect(get("youtube_view_config:user_widget")).toEqual({
      hideWatched: true,
    });
  });

  it("creates a surviving Home to rescue foreign widgets when only fixture pages remain", () => {
    mergeFixtureDashboardPresets(db);
    const edited = state();
    delete edited.views.dashboard_home;
    edited.view_order = edited.view_order.filter(
      (id) => id !== "dashboard_home",
    );
    edited.views[fixtureView].layout.widget_order.push("foreign");
    edited.views[fixtureView].layout.widget_instances.foreign =
      userLayout().widget_instances.user_widget;
    put(DASHBOARD_VIEWS_SETTING_KEY, edited);
    clearFixtureDashboardPresets(db);
    expect(state().view_order).toEqual(["dashboard_home"]);
    expect(state().views.dashboard_home.layout.widget_order).toEqual([
      "foreign",
    ]);
  });

  it("rejects conflicting foreign widget identities atomically", () => {
    put(DASHBOARD_VIEWS_SETTING_KEY, userState());
    mergeFixtureDashboardPresets(db);
    const edited = state();
    edited.views[fixtureView].layout.widget_order.push("user_widget");
    edited.views[fixtureView].layout.widget_instances.user_widget =
      userLayout().widget_instances.user_widget;
    put(DASHBOARD_VIEWS_SETTING_KEY, edited);
    expect(() =>
      db.transaction(() => clearFixtureDashboardPresets(db))(),
    ).toThrow("already exists");
    expect(state()).toEqual(edited);
    expect(get(configKey)).not.toBeNull();
  });

  it("rolls back a preset merge when config persistence fails", () => {
    put(DASHBOARD_VIEWS_SETTING_KEY, userState());
    db.exec(
      "CREATE TRIGGER fail_preset BEFORE INSERT ON settings WHEN NEW.key GLOB 'weather_view_config:pn_dev_fixture_*' BEGIN SELECT RAISE(ABORT,'injected persistence failure'); END",
    );
    const before = db.prepare("SELECT * FROM settings").all();
    expect(() =>
      db.transaction(() => mergeFixtureDashboardPresets(db))(),
    ).toThrow("injected persistence failure");
    expect(db.prepare("SELECT * FROM settings").all()).toEqual(before);
  });

  it("Clear does not materialize dashboard state on a legacy profile", () => {
    put("widget_order", ["youtube"]);
    clearFixtureDashboardPresets(db);
    expect(get(DASHBOARD_VIEWS_SETTING_KEY)).toBeNull();
    expect(get("widget_order")).toEqual(["youtube"]);
  });

  it("Update retires removed module pages, widgets, and configs while rescuing user widgets", () => {
    put(DASHBOARD_VIEWS_SETTING_KEY, userState());
    mergeFixtureDashboardPresets(db);
    const edited = state();
    const retiredId = "pn_dev_fixture_widget_retired_small";
    const foreign = userLayout().widget_instances.user_widget;
    edited.views.mine.layout.widget_order.push(retiredId);
    edited.views.mine.layout.widget_instances[retiredId] = {
      ...foreign,
      instanceId: retiredId,
    };
    edited.views.pn_dev_fixture_dashboard_retired = {
      id: "pn_dev_fixture_dashboard_retired",
      name: "Retired",
      icon: null,
      layout: normalizeWidgetLayout({
        widget_order: ["rescued"],
        widget_instances: { rescued: { ...foreign, instanceId: "rescued" } },
      }),
    };
    edited.view_order.push("pn_dev_fixture_dashboard_retired");
    put(DASHBOARD_VIEWS_SETTING_KEY, edited);
    put("retired_view_config:pn_dev_fixture_widget_retired_small", {
      retired: true,
    });
    put(configKey, { hideWatched: true });
    mergeFixtureDashboardPresets(db);
    expect(state().views.pn_dev_fixture_dashboard_retired).toBeUndefined();
    expect(state().views.mine.layout.widget_order).toEqual([
      "user_widget",
      "rescued",
    ]);
    expect(
      get("retired_view_config:pn_dev_fixture_widget_retired_small"),
    ).toBeNull();
    expect(get(configKey)).toEqual({ hideWatched: true });
  });
});
