import { describe, expect, it, vi } from "vitest";

vi.mock("../../../harness-mode", () => ({ isElectronHarnessRun: () => false }));

import { mapEspnScoreboardEvent, mapEvent } from "../api";

describe("sports event location mapping", () => {
  it("maps and trims TheSportsDB city and country", () => {
    expect(
      mapEvent({
        idEvent: "1",
        idLeague: "10",
        strSport: "Baseball",
        strHomeTeam: "A",
        strAwayTeam: "B",
        dateEvent: "2026-04-01",
        strVenue: "Rogers Centre",
        strCity: " Toronto ",
        strCountry: "Canada",
      }),
    ).toMatchObject({
      venueCity: "Toronto",
      venueRegion: null,
      venueCountry: "Canada",
    });
  });

  it("maps an empty TheSportsDB city to null", () => {
    expect(
      mapEvent({
        idEvent: "1",
        idLeague: "10",
        strSport: "Baseball",
        strHomeTeam: "A",
        strAwayTeam: "B",
        dateEvent: "2026-04-01",
        strCity: "",
      }),
    ).toMatchObject({ venueCity: null });
  });

  it("maps ESPN venue city, state, and country", () => {
    expect(
      mapEspnScoreboardEvent(
        {
          id: "1",
          date: "2026-04-01T23:00:00Z",
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { id: "h", displayName: "Home" } },
                { homeAway: "away", team: { id: "a", displayName: "Away" } },
              ],
              venue: {
                fullName: "Rogers Centre",
                address: { city: "Toronto", state: "ON", country: "Canada" },
              },
            },
          ],
        },
        "10",
        "Baseball",
      ),
    ).toMatchObject({
      venueCity: "Toronto",
      venueRegion: "ON",
      venueCountry: "Canada",
    });
  });

  it("maps a missing ESPN address to null location fields", () => {
    expect(
      mapEspnScoreboardEvent(
        {
          id: "1",
          date: "2026-04-01T23:00:00Z",
          competitions: [
            {
              competitors: [
                { homeAway: "home", team: { id: "h", displayName: "Home" } },
                { homeAway: "away", team: { id: "a", displayName: "Away" } },
              ],
              venue: { fullName: "Rogers Centre" },
            },
          ],
        },
        "10",
        "Baseball",
      ),
    ).toMatchObject({
      venueCity: null,
      venueRegion: null,
      venueCountry: null,
    });
  });
});
