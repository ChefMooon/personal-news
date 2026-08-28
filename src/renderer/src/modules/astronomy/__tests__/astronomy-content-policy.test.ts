import { describe, expect, it } from "vitest";
import type { AstronomySnapshot } from "../../../../../shared/ipc-types";
import {
  astronomyHasOmittedDetail,
  getAstronomyContentPolicy,
} from "../astronomy-content-policy";

const snapshot = {
  groups: {
    moon: { status: "ok", data: {} },
    horizon: { status: "ok", data: {} },
    events: { status: "ok", data: [] },
    planets: { status: "ok", data: [] },
    timetable: { status: "ok", data: [] },
  },
} as unknown as AstronomySnapshot;

describe("astronomy content policy", () => {
  it("keeps Small to Moon and horizon essentials without scrolling", () => {
    const policy = getAstronomyContentPolicy({
      size: "small",
      savedViewMode: "detailed",
      availableWidth: 300,
      snapshot,
      disclosed: false,
    });

    expect(policy.effectiveViewMode).toBe("summary");
    expect(policy.visibleSections).toEqual(["horizon", "moon"]);
    expect(policy.eventLimit).toBe(0);
    expect(policy.verticalOverflow).toBe("none");
    expect(policy.measureRuntimeRows).toBe(false);
  });

  it("caps Medium at four preview groups and stacks below the readable width", () => {
    const policy = getAstronomyContentPolicy({
      size: "medium",
      savedViewMode: "detailed",
      availableWidth: 440,
      snapshot,
      disclosed: false,
    });

    expect(policy.visibleSections).toEqual([
      "horizon",
      "moon",
      "next-phase",
      "sky-arc",
      "timetable",
      "events",
    ]);
    expect(policy.eventLimit).toBe(5);
    expect(policy.stacked).toBe(true);
    expect(policy.verticalOverflow).toBe("none");
    expect(policy.measureRuntimeRows).toBe(true);
    expect(astronomyHasOmittedDetail(policy, snapshot)).toBe(true);
  });

  it("allows Medium disclosure to own the viewport", () => {
    const policy = getAstronomyContentPolicy({
      size: "medium",
      savedViewMode: "summary",
      availableWidth: 700,
      snapshot,
      disclosed: true,
    });

    expect(policy.stacked).toBe(false);
    expect(policy.verticalOverflow).toBe("viewport");
    expect(policy.measureRuntimeRows).toBe(true);
  });

  it("honors Large Detailed ordering and complete limits", () => {
    const policy = getAstronomyContentPolicy({
      size: "large",
      savedViewMode: "detailed",
      availableWidth: 1000,
      snapshot,
      disclosed: false,
    });

    expect(policy.visibleSections).toEqual([
      "sky-arc",
      "lunar-detail",
      "planets",
      "timetable",
      "events",
    ]);
    expect(policy.planetLimit).toBe(7);
    expect(policy.eventLimit).toBeNull();
    expect(policy.verticalOverflow).toBe("content");
    expect(policy.measureRuntimeRows).toBe(true);
  });
});
