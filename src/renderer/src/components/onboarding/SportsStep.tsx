import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  IPC,
  type TeamSearchResult,
  type TrackedTeam,
} from "../../../../shared/ipc-types";
import {
  DEFAULT_SPORT,
  SPORTS_OPTIONS,
  type SupportedSport,
} from "../../../../shared/sports";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface SportsStepProps {
  onNext: () => void;
}

export function SportsStep({ onNext }: SportsStepProps): React.ReactElement {
  const [sport, setSport] = useState<SupportedSport>(DEFAULT_SPORT);
  const [query, setQuery] = useState("");
  const [teams, setTeams] = useState<TrackedTeam[]>([]);
  const [results, setResults] = useState<TeamSearchResult[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [searching, setSearching] = useState(false);
  const [addingTeamId, setAddingTeamId] = useState<string | null>(null);

  const loadTeams = useCallback(async (): Promise<void> => {
    try {
      const tracked = (await window.api.invoke(
        IPC.SPORTS_GET_TRACKED_TEAMS,
      )) as TrackedTeam[];
      setTeams(tracked);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load tracked teams.",
      );
    } finally {
      setLoadingTeams(false);
    }
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  const runSearch = async (): Promise<void> => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    try {
      const found = (await window.api.invoke(IPC.SPORTS_SEARCH_TEAMS, {
        query: trimmed,
        sport,
      })) as TeamSearchResult[];
      setResults(found);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to search sports teams.",
      );
    } finally {
      setSearching(false);
    }
  };

  const addTeam = async (team: TeamSearchResult): Promise<void> => {
    setAddingTeamId(team.teamId);
    try {
      await window.api.invoke(IPC.SPORTS_ADD_TEAM, {
        teamId: team.teamId,
        leagueId: team.leagueId,
        sport: team.sport,
        teamName: team.name,
        leagueName: team.leagueName,
        badgeUrl: team.badgeUrl,
      });
      await loadTeams();
      setResults((current) =>
        current.filter((result) => result.teamId !== team.teamId),
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add sports team.",
      );
    } finally {
      setAddingTeamId(null);
    }
  };

  const trackedIds = new Set(teams.map((team) => team.teamId));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="onboarding-sport" className="text-sm font-medium">
          Sport
        </label>
        <Select
          value={sport}
          onValueChange={(value) => setSport(value as SupportedSport)}
        >
          <SelectTrigger id="onboarding-sport">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPORTS_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <label htmlFor="onboarding-team-search" className="text-sm font-medium">
          Search for a team
        </label>
        <div className="flex gap-2">
          <Input
            id="onboarding-team-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Team name"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void runSearch()}
            disabled={searching || !query.trim()}
          >
            {searching ? "Searching..." : "Search"}
          </Button>
        </div>
      </div>

      {results.length > 0 ? (
        <section className="space-y-2" aria-label="Team search results">
          {results.map((team) => (
            <div
              key={team.teamId}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{team.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {team.leagueName}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void addTeam(team)}
                disabled={
                  trackedIds.has(team.teamId) || addingTeamId === team.teamId
                }
              >
                {addingTeamId === team.teamId ? "Adding..." : "Add"}
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-2" aria-label="Added teams">
        <h3 className="text-sm font-medium">Added teams</h3>
        {teams.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {teams.map((team) => (
              <li key={team.teamId}>
                {team.name}{" "}
                <span className="text-muted-foreground">({team.sport})</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {loadingTeams ? "Loading teams..." : "No teams added yet."}
          </p>
        )}
      </section>

      <div className="sticky bottom-0 z-10 flex justify-end bg-background py-2">
        <Button type="button" onClick={onNext}>
          {teams.length === 0 ? "Skip for now" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
