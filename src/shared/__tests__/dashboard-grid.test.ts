import { describe, expect, it } from "vitest";
import {
  DASHBOARD_GRID_COLUMNS,
  DASHBOARD_GRID_LAYOUT_VERSION,
  getWidgetFootprint,
  getWidgetInsertionY,
  isWidgetGeometry,
  isWidgetSize,
  moveWidget,
  normalizeWidgetLayout,
  projectWidgetLayout,
  reorderWidgetByY,
  setWidgetSize,
} from "../dashboard-grid";

describe("dashboard grid contract", () => {
  it("accepts only the three approved widget sizes", () => {
    expect(isWidgetSize("small")).toBe(true);
    expect(isWidgetSize("medium")).toBe(true);
    expect(isWidgetSize("large")).toBe(true);
    expect(isWidgetSize("wide")).toBe(false);
  });

  it("exposes the normalized baseline footprints", () => {
    for (const moduleId of [
      "youtube",
      "reddit_digest",
      "saved_posts",
      "sports",
      "weather",
      "astronomy",
    ]) {
      expect(getWidgetFootprint(moduleId, "small")).toEqual({ w: 6, h: 6 });
      expect(getWidgetFootprint(moduleId, "medium")).toEqual({ w: 12, h: 9 });
      expect(getWidgetFootprint(moduleId, "large")).toEqual({ w: 12, h: 12 });
    }
  });

  it("validates canonical non-negative integer geometry", () => {
    expect(isWidgetGeometry({ x: 0, y: 2, w: 4, h: 5 })).toBe(true);
    expect(isWidgetGeometry({ x: -1, y: 2, w: 4, h: 5 })).toBe(false);
    expect(isWidgetGeometry({ x: 0, y: 2, w: 4.5, h: 5 })).toBe(false);
  });

  it("publishes the reference grid contract", () => {
    expect(DASHBOARD_GRID_COLUMNS).toBe(12);
    expect(DASHBOARD_GRID_LAYOUT_VERSION).toBe(2);
  });

  it("migrates legacy order into a stacked canonical layout idempotently", () => {
    const migrated = normalizeWidgetLayout({
      widget_order: ["youtube", "sports"],
      widget_visibility: { sports: false },
    });

    expect(migrated.layout_version).toBe(2);
    expect(migrated.widget_order).toEqual(["youtube_1", "sports_1"]);
    expect(migrated.widget_instances.sports_1.size).toBe("large");
    expect(migrated.widget_geometry?.youtube_1).toEqual({
      x: 0,
      y: 0,
      w: 12,
      h: 12,
    });
    expect(normalizeWidgetLayout(migrated)).toEqual(migrated);
  });

  it("reconstructs module IDs from instance-shaped legacy order", () => {
    const migrated = normalizeWidgetLayout({
      widget_order: ["youtube_1"],
      widget_visibility: { youtube_1: false },
    });

    expect(migrated.widget_order).toEqual(["youtube_1"]);
    expect(migrated.widget_instances.youtube_1.moduleId).toBe("youtube");
    expect(migrated.widget_visibility.youtube_1).toBe(false);
  });

  it("repairs overlap and projects canonical geometry to narrower columns", () => {
    const layout = normalizeWidgetLayout({
      widget_order: ["youtube_1", "sports_1"],
      widget_instances: {
        youtube_1: {
          instanceId: "youtube_1",
          moduleId: "youtube",
          label: null,
          size: "medium",
        },
        sports_1: {
          instanceId: "sports_1",
          moduleId: "sports",
          label: null,
          size: "small",
        },
      },
      widget_geometry: {
        youtube_1: { x: 0, y: 0, w: 6, h: 7 },
        sports_1: { x: 0, y: 0, w: 4, h: 5 },
      },
    });

    expect(layout.widget_geometry?.sports_1?.y).toBe(9);
    expect(projectWidgetLayout(layout, 1).sports_1).toEqual({
      x: 0,
      y: 9,
      w: 1,
      h: 6,
    });
  });

  it("migrates saved dimensions to the selected tier while preserving position", () => {
    const layout = normalizeWidgetLayout({
      widget_order: ["astronomy_1"],
      widget_instances: {
        astronomy_1: {
          instanceId: "astronomy_1",
          moduleId: "astronomy",
          label: null,
          size: "small",
        },
      },
      widget_geometry: { astronomy_1: { x: 2, y: 7, w: 3, h: 99 } },
    });

    expect(layout.widget_geometry?.astronomy_1).toEqual({
      x: 2,
      y: 7,
      w: 6,
      h: 6,
    });
  });

  it("moves one cell and changes footprint without changing content settings", () => {
    const layout = normalizeWidgetLayout({
      widget_order: ["youtube_1"],
      widget_instances: {
        youtube_1: {
          instanceId: "youtube_1",
          moduleId: "youtube",
          label: "Videos",
          size: "medium",
        },
      },
      widget_geometry: { youtube_1: { x: 1, y: 2, w: 6, h: 7 } },
    });
    const moved = moveWidget(layout, "youtube_1", "right");
    const resized = setWidgetSize(moved, "youtube_1", "small");

    expect(moved.widget_geometry?.youtube_1?.x).toBe(0);
    expect(resized.widget_instances.youtube_1).toMatchObject({
      label: "Videos",
      size: "small",
    });
    expect(resized.widget_instances.youtube_1.instanceId).toBe("youtube_1");
    expect(resized.widget_geometry?.youtube_1).toMatchObject({ w: 6, h: 6 });
  });

  it("moves widgets up and down in order while exchanging geometry slots", () => {
    const layout = normalizeWidgetLayout({
      widget_order: ["youtube_1", "reddit_digest_1", "sports_1"],
      widget_visibility: { reddit_digest_1: false },
      widget_instances: {
        youtube_1: { moduleId: "youtube", label: "Videos", size: "small" },
        reddit_digest_1: {
          moduleId: "reddit_digest",
          label: "Reddit",
          size: "medium",
        },
        sports_1: { moduleId: "sports", label: "Scores", size: "large" },
      },
      widget_geometry: {
        youtube_1: { x: 0, y: 0, w: 6, h: 6 },
        reddit_digest_1: { x: 6, y: 0, w: 6, h: 9 },
        sports_1: { x: 0, y: 9, w: 12, h: 12 },
      },
    });

    const movedUp = moveWidget(layout, "reddit_digest_1", "up");
    expect(movedUp.widget_order).toEqual([
      "reddit_digest_1",
      "youtube_1",
      "sports_1",
    ]);
    expect(movedUp.widget_geometry?.reddit_digest_1).toEqual({
      x: 0,
      y: 0,
      w: 12,
      h: 9,
    });
    expect(movedUp.widget_geometry?.youtube_1).toEqual({
      x: 0,
      y: 9,
      w: 6,
      h: 6,
    });
    expect(movedUp.widget_visibility.reddit_digest_1).toBe(false);
    expect(movedUp.widget_instances.reddit_digest_1.label).toBe("Reddit");

    const movedDown = moveWidget(movedUp, "reddit_digest_1", "down");
    expect(movedDown.widget_order).toEqual(layout.widget_order);
    expect(movedDown.widget_geometry?.youtube_1).toMatchObject({
      x: 0,
      y: 0,
      w: 6,
      h: 6,
    });
    expect(movedDown.widget_geometry?.reddit_digest_1).toMatchObject({
      x: 0,
      y: 9,
      w: 12,
      h: 9,
    });
    expect(movedDown.widget_geometry?.sports_1).toMatchObject({
      x: 0,
      y: 18,
      w: 12,
      h: 12,
    });
  });

  it("does not move widgets past the sequence boundaries or unknown IDs", () => {
    const layout = normalizeWidgetLayout({
      widget_order: ["youtube_1", "sports_1"],
      widget_instances: {
        youtube_1: { moduleId: "youtube", size: "small" },
        sports_1: { moduleId: "sports", size: "small" },
      },
    });

    expect(moveWidget(layout, "youtube_1", "up")).toEqual(layout);
    expect(moveWidget(layout, "sports_1", "down")).toEqual(layout);
    expect(moveWidget(layout, "missing_1", "up")).toEqual(layout);
  });

  it("reorders a small widget into the gap between medium widgets", () => {
    const layout = normalizeWidgetLayout({
      widget_order: ["youtube_1", "reddit_digest_1", "sports_1"],
      widget_instances: {
        youtube_1: { moduleId: "youtube", size: "medium" },
        reddit_digest_1: { moduleId: "reddit_digest", size: "medium" },
        sports_1: { moduleId: "sports", size: "small" },
      },
    });

    const reordered = normalizeWidgetLayout(
      reorderWidgetByY(layout, "sports_1", 9),
    );

    expect(reordered.widget_order).toEqual([
      "youtube_1",
      "sports_1",
      "reddit_digest_1",
    ]);
    expect(reordered.widget_geometry?.sports_1?.y).toBe(9);
    expect(reordered.widget_geometry?.reddit_digest_1?.y).toBe(15);
  });

  it("projects medium widgets to half width or full width", () => {
    const layout = normalizeWidgetLayout({
      widget_order: ["youtube_1"],
      widget_instances: {
        youtube_1: {
          instanceId: "youtube_1",
          moduleId: "youtube",
          label: null,
          size: "medium",
        },
      },
    });

    expect(projectWidgetLayout(layout, 12).youtube_1?.w).toBe(12);
    expect(projectWidgetLayout(layout, 8).youtube_1?.w).toBe(8);
    expect(projectWidgetLayout(layout, 4).youtube_1?.w).toBe(4);
    expect(projectWidgetLayout(layout, 1).youtube_1?.w).toBe(1);
  });

  it("calculates insertion rows from the actual layout geometry", () => {
    const layout = normalizeWidgetLayout({
      widget_order: ["youtube_1", "sports_1"],
      widget_instances: {
        youtube_1: { moduleId: "youtube", size: "small" },
        sports_1: { moduleId: "sports", size: "large" },
      },
      widget_geometry: {
        youtube_1: { x: 0, y: 4, w: 6, h: 6 },
        sports_1: { x: 0, y: 20, w: 12, h: 12 },
      },
    });

    expect(getWidgetInsertionY(layout, "top")).toBe(0);
    expect(getWidgetInsertionY(layout, { afterId: "youtube_1" })).toBe(10);
    expect(getWidgetInsertionY(layout, "bottom")).toBe(32);
  });
});
