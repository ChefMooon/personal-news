import type { YtChannel, YtVideo } from "../../shared/ipc-types";
import { fixtureTimestamp } from "./fixtures";
import type { DevTestDataContributor } from "./types";

export const YOUTUBE_FIXTURE_CHANNEL_ID = "pn_dev_fixture_youtube_channel";
export const YOUTUBE_FIXTURE_VIDEO_IDS = [
  "pn_dev_fixture_youtube_unwatched",
  "pn_dev_fixture_youtube_watched",
  "pn_dev_fixture_youtube_upcoming",
] as const;

function getFixtureRecords(): { channel: YtChannel; videos: YtVideo[] } {
  const now = fixtureTimestamp();
  return {
    channel: {
      channel_id: YOUTUBE_FIXTURE_CHANNEL_ID,
      name: "Synthetic Video Channel",
      thumbnail_url: "https://example.invalid/fixture/channel.png",
      added_at: now,
      enabled: 1,
      sort_order: 0,
      notify_new_videos: 0,
      notify_live_start: 0,
    },
    videos: [
      {
        video_id: YOUTUBE_FIXTURE_VIDEO_IDS[0],
        channel_id: YOUTUBE_FIXTURE_CHANNEL_ID,
        title: "Synthetic video with an unread state",
        published_at: now - 3600,
        thumbnail_url: "https://example.invalid/fixture/video.png",
        duration_sec: 642,
        broadcast_status: "none",
        scheduled_start: null,
        actual_start_time: null,
        actual_end_time: null,
        is_livestream: 0,
        fetched_at: now,
        media_type: "video",
        watched_at: null,
      },
      {
        video_id: YOUTUBE_FIXTURE_VIDEO_IDS[1],
        channel_id: YOUTUBE_FIXTURE_CHANNEL_ID,
        title: "Synthetic watched short",
        published_at: now - 7200,
        thumbnail_url: "https://example.invalid/fixture/short.png",
        duration_sec: 38,
        broadcast_status: "none",
        scheduled_start: null,
        actual_start_time: null,
        actual_end_time: null,
        is_livestream: 0,
        fetched_at: now,
        media_type: "short",
        watched_at: now - 900,
      },
      {
        video_id: YOUTUBE_FIXTURE_VIDEO_IDS[2],
        channel_id: YOUTUBE_FIXTURE_CHANNEL_ID,
        title: "Synthetic scheduled stream",
        published_at: now - 1800,
        thumbnail_url: "https://example.invalid/fixture/upcoming.png",
        duration_sec: null,
        broadcast_status: "upcoming",
        scheduled_start: now + 7200,
        actual_start_time: null,
        actual_end_time: null,
        is_livestream: 0,
        fetched_at: now,
        media_type: "upcoming_stream",
        watched_at: null,
      },
    ],
  };
}

export const youtubeFixtureContributor: DevTestDataContributor = {
  id: "youtube",
  seed(database): void {
    const records = getFixtureRecords();
    const maximumSortOrder = database
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS value FROM yt_channels")
      .get() as { value: number };
    records.channel.sort_order = maximumSortOrder.value + 1;
    database
      .prepare(
        `
        INSERT INTO yt_channels (
          channel_id, name, thumbnail_url, added_at, enabled, sort_order,
          notify_new_videos, notify_live_start
        ) VALUES (
          @channel_id, @name, @thumbnail_url, @added_at, @enabled, @sort_order,
          @notify_new_videos, @notify_live_start
        )
        ON CONFLICT(channel_id) DO UPDATE SET
          name = excluded.name,
          thumbnail_url = excluded.thumbnail_url,
          enabled = excluded.enabled,
          notify_new_videos = excluded.notify_new_videos,
          notify_live_start = excluded.notify_live_start
      `,
      )
      .run(records.channel);

    const insertVideo = database.prepare(`
      INSERT INTO yt_videos (
        video_id, channel_id, title, published_at, thumbnail_url, duration_sec,
        broadcast_status, scheduled_start, actual_start_time, actual_end_time,
        is_livestream, fetched_at, media_type, watched_at
      ) VALUES (
        @video_id, @channel_id, @title, @published_at, @thumbnail_url,
        @duration_sec, @broadcast_status, @scheduled_start, @actual_start_time,
        @actual_end_time, @is_livestream, @fetched_at, @media_type, @watched_at
      )
      ON CONFLICT(video_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        title = excluded.title,
        published_at = excluded.published_at,
        thumbnail_url = excluded.thumbnail_url,
        duration_sec = excluded.duration_sec,
        broadcast_status = excluded.broadcast_status,
        scheduled_start = excluded.scheduled_start,
        actual_start_time = excluded.actual_start_time,
        actual_end_time = excluded.actual_end_time,
        is_livestream = excluded.is_livestream,
        fetched_at = excluded.fetched_at,
        media_type = excluded.media_type,
        watched_at = excluded.watched_at
    `);

    for (const video of records.videos) {
      insertVideo.run(video);
    }
  },
  clear(database): void {
    const placeholders = YOUTUBE_FIXTURE_VIDEO_IDS.map(() => "?").join(", ");
    const nonFixtureVideo = database
      .prepare(
        `SELECT video_id FROM yt_videos
          WHERE channel_id = ? AND video_id NOT IN (${placeholders})
          LIMIT 1`,
      )
      .get(YOUTUBE_FIXTURE_CHANNEL_ID, ...YOUTUBE_FIXTURE_VIDEO_IDS);
    if (nonFixtureVideo) {
      throw new Error(
        "Cannot clear test YouTube data while non-fixture videos reference its channel.",
      );
    }

    database
      .prepare(`DELETE FROM yt_videos WHERE video_id IN (${placeholders})`)
      .run(...YOUTUBE_FIXTURE_VIDEO_IDS);
    database
      .prepare("DELETE FROM yt_channels WHERE channel_id = ?")
      .run(YOUTUBE_FIXTURE_CHANNEL_ID);
  },
};
