# X saved links and metadata investigation

Date: 2026-10-29. Parsing, local fallback, deduplication and optional best-effort oEmbed text enrichment are implemented.

## Implemented plan

1. Share one strict X URL parser between Saved Posts source handling and ntfy deduplication.
2. Recognize x.com/twitter.com, www/mobile/m hosts, named-user status paths, i/status and i/web/status paths and photo/video views. Identify a post by its decimal ID without numeric conversion.
3. Preserve existing x_<id> saved-record identities, original saved URLs and notes. Normalize dedupe keys only, including legacy ingestion history, and backfill from existing saved records using the existing ntfy flow.
4. Provide a local title from the note, URL handle or post ID. Profiles, search, intents and malformed post paths remain X links with no invented author or handle tag.
5. Test aliases, distinct posts, malformed paths, neutral fallbacks, legacy dedupe history, notes and ntfy replays.

Duplicate X saves without a new note retain the existing title and note; supplying a new note intentionally updates both. Manual and ntfy saves use the same persistence statement. Existing bodies are retained when an optional lookup fails, and a returned post text can enrich a row that has no body. No saved-record migration was added. Already saved titles/tags are not rewritten. Named handles are inferred from the URL, not verified ownership. Distinct post IDs remain distinct even if they are edits of the same post. URL shorteners (t.co), unofficial mirror hosts and unfamiliar path suffixes are not resolved.

## Best-effort lookup options

The official [X oEmbed documentation](https://docs.x.com/x-for-websites/oembed-api) documents an unauthenticated JSON endpoint at https://publish.x.com/oembed. Its post example includes author_name, author_url and HTML containing fallback post text. The document explicitly says markup may change and provides cache_age. This is the most plausible first experiment for optional public-post enrichment without user credentials. It is an embed API rather than a stable plain-text metadata contract; text extraction would be best effort.

The implementation requests omit_script=1 only for a recognized decimal post ID, with a three-second timeout, a 64 KiB response cap and manual redirect handling. It extracts paragraph text from the returned blockquote as inert text, caches successes and misses briefly by post ID, and never renders remote markup. Lookup failures return the existing local title/author/tag fallback. The endpoint response format is not a stable text contract and markup can change. This app has not established real-world service availability; validation uses mocked responses, not a live X request.

The official [Post Lookup documentation](https://docs.x.com/x-api/posts/lookup/introduction) describes GET /2/tweets/:id, expanded authors/media and developer-account/app/token prerequisites. This gives a structured alternative but requires credential storage, settings, access handling and a cost decision. The [current pricing documentation](https://docs.x.com/x-api/getting-started/pricing) describes prepaid credits and per-resource reads; rates and account eligibility should be rechecked in the Developer Console before implementation. No account setup, credentials or paid requests were attempted.

Third-party mirrors and undocumented syndication endpoints were not selected: they add availability, provenance and privacy uncertainty without an authoritative supported contract reviewed here.

## Validation

Focused Electron-runtime Vitest tests cover source fallback, canonical identity, ntfy aliases/replays, distinct IDs and legacy history merging with unchanged saved notes. Node TypeScript checks pass. UI rendering and actual X content availability are separate concerns and are not established by these tests.
