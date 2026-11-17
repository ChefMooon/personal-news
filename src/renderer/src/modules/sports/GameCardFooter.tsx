import React from "react";
import { cn } from "../../lib/utils";
import { NO_PREVIOUS_GAME_TEXT } from "./game-card-utils";

export function GameCardFooter({
  size,
  showVenue,
  venueLine,
  previousText,
}: {
  size: "compact" | "dense" | "default";
  showVenue: boolean;
  venueLine: string;
  previousText: string | null;
}): React.ReactElement {
  const sizeRoot =
    size === "compact"
      ? "mt-2 pt-1.5 text-[10px]"
      : size === "dense"
        ? "mt-2 pt-1.5 text-[11px]"
        : "mt-3 pt-2 text-xs";
  const venuePadding = size === "compact" ? "pr-2" : "pr-3";
  const previousPadding = size === "compact" ? "pl-2" : "pl-3";
  const previousValue = previousText ?? NO_PREVIOUS_GAME_TEXT;

  return (
    <div
      className={cn(
        "grid min-w-0 shrink-0 border-t text-muted-foreground",
        showVenue ? "grid-cols-2 divide-x" : "grid-cols-1",
        sizeRoot,
      )}
    >
      {showVenue ? (
        <div className={cn("min-w-0 text-left", venuePadding)}>
          <p className="font-semibold uppercase tracking-wide">Location</p>
          <p className="truncate" title={venueLine}>
            {venueLine}
          </p>
        </div>
      ) : null}
      <div
        className={cn(
          "min-w-0",
          showVenue ? `text-right ${previousPadding}` : "text-left",
        )}
      >
        <p className="font-semibold uppercase tracking-wide">Previous</p>
        <p className="truncate" title={previousValue}>
          {previousValue}
        </p>
      </div>
    </div>
  );
}
