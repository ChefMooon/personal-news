import type { AstronomySnapshot } from "../../../../shared/ipc-types";
import type { AstronomyViewMode } from "../../hooks/useAstronomyConfig";

export type AstronomyPresentation = "small" | "medium" | "large";
export type AstronomySection =
  | "horizon"
  | "moon"
  | "next-phase"
  | "events"
  | "sky-arc"
  | "lunar-detail"
  | "planets"
  | "timetable";

export interface AstronomyContentPolicyInput {
  size: "small" | "medium" | "large";
  savedViewMode: AstronomyViewMode;
  availableWidth: number | null;
  snapshot: AstronomySnapshot | null;
  disclosed: boolean;
}

export interface AstronomyContentPolicy {
  presentation: AstronomyPresentation;
  effectiveViewMode: AstronomyViewMode;
  visibleSections: AstronomySection[];
  eventLimit: number | null;
  planetLimit: number | null;
  detailsAvailable: boolean;
  isCapped: boolean;
  stacked: boolean;
  verticalOverflow: "none" | "content" | "viewport";
  measureRuntimeRows: boolean;
}

function groupHasData(
  snapshot: AstronomySnapshot | null,
  group: keyof AstronomySnapshot["groups"],
): boolean {
  const value = snapshot?.groups[group];
  return value?.status !== "unavailable" && value?.data != null;
}

export function getAstronomyContentPolicy(
  input: AstronomyContentPolicyInput,
): AstronomyContentPolicy {
  const presentation = input.size;
  const stacked =
    presentation === "medium" && (input.availableWidth ?? 0) < 560;
  const detailsAvailable = presentation !== "large";
  const detailed =
    presentation === "large" && input.savedViewMode === "detailed";

  if (presentation === "small") {
    return {
      presentation,
      effectiveViewMode: "summary",
      visibleSections: ["horizon", "moon"],
      eventLimit: 0,
      planetLimit: 0,
      detailsAvailable,
      isCapped: true,
      stacked: false,
      verticalOverflow: "none",
      measureRuntimeRows: false,
    };
  }

  if (presentation === "medium") {
    return {
      presentation,
      effectiveViewMode: "summary",
      visibleSections: [
        "horizon",
        "moon",
        "next-phase",
        "sky-arc",
        "timetable",
        "events",
      ],
      eventLimit: 5,
      planetLimit: 0,
      detailsAvailable,
      isCapped: true,
      stacked,
      verticalOverflow: input.disclosed ? "viewport" : "none",
      measureRuntimeRows: true,
    };
  }

  if (detailed) {
    return {
      presentation,
      effectiveViewMode: "detailed",
      visibleSections: [
        "sky-arc",
        "lunar-detail",
        "planets",
        "timetable",
        "events",
      ],
      eventLimit: null,
      planetLimit: 7,
      detailsAvailable: false,
      isCapped: false,
      stacked: false,
      verticalOverflow: "content",
      measureRuntimeRows: true,
    };
  }

  return {
    presentation,
    effectiveViewMode: "summary",
    visibleSections: ["horizon", "moon", "next-phase", "events"],
    eventLimit: 5,
    planetLimit: 0,
    detailsAvailable: false,
    isCapped: false,
    stacked: false,
    verticalOverflow: "content",
    measureRuntimeRows: false,
  };
}

export function astronomyHasOmittedDetail(
  policy: AstronomyContentPolicy,
  snapshot: AstronomySnapshot | null,
): boolean {
  if (!policy.detailsAvailable) return false;
  return (
    policy.isCapped ||
    groupHasData(snapshot, "planets") ||
    groupHasData(snapshot, "horizon")
  );
}
