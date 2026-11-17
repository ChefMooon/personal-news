---
name: release-notes-markdown
status: draft - decisions approved 2026-11-17, not implemented
app: Personal News
stack: Electron (React, Vitest)
depends-on: canonical release-notes-md-v1 files (see below)
---

# Personal News: safe markdown release notes

**This is a plan only. Nothing here has been implemented.** Implement it before the next release. Work on the repo's current branch (`dev`); do not create a new branch; leave changes uncommitted for review.

Cross-project context: `C:\Users\justi\Documents\Git\squad\captain-holt\docs\plans\release-update-normalization\release-update-normalization-plan.md`, section 16 (the spec, order of work and test corpus). All four apps use the same format, `release-notes-md-v1`, so release notes look and behave the same everywhere.

## Goal

Show release notes in Personal News with safe, consistent formatting: headings, paragraphs, bullets (one nested level), `code`, **bold**, *italic* and `https` links, rendered from a parsed tree. Never render raw HTML.

## Format summary (full spec in the main plan, section 16)

- Blocks: `### Heading`, one-line paragraph, `- bullet`, one nested `  - bullet` level.
- Inline: code, bold, italic, `[text](https://...)`.
- Forbidden: raw HTML, images, tables, numbered lists, blockquotes, fences, other heading levels, bare URLs, non-https links, wrapped lines, deeper nesting.
- Limits: 500 characters per line, 2048 per URL, 8000 per entry, 60 bullets.
- Render from the tree with React elements only; links `https` only through the existing `IPC.SHELL_OPEN_EXTERNAL` handler (allowlist-checked in `src/main/security/ipc-policy.ts`); invalid input falls back to a plain-text `pre-wrap` block.

## Canonical files this plan copies (created by main plan Phase 1)

Copy unchanged; the audit compares hashes.

- `release-notes-markdown.mjs` and `release-notes-markdown.d.mts` (parser and validator)
- `fixtures/release-notes-md-v1/*` (corpus of `input.md` and `expected.json`)

Proposed locations here: `src/shared/release-notes-markdown.mjs`, `src/shared/release-notes-markdown.d.mts`, `src/shared/__tests__/fixtures/release-notes-md-v1/`

If implementing before the canonical files exist, stop and finish main plan Phase 1 first.

## Current state (read from source, 2026-11-17)

- `src/shared/changelog-notes.mjs` (131 lines) finds a version section and validates the strict subset (headings and plain bullets; rejects backticks, bold, emphasis, links, URLs, HTML). It also provides `parseReleaseNotesMarkdown`.
- `src/main/updates/release-notes.ts` (165 lines) parses the updater's **HTML** release notes (electron-updater delivers the GitHub release body as HTML) into `ReleaseNotesDocument` (`{ sections: [{ heading, items: string[] }] }`) with a hand-written tag tokenizer and entity decoder.
- `src/main/updates/whats-new.ts` builds the "What's new" payload from the bundled `CHANGELOG.md` (markdown).
- `src/renderer/src/components/WhatsNewDialog.tsx` (85 lines) renders `sections` as `h4` plus `ul/li` with plain-text items. Items are strings, so no inline formatting is possible today.
- Used by `App.tsx`, `routes/Settings.tsx`, `components/onboarding/FinishStep.tsx` and `src/shared/ipc-types.ts` (`ReleaseNotesDocument`).
- `npm run release:notes -- <version> [--check]` (`scripts/release-notes-from-changelog.mjs`, 181 lines) validates and pushes notes to the draft release.

## Plan

### Phase 0: pre-checks (read-only)

0.1 Capture two real notes payloads: the HTML shape electron-updater returns for a published release, and the bundled markdown path. Save them as extra fixtures.
0.2 Check what GitHub's rendered HTML looks like for each allowed construct (nested list, link, code, bold, italic) and for the hostile fixtures, so the HTML adapter in Phase 2 is written against real output.
0.3 List every consumer of `ReleaseNotesDocument` and `parseReleaseNotesMarkdown` so the type change in Phase 1 has a complete list.

### Phase 1: parser and types

1.1 Add the canonical parser, declarations and fixtures at the locations above.
1.2 Replace `ReleaseNotesDocument` in `ipc-types.ts` with the canonical `ReleaseNotes` tree. Keep `ReleaseNotesDocument` as an alias for one release if needed to keep the IPC contract stable.
1.3 `changelog-notes.mjs`: keep `findVersionSection`, and make `validateChangelogSubset` delegate to the canonical validator so there is one rule set. Delete the old inline rules once nothing imports them.
1.4 `whats-new.ts` and `buildWhatsNewPayload`: produce the new tree from the bundled markdown.

