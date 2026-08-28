import React, { useState, useRef, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { WidgetTransferButton } from "./WidgetTransferButton";
import { WidgetErrorBoundary } from "./WidgetErrorBoundary";

const MANUAL_DRAG_EDGE_THRESHOLD = 80;
const MANUAL_DRAG_MAX_SCROLL_SPEED = 18;

interface WidgetWrapperProps {
  id: string;
  label: string | null;
  defaultLabel: string;
  editMode: boolean;
  visible: boolean;
  onToggleVisibility: (id: string) => void;
  onRename: (id: string, newLabel: string | null) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onMoveLeft: (id: string) => void;
  onMoveRight: (id: string) => void;
  onManualDragCommit?: (
    id: string,
    deltaX: number,
    deltaY: number,
    point: { x: number; y: number },
  ) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

export const WidgetWrapper = React.forwardRef<
  HTMLDivElement,
  WidgetWrapperProps
>(function WidgetWrapper(
  {
    id,
    label,
    defaultLabel,
    editMode,
    visible,
    onToggleVisibility,
    onRename,
    onRemove,
    onMoveUp,
    onMoveDown,
    onMoveLeft,
    onMoveRight,
    onManualDragCommit,
    className,
    style,
    children,
  },
  ref,
): React.ReactElement {
  const [renaming, setRenaming] = useState(false);
  const [draftLabel, setDraftLabel] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [manualDragOffset, setManualDragOffset] = useState({ x: 0, y: 0 });
  const manualDragStartRef = useRef<{
    x: number;
    y: number;
    scrollX: number;
    scrollContainer: HTMLElement | null;
    scrollTop: number;
  } | null>(null);
  const manualDragPointerRef = useRef({ x: 0, y: 0 });
  const manualDragAnimationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (renaming && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renaming]);

  useEffect(() => {
    function handleWindowScroll(): void {
      const start = manualDragStartRef.current;
      if (!start) {
        return;
      }
      setManualDragOffset(getManualDragOffset(start.x, start.y));
    }

    window.addEventListener("scroll", handleWindowScroll, true);
    return () => window.removeEventListener("scroll", handleWindowScroll, true);
  }, []);

  useEffect(() => {
    return () => stopManualDragAutoScroll();
  }, []);

  useEffect(() => {
    if (!editMode || !onManualDragCommit) {
      handleManualDragCancel();
    }
  }, [editMode, onManualDragCommit]);

  function stopManualDragAutoScroll(): void {
    if (manualDragAnimationFrameRef.current !== null) {
      cancelAnimationFrame(manualDragAnimationFrameRef.current);
      manualDragAnimationFrameRef.current = null;
    }
  }

  function getManualDragScrollSpeed(pointerY: number, bounds: DOMRect): number {
    if (pointerY < bounds.top + MANUAL_DRAG_EDGE_THRESHOLD) {
      const distance = Math.max(0, pointerY - bounds.top);
      return (
        -MANUAL_DRAG_MAX_SCROLL_SPEED *
        (1 - Math.min(1, distance / MANUAL_DRAG_EDGE_THRESHOLD))
      );
    }

    if (pointerY > bounds.bottom - MANUAL_DRAG_EDGE_THRESHOLD) {
      const distance = Math.max(0, bounds.bottom - pointerY);
      return (
        MANUAL_DRAG_MAX_SCROLL_SPEED *
        (1 - Math.min(1, distance / MANUAL_DRAG_EDGE_THRESHOLD))
      );
    }

    return 0;
  }

  function runManualDragAutoScroll(): void {
    const start = manualDragStartRef.current;
    const scrollContainer = start?.scrollContainer;
    if (!start || !scrollContainer) {
      stopManualDragAutoScroll();
      return;
    }

    const speed = getManualDragScrollSpeed(
      manualDragPointerRef.current.y,
      scrollContainer.getBoundingClientRect(),
    );
    const previousScrollTop = scrollContainer.scrollTop;
    if (speed !== 0) {
      scrollContainer.scrollTop = Math.max(
        0,
        Math.min(
          scrollContainer.scrollHeight - scrollContainer.clientHeight,
          previousScrollTop + speed,
        ),
      );
      if (scrollContainer.scrollTop !== previousScrollTop) {
        setManualDragOffset(
          getManualDragOffset(
            manualDragPointerRef.current.x,
            manualDragPointerRef.current.y,
          ),
        );
      }
    }

    if (speed !== 0 && scrollContainer.scrollTop !== previousScrollTop) {
      manualDragAnimationFrameRef.current = requestAnimationFrame(
        runManualDragAutoScroll,
      );
    } else {
      manualDragAnimationFrameRef.current = null;
    }
  }

  function startManualDragAutoScroll(): void {
    stopManualDragAutoScroll();
    manualDragAnimationFrameRef.current = requestAnimationFrame(
      runManualDragAutoScroll,
    );
  }

  function handleManualDragStart(
    event: React.PointerEvent<HTMLSpanElement>,
  ): void {
    if (!editMode || !onManualDragCommit) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    manualDragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      scrollX: window.scrollX,
      scrollContainer: event.currentTarget.closest("main"),
      scrollTop: event.currentTarget.closest("main")?.scrollTop ?? 0,
    };
    manualDragPointerRef.current = { x: event.clientX, y: event.clientY };
    startManualDragAutoScroll();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleManualDragMove(
    event: React.PointerEvent<HTMLSpanElement>,
  ): void {
    const start = manualDragStartRef.current;
    if (!start) {
      return;
    }
    manualDragPointerRef.current = { x: event.clientX, y: event.clientY };
    setManualDragOffset(getManualDragOffset(event.clientX, event.clientY));
    if (manualDragAnimationFrameRef.current === null) {
      startManualDragAutoScroll();
    }
  }

  function handleManualDragEnd(
    event: React.PointerEvent<HTMLSpanElement>,
  ): void {
    const start = manualDragStartRef.current;
    if (!start) {
      return;
    }
    const { x: deltaX, y: deltaY } = getManualDragOffset(
      event.clientX,
      event.clientY,
    );
    stopManualDragAutoScroll();
    manualDragStartRef.current = null;
    setManualDragOffset({ x: 0, y: 0 });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onManualDragCommit?.(id, deltaX, deltaY, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handleManualDragCancel(): void {
    stopManualDragAutoScroll();
    manualDragStartRef.current = null;
    setManualDragOffset({ x: 0, y: 0 });
  }

  function getManualDragOffset(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } {
    const start = manualDragStartRef.current;
    if (!start) {
      return { x: 0, y: 0 };
    }
    return {
      x: clientX - start.x + (window.scrollX - start.scrollX),
      y:
        clientY -
        start.y +
        ((start.scrollContainer?.scrollTop ?? 0) - start.scrollTop),
    };
  }

  function startRename(): void {
    setDraftLabel(label ?? defaultLabel);
    setRenaming(true);
  }

  function commitRename(): void {
    const trimmed = draftLabel.trim();
    // Treat empty or unchanged-from-default as "no custom label"
    onRename(id, trimmed === "" || trimmed === defaultLabel ? null : trimmed);
    setRenaming(false);
  }

  return (
    <div
      ref={ref}
      data-widget-instance-id={id}
      tabIndex={0}
      aria-label={`${label ?? defaultLabel} widget`}
      className={[
        className,
        "relative flex h-full min-h-0 flex-col overflow-hidden",
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        ...style,
        transform: `${style?.transform ?? ""} translate(${manualDragOffset.x}px, ${manualDragOffset.y}px)`,
      }}
    >
      {editMode && (
        <div className="absolute left-1 top-1 z-10 flex h-4 items-center gap-1 px-1">
          {/* Drag handle */}
          <span
            role="button"
            tabIndex={0}
            className="dashboard-grid-drag-handle cursor-grab active:cursor-grabbing rounded p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Drag widget"
            onPointerDown={handleManualDragStart}
            onPointerMove={handleManualDragMove}
            onPointerUp={handleManualDragEnd}
            onPointerCancel={handleManualDragCancel}
            onLostPointerCapture={handleManualDragCancel}
          >
            <GripVertical className="h-4 w-4" />
          </span>

          {/* Move up */}
          <button
            type="button"
            onClick={() => onMoveUp(id)}
            className="rounded p-0 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Move widget up"
          >
            <ChevronUp className="h-4 w-4" />
          </button>

          {/* Move down */}
          <button
            type="button"
            onClick={() => onMoveDown(id)}
            className="rounded p-0 text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
            aria-label="Move widget down"
          >
            <ChevronDown className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => onMoveLeft(id)}
            className="rounded p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Move widget left"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onMoveRight(id)}
            className="rounded p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Move widget right"
          >
            <ArrowRight className="h-4 w-4" />
          </button>

          <WidgetTransferButton instanceId={id} />

          {/* Visibility toggle */}
          <button
            type="button"
            onClick={() => onToggleVisibility(id)}
            className="rounded p-0 text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={visible ? "Hide widget" : "Show widget"}
            aria-pressed={!visible}
          >
            {visible ? (
              <Eye className="h-4 w-4" />
            ) : (
              <EyeOff className="h-4 w-4" />
            )}
          </button>

          {/* Inline rename */}
          {renaming ? (
            <input
              ref={inputRef}
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              className="flex-1 text-xs bg-background border border-border rounded px-2 py-0.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          ) : (
            <button
              type="button"
              onClick={startRename}
              className="flex flex-1 items-center gap-1.5 rounded px-1 py-0 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground group"
              title="Click to rename"
            >
              <span className="truncate">{label ?? defaultLabel}</span>
              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
            </button>
          )}

          {/* Remove */}
          <button
            type="button"
            onClick={() => onRemove(id)}
            className="rounded p-0 text-muted-foreground hover:bg-accent hover:text-destructive"
            aria-label="Remove widget"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}
      {/* When hidden in edit mode, show a compact placeholder instead of the full widget */}
      {editMode && !visible ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-3 flex items-center gap-3 text-muted-foreground select-none">
          <EyeOff className="h-4 w-4 shrink-0" />
          <span className="text-sm">
            Widget hidden — click the eye icon above to show it again.
          </span>
        </div>
      ) : (
        visible && (
          <WidgetErrorBoundary
            widgetTitle={label ?? defaultLabel}
            instanceId={id}
          >
            {children}
          </WidgetErrorBoundary>
        )
      )}
    </div>
  );
});
