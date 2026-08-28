import { describe, expect, it } from "vitest";
import {
  createWidgetContentFixtures,
  isHorizontallyContained,
  WIDGET_COLUMN_PROJECTIONS,
  WIDGET_SIZE_CASES,
  WIDGET_CONTENT_STATES,
  type WidgetContentPolicy,
} from "./widget-content-fixtures";
import { getYouTubeContentPolicy } from "../youtube/youtube-content-policy";

describe("widget content test contract", () => {
  it("provides the shared state matrix", () => {
    expect(createWidgetContentFixtures({ items: ["item"] })).toEqual([
      { state: "populated", value: { items: ["item"] }, error: null },
      { state: "empty", value: null, error: null },
      { state: "loading", value: null, error: null },
      { state: "error", value: null, error: "Unable to load widget data." },
    ]);
    expect(WIDGET_CONTENT_STATES).toHaveLength(4);
  });

  it("provides the three size tiers and breakpoint projections", () => {
    expect(WIDGET_SIZE_CASES).toEqual([
      { size: "small", width: 6, height: 6 },
      { size: "medium", width: 12, height: 9 },
      { size: "large", width: 12, height: 12 },
    ]);
    expect(WIDGET_COLUMN_PROJECTIONS).toEqual([12, 8, 4, 1]);
  });

  it("expresses the policy assertions used by widget tests", () => {
    const policy: WidgetContentPolicy<"columns" | "single"> = {
      visibleItemLimit: 2,
      effectiveMode: "single",
      priorities: ["title", "status"],
    };

    expect(policy.visibleItemLimit).toBeGreaterThanOrEqual(0);
    expect(["columns", "single"]).toContain(policy.effectiveMode);
    expect(policy.priorities.length).toBeGreaterThan(0);
  });

  it("checks horizontal containment without prescribing a layout engine", () => {
    expect(isHorizontallyContained(320, 320)).toBe(true);
    expect(isHorizontallyContained(319, 320)).toBe(true);
    expect(isHorizontallyContained(321, 320)).toBe(false);
  });

  it("keeps YouTube size policy separate from configured card density", () => {
    expect(getYouTubeContentPolicy("small", "detailed")).toEqual({
      channelLimit: 1,
      carouselRows: 1,
      compactRows: true,
      videoDensity: "compact",
      compactStreams: true,
    });
    expect(getYouTubeContentPolicy("medium", "compact")).toMatchObject({
      channelLimit: 2,
      carouselRows: 1,
      videoDensity: "compact",
      compactRows: true,
    });
    expect(getYouTubeContentPolicy("large", "detailed")).toMatchObject({
      channelLimit: Number.POSITIVE_INFINITY,
      carouselRows: 1,
      videoDensity: "detailed",
    });
  });
});
