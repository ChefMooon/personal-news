import type React from "react";
import type { WidgetSize } from "../../../shared/ipc-types";

interface WidgetSizeControlProps {
  size: WidgetSize;
  editMode?: boolean;
  onChange: (size: WidgetSize) => void;
}

const SIZE_OPTIONS: Array<{ value: WidgetSize; label: string }> = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

export function WidgetSizeControl({
  size,
  editMode,
  onChange,
}: WidgetSizeControlProps): React.ReactElement {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Widget size</label>
      <div
        className="flex h-9 w-full items-center overflow-hidden rounded-md border border-input bg-background"
        role="group"
        aria-label="Widget size"
      >
        {SIZE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={editMode === false}
            aria-pressed={size === option.value}
            aria-label={`Set widget size to ${option.label}`}
            className="h-full min-w-0 flex-1 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:font-semibold data-[selected=true]:text-foreground"
            data-selected={size === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
