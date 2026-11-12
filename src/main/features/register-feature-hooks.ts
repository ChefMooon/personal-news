import { getDb } from "../db/database";
import { applyAstronomyEnabled } from "../sources/astronomy";
import { applySavedPostsEnabled } from "../sources/reddit";
import { applyRedditDigestEnabled } from "../sources/scripts";
import { applySportsEnabled } from "../sources/sports";
import { applyWeatherEnabled } from "../sources/weather";
import { applyYouTubeEnabled } from "../sources/youtube";
import {
  assertAllFeatureHooksRegistered,
  registerFeatureHook,
} from "./feature-dispatcher";

export function registerFeatureHooks(): void {
  registerFeatureHook("youtube", applyYouTubeEnabled);
  registerFeatureHook("saved_posts", applySavedPostsEnabled);
  registerFeatureHook("sports", applySportsEnabled);
  registerFeatureHook("weather", applyWeatherEnabled);
  registerFeatureHook("astronomy", applyAstronomyEnabled);
  registerFeatureHook("reddit_digest", (enabled) =>
    applyRedditDigestEnabled(getDb(), enabled),
  );
  assertAllFeatureHooksRegistered();
}
