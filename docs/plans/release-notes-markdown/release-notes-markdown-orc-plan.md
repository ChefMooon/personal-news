---
name: release-notes-markdown
type: orc-plan
status: COMPLETED
source_brainstorm: none
planner: sonnet/high
implementer: codex gpt-6.1-terra/medium
dispatch: ctx_a81960d368ef
created: 2026-11-17
phases: 4/6
size: L
files: 34
plan_time: 10m57s
plan_usage: n/a
impl_time: ~61m (implement ~53m + fixes ~8m)
impl_usage: +33% session, +6% weekly (codex, approximate)
models: [codex/gpt-6.1-terra, codex/gpt-6-luna (requested, unverified), claude/sonnet (review)]
---

# Plan: release-notes-markdown

Scope source: `docs/plans/release-notes-markdown/release-notes-markdown-plan.md` (draft plan treated as the scope; canonical parser files live in `C:\Users\justi\.claude\skills\release-skill-maintenance\` and are copied unchanged).

## Plan (approved)

# Implementation plan: safe markdown release notes (`release-notes-md-v1`) for Personal News

## Summary

Replace the string-item release-notes model with the canonical `release-notes-md-v1` tree, which is frozen and copied unchanged from the skill dir. Main produces the tree with the canonical parser for the bundled `CHANGELOG.md`, and with a small allowlist HTML adapter for electron-updater HTML. The renderer shows it with a new hook-free `ReleaseNotesView` using React elements only, with `https` links opened through `IPC.SHELL_OPEN_EXTERNAL`. Tests, browser scenarios, the release script and docs move to the same single rule set.

## Overview

| id | goal | files | steps | parallel_safe | effort | size |
|---|---|---|---|---|---|---|
| P1 | Copy canonical files byte-for-byte, hash-verify, lint/prettier-ignore them, replace the old shared test with a corpus runner | 8 | 9 | no | medium | L |
| P2 | Main side: new `ReleaseNotesDocument` type, bundled-notes lookup, rewritten HTML adapter, service wiring, tests | 8 | 11 | no | medium | L |
| P3 | Renderer: `ReleaseNotesView`, helpers, `WhatsNewDialog`, caller gating, unit and source-scan tests (`ui: yes`) | 8 | 10 | no | medium | L |
| P4 | Extend standalone browser scenarios (all constructs, hostile, keyboard, theme, size, contrast) (`ui: yes`) | 2 | 6 | yes (with P5) | medium | S |
| P5 | Release tooling, Electron harness script, docs, delete the old `changelog-notes` module | 8 | 8 | yes (with P4) | medium | L |
| P6 | Full verification and manual UI check (no files) | 0 | 7 | no | low | S |

`Size L · 6 phases · 34 files · 2 parallel_safe · longest chain P1 → P2 → P3 → P4 → P6 · risk medium (IPC contract change across processes, a security-sensitive new HTML adapter and link opener, and a lint script that would rewrite the repo)`

- **File count:** P1 is 4 copies, 1 new test, `eslint.config.js`, `.prettierignore`, and 1 deleted test. P5 includes 2 deleted modules. 34 distinct files in total.
- **Why P1, P2, P3 and P5 are L:** each is 6+ files or cross-cutting.

## Corrections to the draft's "Current state" (verified in source)

1. **Old module API.** `src/shared/changelog-notes.mjs` (131 lines) exports `extractChangelogSection`, `getChangelogSectionLineOffset`, `validateReleaseNotesMarkdown` and `parseReleaseNotesMarkdown`. The draft's `validateChangelogSubset` and `buildWhatsNewPayload` do not exist. The canonical module already provides `findVersionSection`, so the old module is deleted entirely (P5), not delegated.
2. **Updates files.**
   - `src/main/updates/release-notes.ts` is 165 lines. It also exports `compareVersions` and `decideWhatsNew`, which must stay.
   - `whats-new.ts` is 106 lines. Its real functions are `readBundledNotes`, `hasBundledWhatsNewEntry`, `getCurrentReleaseNotes`, `getPendingWhatsNew` and `acknowledgeWhatsNew`.
   - `hasBundledWhatsNewEntry` is used by `src/main/index.ts:741` for the production smoke report, and `scripts/verify-production-build.mjs` fails the build if it is false. It must stay true only for a valid entry.
3. **No `simulation.ts`.** The simulation is `simulateDownloadedUpdateForHarness` in `src/main/updates/service.ts`. It is harness-only, behind IPC `updates:simulateStatus`, takes `{version, releaseNotesHtml}`, and is not installable.
4. **Dialog consumers.**
   - `App.tsx`, `routes/Settings.tsx` and `components/onboarding/FinishStep.tsx` render notes only through `WhatsNewDialog`.
   - Their only coupling is button gating on `.sections.length`: `App.tsx:199`, `Settings.tsx:1997`, `FinishStep.tsx:175`.
   - `App.tsx` and `WhatsNewDialog.tsx` also import the type `ReleaseNotesDocument`. The name is kept, so those imports need no change.
5. **The bundle rarely has the incoming version (important).** The packaged `CHANGELOG.md` contains entries only up to the running version.
   - For an incoming update (`info.version` greater than the running version) the bundled lookup almost never hits. It hits only in dev, the harness, or a same-version redownload.
   - Decision 1 is still implemented as written (bundle first, HTML adapter fallback). In production the HTML adapter is therefore the normal path for the pre-install dialog, so it must be correct, not minimal. See Open question 1.
6. **Fixtures.** The canonical corpus is one `cases.json` with 69 cases plus `release-notes-markdown.corpus.mjs`, not `input.md`/`expected.json` pairs. The corpus helper imports `./release-notes-markdown.mjs`, so it must sit beside the parser.
7. **Tests.**
   - The tests in scope are `src/main/updates/{release-notes,whats-new,service}.test.ts` and `src/shared/__tests__/changelog-notes.test.ts`.
   - `scripts/test-whats-new.mjs`, `scripts/test-whats-new-browser.mjs` and `scripts/test-onboarding-browser.mjs:69` use the old `items` shape.
   - `release-notes.test.ts` holds the one real feed capture (`FEED_1_5_2`, the decoded `<content>` from `releases.atom`).
8. **Line endings (critical for lint).**
   - The repo working tree is CRLF (`git ls-files --eol` shows `i/lf w/crlf`). The canonical files are LF.
   - `npm run lint` is `eslint --fix` with `prettier/prettier: warn`. Running eslint on three files gave 615 "Delete `␍`" warnings, so `npm run lint` would rewrite line endings across the repo and would also reformat the canonical files.
   - Do not run `npm run lint`. `docs/HOW-TO-MAINTAIN-ONBOARDING.md` already says it is not a check.
9. **No RTL, no jsdom, no DESIGN.md.** Details in the Test decisions below.
10. **Existing changelog is valid.** Every `CHANGELOG.md` entry (1.0.0 to 1.6.1) parses `valid=true` under the canonical parser, so no changelog edits are needed.
11. **Draft Phase 0 is folded in.** There is no separate phase:
    - The consumer inventory is the verified list above and in each phase's file ownership.
    - The HTML fixtures are built in P2 offline (see the adapter test spec).
    - `electron-updater` 6.8.9 `GitHubProvider.js` shows `releaseNotes` comes from the atom `<content>`, with `"No content."` mapped to empty. No network is needed.

## Design decisions

### Data and process

- **Tree flows over IPC.**
  - `ReleaseNotesDocument` keeps its name and becomes the canonical tree plus an optional fallback: `interface ReleaseNotesDocument extends ReleaseNotes { fallbackText?: string }`. `ReleaseNotes`, `Inline` and `Block` are re-exported from the canonical `.d.mts` via `export type { ... }`.
  - The old `items`-based `ReleaseNotesSection` is replaced by the canonical `{heading, blocks}`.
  - No compatibility alias is needed: main and renderer ship together.
  - Reason: this keeps the IPC contract and caller names stable.
- **Fallback text only for invalid bundled markdown.**
  - An invalid bundled entry becomes `{sections: [], fallbackText: <raw body, trimmed, sliced to LIMITS.maxEntryLength>}`. This satisfies the "invalid shows plain text, never blank" acceptance criterion.
  - The updater HTML path never produces fallback text: invalid HTML returns `null`, so no button is shown.
  - Reason: there is no raw markdown for HTML input, and dumping HTML text into the dialog is poor UX.
- **Bundle first, then the adapter.**
  - `service.ts` calls a quiet `readValidBundledNotes(version)` for `info.version`. If that returns null it uses `parseUpdaterReleaseNotes(info.releaseNotes)`.
  - An invalid bundled entry is not used for incoming updates, so the HTML is tried instead.
  - Reason: Decision 1, and it avoids a console warning on every update check.
- **New `src/main/updates/bundled-notes.ts`** (imports `./bundled-changelog`, so the existing `vi.mock("./bundled-changelog")` in `whats-new.test.ts` keeps working):
  - `lookupBundledNotes(version)` returns `{kind:"missing"} | {kind:"valid", notes} | {kind:"invalid", fallbackText, violations: string[]}`. It uses `findVersionSection`, then `parseReleaseNotes(section.body, {lineOffset: section.bodyStartLine - 1})`. It never throws and never logs.
  - `readBundledNotes(version)` is used by what's-new. Valid returns the notes, invalid returns the fallback document plus one `console.warn` listing `formatViolations`, and missing returns null plus `console.warn`.
  - `readValidBundledNotes(version)` is used by the service and is quiet.
  - `hasBundledWhatsNewEntry` stays in `whats-new.ts` and returns true only for `kind === "valid"`, so the production smoke check keeps failing on a bad entry.
- **HTML adapter builds the tree directly and validates it.**
  - It does not round-trip through markdown. A round trip would mark entity-decoded text such as `&amp;lt;b&amp;gt;` as raw HTML.
  - Walker allowlist:
    - Tags: `h3`, `p`, `ul`, `li`, `strong`, `em`, `code`, `a[href]`. A single `<p>` directly inside `<li>` (loose list) is unwrapped.
    - Attributes: all ignored except `href` on `a`.
  - Any other tag, `<br>`, comment-only junk, an unterminated `<`, `h1`/`h2`/`h4`+, a second nesting level, or more than one nested `ul` per `li` makes the result `null`. This is stricter than the old tokenizer, which skipped unknown tags; the old "unknown tag keeps its text" behavior is deliberately dropped.
  - Text rules:
    - Entities are decoded with the existing single-pass decoder, which stays.
    - Whitespace is collapsed. Text with control or bidi characters returns null (use the same set as the parser's `FORBIDDEN_CHARS`).
    - Headings must be plain text.
  - Limits and links:
    - Total bullets are capped at `LIMITS.maxBullets` and total plain text at `LIMITS.maxEntryLength`.
    - Links must pass `new URL()` with `https:`, a hostname, no credentials, no whitespace or quotes or `<>`, and a length of at most `LIMITS.maxUrlLength`. Otherwise the whole result is `null`.
    - Input length is capped at 100,000 characters (matching `MAX_SIMULATED_RELEASE_NOTES_LENGTH`), and the tokenizer must be linear time.
  - A leading `<ul>` without an `<h3>` is accepted as a `heading: null` section, as the old adapter did.
  - Reason: Decision 1, with one explicit rule set shared with the renderer's second gate.
- **`parseUpdaterReleaseNotes(input)` keeps its contract.**
  - Accepts a string or an array of `{note}`; arrays concatenate sections.
  - A string with no `<h3|ul|li` tag and containing `### ` is parsed with the canonical `parseReleaseNotes`. It is accepted only when `valid`, otherwise null.
  - Everything else goes through the HTML adapter.
- **Link policy has two gates.** The parser guarantees `https`. The renderer re-checks `https` plus credentials and length with `getSafeExternalHref` (defence in depth). Anything that fails renders as plain text, never `<a>`.
- **`ipc-policy.ts` is unchanged.** I confirmed `shell:` is allowed for the renderer. The main handler uses `parseExternalHttpUrl` (http or https, at most 4096 characters, no control characters, no credentials). Our gate is stricter, so nothing is weakened. CSP, BrowserWindow settings, preload and the main-side URL check are untouched.
- **Old module removed.** `src/shared/changelog-notes.mjs`, its `.d.mts` and its test are deleted. The old test is deleted in P1 because it asserts `.items`, which would break typecheck once the type changes. The old module itself is deleted in P5 after its last importers (`scripts/*`) are migrated.

### Tooling decisions

- **Lint and prettier safety.**
  - Add the three canonical `src/shared/release-notes-markdown.*` files to `ignores` in `eslint.config.js`.
  - Create `.prettierignore` containing the same three files plus `src/shared/__tests__/fixtures/`. Prettier 3.9.6 reads `.prettierignore` by default.
  - Reason: stops `eslint --fix` and `npm run format` from silently changing hashed files.
- **Where the files go:**
  - `src/shared/release-notes-markdown.mjs`
  - `src/shared/release-notes-markdown.d.mts`
  - `src/shared/release-notes-markdown.corpus.mjs` (beside the parser, because of its relative import)
  - `src/shared/__tests__/fixtures/release-notes-md-v1/cases.json`
  - The canonical `release-notes-markdown.test.mjs` (a `node:test` file, not in the ledger list) is not copied. Its assertions are re-expressed in Vitest in P1.
- **Hash guard test.** A Vitest case reads the three code files plus `cases.json`, normalizes CRLF to LF, and compares sha256 to constants, so an accidental edit or a lint rewrite fails loudly. The constants are the LF hashes below, which are identical to the raw hashes of the originals.
- **Test decisions.**
  - **Vitest** runs in the `node` environment. React 18.3.1 `react-dom/server` is installed. `vitest.config.mts` includes `src/**/*.test.ts(x)`, and `@vitejs/plugin-react` handles the TSX.
  - **No RTL or jsdom.** The draft's React Testing Library step is replaced by two techniques that need no new dependency:
    - (a) `renderToStaticMarkup` for element-structure and escaping assertions.
    - (b) Calling the hook-free `ReleaseNotesView` as a plain function and walking the returned React element tree. This finds `<a>` props and invokes `onClick` with `{preventDefault: vi.fn()}`, with `window.api.invoke` stubbed on `globalThis.window`.
    - For this the component must use inline render helper functions, not nested components or hooks.
  - Real browser behavior (clicks, focus ring, scroll, contrast, themes) goes in the existing `npm run test:whats-new-browser` Playwright script, which is the repo's renderer-only workflow per `AGENTS.md`.
  - A source-scan Vitest test reads the notes component files and fails on `dangerouslySetInnerHTML`, `innerHTML`, `outerHTML` or `insertAdjacentHTML`. A repo grep shows there are currently zero uses in `src`.

### UI spec (`ui: yes`, applies to P3 and P4)

- **Source.**
  - No `DESIGN.md` exists, so none is created. The closest guide is `docs/ui-ux.md`: §9 (shadcn/ui on Radix), §10 (minimum window 900x600, `src/main/index.ts:126-127`), §11 (a11y: keyboard-focusable, color not the sole signal, WCAG AA 4.5:1 normal text, minimum 14px body). The guide is not changed.
  - Grounded in `WhatsNewDialog.tsx` markup, the tokens in `src/renderer/src/assets/main.css`, and the existing external-link style at `Settings.tsx:2430`.
- **Tokens and theme.**
  - Tailwind v4 (`@tailwindcss/vite`) with HSL CSS variables, mapped as `--color-*` and switched with `data-theme`. Tokens used: `foreground` (inherited), `muted`, `muted-foreground`, `primary`, `ring`, `background`.
  - There is no link token, mono token or subtle-background token. Use Tailwind `font-mono` and `bg-muted`, and add no new tokens or CSS.
  - Both themes follow automatically.
- **Components.**
  - Reuse `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` and `Button` from `./ui/*`, and Sonner `toast`.
  - Create one component, `ReleaseNotesView` (new file in `src/renderer/src/components/`), plus the helpers in `src/renderer/src/lib/release-notes.ts`.
  - The dialog's text buttons ("View full changelog" and "Got it") and the toast's "See what's new" are existing and stay as they are. Links are inline text links, not icon buttons, per the decision "no extra icon".
- **Layout and sizes.**
  - `DialogContent` stays `max-w-lg`. The body wrapper stays `max-h-[60vh] overflow-y-auto pr-1 text-sm`, which is the current scroll body.
  - At 900x600 minimum the dialog, header and footer must fit in the viewport, and the body scrolls internally.
  - `ReleaseNotesView` root is `space-y-4 break-words`, so long unbroken labels wrap instead of overflowing horizontally.
  - Each section is `space-y-1`, which reproduces the current `h4 mb-1` gap. A paragraph is a `<p>`.
  - Lists are `<ul className="list-disc space-y-1 pl-5">`, and a nested list is `<ul className="mt-1 list-disc space-y-1 pl-5">` (indent 20px per level).
  - Heading is `<h4 className="mb-1 font-medium">` (unchanged; a `null` heading renders none).
  - Inline `<strong>` and `<em>` use no extra classes (preflight keeps bold, italic is native).
  - Inline `<code>` is `rounded bg-muted px-1 py-0.5 font-mono`. It keeps the body size, so the 14px minimum holds.
- **States.**
  - **Link default:** inherits body text color, with `underline underline-offset-2 decoration-muted-foreground/50 transition-colors` (the existing external-link style).
  - **Link hover:** `hover:text-primary`.
  - **Link focus-visible:** `rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`.
  - **Link pressed:** no separate style (unsettled; none is defined in the app, so none is added).
  - **Open failure:** `toast.error(err.message)` with the fallback text "Unable to open the link.", matching `WhatsNewDialog.openFullChangelog`.
  - **Unsafe or invalid link node:** rendered as plain text in a `<span>`, no `<a>`.
  - **Fallback:** `<p className="whitespace-pre-wrap break-words">{fallbackText}</p>`.
  - **No content:** the existing `<p className="text-muted-foreground">Release notes are not available for this update.</p>`.
- **Interaction.**
  - Links are `<a href={href} rel="noopener noreferrer" title={href}>` with `onClick` calling `preventDefault()` then `window.api.invoke(IPC.SHELL_OPEN_EXTERNAL, href)`. A link therefore never navigates the app window, and Enter activates it natively.
  - Tab reaches each link in DOM order with a visible ring. The Radix dialog focus trap cycles links, then the footer buttons, then Close. Escape closes the dialog (existing behavior).
  - Reason for `<a href>` rather than a `<button>`: the spec says `a`, it gives link semantics and keeps `getByRole("link")` working. Middle-click or Ctrl-click would go through the existing `setWindowOpenHandler`, which opens https externally and denies the window.
- **Accessibility.**
  - Semantics are h4, p, ul, li, strong, em, code and a. The link accessible name is its text, and `title` exposes the URL. No `aria-label` override, to keep the visible label in the name.
  - Contrast, computed from the tokens (verify in the browser):
    - Default link text and code text are body foreground on `background` or `muted`, roughly 12:1 or better in both themes.
    - Dark theme `text-primary` is about 4.42:1 on `bg-background` (computed from the dark tokens; this is an estimate), just under 4.5:1. The existing style uses it only on hover, and the underline remains the non-color signal.
    - The underline at `decoration-muted-foreground/50` is faint, estimated about 2.3:1 in light theme. It matches the approved "existing style" decision.
    - Both are recorded as Open question 2 rather than silently changed.
  - The ring uses the `ring` token.
- **Content.**
  - The existing empty-state text is kept.
  - The fallback text is the raw entry, escaped by React.
  - No new copy elsewhere.
- **Proposal, labeled:** none beyond the above. The Radix default initial focus is left unchanged (see Open question 3).

## Phases

### P1: Canonical files, safe linting, corpus test
- **depends_on:** none. **parallel_safe:** no. **effort:** medium. **ui:** no.
- **Files:**
  - Create `src/shared/release-notes-markdown.mjs`, `src/shared/release-notes-markdown.d.mts` and `src/shared/release-notes-markdown.corpus.mjs`.
  - Create `src/shared/__tests__/fixtures/release-notes-md-v1/cases.json`.
  - Create `src/shared/__tests__/release-notes-markdown.test.ts`.
  - Modify `eslint.config.js`. Create `.prettierignore`.
  - Delete `src/shared/__tests__/changelog-notes.test.ts`.

**Steps**
1. Copy byte-for-byte (do not use the Read/Write tools, because the regex contains literal bidi characters):
   ```
   S="C:/Users/justi/.claude/skills/release-skill-maintenance/templates/copilot"
   cp "$S/scripts/release-notes-markdown.mjs"        src/shared/release-notes-markdown.mjs
   cp "$S/scripts/release-notes-markdown.d.mts"      src/shared/release-notes-markdown.d.mts
   cp "$S/scripts/release-notes-markdown.corpus.mjs" src/shared/release-notes-markdown.corpus.mjs
   mkdir -p src/shared/__tests__/fixtures/release-notes-md-v1
   cp "$S/fixtures/release-notes-md-v1/cases.json"   src/shared/__tests__/fixtures/release-notes-md-v1/cases.json
   ```
2. Verify hashes (bash). Every line must print `OK`:
   ```
   for p in "scripts/release-notes-markdown.mjs:src/shared/release-notes-markdown.mjs" \
            "scripts/release-notes-markdown.d.mts:src/shared/release-notes-markdown.d.mts" \
            "scripts/release-notes-markdown.corpus.mjs:src/shared/release-notes-markdown.corpus.mjs" \
            "fixtures/release-notes-md-v1/cases.json:src/shared/__tests__/fixtures/release-notes-md-v1/cases.json"; do
     a="${p%%:*}"; b="${p##*:}"
     [ "$(sha256sum < "$S/$a" | cut -d' ' -f1)" = "$(sha256sum < "$b" | cut -d' ' -f1)" ] && echo "OK $b" || echo "MISMATCH $b"
   done
   ```
   PowerShell equivalent is `Get-FileHash -Algorithm SHA256 <path>` on each pair. Expected hashes:
   - `.mjs`: `4873c9967ed669085f3a23b33c97d877bb90489aa78a0607fbaa136b28a67c32`
   - `.d.mts`: `96b6b2be9d4384f6f8c06d5d028ecc604503f27792dc515f780eb3fa8a920f3e`
   - `.corpus.mjs`: `8c672fab613dadd85f3240183fecf9351440bae0f3eab040b68993de70a1846e`
   - `cases.json`: `dd1b53d30cb373eaf136dacd979a4d5f0ea3025087a8c38f034eb5ccd5c15ae6`

   If a hash differs or the corpus fails, stop and report. Do not edit the copy.
3. `eslint.config.js`: append the three `src/shared/release-notes-markdown.*` paths to the existing top-level `ignores` array. Create `.prettierignore` with those three paths plus `src/shared/__tests__/fixtures/`.
4. Delete `src/shared/__tests__/changelog-notes.test.ts`. The old module stays until P5.
5. Create `src/shared/__tests__/release-notes-markdown.test.ts`, using the same import style as the old test and `fileURLToPath(new URL("./fixtures/release-notes-md-v1/cases.json", import.meta.url))` to load the cases:
   - Run every case with `runCase` from `../release-notes-markdown.corpus.mjs`: `it.each(cases)(id, c => expect(runCase(c)).toEqual([]))`.
   - Re-express the canonical `node:test` assertions: unique ids; every invalid case lists violations; hostile inputs (`"*".repeat(100000)`, `"[".repeat(50000)`, `` "`".repeat(50000) ``, `"<".repeat(50000)`, `"- " + "a".repeat(1000000)`, `"\u0000\u202e"`) return `valid === false` in under 2000 ms; `findVersionSection` line numbers and `lineOffset` produce `CHANGELOG.md:7: raw HTML` via `formatViolations`; missing, duplicate and impossible-date headings throw; prerelease versions match literally.
   - Repository guard: read `package.json` and `CHANGELOG.md` from `process.cwd()`, `findVersionSection(changelog, pkg.version)`, and require `parseReleaseNotes(body, {lineOffset: bodyStartLine - 1}).valid === true`.
   - Hash guard: sha256 of the four files with CRLF replaced by LF equals the four constants above.
6. `npm test -- release-notes-markdown`.
7. Run eslint without fixing on the new or changed files (see Checks) and confirm no errors.
8. `git status` shows only the intended files. Do not run `npm run lint`.
9. If any step reveals a parser problem, report it. Never edit a canonical file.

**Acceptance**
- Four hashes match their originals.
- The corpus (69 cases) passes in Vitest.
- The repository guard passes for the current `package.json` version.
- `npm run typecheck:node` passes. (Web typecheck is not affected yet, because nothing imports the canonical files.)

**Checks:** the hash loop above, `npm test -- release-notes-markdown`, `npm run typecheck:node`, non-fixing eslint.

### P2: Main side: type, bundled notes, HTML adapter, service
- **depends_on:** P1. **parallel_safe:** no. **effort:** medium. **ui:** no.
- **Files:** modify `src/shared/ipc-types.ts`, `src/main/updates/whats-new.ts`, `release-notes.ts`, `service.ts` and `release-notes.test.ts`, `whats-new.test.ts`, `service.test.ts`. Create `src/main/updates/bundled-notes.ts`.

**Steps**
1. `src/shared/ipc-types.ts` (~lines 1287-1302):
   - Replace `ReleaseNotesSection` and `ReleaseNotesDocument` with type re-exports from `./release-notes-markdown.mjs`: `Inline`, `Block`, `ListItem`, `ReleaseNotes`, and `ReleaseNotesSection` (the canonical `{heading, blocks}`).
   - Define `interface ReleaseNotesDocument extends ReleaseNotes { fallbackText?: string }` with a doc comment: sections is `[]` and fallbackText is set only for an invalid bundled entry.
   - `WhatsNewPayload.notes` stays `ReleaseNotesDocument`. `UpdateStatusEvent.releaseNotes` and `downloadedReleaseNotes` keep their types. `FULL_CHANGELOG_URL` is unchanged.
2. Create `src/main/updates/bundled-notes.ts` as specified in Data and process (`lookupBundledNotes`, `readBundledNotes`, `readValidBundledNotes`).
3. `whats-new.ts`: remove the `changelog-notes.mjs` imports and the local `readBundledNotes`; import from `./bundled-notes`. `hasBundledWhatsNewEntry` becomes `lookupBundledNotes(version).kind === "valid"`. The rest of the logic (modes, seeding, acknowledgements) is unchanged.
   - `getPendingWhatsNew` on an invalid entry returns the fallback payload and does not write `WHATS_NEW_LAST_SEEN_KEY`, since the dialog is shown and acknowledgement happens on dismiss.
   - It still marks the version seen only when the entry is missing (existing behavior).
4. `release-notes.ts`:
   - Delete `TOKEN_PATTERN`, the old `parseReleaseNotesHtml` tokenizer, and the `changelog-notes.mjs` import.
   - Keep `decodeEntities`, `codePointToString`, `compareVersions` and `decideWhatsNew` untouched.
   - Write the new `parseReleaseNotesHtml(html): ReleaseNotesDocument | null` per the adapter spec. The tokenizer regex must be linear time; a stray `<` that does not form a tag returns null.
   - Rewrite `parseUpdaterReleaseNotes(input)` as specified.
   - Import `LIMITS` and `parseReleaseNotes` from `../../shared/release-notes-markdown.mjs`.
5. `service.ts`:
   - `normalizeReleaseNotes(version, input)` returns `readValidBundledNotes(version) ?? parseUpdaterReleaseNotes(input)`.
   - Call it with `info.version` in `update-available` and `update-downloaded` (both the `releaseNotes` and `downloadedReleaseNotes` fields), and with `version` in `simulateDownloadedUpdateForHarness`.
   - If `version` is undefined, skip the bundled lookup.
6. `release-notes.test.ts`: remove the old-shape cases and keep the `compareVersions` and `decideWhatsNew` tests verbatim. Add fixtures offline, with no network:
   - **Real capture:** keep `FEED_1_5_2` (the real `releases.atom` content). Expected tree is `parseReleaseNotes(findVersionSection(CHANGELOG,"1.5.2").body).notes`, as now. This proves h3, ul and li against real output.
   - **GFM-standard HTML, not live captures (unverified):** one row per construct, each paired with its markdown. The expected tree is the canonical parser's tree for that markdown. Constructs: paragraph; code, bold and italic; italic inside bold; code inside bold; link (`<a href="https://example.com/x" rel="nofollow">t</a>`); link with a code label; nested bullets (`<li>Parent\n<ul>\n<li>Child</li>\n</ul>\n</li>`); loose list (`<li><p>x</p></li>`); null-heading `<ul>`; entity single-pass (`&amp;lt;` becomes `&lt;`, `&amp;` becomes `&`, `&#39;`, `&#x27;`).
   - **Rejections to `null`:**
     - script, img, table, `ol`, blockquote, pre, h2, h4, `br`, `b`, unknown custom tag.
     - `a` with `http:`, `javascript:`, `data:` or `mailto:` href, no href, or credentials.
     - Nesting deeper than one level, more than 60 bullets, over 100,000 characters.
     - A control character or bidi override in text, and a stray `<`.
     - The input `"No content."` and the empty string.
   - **Ignored attributes:** an `onclick` attribute on a valid tag leaves no trace in the tree.
   - **Hostile performance:** `"<".repeat(1e6)` and `"<ul><li>".repeat(1e5)` return null in under 2000 ms.
   - **`parseUpdaterReleaseNotes`:** array concatenation, valid markdown string, invalid markdown string returns null, non-string input returns null.
   - Optional online verification, not required: `gh api markdown -f text=... -f mode=gfm` can confirm the synthetic HTML shapes; record the result, do not block on it.
7. `whats-new.test.ts`: replace `allItems` with a helper that extracts bullet plain text (`inlineToText`) from `blocks`. Update the `getCurrentReleaseNotes` expectation to the new tree. Add:
   - An invalid bundled entry (for example one containing `<b>`) makes `getCurrentReleaseNotes()` return `{version, notes: {sections: [], fallbackText}}`.
   - `hasBundledWhatsNewEntry` is false for that entry.
   - An `Unreleased` or bad-date heading returns null.
   - An entry with a link and code renders a tree containing the link and code nodes.
8. `service.test.ts`:
   - Update `expected` and the HTML test to the new tree.
   - Add `vi.mock("./bundled-changelog", …)` with a bundle containing only `## [2.5.0] - 2026-03-01`.
   - Add tests that (a) `update-downloaded` with version `2.5.0` and different HTML yields the bundled tree, and (b) version `2.0.0` yields the HTML adapter tree.
   - Add tests that an invalid bundled entry falls through to HTML, and that the harness simulation still refuses install.
9. `npm run typecheck:node` must pass. `npm run typecheck:web` is expected to fail until P3, in `WhatsNewDialog.tsx`, `App.tsx`, `Settings.tsx` and `FinishStep.tsx`.
10. `npm test -- release-notes`, `-- whats-new`, `-- service`, `-- ipc-policy` (regression, unchanged file).
11. Confirm `git diff src/main/security/ipc-policy.ts` is empty.

**Acceptance**
- The adapter output equals the canonical-parser tree for every allowed construct.
- Every rejection returns null and never throws.
- `hasBundledWhatsNewEntry` is false for an invalid entry.
- The service prefers a valid bundled entry for the incoming version.
- `typecheck:node` is clean and the focused tests are green.

**Checks:** focused tests, `npm run typecheck:node`, non-fixing eslint on changed files.

### P3: Renderer (`ui: yes`)
- **depends_on:** P2. **parallel_safe:** no. **effort:** medium.
- **Files:**
  - Create `src/renderer/src/components/ReleaseNotesView.tsx` and `src/renderer/src/lib/release-notes.ts`.
  - Modify `src/renderer/src/components/WhatsNewDialog.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/routes/Settings.tsx` and `src/renderer/src/components/onboarding/FinishStep.tsx`.
  - Create `src/renderer/src/components/__tests__/ReleaseNotesView.test.tsx` and `src/renderer/src/components/__tests__/release-notes-no-raw-html.test.ts`.

**Steps**
1. `lib/release-notes.ts` exports:
   - `getSafeExternalHref(value: unknown): string | null`. It requires a string of at most 2048 characters, with no whitespace, control characters, quotes or `<>`. `new URL` must give `https:`, a non-empty hostname, and no username or password. It returns the original string unchanged.
   - `hasReleaseNotesContent(notes: ReleaseNotesDocument | null | undefined): boolean`. True if `fallbackText` is a non-empty string, or any section has `Array.isArray(blocks) && blocks.length > 0`. Tolerant of malformed trees and never throws.
   - `openReleaseNotesLink(href: string): void`. It calls `window.api.invoke(IPC.SHELL_OPEN_EXTERNAL, href).catch(...)`, with `toast.error(err instanceof Error ? err.message : "Unable to open the link.")` (import `toast` from `sonner`).
2. `ReleaseNotesView.tsx`: `import React from "react"`, props `{ notes: ReleaseNotesDocument }`. No hooks and no nested components; use inline helper functions only (`renderInline`, `renderItem`) so tests can walk the element tree.
   - If `fallbackText` is present and no section is renderable, render the fallback `<p>`.
   - Otherwise render the root `div.space-y-4.break-words`, then sections, `h4`, paragraphs and lists, all classed per the UI spec.
   - Each `blocks` array, `items`, `children` and `inline` value is `Array.isArray`-guarded, and an unknown inline `type` renders nothing.
   - Link nodes with a null `getSafeExternalHref` render `<span>` containing the children.
   - Keys come from indices. Never use `dangerouslySetInnerHTML`.
3. `WhatsNewDialog.tsx`: import `ReleaseNotesView` and `hasReleaseNotesContent`. Replace the `sections.map` and the `sections.length === 0` branch with `hasReleaseNotesContent(notes) ? <ReleaseNotesView notes={notes!} /> : <p className="text-muted-foreground">Release notes are not available for this update.</p>`. The wrapper becomes `max-h-[60vh] overflow-y-auto pr-1 text-sm` (`space-y-4` moves into the view). Keep the header, description, footer buttons, `openFullChangelog`, `FULL_CHANGELOG_URL` and props.
4. Gating swaps (no other change in these files):
   - `App.tsx:199`: `readyNotes && readyNotes.sections.length > 0` becomes `hasReleaseNotesContent(readyNotes)`.
   - `Settings.tsx:1997`: `updateStatus.downloadedReleaseNotes?.sections.length` becomes `hasReleaseNotesContent(updateStatus.downloadedReleaseNotes)`.
   - `FinishStep.tsx:175`: `releaseNotes?.notes.sections.length` becomes `hasReleaseNotesContent(releaseNotes?.notes)`.
   - Add the import in each.
5. `ReleaseNotesView.test.tsx`:
   - `vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))`.
   - **Corpus-driven.** Load `cases.json` and `runCase`. For each `valid` case, parse then `renderToStaticMarkup(<ReleaseNotesView notes={result.notes} />)`:
     - Every tag in the markup is within `{div,h4,p,ul,li,strong,em,code,a,span}`.
     - Every `href` starts with `https://`.
     - The `<a` count equals the tree's link count.
     - `<code` appears only for code nodes.
   - For each invalid case, assert `parseReleaseNotes(...).valid === false`, and render `{sections: [], fallbackText: input}`. The tags are within `{div,p}`, there is no `<script`, `<img` or `<b>`, `whitespace-pre-wrap` is present, and the raw text is HTML-escaped.
   - **Hand-built hostile tree** (as if main were compromised): links with `javascript:`, `http:`, `data:`, `mailto:`, a credentials URL, an over-length URL, and `href: 42`; text `<img src=x onerror=1>`. Expect zero `<a>`, no `<img`, and text shown escaped.
   - **Malformed shapes** (old-shape `items`, `blocks` missing, `null` sections) never throw; `hasReleaseNotesContent` is false.
   - **Click behavior.** Call `ReleaseNotesView({notes})` as a function, walk the element tree to the `a` elements, assert `rel`, `title` and `href`, then call `onClick({preventDefault})`. Assert `preventDefault` was called and `window.api.invoke` (stubbed on `globalThis.window`) was called with `(IPC.SHELL_OPEN_EXTERNAL, href)`. On a rejecting invoke assert `toast.error` gets the message, and on a non-Error rejection the text "Unable to open the link."
6. `release-notes-no-raw-html.test.ts`: read `ReleaseNotesView.tsx`, `lib/release-notes.ts`, `WhatsNewDialog.tsx`, `main/updates/release-notes.ts` and `bundled-notes.ts` with `node:fs` (resolved from `process.cwd()`), and assert none matches `/dangerouslySetInnerHTML|innerHTML|outerHTML|insertAdjacentHTML/`.
7. `npm test -- ReleaseNotesView`, `npm test -- release-notes-no-raw-html`, `npm run typecheck`.
8. `npm run dev:renderer-browser`, then drive manually (see the UI check below). Playwright automation lands in P4.
9. If importing `sonner` in the node environment errors despite the mock, report it. The mock should be enough, since the unit test never renders the toaster.
10. Non-fixing eslint on the touched files.

**Acceptance**
- Corpus-driven render tests pass and no raw HTML ever becomes an element or a link.
- Dialog empty and fallback states match the spec.
- Callers gate identically on the new shape.
- `npm run typecheck` is fully green.

**UI acceptance (observable)**
- A bullet with a link renders as an underlined inline link in body color.
- Hover turns the link to the primary color.
- Tab shows a ring on the focused link.
- Enter and click open the URL via `shell:openExternal`.
- A `javascript:` link node renders as plain text, with no link or underline.
- Code renders monospace on the muted background.
- Nested bullets indent one level.
- The dialog is fully visible at 900x600 and scrolls internally, in light and dark.

**UI check**
- Run `npm run dev:renderer-browser` at `http://127.0.0.1:4175/`.
- In the console, set `sessionStorage.setItem("__rendererBrowserScenario", JSON.stringify({whatsNewPending: {version: "99.0.0", notes: <tree using every construct>}}))` and reload.
- Look at the dialog at 900x600 and at 1280x800, in light and dark (`document.documentElement.dataset.theme = "dark"`).
- If this cannot be run, record "visual check not run".

### P4: Browser automation (`ui: yes`)
- **depends_on:** P3. **parallel_safe:** yes (file-disjoint with P5). **effort:** medium.
- **Files:** modify `scripts/test-whats-new-browser.mjs` and `scripts/test-onboarding-browser.mjs`.

**Steps**
1. Update the shared `notes` fixture in `test-whats-new-browser.mjs` to the new tree shape. Add a small flattener for assertions, so `expectDialogContent` uses plain text from `inline`.
2. Update `scripts/test-onboarding-browser.mjs:69` to a one-bullet tree with text "Example item". Its assertions stay as they are.
3. Add scenarios to `test-whats-new-browser.mjs`. They reuse `setDownloaded` for the incoming dialog and `openWithPending` for the installed one, and use `window.__rendererBrowserCalls` to record `shell:openExternal`:
   - **All constructs.**
     - Tree: heading, a paragraph, bullets with code, bold, italic and a link, a nested bullet, a second `null`-heading section.
     - Asserts: roles and tags (h4, p, `ul > li`, `li > ul > li`, strong, em, code), `code` computed `font-family` includes `monospace`, link `href`, `rel`, `title`, and no `img` or `script` in the dialog.
   - **Link opens through IPC.** Click the link by role and name. A `shell:openExternal` call with the exact href is recorded, the page URL is unchanged, and `context.pages().length === 1`.
   - **Keyboard.**
     - Tab through the dialog and record `document.activeElement` per press: links in DOM order, then "View full changelog", "Got it", Close.
     - The focused link has a non-`none` `box-shadow` (the ring).
     - Enter activates the link, and Escape closes the dialog.
   - **Open failure.** Wrap `window.api.invoke` (as `setDownloaded` does) so `shell:openExternal` rejects with `Error("blocked")`. Click the link and expect a toast containing `blocked`, while the dialog stays open.
   - **Hostile.** Replace the old "XSS-shaped item" scenario. Tree with text `<img src=x onerror=window.__pwned=1>` and link nodes with `javascript:window.__pwned=1`, `http://example.com`, `data:text/html,x`, `mailto:a@b.co`. Expect zero `a` elements, the text visible, and `window.__pwned === undefined`. Also a `fallbackText` document containing `<script>window.__pwned=1</script>`: it appears as text in a `white-space: pre-wrap` element, with no script element.
   - **Malformed and empty.** An old-shape document shows the "Release notes are not available" text and does not blank or crash the dialog (`checkClean`). The existing `null` and `{sections: []}` no-button scenarios stay.
   - **Layout at 900x600.** The viewport is 900x600 and a 500-character unbroken label is present, with 60 bullets in another run. The dialog bounding box is inside the viewport, the footer buttons are visible, the scroll container has `scrollWidth <= clientWidth`, and with 60 bullets `scrollHeight > clientHeight` and `overflow-y` is `auto`.
   - **Contrast, light and dark.** Compute WCAG contrast from `getComputedStyle` colors. Walk up ancestors for the effective background, and parse `rgb(...)` as Chromium serializes it.
     - Assert link default text vs dialog background is at least 4.5, and code text vs its `bg-muted` background is at least 4.5.
     - Measure link hover and log it, without asserting (documented gap, Open question 2).
   - **Screenshots.** Take them in light and dark at 900x600 and 1280x800 into `artifactDir`.
4. Keep the existing scenarios, with `checkClean` at the end of each new one.
5. Run `npm run test:whats-new-browser` and `npm run test:onboarding-browser`.
6. `npm run test:update-notifications` (regression).

**Acceptance**
- All scenarios PASS.
- The contrast assertions hold in both themes.
- No page errors and no API errors.

**UI check:** the screenshots in `artifacts/renderer-browser/whats-new-*/` for light and dark, at 900x600 and 1280x800. Open the dark 900x600 screenshot and confirm there is no overflow or clipped footer. If the script cannot run (Playwright browsers are present locally), record "visual check not run".

### P5: Release tooling, Electron harness script, docs, cleanup
- **depends_on:** P2. **parallel_safe:** yes (file-disjoint with P4). **effort:** medium. **ui:** no.
- **Files:** modify `scripts/release-notes-from-changelog.mjs`, `scripts/test-whats-new.mjs`, `scripts/verify-production-build.mjs`, `scripts/PLAYWRIGHT-HARNESS.md`, `docs/HOW-TO-RELEASE.md` and `docs/HOW-TO-MAINTAIN-ONBOARDING.md`. Delete `src/shared/changelog-notes.mjs` and `src/shared/changelog-notes.d.mts`.

**Steps**
1. `scripts/release-notes-from-changelog.mjs`: import `findVersionSection`, `parseReleaseNotes`, `formatViolations` and `inlineToText` from `../src/shared/release-notes-markdown.mjs`.
   - `runCheck(version)`: `section = findVersionSection(changelog, version)`, then `parseReleaseNotes(section.body, {lineOffset: section.bodyStartLine - 1})`. Print `formatViolations(violations)` lines (`CHANGELOG.md:<line>: <message>`) to stderr and exit 1 on any violation. Catch `findVersionSection` errors and print the message (it includes `CHANGELOG.md:<line>:` for the Unreleased and bad-date cases), exit 1.
   - Count headings and bullets from the tree for the success message (nested bullets count).
   - The publish and `--dry-run` paths use `section.body.trim()` where `extractChangelogSection` was used. Keep the printed output otherwise the same.
2. `scripts/test-whats-new.mjs` (the Electron harness): rewrite the notes comparison with the canonical API (`findVersionSection`, `parseReleaseNotes`, `inlineToText`).
   - Expected `li` count is the total of items plus nested children.
   - `dialogText.includes(...)` checks use `inlineToText(item.inline)`.
   - The "earlier-only items" leak check uses plain text. Compute `earlierVersion` the same way.
   - Extend `SIMULATED_HTML` with a link, code and a nested list, for example `<li>Simulated feature <code>Alpha</code> with <a href="https://example.com/a" rel="nofollow">a link</a></li>` and `<li>Fish &amp; chips support<ul><li>Nested note</li></ul></li>`. Assert the link role and its `href`, and the nested text. Do not click links in Electron.
3. `scripts/verify-production-build.mjs` (~line 160): update the error message to the new rules (`### ` headings, bullets, limited inline formatting, one nested level). The check logic is unchanged.
4. `scripts/PLAYWRIGHT-HARNESS.md` (~line 178): note that `simulateStatus` HTML goes through the allowlist adapter (supported tags, anything else yields no notes).
5. `docs/HOW-TO-RELEASE.md` (line ~34 and ~114): replace "may only use `###` headings and plain-text bullets" with the new subset: `### Heading`, one-line paragraph, `- bullet` with one nested level, inline `code`, **bold**, *italic*, `[text](https://...)`. Forbidden: raw HTML, images, tables, numbered lists, blockquotes, fences, other heading levels, bare URLs, non-https links, wrapped lines, deeper nesting. Limits: 500 per line, 2048 per URL, 8000 per entry, 60 bullets. Update the Common Mistakes line the same way.
6. `docs/HOW-TO-MAINTAIN-ONBOARDING.md`: change "plain-text CHANGELOG bullets" (~line 165) and the Common Mistakes line (~209, "validator rejects bold, backticks, links"), and the `npm test -- changelog-notes` command (~216) to `npm test -- release-notes-markdown`. `AGENTS.md` and `.github/copilot-instructions.md` do not describe the old subset (verified), so they are not touched.
7. Delete `src/shared/changelog-notes.mjs` and `.d.mts`. Then `grep -rn "changelog-notes" src scripts docs` must return nothing except old plan docs.
8. `npm run release:notes -- 1.6.1 --check` prints a valid message. Do not edit `CHANGELOG.md` to test a bad entry.

**Acceptance**
- `--check` uses the canonical parser and reports `CHANGELOG.md:<line>: <message>`.
- The deleted module has no importers, and `npm run typecheck`, `npm test` and `npm run build` pass.
- Docs describe the new subset.

**Checks:** `npm run release:notes -- 1.6.1 --check`; `npm run release:notes -- 9.9.9 --check` (should exit 1 with the missing-entry message); `npm run typecheck`.
- **Not run (CHANGELOG and publish paths):** do not run `npm run release:notes -- <v> release`; it would call `gh release edit`.

### P6: Verification (no file edits)
- **depends_on:** P4, P5. **parallel_safe:** no. **effort:** low. **ui:** yes (manual UI check).

**Steps**
1. Re-run the four hash checks from P1 (a lint run or stray formatting could have touched the files).
2. `npm run typecheck`, then `npm test` (full suite), then `npm run build`.
3. `npm run test:whats-new-browser`, `npm run test:onboarding-browser`, `npm run test:update-notifications`, then `npm run test:renderer-browser` (full matrix regression, slowest).
4. `npm run test:whats-new` (Electron harness: the real HTML to adapter to dialog path). If the harness requires a prior build and fails to launch, run `npm run build` first. If Electron cannot be launched in this environment, record "not run".
5. Manual UI check: the live preview or the Playwright screenshots from P4, at 900x600 and typical size, in light and dark. Confirm all constructs, link hover and focus ring, nested indent, and the fallback block.
6. Optional on a test machine: install a built update, or run `PERSONAL_NEWS_WHATS_NEW_PREVIEW=1 npm run dev`, which shows the real bundled 1.6.1 entry in the installed variant.
7. `git status` and `git diff --stat`: only the 34 intended files are changed, the canonical files are byte-identical, and nothing is committed.

**Acceptance:** all checks green or explicitly recorded as not run, with the reason.

## Acceptance criteria (overall, mapped to the draft's scope)

- **Canonical copy byte-identical:** the four SHA-256 values in P1 match, and the hash guard test passes.
- **Corpus passes (including hostile cases):** `npm test -- release-notes-markdown` runs all 69 cases in Vitest, plus the performance case.
- **Full entry renders in dialog, Settings and onboarding finish, light and dark, narrowest window:** P4 all-constructs and layout scenarios, with P6 manual check. Settings and onboarding use the same dialog, so they are covered by P4's existing scenarios plus the shared component.
- **No raw HTML sink:** `release-notes-no-raw-html.test.ts` is the scan; the corpus-driven render test and the hostile browser scenario confirm nothing is injected.
- **Only https via `SHELL_OPEN_EXTERNAL`:** unit and browser tests. `javascript:`, `http:`, `data:` and `mailto:` never produce a link, in the parser and again in the renderer gate.
- **Invalid or oversized notes show the plain-text fallback and never blank or throw:** P3 tests and the P4 fallback and malformed scenarios.
- **`release:notes --check` uses the canonical parser:** P5.
- **Existing tests updated and suites green:** `npm test`, `npm run typecheck`, `npm run build`. Lint is run non-fixing; see Checks.

## Checks (exact commands)

- `npm run typecheck`: both TS projects. Expected: `typecheck:web` is red between P2 and P3 only.
- `npm test`: full Vitest suite under Electron-as-node.
- Focused tests:
  - `npm test -- release-notes-markdown`
  - `npm test -- release-notes`
  - `npm test -- whats-new`
  - `npm test -- service`
  - `npm test -- ReleaseNotesView`
  - `npm test -- release-notes-no-raw-html`
- Browser: `npm run test:whats-new-browser`, `npm run test:onboarding-browser`, `npm run test:update-notifications`, `npm run test:renderer-browser`. Playwright Chromium builds exist locally; running them is not confirmed.
- Electron harness: `npm run test:whats-new` (not confirmed runnable here).
- `npm run build`: typecheck plus electron-vite build.
- `npm run release:notes -- 1.6.1 --check`: expects a "valid" line.
- **Lint:** `npm run lint` runs eslint with `--fix`, so it mutates files and would rewrite CRLF to LF repo-wide. Do not use it. Use `npx eslint <changed files> --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts --rule "prettier/prettier: off"`, which does not fix. Pass means no output and exit 0. The CRLF "Delete ␍" prettier warnings are pre-existing and excluded by turning the rule off.
- `npm run verify:production:win` is a pre-release step, not required here; it cannot be confirmed from this environment.

## Risks and open questions

**Risks**
- The HTML adapter is the production path for pre-install notes (correction 5). Its GFM shapes other than h3, ul and li are synthesized, not captured live (unverified). An unexpected feed shape means null (no button), which is safe but loses notes.
- `npm run lint` and `npm run format` can corrupt the hashed files and rewrite line endings. Mitigated by ignore entries, the hash guard test and the lint instruction above.
- `typecheck:web` is red between P2 and P3, which is why P2 is verified with `typecheck:node`.
- `sonner` import in the node environment may need the mock shown in P3 step 9.

**Open questions**
1. **Partial-drop rationale.** Because the bundle lacks the incoming version, the "bundle preferred for incoming" rule rarely applies in production, and the strict HTML adapter is the real path. Confirm you are happy with that rather than expecting bundling of future notes.
2. **Contrast of the approved link style.** Dark `hover:text-primary` is about 4.42:1 (below 4.5:1), and the `decoration-muted-foreground/50` underline is faint (about 2.3:1 in light), estimated from tokens. Default stays "match the existing app link style"; alternatives are `hover:text-foreground` and full-opacity `decoration-muted-foreground`. Decide whether to change.
3. **Initial dialog focus.** With links in the notes, Radix default initial focus may land on the first link, not "View full changelog" as today. Default is left unchanged; the alternative is `onOpenAutoFocus` to focus the dialog content. Confirm after the UI check.
4. **`.github/skills/release-update/SKILL.md` lines 74-78** still describe the old subset. This file is release-skill migration scope (out of scope), so it is not edited. Flag it as a follow-up.
5. **Fallback look.** The plain-text block uses the body font with `whitespace-pre-wrap` as a proposal (alternative: `font-mono` to signal raw text). Say if you prefer mono.

## Out of scope / do not touch

- `CHANGELOG.md` and its entries, including adding an entry for this feature.
- The release-skill migration and `.github/skills/release-update/SKILL.md`.
- `src/main/security/ipc-policy.ts`, CSP, BrowserWindow settings, preload, and the main `SHELL_OPEN_EXTERNAL` handler.
- Any new dependency (no RTL, no jsdom), `docs/ui-ux.md`, `main.css` tokens, and any `docs/DESIGN.md`.
- The production database and the live profile (tests use the harness's isolated profile).
- Committing, pushing, or creating a branch; the work stays uncommitted on `dev`.
- Editing the canonical files in the skill dir or the repo copies. Report parser problems instead.

## Run log

### 1. Planned (2026-11-17)
- Planner: sonnet, effort high. plan_time: 10m57s (planner 10m10s, one haiku UI scout 47s). plan_usage: n/a (usage probe not run).
- Scouts: haiku (UI).

### 2. Implementer started (2026-11-17)
- Harness codex, requested model gpt-6.1-terra / medium (Terra orchestrates gpt-6-luna). Dispatch ctx_a81960d368ef, run run_d37d3b34346c, kept open.
- Pre-start usage (codex): session 9%, weekly 1%.

### 3. Implementer report (2026-11-17)
- STATUS: partial (payload outcome=failed, but all automated checks passed; the gap is manual UI inspection).
- PHASES: P1, P2, P4, P5 done; P3 and P6 partial (manual UI check not completed). Luna subagents luna_phase_1..6 (medium; P6 low). Corrections made during run: whitespace (P2), keyboard assertion (P4), Electron locator (P5).
- FILES CHANGED: 23 modified/deleted tracked files plus new files (canonical copies, bundled-notes.ts, ReleaseNotesView.tsx, lib/release-notes.ts, tests); see git status.
- CHECKS RUN: canonical hashes OK; focused tests; npm run typecheck; npm test (82 files, 778 tests); npm run build; test:whats-new-browser 16/16; test:onboarding-browser 7/7; test:update-notifications; test:renderer-browser; non-fixing eslint; git diff --check; release:notes 1.6.1 --check passed and 9.9.9 failed as expected; test:whats-new passed after a locator fix. Screenshots: dark 900x600 and light 1280x800 layout confirmed. Hover, focus ring and fallback appearance not manually verified (browser host unavailable).
- DEVIATIONS: corpus test uses a loop instead of it.each (TypeScript typing); manual UI incomplete.
- OPEN ISSUES: finish visual inspection; owner decisions on hover contrast (Q2), initial focus (Q3), fallback font (Q5); `.github/skills/release-update/SKILL.md` still describes the old subset (out of scope).
- Worker reported actual runtime model/effort of Luna subagents as unverified; orchestrator launched as codex gpt-6.1-terra/medium (matches requested).
- cost: stage=implement harness=codex model=gpt-6.1-terra/medium time=~53m (dispatchedAt 20:22:10 to completedAt 21:15:38Z; timezone of the first value not stated) usage=+33% session, +6% weekly (approximate; session 9%→42%, weekly 1%→7%)

### 4. Review round 1 (2026-11-17)
- Reviewer: claude sonnet (orc-phase-verifier subagent), ~1m47s, usage n/a. cost: stage=review harness=claude model=sonnet time=~1m47s usage=n/a
- Verdict: PARTIAL. P1 and P5 passed; P4 not re-run; P2, P3, P6 partial. Canonical hashes match; typecheck clean; 243 focused tests pass; no out-of-scope edits.
- Distilled findings (all in the HTML adapter, `src/main/updates/release-notes.ts`, unless noted):
  - R1 major: link URL checks (whitespace, quotes, `<>`, 2048 length) run before entity decoding, so `&quot;`/`&#32;`/`&lt;` or 400x`&amp;` in an href pass.
  - R2 major: `parseUpdaterReleaseNotes` drops an invalid array entry and returns the rest, instead of `null`; bullet/length limits are per entry, not across the concatenation.
  - R3 major: adapter accepts nested links, bold-in-bold, italic-in-italic, empty link/bold children, a second nested `ul` that the canonical grammar rejects.
  - R4 minor: a lone `<h3>` yields an empty section the canonical parser never produces.
  - R5 minor: `bundled-notes.ts:27` swallows the `findVersionSection` error message (Unreleased/bad-date).
  - R6 minor: `release-notes.test.ts` lacks cases for the above (code-label link, multiple nested ul, entity in href, multiple `<p>` in li, array with invalid entry, over-100k with markup).
  - R7 info: manual UI checks not done (P3/P6); record or complete.
- Dropped by coordinator: adjacent text-node merging and `&nbsp;` collapse (cosmetic tree differences); regex `href=` matching inside another attribute's value (low severity, result is https-validated anyway).

### 5. Fixes chosen and sent (2026-11-17)
- User chose: apply all (R1-R6). R7 (manual UI) stays a noted gap.
- Sent to the open implementer as follow-up dispatch ctx_c363f1280e14. Pre-send usage (codex): session 43%, weekly 7%.

### 6. Fixes result (2026-11-17)
- STATUS: done. Luna subagent luna_review_fixes (requested gpt-6-luna medium; runtime model/effort unverified) fixed R1-R6 plus an empty-intermediate-heading follow-up.
- FILES CHANGED: src/main/updates/release-notes.ts (decoded URL validation, array-wide limits, grammar and heading checks), release-notes.test.ts (regressions), bundled-notes.ts (lookup error detail), whats-new.test.ts (warning coverage).
- CHECKS RUN: typecheck PASS; npm test PASS (82 files, 791 tests); test:whats-new-browser 16/16; test:whats-new PASS; non-fixing eslint on four files PASS (first npx attempt hung and was interrupted, local eslint binary passed); git diff --check PASS.
- DEVIATIONS/OPEN: visual check not run; hover contrast, initial focus and fallback look remain owner decisions.
- cost: stage=fixes harness=codex model=gpt-6.1-terra/medium (launch metadata not shown for follow-up) time=~8m (21:20:51 to 21:28:32Z; first timestamp's zone not stated) usage=+7% session, +1% weekly (approximate; session 43%→50%, weekly 7%→8%)

### 7. Wrap-up (2026-11-17)
- Built: canonical parser copied unchanged (hashes verified), tree-based `ReleaseNotesDocument`, bundled-notes lookup, rewritten allowlist HTML adapter, bundle-first service wiring, `ReleaseNotesView` renderer with https-only links, browser/Electron scenarios, canonical-parser release tooling, docs updated, old `changelog-notes` module deleted.
- Final checks (after fixes): typecheck, npm test (791), whats-new browser 16/16, Electron test:whats-new, non-fixing eslint, git diff --check all pass. Earlier: onboarding browser 7/7, update-notifications, renderer-browser matrix, release:notes --check passed.
- Review: 1 round (claude sonnet, PARTIAL); R1-R6 fixed, two cosmetic items and one low-severity item dropped. Not re-reviewed.
- Open: manual UI check not run (hover, focus ring, fallback look); owner decisions on link hover contrast (Q2), initial dialog focus (Q3), fallback font (Q5); `.github/skills/release-update/SKILL.md` still describes the old subset (out of scope follow-up). `phases: 4/6` because P3 and P6 manual UI checks are incomplete.
- Cost summary:
  - plan: sonnet/high, ~10m57s, usage n/a
  - implement: codex gpt-6.1-terra/medium, ~53m, +33% session / +6% weekly
  - review: claude sonnet, ~1m47s, usage n/a
  - fixes: codex gpt-6.1-terra/medium, ~8m, +7% session / +1% weekly
  - totals: ~74m wall time across stages; usage deltas are Codex-only and approximate. Plan size L (6 phases, 34 files).

<!-- run-log-end -->