### Phase 2: HTML adapter for updater notes

2.1 Turn `release-notes.ts` into an adapter that maps the updater's HTML into the same canonical tree, supporting only the constructs the spec allows. Anything else makes the adapter return `null`, and the dialog falls back to the bundled-markdown entry for that version (preferred whenever the version is the running or incoming version, since the app bundles its own CHANGELOG).
2.2 Keep the tokenizer only if it can be reduced to a small allowlist walker extended with `strong`, `em`, `code`, `a[href^="https://"]` and one nesting level. Keep the single-pass entity decoder (it is correct for `&amp;lt;`).
2.3 Decide per Open question 1 whether to drop the HTML path entirely.

### Phase 3: renderer

3.1 Replace the string items in `WhatsNewDialog.tsx` with a small `ReleaseNotesView` component (new file under `src/renderer/src/components/`) that renders the tree: `h4` headings, `p`, nested `ul/li`, `strong`, `em`, `code`, and `a` for https links.
3.2 Links call `window.api.invoke(IPC.SHELL_OPEN_EXTERNAL, href)` on click and `preventDefault()`; `rel="noopener noreferrer"`; keep a visible focus ring from the app's tokens. Show the URL in the accessible name or `title`.
3.3 Use the app's existing typography and theme tokens (check for a `DESIGN.md` or design notes in `docs/` first); `code` uses the monospace token with a subtle background. No new dependencies.
3.4 Use `ReleaseNotesView` in every place that currently shows notes (`App.tsx`, `Settings.tsx`, `FinishStep.tsx`).
3.5 Fallback: if the tree is empty or invalid, render the plain-text `pre-wrap` block.

### Phase 4: tests

4.1 Parser: run the whole corpus (`src/shared/__tests__/changelog-notes.test.ts` becomes the corpus runner).
4.2 Adapter: HTML fixtures from Phase 0 map to the same trees as the markdown fixtures for the allowed constructs, and to `null` for the rest.
4.3 Renderer: a React Testing Library suite renders each fixture and asserts element structure, that `<script>` and `javascript:` content never becomes an element or link, and that the plain-text fallback appears for invalid input.
4.4 Keep `src/main/updates/release-notes.test.ts` passing or replace its cases with fixture-based ones.

### Phase 5: release tooling

5.1 `scripts/release-notes-from-changelog.mjs` and `npm run release:notes -- <version> --check` call the canonical validator (this also becomes the shared `check-changelog` in the release plan).
5.2 Update `docs/HOW-TO-RELEASE.md` where it describes the supported subset.
5.3 Update any developer docs, `AGENTS.md` or `.github/copilot-instructions.md` text that describes the old strict subset.

### Phase 6: manual verification

6.1 Run the app with an update simulation (`src/main/updates/simulation.ts`) using a fixture entry that uses every construct; check the dialog in both themes and a small window.
6.2 Click a link and confirm it opens the system browser; confirm an `http://` link in a crafted entry is not clickable.
6.3 Install a built update on a test machine if practical.

## Acceptance criteria

- The canonical parser copy is byte-identical to the canonical file.
- The whole fixture corpus passes in this repo's test run, including every hostile fixture.
- A release entry using every allowed construct renders correctly in the What's new dialog, the Settings update panel and the onboarding finish step, in light and dark themes where the app has both, and at the narrowest supported window size.
- No `innerHTML`, `dangerouslySetInnerHTML` or `@html` receives release-note content (add a test or lint rule that fails if one is introduced in the notes components).
- Links open only `https` URLs through `IPC.SHELL_OPEN_EXTERNAL`; `javascript:`, `http:`, `data:` and `mailto:` links are never rendered as links.
- Invalid or oversized notes show the plain-text fallback and never throw or blank the dialog.
- `npm run release:notes -- <version> --check` uses the same parser and prints `CHANGELOG.md:<line>: <message>` violations.
- Existing release-notes tests are updated or replaced, and the full suite, lint and build pass: `npm run lint`, `npm test`, `npm run build` (`npm run verify:production:win` before a release).

## Decisions (approved 2026-11-17)

1. **HTML path: partial drop.** Use the bundled `CHANGELOG.md` entry whenever the version is the running or incoming version. Keep a small allowlist HTML adapter only as a fallback for versions not in the bundle. Remove the rest of the custom tokenizer.
2. **Link styling:** match the app's existing external-link style; no extra icon.

## Out of scope

- Editing the CHANGELOG itself or older entries (only the entry being released is validated).
- The release-skill migration (main plan Phases 2 to 5); this plan only prepares the app.
- Committing or pushing; you review the diff first.
