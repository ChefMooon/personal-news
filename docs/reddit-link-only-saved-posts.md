# Reddit link-only Saved Posts

Saved Posts recognizes Reddit comment-post URLs and `/s/` share links on the supported `reddit.com` hostnames. Reddit metadata is not requested because Reddit's post API requires authenticated access. A recognized Reddit URL is saved with the submitted URL, subreddit inferred from its path, and an explicit **Link only** status. Other Reddit URLs use the generic link metadata fallback.

Comment URLs use Reddit's post ID for deduplication. Share URLs use a SHA-256 hash of their normalized Reddit URL; their short code is not resolved over the network. The submitted URL remains the opening URL.

Link-only imports do not overwrite existing title, URL, permalink, author, subreddit, score, body, tags, viewed state, or save time. A non-empty note supplied with an import updates the saved note; an omitted note preserves it. A later trusted metadata record with the same verified post ID can enrich it. Share links are not guessed to match comment-post IDs.

The same handling applies to manual saves and ntfy imports. Link-only ntfy records count as successful ingestion and advance the cursor normally; the sync summary reports them separately. Invalid or unrecognized URLs retain normal validation and error behavior.
