# YouTube Channel Sync Strategy

## Overview

After the RSS feed is parsed into a normalized `ParsedFeed` object, this strategy governs how that data flows into the database and when the YouTube Data API v3 is called to enrich it. The goal is to minimize API quota usage while keeping the database accurate and complete.

---

## The Two-Track System

The sync runs on two independent schedules that complement each other.

| Track | Trigger | Purpose |
|-------|---------|---------|
| **RSS Poll** | Frequent (e.g. every 15–30 min) | Catch new entries quickly, minimize API calls |
| **Reconciliation Pass** | Scheduled (e.g. once daily) | Catch entries missed between polls, validate existing data |

---

## Track 1 — RSS Poll (Primary Path)

This is the hot path. It runs frequently and should be lightweight.

### Step 1 — Parse the Feed

Call the RSS parser (see parsing strategy doc) to produce a `ParsedFeed` containing `channel` info and a list of classified `entries`.

### Step 2 — Extract and Diff Entry IDs

Pull the list of video IDs from the parsed entries and compare against what is already stored in the database.

```
incomingIds  = [entry.id for entry in parsedFeed.entries]
existingIds  = db.query("SELECT id FROM videos WHERE id IN (?)", incomingIds)
newIds       = incomingIds - existingIds
```

If `newIds` is empty, stop here. No API call is needed.

### Step 3 — Enrich New Entries via YouTube API

For each ID in `newIds`, call `videos.list` with the following parts:

- `snippet` — title, description, channel info, publish date, thumbnails
- `contentDetails` — duration (used to confirm Shorts by length)
- `statistics` — view count, like count
- `liveStreamingDetails` — confirms if the entry is or was a livestream

```
apiResponse = youtube.videos.list(
  id     = newIds.join(","),   // up to 50 IDs per request
  part   = "snippet,contentDetails,statistics,liveStreamingDetails"
)
```

> This costs **1 quota unit** per call regardless of how many IDs are included (up to 50). Batch all new IDs into a single request where possible.

### Step 4 — Resolve Final Media Type

The RSS classification provides an initial `mediaType` hint. Use the API response to confirm or promote it.

| RSS mediaType | API signal | Final mediaType |
|---|---|---|
| `short` | Any | `short` — URL is definitive, no change |
| `upcoming_livestream` | `liveStreamingDetails` present | `upcoming_livestream` — confirm |
| `upcoming_livestream` | No `liveStreamingDetails` | `video` — likely a date error, demote |
| `video` | `liveStreamingDetails` present | `livestream` — promote |
| `video` | No `liveStreamingDetails` | `video` — confirmed |

### Step 5 — Upsert into Database

Insert each enriched entry as a new row. The RSS-derived fields and API-derived fields are merged at this point.

Fields to store:

| Field | Source |
|-------|--------|
| `id` | RSS + API |
| `title` | API (prefer over RSS — more reliable) |
| `description` | API |
| `url` | RSS |
| `mediaType` | Resolved in Step 4 |
| `publishedAt` | API |
| `updatedAt` | RSS |
| `duration` | API (`contentDetails.duration`) |
| `thumbnailUrl` | API |
| `viewCount` | API |
| `likeCount` | API |
| `isLivestream` | API (`liveStreamingDetails` present) |
| `syncedAt` | Current timestamp |

---

## Track 2 — Reconciliation Pass (Safety Net)

The RSS feed only returns the ~15 most recent entries. If the poll goes down or entries are published in rapid succession, some may be missed entirely. The reconciliation pass closes that gap.

### Step 1 — Full Channel Search

Call `search.list` to retrieve recent videos for the channel, ordered by date.

```
searchResponse = youtube.search.list(
  channelId  = CHANNEL_ID,
  type       = "video",
  order      = "date",
  maxResults = 50,        // adjust based on publish frequency
  part       = "id"       // keep it cheap, just get IDs
)
```

> `search.list` costs **100 quota units** per call — significantly more expensive than `videos.list`. Only request `id` here to keep the cost down.

### Step 2 — Diff Against Database

```
incomingIds = [result.id for result in searchResponse.items]
existingIds = db.query("SELECT id FROM videos WHERE id IN (?)", incomingIds)
newIds      = incomingIds - existingIds
```

### Step 3 — Enrich and Upsert

If `newIds` is non-empty, call `videos.list` with the same parts as Track 1 (Step 3) and upsert using the same logic.

---

## Quota Budget

The YouTube Data API v3 provides **10,000 units per day** by default.

| Operation | Cost | Frequency | Daily Cost (estimate) |
|-----------|------|-----------|----------------------|
| `videos.list` (new entries) | 1 unit | Per RSS poll with new content | ~5–20 units |
| `search.list` (reconciliation) | 100 units | Once daily | 100 units |
| **Total** | | | **~120–150 units/day** |

This leaves a large safety margin under the default quota. The expensive operation is `search.list` — keep it on a daily schedule, not more frequent.

---

## Error Handling

| Failure | Behaviour |
|---------|-----------|
| RSS fetch fails | Log, skip poll, retry on next interval |
| API call fails (5xx) | Log, enqueue IDs for retry, do not drop them |
| API call fails (quota exceeded) | Log, pause all API calls until quota resets (midnight Pacific), resume reconciliation the next day |
| Entry missing from API response | Log a warning, insert with RSS-only data, flag `needsEnrichment = true` for retry |
| Malformed date in RSS entry | Default `mediaType` to `video`, log for review |

---

## Implementation Order

1. **RSS parser** — produce the normalized `ParsedFeed` (see parsing strategy doc)
2. **Database schema** — define the `videos` table with all fields from Step 5 above
3. **Diff logic** — query existing IDs, compute the delta
4. **API enrichment** — call `videos.list`, resolve final `mediaType`
5. **Upsert** — write enriched rows to the database
6. **Track 1 scheduler** — wire up the poll loop
7. **Track 2 scheduler** — wire up the daily reconciliation pass
8. **Error handling and retry queue** — handle API failures and partial enrichment