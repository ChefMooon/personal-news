import type { SportEvent } from "../../../../shared/ipc-types";
import { getLeagueKey, type LeaguesById } from "./league-display";

const COUNTRY_ALIASES: Record<string, string> = {
  usa: "united states",
  us: "united states",
  "u.s.": "united states",
  "u.s.a.": "united states",
  "united states": "united states",
  "united states of america": "united states",
  uk: "united kingdom",
  "u.k.": "united kingdom",
  "united kingdom": "united kingdom",
  "great britain": "united kingdom",
  england: "united kingdom",
  scotland: "united kingdom",
  wales: "united kingdom",
  "northern ireland": "united kingdom",
};

export function normalizeCountryKey(
  value: string | null | undefined,
): string | null {
  const normalized = value
    ?.trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^the /, "");
  if (!normalized) {
    return null;
  }
  return COUNTRY_ALIASES[normalized] ?? normalized;
}

export function getLeagueCountry(
  event: SportEvent,
  leaguesById: LeaguesById,
): string | null {
  return (
    leaguesById[getLeagueKey(event.sport, event.leagueId)]?.country ?? null
  );
}

export function formatEventLocation(
  event: Pick<SportEvent, "venueCity" | "venueRegion" | "venueCountry">,
  leagueCountry: string | null | undefined,
): string | null {
  const city = event.venueCity?.trim() || null;
  const region = event.venueRegion?.trim() || null;
  const country = event.venueCountry?.trim() || null;
  if (!city) {
    return null;
  }

  const leagueKey = normalizeCountryKey(leagueCountry);
  const eventKey = normalizeCountryKey(country);
  if (leagueKey && eventKey && leagueKey !== eventKey) {
    return `${city}, ${country}`;
  }
  if (leagueKey && eventKey) {
    return region ? `${city}, ${region}` : city;
  }
  if (region) {
    return `${city}, ${region}`;
  }
  return country ? `${city}, ${country}` : city;
}

export function formatVenueLine(
  event: SportEvent,
  leagueCountry: string | null | undefined,
): string | null {
  const venue = event.venue?.trim() || null;
  const location = formatEventLocation(event, leagueCountry);
  if (venue && location) {
    return `${venue} · ${location}`;
  }
  return venue ?? location;
}
