import type { YtChannel, YtVideo } from "../../../shared/ipc-types";
import { fixtureTimestamp, type FixtureContext } from "../fixtures";

export const YOUTUBE_FIXTURE_CHANNEL_IDS = [
  "pn_dev_fixture_youtube_channel",
  "pn_dev_fixture_youtube_channel_2",
  "pn_dev_fixture_youtube_channel_3",
  "pn_dev_fixture_youtube_channel_4",
] as const;
export const YOUTUBE_FIXTURE_CHANNEL_ID = YOUTUBE_FIXTURE_CHANNEL_IDS[0];
export const LEGACY_YOUTUBE_FIXTURE_VIDEO_IDS = [
  "pn_dev_fixture_youtube_unwatched",
  "pn_dev_fixture_youtube_watched",
  "pn_dev_fixture_youtube_upcoming",
] as const;
const CHANNELS = [
  {
    id: YOUTUBE_FIXTURE_CHANNEL_IDS[0],
    name: "Synthetic Video Channel",
    count: 15,
  },
  {
    id: YOUTUBE_FIXTURE_CHANNEL_IDS[1],
    name: "Synthetic Science Channel",
    count: 5,
  },
  {
    id: YOUTUBE_FIXTURE_CHANNEL_IDS[2],
    name: "Synthetic Maker Channel",
    count: 5,
  },
  {
    id: YOUTUBE_FIXTURE_CHANNEL_IDS[3],
    name: "Synthetic Nature Channel",
    count: 5,
  },
] as const;
export const YOUTUBE_FIXTURE_VIDEO_IDS = CHANNELS.flatMap((channel) =>
  Array.from(
    { length: channel.count },
    (_, index) => `${channel.id}_video_${String(index + 1).padStart(2, "0")}`,
  ),
);

const THUMBNAIL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='320' height='180'%3E%3Crect width='320' height='180' fill='%232c3e50'/%3E%3C/svg%3E";
const SHORT_VIDEO_ID = `${YOUTUBE_FIXTURE_CHANNEL_IDS[0]}_video_02`;
const UPCOMING_STREAM_VIDEO_ID = `${YOUTUBE_FIXTURE_CHANNEL_IDS[0]}_video_03`;
const WATCHED_VIDEO_ID = `${YOUTUBE_FIXTURE_CHANNEL_IDS[0]}_video_04`;
const LIFECYCLE_CASES: Record<
  string,
  {
    title: string;
    mediaType: YtVideo["media_type"];
    duration: number | null;
    broadcast: YtVideo["broadcast_status"];
    watched: boolean;
    upcoming: boolean;
  }
> = {
  [SHORT_VIDEO_ID]: {
    title: "Synthetic Video Channel — Synthetic short",
    mediaType: "short",
    duration: 38,
    broadcast: "none",
    watched: false,
    upcoming: false,
  },
  [UPCOMING_STREAM_VIDEO_ID]: {
    title: "Synthetic Video Channel — Synthetic scheduled stream",
    mediaType: "upcoming_stream",
    duration: null,
    broadcast: "upcoming",
    watched: false,
    upcoming: true,
  },
  [WATCHED_VIDEO_ID]: {
    title: "Synthetic Video Channel — Synthetic video 4",
    mediaType: "video",
    duration: 351,
    broadcast: "none",
    watched: true,
    upcoming: false,
  },
};

export function buildYouTubeFixtures(context: FixtureContext): {
  channels: YtChannel[];
  videos: YtVideo[];
} {
  const now = fixtureTimestamp(context);
  const channels: YtChannel[] = CHANNELS.map((channel, index) => ({
    channel_id: channel.id,
    name: channel.name,
    thumbnail_url: THUMBNAIL,
    added_at: now,
    enabled: 1,
    sort_order: index,
    notify_new_videos: 0,
    notify_live_start: 0,
  }));
  let globalIndex = 0;
  const videos: YtVideo[] = CHANNELS.flatMap((channel) =>
    Array.from({ length: channel.count }, (_, videoIndex) => {
      const id = `${channel.id}_video_${String(videoIndex + 1).padStart(2, "0")}`;
      const example = LIFECYCLE_CASES[id];
      const title =
        example?.title ?? `${channel.name} — Synthetic video ${videoIndex + 1}`;
      const mediaType = example?.mediaType ?? "video";
      const upcoming = example?.upcoming ?? false;
      const watched = example?.watched ?? false;
      const video: YtVideo = {
        video_id: id,
        channel_id: channel.id,
        title,
        published_at: now - (globalIndex + 1) * 3600,
        thumbnail_url: THUMBNAIL,
        duration_sec: example ? example.duration : 300 + globalIndex * 17,
        broadcast_status: example?.broadcast ?? "none",
        scheduled_start: upcoming ? now + 7200 : null,
        actual_start_time: null,
        actual_end_time: null,
        is_livestream: 0,
        fetched_at: now,
        media_type: mediaType,
        watched_at: watched ? now - 900 : null,
      };
      globalIndex += 1;
      return video;
    }),
  );
  return { channels, videos };
}
