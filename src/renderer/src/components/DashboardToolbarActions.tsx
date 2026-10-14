import { useEffect, useRef, useState, type ReactElement } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  LayoutDashboard,
  ChevronDown,
  Pencil,
  Settings2,
  SquarePlus,
  Trash2,
} from "lucide-react";
import { Button } from "./ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

interface DashboardToolbarActionsProps {
  editMode: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canDelete: boolean;
  onToggleEditMode: () => void;
  onNewDashboard: () => void;
  onAddWidget: () => void;
  onEditDashboard: () => void;
  onDuplicateDashboard: () => void;
  onMoveDashboardLeft: () => void;
  onMoveDashboardRight: () => void;
  onDeleteDashboard: () => void;
}

export function DashboardToolbarActions({
  editMode,
  canMoveLeft,
  canMoveRight,
  canDelete,
  onToggleEditMode,
  onNewDashboard,
  onAddWidget,
  onEditDashboard,
  onDuplicateDashboard,
  onMoveDashboardLeft,
  onMoveDashboardRight,
  onDeleteDashboard,
}: DashboardToolbarActionsProps): ReactElement {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent): void => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const runAction = (action: () => void): void => {
    setOpen(false);
    action();
  };
  const menuButtonClass = "w-full justify-start gap-2 px-3";

  return (
    <div
      ref={popoverRef}
      role="group"
      aria-label="Dashboard editing and actions"
      className="relative flex shrink-0 items-center"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={editMode ? "default" : "outline"}
            size="icon"
            className="h-10 w-10 rounded-r-none"
            aria-label={editMode ? "Done editing layout" : "Edit Layout"}
            aria-pressed={editMode}
            onClick={() => {
              setOpen(false);
              onToggleEditMode();
            }}
          >
            {editMode ? <Check /> : <Settings2 />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{editMode ? "Done" : "Edit Layout"}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={editMode ? "default" : "outline"}
            size="icon"
            className="h-10 w-8 rounded-l-none border-l-0"
            aria-label="Dashboard actions"
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls="dashboard-actions-popover"
            onClick={() => setOpen((value) => !value)}
          >
            <ChevronDown
              className={
                open
                  ? "rotate-180 transition-transform"
                  : "transition-transform"
              }
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Dashboard actions</TooltipContent>
      </Tooltip>

      {open && (
        <div
          id="dashboard-actions-popover"
          role="dialog"
          aria-label="Dashboard actions"
          className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100vh-5rem)] w-56 overflow-y-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Button
            variant="ghost"
            className={menuButtonClass}
            onClick={() => runAction(onNewDashboard)}
          >
            <LayoutDashboard />
            New Dashboard
          </Button>

          <>
            <div className="my-1 border-t" />
            <Button
              variant="ghost"
              className={menuButtonClass}
              onClick={() => runAction(onAddWidget)}
            >
              <SquarePlus />
              Add Widget
            </Button>
            <Button
              variant="ghost"
              className={menuButtonClass}
              onClick={() => runAction(onEditDashboard)}
            >
              <Pencil />
              Dashboard details
            </Button>
            <Button
              variant="ghost"
              className={menuButtonClass}
              onClick={() => runAction(onDuplicateDashboard)}
            >
              <Copy />
              Duplicate Dashboard
            </Button>
            <Button
              variant="ghost"
              className={menuButtonClass}
              disabled={!canMoveLeft}
              onClick={() => runAction(onMoveDashboardLeft)}
            >
              <ArrowLeft />
              Move Dashboard Left
            </Button>
            <Button
              variant="ghost"
              className={menuButtonClass}
              disabled={!canMoveRight}
              onClick={() => runAction(onMoveDashboardRight)}
            >
              <ArrowRight />
              Move Dashboard Right
            </Button>
            <Button
              variant="ghost"
              className={`${menuButtonClass} text-destructive hover:text-destructive`}
              disabled={!canDelete}
              onClick={() => runAction(onDeleteDashboard)}
            >
              <Trash2 />
              Delete Dashboard
            </Button>
          </>
        </div>
      )}
    </div>
  );
}
