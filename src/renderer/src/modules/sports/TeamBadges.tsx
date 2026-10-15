import React from "react";
import type { TrackedTeam } from "../../../../shared/ipc-types";
import { cn } from "../../lib/utils";
import { TeamAvatar } from "./TeamAvatar";

export interface TeamBadgeProps {
  team: TrackedTeam;
  size?: "sm" | "md" | "lg";
}

export interface OpponentBadgeProps {
  name: string;
  badgeUrl: string | null;
  size?: "sm" | "md" | "lg";
}

export function TeamBadge({
  team,
  size = "md",
}: TeamBadgeProps): React.ReactElement {
  const sizeClass =
    size === "sm"
      ? "h-7 w-7 text-xs"
      : size === "lg"
        ? "h-11 w-11 text-sm"
        : "h-9 w-9 text-xs";

  return (
    <TeamAvatar
      name={team.shortName ?? team.name}
      src={team.badgeUrl}
      className={cn("rounded-full", sizeClass)}
    />
  );
}

export function OpponentBadge({
  name,
  badgeUrl,
  size = "md",
}: OpponentBadgeProps): React.ReactElement {
  const sizeClass =
    size === "sm"
      ? "h-7 w-7 text-xs"
      : size === "lg"
        ? "h-11 w-11 text-sm"
        : "h-9 w-9 text-xs";

  return (
    <TeamAvatar
      name={name}
      src={badgeUrl}
      className={cn("rounded-full", sizeClass)}
    />
  );
}
