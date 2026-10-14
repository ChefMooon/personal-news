import {
  buildYouTubeFixtures,
  LEGACY_YOUTUBE_FIXTURE_VIDEO_IDS,
  YOUTUBE_FIXTURE_CHANNEL_IDS,
  YOUTUBE_FIXTURE_VIDEO_IDS,
} from "./definitions/youtube";
import { createFixtureContext, type FixtureContext } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export {
  YOUTUBE_FIXTURE_CHANNEL_ID,
  YOUTUBE_FIXTURE_CHANNEL_IDS,
  YOUTUBE_FIXTURE_VIDEO_IDS,
} from "./definitions/youtube";

export const youtubeFixtureContributor: DevTestDataContributor = {
  id: "youtube",
  seed(database, context: FixtureContext = createFixtureContext()): void {
    database
      .prepare(
        `DELETE FROM yt_videos WHERE video_id IN (${LEGACY_YOUTUBE_FIXTURE_VIDEO_IDS.map(() => "?").join(", ")})`,
      )
      .run(...LEGACY_YOUTUBE_FIXTURE_VIDEO_IDS);
    const records = buildYouTubeFixtures(context);
    const maximumSortOrder = database
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS value FROM yt_channels")
      .get() as { value: number };
    const insertChannel = database.prepare(`
      INSERT INTO yt_channels (channel_id, name, thumbnail_url, added_at, enabled, sort_order, notify_new_videos, notify_live_start)
      VALUES (@channel_id, @name, @thumbnail_url, @added_at, @enabled, @sort_order, @notify_new_videos, @notify_live_start)
      ON CONFLICT(channel_id) DO UPDATE SET
        name = excluded.name, thumbnail_url = excluded.thumbnail_url, enabled = excluded.enabled,
        notify_new_videos = excluded.notify_new_videos, notify_live_start = excluded.notify_live_start
    `);
    records.channels.forEach((channel, index) =>
      insertChannel.run({
        ...channel,
        sort_order: maximumSortOrder.value + index + 1,
      }),
    );
    const insertVideo = database.prepare(`
      INSERT INTO yt_videos (
        video_id, channel_id, title, published_at, thumbnail_url, duration_sec,
        broadcast_status, scheduled_start, actual_start_time, actual_end_time,
        is_livestream, fetched_at, media_type, watched_at
      ) VALUES (
        @video_id, @channel_id, @title, @published_at, @thumbnail_url, @duration_sec,
        @broadcast_status, @scheduled_start, @actual_start_time, @actual_end_time,
        @is_livestream, @fetched_at, @media_type, @watched_at
      )
      ON CONFLICT(video_id) DO UPDATE SET
        channel_id = excluded.channel_id, title = excluded.title, published_at = excluded.published_at,
        thumbnail_url = excluded.thumbnail_url, duration_sec = excluded.duration_sec,
        broadcast_status = excluded.broadcast_status, scheduled_start = excluded.scheduled_start,
        actual_start_time = excluded.actual_start_time, actual_end_time = excluded.actual_end_time,
        is_livestream = excluded.is_livestream, fetched_at = excluded.fetched_at,
        media_type = excluded.media_type, watched_at = excluded.watched_at
    `);
    for (const video of records.videos) insertVideo.run(video);
  },
  clear(database): void {
    const ids = [
      ...YOUTUBE_FIXTURE_VIDEO_IDS,
      ...LEGACY_YOUTUBE_FIXTURE_VIDEO_IDS,
    ];
    const videoPlaceholders = ids.map(() => "?").join(", ");
    const nonFixtureVideo = database
      .prepare(
        `
      SELECT video_id FROM yt_videos WHERE channel_id IN (${YOUTUBE_FIXTURE_CHANNEL_IDS.map(() => "?").join(", ")})
      AND video_id NOT IN (${videoPlaceholders}) LIMIT 1
    `,
      )
      .get(...YOUTUBE_FIXTURE_CHANNEL_IDS, ...ids);
    if (nonFixtureVideo)
      throw new Error(
        "Cannot clear test YouTube data while non-fixture videos reference a fixture channel.",
      );
    database
      .prepare(`DELETE FROM yt_videos WHERE video_id IN (${videoPlaceholders})`)
      .run(...ids);
    database
      .prepare(
        `DELETE FROM yt_channels WHERE channel_id IN (${YOUTUBE_FIXTURE_CHANNEL_IDS.map(() => "?").join(", ")})`,
      )
      .run(...YOUTUBE_FIXTURE_CHANNEL_IDS);
  },
};
