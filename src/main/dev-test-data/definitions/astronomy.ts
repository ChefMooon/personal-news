import type {
  AstronomyPlanetData,
  AstronomySnapshot,
} from "../../../shared/ipc-types";
import { fixtureTimestamp, type FixtureContext } from "../fixtures";
import { WEATHER_FIXTURE_LOCATION_ID } from "./weather";

// Explicit synthetic values keep every display group populated at any fixture date.
export function buildAstronomyFixture(
  context: FixtureContext,
): AstronomySnapshot {
  const time = fixtureTimestamp(context);
  const planet = (
    body: string,
    altitude: number,
    azimuth: number,
    magnitude: number,
    skyState: AstronomyPlanetData["skyState"],
  ): AstronomyPlanetData => ({
    body,
    altitude,
    azimuth,
    riseTime: time - 7200,
    setTime: time + 21600,
    magnitude,
    illuminationPercent: 92,
    phaseAngle: 33,
    heliocentricDistanceAu: body === "Venus" ? 0.72 : 5.2,
    geocentricDistanceAu: body === "Venus" ? 1.1 : 4.6,
    eclipticLongitude: 125,
    eclipticLatitude: 1.2,
    skyState,
  });
  return {
    locationId: WEATHER_FIXTURE_LOCATION_ID,
    forTimestamp: time,
    calculatedAt: time,
    stale: false,
    status: "complete",
    groups: {
      moon: {
        status: "fresh",
        data: {
          phaseAngle: 120,
          phaseName: "waxing_gibbous",
          illuminationPercent: 75,
          trend: "waxing",
          synodicProgress: 1 / 3,
          distanceKm: 384400,
          librationLatitude: 2.4,
          librationLongitude: -3.1,
          nextPrimaryPhaseName: "full",
          nextPrimaryPhaseTime: time + 5 * 86400,
          nextPerigeeTime: time + 7 * 86400,
          nextApogeeTime: time + 21 * 86400,
        },
      },
      horizon: {
        status: "fresh",
        data: {
          sun: { riseTime: time - 6 * 3600, setTime: time + 6 * 3600 },
          moon: { riseTime: time - 2 * 3600, setTime: time + 10 * 3600 },
          sunAltitude: 38,
          sunAzimuth: 180,
          moonAltitude: 24,
          moonAzimuth: 115,
          solarState: "day",
        },
      },
      planets: {
        status: "fresh",
        data: [
          planet("Venus", 18, 95, -4.2, "too_bright"),
          planet("Jupiter", 42, 130, -2.4, "up"),
          planet("Saturn", -12, 250, 0.7, "below_horizon"),
        ],
      },
      events: {
        status: "fresh",
        data: [
          {
            family: "season",
            label: "Synthetic solstice",
            time: time + 30 * 86400,
            localVisibility: null,
          },
          {
            family: "lunar_eclipse",
            label: "Synthetic lunar eclipse",
            time: time + 45 * 86400,
            localVisibility: null,
          },
          {
            family: "solar_eclipse",
            label: "Synthetic solar eclipse",
            time: time + 60 * 86400,
            localVisibility: null,
          },
          {
            family: "transit",
            label: "Synthetic Mercury transit",
            time: time + 90 * 86400,
            localVisibility: null,
          },
        ],
      },
    },
  };
}
