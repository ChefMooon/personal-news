import type {
  WidgetGeometry,
  WidgetInstance,
  WidgetLayout,
  WidgetSize,
} from "./ipc-types";

export const DASHBOARD_GRID_LAYOUT_VERSION = 2;
export const DASHBOARD_GRID_COLUMNS = 12;
export const DASHBOARD_GRID_ROW_HEIGHT = 40;
export const DASHBOARD_GRID_GAP = 16;

export const DASHBOARD_GRID_BREAKPOINTS = {
  xl: 1200,
  lg: 996,
  md: 768,
  sm: 480,
  xs: 0,
} as const;

export const DASHBOARD_GRID_COLUMNS_BY_BREAKPOINT = {
  xl: 12,
  lg: 8,
  md: 4,
  sm: 1,
  xs: 1,
} as const;

export interface WidgetFootprint {
  w: number;
  h: number;
}

export type WidgetInsertionPosition = "top" | "bottom" | { afterId: string };

export const WIDGET_FOOTPRINTS: Readonly<
  Record<string, Readonly<Record<WidgetSize, WidgetFootprint>>>
> = {
  youtube: {
    small: { w: 6, h: 6 },
    medium: { w: 12, h: 9 },
    large: { w: 12, h: 12 },
  },
  reddit_digest: {
    small: { w: 6, h: 6 },
    medium: { w: 12, h: 9 },
    large: { w: 12, h: 12 },
  },
  saved_posts: {
    small: { w: 6, h: 6 },
    medium: { w: 12, h: 9 },
    large: { w: 12, h: 12 },
  },
  sports: {
    small: { w: 6, h: 6 },
    medium: { w: 12, h: 9 },
    large: { w: 12, h: 12 },
  },
  weather: {
    small: { w: 6, h: 6 },
    medium: { w: 12, h: 9 },
    large: { w: 12, h: 12 },
  },
  astronomy: {
    small: { w: 6, h: 6 },
    medium: { w: 12, h: 9 },
    large: { w: 12, h: 12 },
  },
};

const DEFAULT_WIDGET_FOOTPRINT: Readonly<Record<WidgetSize, WidgetFootprint>> =
  {
    small: { w: 6, h: 6 },
    medium: { w: 12, h: 9 },
    large: { w: 12, h: 12 },
  };

export function isWidgetSize(value: unknown): value is WidgetSize {
  return value === "small" || value === "medium" || value === "large";
}

export function getWidgetFootprint(
  moduleId: string,
  size: WidgetSize,
): WidgetFootprint {
  return WIDGET_FOOTPRINTS[moduleId]?.[size] ?? DEFAULT_WIDGET_FOOTPRINT[size];
}

export function getWidgetInsertionY(
  layout: WidgetLayout,
  position: WidgetInsertionPosition,
): number {
  if (position === "top") {
    return 0;
  }

  if (position !== "bottom") {
    const afterGeometry = layout.widget_geometry?.[position.afterId];
    if (afterGeometry) {
      return afterGeometry.y + afterGeometry.h;
    }
  }

  return Object.values(layout.widget_geometry ?? {}).reduce(
    (bottom, geometry) => Math.max(bottom, geometry.y + geometry.h),
    0,
  );
}

export function isWidgetGeometry(value: unknown): value is WidgetGeometry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const geometry = value as Partial<WidgetGeometry>;
  return [geometry.x, geometry.y, geometry.w, geometry.h].every(
    (coordinate) =>
      typeof coordinate === "number" &&
      Number.isInteger(coordinate) &&
      coordinate >= 0,
  );
}

function overlaps(a: WidgetGeometry, b: WidgetGeometry): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

function compactGeometry(
  items: Array<{ id: string; geometry: WidgetGeometry }>,
  columns = DASHBOARD_GRID_COLUMNS,
): Record<string, WidgetGeometry> {
  const placed: Array<{ id: string; geometry: WidgetGeometry }> = [];

  for (const item of items) {
    const width = Math.min(Math.max(1, item.geometry.w), columns);
    const geometry: WidgetGeometry = {
      x: Math.min(Math.max(0, item.geometry.x), columns - width),
      y: Math.max(0, item.geometry.y),
      w: width,
      h: Math.max(1, item.geometry.h),
    };

    let collision = placed.find(({ geometry: placedGeometry }) =>
      overlaps(geometry, placedGeometry),
    );
    while (collision) {
      geometry.y = collision.geometry.y + collision.geometry.h;
      collision = placed.find(({ geometry: placedGeometry }) =>
        overlaps(geometry, placedGeometry),
      );
    }

    placed.push({ id: item.id, geometry });
  }

  return Object.fromEntries(
    placed.map(({ id, geometry: placedGeometry }) => [id, placedGeometry]),
  );
}

