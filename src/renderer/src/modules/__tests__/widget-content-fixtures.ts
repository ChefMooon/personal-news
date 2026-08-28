import type { WidgetSize } from "@shared/ipc-types";

export const WIDGET_CONTENT_STATES = [
  "populated",
  "empty",
  "loading",
  "error",
] as const;

export type WidgetContentState = (typeof WIDGET_CONTENT_STATES)[number];

export const WIDGET_SIZE_CASES: ReadonlyArray<{
  size: WidgetSize;
  width: number;
  height: number;
}> = [
  { size: "small", width: 6, height: 6 },
  { size: "medium", width: 12, height: 9 },
  { size: "large", width: 12, height: 12 },
];

export const WIDGET_COLUMN_PROJECTIONS = [12, 8, 4, 1] as const;

export interface WidgetContentFixture<T> {
  state: WidgetContentState;
  value: T | null;
  error: string | null;
}

export interface WidgetContentPolicy<TMode extends string = string> {
  visibleItemLimit: number;
  effectiveMode: TMode;
  priorities: readonly string[];
}

export function createWidgetContentFixtures<T>(
  populatedValue: T,
): ReadonlyArray<WidgetContentFixture<T>> {
  return [
    { state: "populated", value: populatedValue, error: null },
    { state: "empty", value: null, error: null },
    { state: "loading", value: null, error: null },
    { state: "error", value: null, error: "Unable to load widget data." },
  ];
}

export function isHorizontallyContained(
  contentWidth: number,
  allocatedWidth: number,
): boolean {
  return contentWidth <= allocatedWidth;
}
