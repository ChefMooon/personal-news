# ntfy ingestion and one-off testing

## How ntfy ingestion works

The ntfy flow is centered around the Reddit source module:

1. The app polls the configured ntfy topic from the main process.
2. It fetches the topic feed from the ntfy server and reads each incoming message.
3. Each message is passed through the shared parser in [src/main/sources/reddit/ntfy-message.mjs](../src/main/sources/reddit/ntfy-message.mjs).
4. If a valid HTTP URL is found, the app fetches metadata for that URL and stores the result as a saved post.
5. Sync status and failures are written back to the app settings so the UI can show the latest summary.

The main entry point is [src/main/sources/reddit/ntfy.ts](../src/main/sources/reddit/ntfy.ts).

## What the parser handles

The parser accepts a raw ntfy message and extracts:

- a URL, when present
- an optional note when the message contains a URL followed by additional text on the next line

It also handles common share-sheet payloads such as JSON objects that contain a URL value.

## Easy one-off tests

A simple CLI helper is available at [scripts/test-ntfy-message.mjs](../scripts/test-ntfy-message.mjs).

### Run a one-off test with an inline message

```bash
npm run test:ntfy-message -- 'https://example.com'
```

### Run a one-off test with a JSON-style ntfy payload

```bash
npm run test:ntfy-message -- '{"url":"https://example.com"}'
```

### Pipe input from stdin

```bash
printf '{"url":"https://example.com"}' | npm run test:ntfy-message
```

The script prints a short success or failure summary and exits with a non-zero status when no URL can be extracted.