function getHiddenOnlyBands(
  hiddenGeometry: WidgetGeometry[],
  visibleGeometry: WidgetGeometry[],
): Array<{ start: number; end: number }> {
  const verticalBoundaries = [
    ...hiddenGeometry.flatMap(({ y, h }) => [y, y + h]),
    ...visibleGeometry.flatMap(({ y, h }) => [y, y + h]),
  ].sort((left, right) => left - right);
  const hiddenOnlyBands: Array<{ start: number; end: number }> = [];
  for (let index = 1; index < verticalBoundaries.length; index += 1) {
    const start = verticalBoundaries[index - 1];
    const end = verticalBoundaries[index];
    const hasHidden = hiddenGeometry.some(
      (geometry) => geometry.y < end && geometry.y + geometry.h > start,
    );
    const hasVisible = visibleGeometry.some(
      (geometry) => geometry.y < end && geometry.y + geometry.h > start,
    );
    if (hasHidden && !hasVisible) {
      hiddenOnlyBands.push({ start, end });
    }
  }
  return hiddenOnlyBands;
}

function restoreHiddenRows(
  geometry: WidgetGeometry,
  hiddenOnlyBands: Array<{ start: number; end: number }>,
): WidgetGeometry {
  let removedRows = 0;
  for (const band of hiddenOnlyBands) {
    const projectedStart = band.start - removedRows;
    if (projectedStart <= geometry.y) {
      removedRows += band.end - band.start;
    }
  }
  return { ...geometry, y: geometry.y + removedRows };
}

function getRawInstance(
  rawInstances: Record<string, Partial<WidgetInstance>>,
  id: string,
): WidgetInstance | null {
  const raw = rawInstances[id];
  if (!raw || typeof raw.moduleId !== "string") {
    return null;
  }

  return {
    instanceId: id,
    moduleId: raw.moduleId,
    label: typeof raw.label === "string" ? raw.label : null,
    size: isWidgetSize(raw.size) ? raw.size : "large",
  };
}

export function normalizeWidgetLayout(raw: unknown): WidgetLayout {
  const candidate = (raw ?? {}) as Partial<WidgetLayout> & {
    widget_order?: unknown;
    widget_instances?: unknown;
    widget_visibility?: unknown;
    widget_geometry?: unknown;
  };
  const rawInstances =
    candidate.widget_instances && typeof candidate.widget_instances === "object"
      ? (candidate.widget_instances as Record<string, Partial<WidgetInstance>>)
      : {};
  const rawOrder = Array.isArray(candidate.widget_order)
    ? candidate.widget_order.filter(
        (id): id is string => typeof id === "string",
      )
    : Object.keys(rawInstances);
  const visibility =
    candidate.widget_visibility &&
    typeof candidate.widget_visibility === "object"
      ? (candidate.widget_visibility as Record<string, boolean>)
      : {};
  const rawGeometry =
    candidate.widget_geometry && typeof candidate.widget_geometry === "object"
      ? (candidate.widget_geometry as Record<string, unknown>)
      : {};
  const instances: Record<string, WidgetInstance> = {};
  const order: string[] = [];

  for (const id of rawOrder) {
    if (order.includes(id)) {
      continue;
    }
    const direct = getRawInstance(rawInstances, id);
    const legacyModuleId = direct?.moduleId ?? id.replace(/^(.*)_\d+$/, "$1");
    const instanceId = direct ? id : `${legacyModuleId}_1`;
    if (instances[instanceId]) {
      continue;
    }
    instances[instanceId] = direct ?? {
      instanceId,
      moduleId: legacyModuleId,
      label: null,
      size: "large",
    };
    order.push(instanceId);
  }

  const geometryItems = order.map((id, index) => {
    const instance = instances[id];
    const footprint = getWidgetFootprint(instance.moduleId, instance.size);
    const saved = rawGeometry[id];
    const position = isWidgetGeometry(saved)
      ? { x: saved.x, y: saved.y }
      : { x: 0, y: index === 0 ? 0 : index * footprint.h };
    return {
      id,
      geometry: { ...position, ...footprint },
    };
  });

  return {
    layout_version: DASHBOARD_GRID_LAYOUT_VERSION,
    widget_order: order,
    widget_visibility: Object.fromEntries(
      order.map((id) => [id, visibility[id] !== false]),
    ),
    widget_instances: instances,
    widget_geometry: compactGeometry(geometryItems),
  };
}

