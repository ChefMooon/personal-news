# Bluesky saved posts

Saved Posts recognizes `bsky.app` and `www.bsky.app` profile/post share links over HTTP(S), including query strings, fragments, and a trailing slash. It stores an author-scoped identity (`bsky_{actor}_{rkey}`), so two authors using the same record key remain separate. Other Bluesky pages are saved as neutral links without an inferred author.

For a recognized post, Personal News may resolve a handle to a DID and request the post record through Bluesky's public AppView XRPC endpoints. The returned record text populates the saved-post body. API failures, missing records, and local request-capacity limits leave the post saved with fallback metadata; no background retry or historical backfill runs. A later manual or ntfy save can try enrichment again.

The process applies conservative local safeguards: one request at a time, at least one second between starts, a rolling ceiling of 28 requests per minute (under the 30-per-minute app limit, leaving room for a two-request lookup), bounded response size and timeout, and no redirects. Positive and negative results are cached in bounded process-local caches. HTTP 429 responses start a global cooldown of at least 60 seconds using `Retry-After` when available; server and network failures use exponential cooldown up to 15 minutes. These are application safeguards, not Bluesky-published quotas, and they reset when the application process restarts.

Older `bsky_{rkey}` database rows are re-keyed only when their stored URL parses to the same actor and record key, and only if the new identity is not already present. Existing title, note, tags, viewed state, and saved time remain attached to the row. A row whose URL cannot prove ownership is left untouched.
