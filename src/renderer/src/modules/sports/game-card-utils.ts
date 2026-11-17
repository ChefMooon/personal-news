import type { SportEvent, TrackedTeam } from "../../../../shared/ipc-types";
import { resolveTrackedTeamSide } from "./side-resolution";

export const NO_PREVIOUS_GAME_TEXT = "No previous game";

export function shortTeamName(name: string): string {
  const words = name.trim().split(/\s+/);
  return words.length > 1
    ? words
        .map((word) => word[0])
        .join("")
        .slice(0, 4)
    : name.slice(0, 8);
}

export function formatPreviousResult(
  previousGame: SportEvent | null,
  trackedTeam: TrackedTeam | null,
): string | null {
  if (!previousGame || !trackedTeam) {
    return null;
  }

  const side = resolveTrackedTeamSide(
    previousGame,
    trackedTeam.teamId,
    trackedTeam.name,
    trackedTeam.leagueId,
  );
  if (!side) {
    return null;
  }

  const tracked =
    side === "home"
      ? { name: previousGame.homeTeam, score: previousGame.homeScore }
      : { name: previousGame.awayTeam, score: previousGame.awayScore };
  const opponent =
    side === "home"
      ? { name: previousGame.awayTeam, score: previousGame.awayScore }
      : { name: previousGame.homeTeam, score: previousGame.homeScore };

  return `${shortTeamName(tracked.name)} ${tracked.score ?? "-"} - ${opponent.score ?? "-"} ${shortTeamName(opponent.name)}`;
}