export function projectWidgetLayout(
  layout: WidgetLayout,
  columns: number,
): Record<string, WidgetGeometry> {
  const canonical = normalizeWidgetLayout(layout);
  const geometry = canonical.widget_geometry ?? {};
  return compactGeometry(
    canonical.widget_order.map((id) => {
      const source = geometry[id];
      return {
        id,
        geometry: {
          x: Math.round((source.x * columns) / DASHBOARD_GRID_COLUMNS),
          y: source.y,
          w: getProjectedWidgetWidth(source.w, columns),
          h: source.h,
        },
      };
    }),
    columns,
  );
}

export function getVisibleWidgetLayout(
  layout: WidgetLayout,
  hiddenIds: ReadonlySet<string>,
): WidgetLayout {
  const canonical = normalizeWidgetLayout(layout);
  const matchingHiddenIds = new Set(
    canonical.widget_order.filter((id) => hiddenIds.has(id)),
  );
  if (matchingHiddenIds.size === 0) {
    return canonical;
  }

  const {
    widget_order: _widgetOrder,
    widget_instances: _widgetInstances,
    widget_visibility: _widgetVisibility,
    widget_geometry: _widgetGeometry,
    ...remainingLayout
  } = canonical;
  const visibleOrder = canonical.widget_order.filter(
    (id) => !matchingHiddenIds.has(id),
  );
  const originalGeometry = canonical.widget_geometry ?? {};
  const hiddenGeometry = [...matchingHiddenIds]
    .map((id) => originalGeometry[id])
    .filter((geometry): geometry is WidgetGeometry => geometry != null);
  const visibleGeometry = visibleOrder
    .map((id) => originalGeometry[id])
    .filter((geometry): geometry is WidgetGeometry => geometry != null);
  const hiddenOnlyBands = getHiddenOnlyBands(
    hiddenGeometry,
    visibleGeometry,
  );
  const adjustedGeometry = Object.fromEntries(
    visibleOrder.flatMap((id) => {
      const geometry = originalGeometry[id];
      if (!geometry) return [];
      const removedRows = hiddenOnlyBands.reduce(
        (total, band) =>
          band.end <= geometry.y ? total + band.end - band.start : total,
        0,
      );
      return [[id, { ...geometry, y: geometry.y - removedRows }]];
    }),
  );

  return normalizeWidgetLayout({
    ...remainingLayout,
    widget_order: visibleOrder,
    widget_instances: Object.fromEntries(
      Object.entries(canonical.widget_instances).filter(
        ([id]) => !matchingHiddenIds.has(id),
      ),
    ),
    widget_visibility: Object.fromEntries(
      Object.entries(canonical.widget_visibility).filter(
        ([id]) => !matchingHiddenIds.has(id),
      ),
    ),
    widget_geometry: adjustedGeometry,
  });
}

export function applyToVisibleWidgets(
  layout: WidgetLayout,
  hiddenIds: ReadonlySet<string>,
  transform: (visible: WidgetLayout) => WidgetLayout,
): WidgetLayout {
  const canonical = normalizeWidgetLayout(layout);
  const matchingHiddenIds = new Set(
    canonical.widget_order.filter((id) => hiddenIds.has(id)),
  );
  const visibleLayout =
    matchingHiddenIds.size === 0
      ? canonical
      : getVisibleWidgetLayout(canonical, matchingHiddenIds);
  const transformed = transform(visibleLayout);
  const visibleIds = new Set(visibleLayout.widget_order);
  const transformedIds = new Set(transformed.widget_order);
  if (
    transformedIds.size !== visibleIds.size ||
    transformed.widget_order.length !== visibleIds.size ||
    [...visibleIds].some((id) => !transformedIds.has(id))
  ) {
    console.warn(
      "Visible widget transforms must preserve the widget IDs; keeping the original layout.",
    );
    return canonical;
  }

  if (matchingHiddenIds.size === 0) {
    return transformed;
  }

  let visibleIndex = 0;
  const widgetOrder = canonical.widget_order.map((id) =>
    matchingHiddenIds.has(id)
      ? id
      : transformed.widget_order[visibleIndex++],
  );
  const hiddenInstances = Object.fromEntries(
    Object.entries(canonical.widget_instances).filter(([id]) =>
      matchingHiddenIds.has(id),
    ),
  );
  const hiddenVisibility = Object.fromEntries(
    Object.entries(canonical.widget_visibility).filter(([id]) =>
      matchingHiddenIds.has(id),
    ),
  );
  const hiddenGeometry = Object.fromEntries(
    Object.entries(canonical.widget_geometry ?? {}).filter(([id]) =>
      matchingHiddenIds.has(id),
    ),
  );
  const hiddenOnlyBands = getHiddenOnlyBands(
    Object.values(hiddenGeometry),
    visibleLayout.widget_order
      .map((id) => canonical.widget_geometry?.[id])
      .filter((geometry): geometry is WidgetGeometry => geometry != null),
  );
  const restoredVisibleGeometry = Object.fromEntries(
    Object.entries(transformed.widget_geometry ?? {}).map(([id, geometry]) => [
      id,
      restoreHiddenRows(geometry, hiddenOnlyBands),
    ]),
  );

  return {
    ...canonical,
    ...transformed,
    widget_order: widgetOrder,
    widget_instances: { ...hiddenInstances, ...transformed.widget_instances },
    widget_visibility: { ...hiddenVisibility, ...transformed.widget_visibility },
    widget_geometry: { ...hiddenGeometry, ...restoredVisibleGeometry },
  };
}

