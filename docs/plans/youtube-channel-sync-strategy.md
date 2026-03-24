# YouTube Channel Sync Strategy

> Status: Historical implementation strategy retained for context. It reflects an earlier debug-first ingest approach and is not the maintained source of truth for the current YouTube pipeline.
>
> Current maintained docs: [README](../../README.md), [docs/architecture/data-sources.md](../architecture/data-sources.md), and [docs/architecture/overview.md](../architecture/overview.md).

## Overview

This version of the strategy is focused on a multi-channel, debug-first ingest loop.

Goals for this phase:

- Poll RSS for every configured channel
- Build a list of candidate video IDs that are not in the database
- Send IDs to YouTube Data API v3 in batches of up to 50
- Log request payloads before each API call
- Log and persist raw API responses for inspection
- Normalize only API data (RSS is used only to discover candidate IDs)

This gives a safe iteration loop for testing normalization before the final production ingest flow is locked in.

---

## Scope of This Phase

In scope now:

- Multi-channel RSS polling and ID extraction
- Global diff against existing DB IDs
- Batch building and preflight request logging
- Raw YouTube API response capture
- Initial normalization rules for mediaType, title, description, duration

Deferred until after this phase is stable:

- Daily reconciliation using `search.list`
- Full retry orchestration and quota backpressure logic
- Final production observability dashboards

---

## Multi-Channel Poll Loop (Primary Path)

This is the hot path and should run on a frequent interval.

### Step 0 - Load Configured Channels

Read all enabled channel subscriptions from settings.

Example shape:

```
channels = [
  { channelId, feedUrl, enabled: true },
  ...
]
```

### Step 1 - Fetch RSS Per Channel

For each enabled channel, fetch and parse RSS independently.

```
for channel in channels:
  parsedFeed = parseFeed(channel.feedUrl)
  collect(parsedFeed.entries, channel.channelId)
```

RSS output is transient in this phase and is not written to the `videos` table.

### Step 2 - Build Candidate ID Set

Extract IDs from parsed RSS entries and keep channel context for debugging:

```
candidates = [
  {
    videoId,
    sourceChannelId,
    rssUrl,
    rssMediaHint,
    rssPublishedAt,
  }
]
```

Then de-duplicate by `videoId` across all channels for this poll cycle.

### Step 3 - Diff Against DB (Recommended: One Consolidated Query)

Decision: use one consolidated DB diff per poll cycle, not one query per channel.

Why this is better:

- Fewer DB round-trips as channel count grows
- Global de-duplication is naturally handled
- Simpler batch construction for `videos.list`

Implementation note:

- Chunk query parameters to avoid SQLite bind limits (for example, 500-900 IDs per SQL call)
- Merge chunked results into a single `existingIds` set

Pseudo-flow:

```
incomingIds = unique([c.videoId for c in candidates])
existingIds = set()

for idChunk in chunk(incomingIds, DB_IN_LIMIT):
  rows = db.query("SELECT id FROM videos WHERE id IN (?)", idChunk)
  existingIds += rows

newIds = incomingIds - existingIds
```

### Step 4 - Build New Video Worklist

Create a list containing only IDs missing from the database:

```
videosToFetch = [id for id in incomingIds if id not in existingIds]
```

Log this list as a debug artifact for each poll cycle.

### Step 5 - Split Into API Batches (<= 50)

Chunk `videosToFetch` into request batches of up to 50 IDs:

```
batches = chunk(videosToFetch, 50)
```

For each batch, build a request object:

```
{
  part: "snippet,contentDetails,statistics,liveStreamingDetails",
  id: "comma,separated,video,ids"
}
```

### Step 6 - Preflight Debug Output Before API Calls

Before sending each batch request, log the exact payload.

Required debug output per batch:

- pollCycleId
- batchIndex and batchSize
- list of video IDs
- full request params (parts and ID string)
- source channels represented in this batch

Optional safety mode for local testing:

- Manual confirmation mode pauses before each API call
- Operator can confirm send, skip one batch, or skip all remaining batches in the poll cycle

### Step 7 - Call YouTube API and Capture Raw Response

After manual confirmation, call `videos.list` for each batch.

Persist raw response payload (verbatim JSON) for each batch to a debug location.

Suggested file naming:

```
resources/debug/youtube-sync/{pollCycleId}/batch-{index}-request.json
resources/debug/youtube-sync/{pollCycleId}/batch-{index}-response.raw.json
```

This is the JSON equivalent of keeping raw XML during parser development.

### Step 8 - Normalize API Data (Iterative)

Normalization runs after raw response capture and should stay easy to inspect and revise.

Target normalized fields for now:

- `id`
- `mediaType` (`video`, `short`, `upcoming_stream`, `live`)
- `title`
- `description`
- `duration`
- `publishedAt`
- `channelId`
- `thumbnailUrl`

Keep a normalization debug artifact per batch:

```
resources/debug/youtube-sync/{pollCycleId}/batch-{index}-normalized.preview.json
```

### Step 9 - Media Type Rules (Current Draft)

Use API-first rules in this order:

1. `live` if `snippet.liveBroadcastContent == "live"` or `liveStreamingDetails.actualStartTime` exists and `actualEndTime` is absent
2. `upcoming_stream` if `snippet.liveBroadcastContent == "upcoming"` or `liveStreamingDetails.scheduledStartTime` exists and `actualStartTime` is absent
3. `short` if parsed ISO 8601 duration is <= 60 seconds
4. `video` otherwise

Mark uncertain classifications with a debug flag (for example `mediaTypeConfidence: "low"`) so rules can be refined quickly.

### Step 10 - Ingest Policy

Only normalized API data is inserted/updated in `videos`.

RSS-derived metadata is not persisted in `videos` in this phase.

---

## Quota and Batch Notes

- `videos.list` costs 1 unit per request, up to 50 IDs per request
- Estimated units per poll cycle:

```
unitsPerCycle ~= ceil(newVideoCount / 50)
```

- With multiple channels, quota usage scales with total new IDs across all channels, not channel count directly

---

## Error Handling for This Phase

| Failure | Behavior |
|---------|----------|
| RSS fetch fails for one channel | Log channel-level error, continue other channels |
| DB diff query chunk fails | Log chunk and fail cycle safely (no partial API calls) |
| API call fails (5xx) | Log batch payload and schedule retry for that exact batch |
| API call fails (quota) | Stop remaining batches, keep pending IDs for next run |
| API returns partial item set | Log missing IDs, keep unresolved IDs queued |
| Normalization rule throws | Persist raw response, mark batch as `normalization_failed` |

---

## Implementation Order (This Iteration)

1. Multi-channel RSS fetch loop
2. Global candidate ID set + de-dup
3. Consolidated DB diff with chunked `IN` queries
4. New ID worklist debug output
5. Batch builder (max 50 IDs)
6. Preflight request logger
7. API caller + raw response persistence
8. Initial normalization preview (`video`, `short`, `upcoming_stream`, `live`)
9. API-only ingest to `videos`
10. Iterate debug output and normalization rules

---

## Decisions Locked for This Iteration

1. Debug artifacts are stored on filesystem under `resources/debug/`.
2. Batch sending uses manual confirmation by default, with options to send, skip one batch, or skip all remaining batches.
3. `live` is a separate media type now; it is not folded into `upcoming_stream`.