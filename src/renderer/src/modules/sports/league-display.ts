import type { SportLeague, TrackedTeam } from "../../../../shared/ipc-types";
import { getSportLabel } from "../../../../shared/sports";

export type LeaguesById = Record<string, SportLeague>;

export function getLeagueKey(sport: string, leagueId: string): string {
  return `${sport}:${leagueId}`;
}

export function getLeagueLabel({
  sport,
  leagueId,
  leaguesById,
  fallbackLabel,
}: {
  sport: string;
  leagueId: string;
  leaguesById: LeaguesById;
  fallbackLabel?: string | null;
}): string {
  const candidate = [
    fallbackLabel,
    leaguesById[getLeagueKey(sport, leagueId)]?.name,
  ]
    .map((label) => label?.trim())
    .find(
      (label) =>
        label &&
        label.toLowerCase() !== leagueId.toLowerCase() &&
        !/^\d+$/.test(label),
    );
  if (
    !candidate ||
    candidate.toLowerCase() === leagueId.toLowerCase() ||
    /^\d+$/.test(candidate)
  ) {
    return getSportLabel(sport);
  }
  return candidate;
}

export function getTrackedTeamMeta(
  team: TrackedTeam,
  leaguesById: LeaguesById,
  showSportLabels: boolean,
): string {
  const leagueLabel = getLeagueLabel({
    sport: team.sport,
    leagueId: team.leagueId,
    leaguesById,
  });

  const sportLabel = getSportLabel(team.sport);
  if (!showSportLabels || leagueLabel === sportLabel) {
    return leagueLabel;
  }
  return `${sportLabel} · ${leagueLabel}`;
}