export function moveWidget(
  layout: WidgetLayout,
  instanceId: string,
  direction: "left" | "right" | "up" | "down",
): WidgetLayout {
  const canonical = normalizeWidgetLayout(layout);
  const geometry = canonical.widget_geometry ?? {};
  const current = geometry[instanceId];
  if (!current) {
    return canonical;
  }

  if (direction === "up" || direction === "down") {
    const currentIndex = canonical.widget_order.indexOf(instanceId);
    const adjacentIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;
    const adjacentId = canonical.widget_order[adjacentIndex];
    const adjacent = adjacentId ? geometry[adjacentId] : undefined;

    if (currentIndex === -1 || !adjacentId || !adjacent) {
      return canonical;
    }

    const nextOrder = [...canonical.widget_order];
    nextOrder[currentIndex] = adjacentId;
    nextOrder[adjacentIndex] = instanceId;

    return {
      ...canonical,
      widget_order: nextOrder,
      widget_geometry: compactGeometry(
        nextOrder.map((id) => ({
          id,
          geometry:
            id === instanceId
              ? { ...current, x: adjacent.x, y: adjacent.y }
              : id === adjacentId
                ? { ...adjacent, x: current.x, y: current.y }
                : geometry[id],
        })),
      ),
    };
  }

  const next = { ...current };
  if (direction === "left") next.x -= 1;
  if (direction === "right") next.x += 1;
  return {
    ...canonical,
    widget_geometry: compactGeometry(
      canonical.widget_order.map((id) => ({
        id,
        geometry: id === instanceId ? next : geometry[id],
      })),
    ),
  };
}

export function reorderWidgetByY(
  layout: WidgetLayout,
  instanceId: string,
  targetY: number,
): WidgetLayout {
  const canonical = normalizeWidgetLayout(layout);
  const geometry = canonical.widget_geometry ?? {};
  const current = geometry[instanceId];
  if (!current) {
    return canonical;
  }

  const targetCenterY = Math.max(0, targetY) + current.h / 2;
  const remainingOrder = canonical.widget_order.filter(
    (id) => id !== instanceId,
  );
  const insertionIndex = remainingOrder.findIndex((id) => {
    const candidate = geometry[id];
    return candidate != null && targetCenterY < candidate.y + candidate.h / 2;
  });

  if (insertionIndex === -1) {
    remainingOrder.push(instanceId);
  } else {
    remainingOrder.splice(insertionIndex, 0, instanceId);
  }

  return {
    ...canonical,
    widget_order: remainingOrder,
    widget_geometry: {
      ...geometry,
      [instanceId]: {
        ...current,
        y: Math.max(0, targetY),
      },
    },
  };
}

export function setWidgetSize(
  layout: WidgetLayout,
  instanceId: string,
  size: WidgetSize,
): WidgetLayout {
  const canonical = normalizeWidgetLayout(layout);
  const instance = canonical.widget_instances[instanceId];
  if (!instance) return canonical;
  const nextInstances = {
    ...canonical.widget_instances,
    [instanceId]: { ...instance, size },
  };
  const current = canonical.widget_geometry?.[instanceId];
  const footprint = getWidgetFootprint(instance.moduleId, size);
  return {
    ...canonical,
    widget_instances: nextInstances,
    widget_geometry: compactGeometry(
      canonical.widget_order.map((id) => ({
        id,
        geometry:
          id === instanceId
            ? { x: current?.x ?? 0, y: current?.y ?? 0, ...footprint }
            : (canonical.widget_geometry?.[id] ?? {
                x: 0,
                y: 0,
                ...getWidgetFootprint(
                  canonical.widget_instances[id].moduleId,
                  canonical.widget_instances[id].size,
                ),
              }),
      })),
    ),
  };
}

function getProjectedWidgetWidth(width: number, columns: number): number {
  if (width === 6) {
    return columns >= 8 ? Math.floor(columns / 2) : columns;
  }
  return Math.min(width, columns);
}
