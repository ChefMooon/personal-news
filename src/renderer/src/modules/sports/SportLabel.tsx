import React from "react";
import {
  CircleDot,
  Dribbble,
  Snowflake,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import {
  isSupportedSport,
  type SupportedSport,
} from "../../../../shared/sports";
import { cn } from "../../lib/utils";

const SPORT_ICONS = {
  Baseball: CircleDot,
  Basketball: Dribbble,
  "Ice Hockey": Snowflake,
} satisfies Record<SupportedSport, LucideIcon>;

export function SportLabel({
  sport,
  size,
}: {
  sport: string;
  size: "compact" | "dense" | "default";
}): React.ReactElement | null {
  if (!sport) {
    return null;
  }

  const Icon = isSupportedSport(sport) ? SPORT_ICONS[sport] : Trophy;

  return (
    <span
      data-sports-sport-label
      title={sport}
      className={cn(
        "inline-flex min-w-[1.75rem] shrink-[4] items-center gap-1 overflow-hidden rounded-full border border-border/60 px-2 py-0.5 leading-4 text-muted-foreground",
        size === "compact" ? "text-[11px]" : "text-xs",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "shrink-0",
          size === "compact" ? "h-3 w-3" : "h-3.5 w-3.5",
        )}
      />
      <span className="truncate">{sport}</span>
    </span>
  );
}
