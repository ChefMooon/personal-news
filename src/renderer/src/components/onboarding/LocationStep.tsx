import React, { useState } from "react";
import type { FeatureId } from "../../../../shared/feature-manifest";
import type { WeatherSearchResult } from "../../../../shared/ipc-types";
import { useWeatherLocations } from "../../hooks/useWeatherLocations";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface LocationStepProps {
  featureIds: readonly FeatureId[];
  onNext: () => void;
}

export function LocationStep({
  featureIds,
  onNext,
}: LocationStepProps): React.ReactElement {
  const { locations, search, saveLocation } = useWeatherLocations();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WeatherSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const hasWeather = featureIds.includes("weather");
  const hasAstronomy = featureIds.includes("astronomy");

  const runSearch = async (): Promise<void> => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    try {
      setResults(await search(trimmed));
    } finally {
      setSearching(false);
    }
  };

  const save = async (location: WeatherSearchResult): Promise<void> => {
    setSavingId(location.id);
    try {
      await saveLocation(location);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">
          {hasWeather ? "Where are you?" : "Pick a location for Astronomy"}
        </h2>
        {hasWeather && hasAstronomy ? (
          <p className="text-sm text-muted-foreground">
            Weather and Astronomy use this location.
          </p>
        ) : null}
        {!hasWeather && hasAstronomy ? (
          <p className="text-sm text-muted-foreground">
            Astronomy uses saved Weather locations. This saves one even though
            Weather is off.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="onboarding-location-search"
          className="text-sm font-medium"
        >
          Search for a city
        </label>
        <div className="flex gap-2">
          <Input
            id="onboarding-location-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void runSearch();
              }
            }}
            placeholder="City name"
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
        <section className="space-y-2" aria-label="Location search results">
          {results.map((location) => (
            <div
              key={location.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <span className="text-sm">
                {[location.name, location.admin1, location.country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void save(location)}
                disabled={savingId === location.id}
              >
                {savingId === location.id ? "Saving..." : "Save"}
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-2" aria-label="Saved locations">
        <h3 className="text-sm font-medium">Saved locations</h3>
        {locations.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {locations.map((location) => (
              <li key={location.id}>
                {[location.name, location.admin1, location.country]
                  .filter(Boolean)
                  .join(", ")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No saved locations yet.
          </p>
        )}
      </section>

      <div className="sticky bottom-0 z-10 flex justify-end bg-background py-2">
        <Button type="button" onClick={onNext}>
          {locations.length === 0 ? "Skip for now" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
