import { upsertAstronomySnapshot } from "../sources/astronomy/cache";
import { buildAstronomyFixture } from "./definitions/astronomy";
import { WEATHER_FIXTURE_LOCATION_ID } from "./definitions/weather";
import { createFixtureContext, type FixtureContext } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export const astronomyFixtureContributor: DevTestDataContributor = {
  id: "astronomy",
  seed(database, context: FixtureContext = createFixtureContext()): void {
    const snapshot = buildAstronomyFixture(context);
    upsertAstronomySnapshot(
      database,
      snapshot.locationId,
      snapshot.forTimestamp,
      snapshot.calculatedAt,
      snapshot.groups,
    );
  },
  clear(database): void {
    database
      .prepare("DELETE FROM astronomy_cache WHERE location_id = ?")
      .run(WEATHER_FIXTURE_LOCATION_ID);
  },
};
