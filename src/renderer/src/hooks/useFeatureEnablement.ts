import { useAstronomyEnabled } from "../contexts/AstronomyEnabledContext";
import { useRedditDigestEnabled } from "../contexts/RedditDigestEnabledContext";
import { useSavedPostsEnabled } from "../contexts/SavedPostsEnabledContext";
import { useSportsEnabled } from "../contexts/SportsEnabledContext";
import { useWeatherEnabled } from "../contexts/WeatherEnabledContext";
import { useYouTubeEnabled } from "../contexts/YouTubeEnabledContext";
import type { FeatureId } from "../../../shared/feature-manifest";

export function useFeatureEnablement(): {
  isEnabled: (id: FeatureId) => boolean;
  setEnabled: (id: FeatureId, value: boolean) => void;
  youtubeLoading: boolean;
  astronomyLoading: boolean;
} {
  const youtube = useYouTubeEnabled();
  const redditDigest = useRedditDigestEnabled();
  const savedPosts = useSavedPostsEnabled();
  const sports = useSportsEnabled();
  const weather = useWeatherEnabled();
  const astronomy = useAstronomyEnabled();

  const features = {
    youtube,
    reddit_digest: redditDigest,
    saved_posts: savedPosts,
    sports,
    weather,
    astronomy,
  };

  return {
    isEnabled: (id) => features[id].enabled,
    setEnabled: (id, value) => features[id].setEnabled(value),
    youtubeLoading: youtube.loading,
    astronomyLoading: astronomy.loading,
  };
}
