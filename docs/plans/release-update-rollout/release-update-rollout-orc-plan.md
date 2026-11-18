---
name: release-update-rollout
type: orc-plan
status: IN_REVIEW
source_brainstorm: none
planner: claude/captain-holt (written directly, not via /orc-plan)
implementer: codex gpt-6.1-terra medium (after opencode stopped)
dispatch: ctx_de0337b61120
created: 2026-11-17
phases: 8/9
size: L
files: 28
plan_time: n/a
plan_usage: n/a
---

# Plan: release-update-rollout


Source: main plan `C:\Users\justi\Documents\Git\squad\captain-holt\docs\plans\release-update-normalization\release-update-normalization-plan.md` (Phase 3). Written directly by the Holt session; there was no `/orc-plan` draft to save.

## Plan (approved 2026-11-17)

### Summary

Personal News already has a `release-update` skill but it is hand-driven: a tag-only workflow, `-alpha`/`-beta` channel arguments, a delete-and-recreate tag path, a changelog helper that fills the draft body after the build, and `npm install` in CI. Replace it with the shared process: tag push, `prepare` job (tag, versions, changelog, ancestor-of-main, single draft with the body), Windows build into the draft, `verify` job, draft handoff, confirmed publish. The in-app "What's new" bundling check stays.

### Overview

| id | goal | files | parallel_safe | effort | size |
|---|---|---|---|---|---|
| P0 | Gate: sources, hashes, consumers of old helper | 0 | no | low | S |
| P1 | Shared scripts, fixture, test wiring | 18 | no | low | M |
| P2 | `release.config.json` and example, non-fixing lint script | 3 | yes (after P1) | medium | S |
| P3 | Workflow `release.yml` replaces `release-tag.yml` | 2 | no | high | M |
| P4 | Rewrite skill from template | 1 | yes (after P2) | medium | M |
| P5 | Reconcile `release-notes-from-changelog.mjs` and `release:notes` | 5 | no | medium | M |
| P6 | Docs and instruction pointers | 3 | yes (after P4) | low | S |
| P7 | Whole-repo verification | 0 | no | medium | S |
| P8 | Manual verification (human) | 0 | no | n/a | S |

Size L, 9 phases, about 28 files, risk medium. Highest risk is P3 (workflow) and P5 (the helper has live consumers: the What's new bundling and its tests).

### Ground rules (apply to every phase)

- Work on the current branch. Do not create branches or worktrees. **Do not commit or push.** Leave every change uncommitted for review.
- Never run a release: no tag creation or push, no `gh release` mutation, no `gh workflow run`, no publish.
- Never print, write or commit secrets. Secret and environment variable checks are by name only (set / not set).
- The apps are unsigned. Do not add OS code-signing checks.
- **Canonical files are copied byte for byte and never edited.** Source of truth: `C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot`. Compare with `cmp` or `sha256sum` against the source after copying. If a canonical script seems wrong for this repo, stop and report it in the Run log; do not edit the copy.
- The four renderer-plan files already live in the app (`release-notes-markdown.mjs`, `.d.mts`, `.corpus.mjs`, `cases.json`). Leave those app-side copies exactly as they are. This plan adds a second byte-identical set for build tooling (see Design decisions 1).
- Verify every claim against the repo (`package.json`, workflow, scripts, config). Do not infer.
- Use the shared skill's reference docs while working: `C:\Users\justi\.claude\skills\release-skill-maintenance\SKILL.md`, `references\audit-checklist.md` (checks A to F), `references\release.config.md`, the example config for this stack, `templates\copilot\release-update.SKILL.md`, `templates\copilot\stack-fragments.md`, and the workflow template for this stack.

### Design decisions

1. **Two identical copies of the parser set, on purpose.** The renderer plan put the parser, declarations, corpus helper and `cases.json` under the app source tree for the renderer and its tests. The shared release scripts import `./release-notes-markdown.mjs` from `scripts/` and the shared test reads `../fixtures/release-notes-md-v1/cases.json`. Rather than edit either side, `scripts/` and `fixtures/` get their own byte-identical copies. Both are hash-checked (audit D2, D3, D5). Never edit any copy.
2. **Shared test files run under `node --test`, not the app's test runner.** `release-scripts.test.mjs` and `release-notes-markdown.test.mjs` use `node:test`. Exclude them from the app's test runner (vitest/Vite `exclude`), from lint autofix and from formatters, and add an npm script `test:release-scripts` that runs both with `node --test`.
3. **Canonical copies must not be rewritten by tooling.** Add the 12 script files and the fixture to the ESLint ignore list and the Prettier ignore list, and add an `eol=lf` rule for them in `.gitattributes` so a checkout cannot change their bytes.
4. **Changelog format is `release-notes-md-v1`** (the renderer plan is done in all four repos), so `changelog.format` is `release-notes-md-v1`. `/update-changelog` already reads `release.config.json` for `style` and `format`.
5. **Tag push is the trigger, annotated tag at the verified SHA, retry is `gh workflow run release.yml --ref vX.Y.Z`.** The skill, not the worker, ever pushes a tag.
6. **Prereleases are `-beta.N`.** Anything that still mentions `-alpha`, `-beta` channel arguments or delete-and-recreate tag steps is removed from the skill and docs.
7. **Workflow file is renamed to `.github/workflows/release.yml`** (use `git mv` from `release-tag.yml`). `windows-production-build.yml` is a separate verification workflow and stays untouched.
8. **`npm ci` replaces `npm install`** (a lockfile is committed).
9. **Explicit `"releaseType": "draft"`** is added to the GitHub publish entry in `package.json` `build.publish`. Today it relies on the electron-builder default; the audit (C5) requires it explicit.
10. **The lint script rewrites files** (`eslint . --fix`). The release flow must not mutate the tree, so add `lint:check` (the same command without `--fix`) and use it in the config `verify` list and the workflow. Leave `lint` as it is.
11. **The old helper `scripts/release-notes-from-changelog.mjs` and `release:notes` are replaced** by the shared scripts, subject to P0/P5 findings about its consumers.
12. **Prereleases are `-beta.N`.** The `-alpha`/`-beta` channel argument, the channel-based tag rules and the delete-and-recreate tag section are removed.

### Decisions (resolved 2026-11-17: releaseBranch is main; the recommended option was chosen for the others)

- **`releaseBranch`.** The main plan (section 17) said Personal News would use `dev` "until you change it". `origin` only has `main`, and the `prepare` job requires the tagged commit to be on `origin/<releaseBranch>`, so `dev` would fail audit B6 and the CI gate. This plan sets `releaseBranch: "main"`: you merge `dev` into `main` before releasing. This also matches the existing skill, which already requires `main`.
- **Rehearsal.** None in this plan.

### P0: Gate (read-only, no edits)

- Confirm the canonical sources exist at `C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot\scripts` (the 12 files above), `C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot\fixtures\release-notes-md-v1\cases.json`, and the stack template files named in the ground rules. Stop if any is missing.
- Confirm the app-side parser copies from the renderer plan are present and match these frozen hashes:

| file | sha256 |
|---|---|
| `release-notes-markdown.mjs` | `4873c9967ed669085f3a23b33c97d877bb90489aa78a0607fbaa136b28a67c32` |
| `release-notes-markdown.d.mts` | `96b6b2be9d4384f6f8c06d5d028ecc604503f27792dc515f780eb3fa8a920f3e` |
| `release-notes-markdown.corpus.mjs` | `8c672fab613dadd85f3240183fecf9351440bae0f3eab040b68993de70a1846e` |
| `cases.json` | `dd1b53d30cb373eaf136dacd979a4d5f0ea3025087a8c38f034eb5ccd5c15ae6` |

- Run the shared self-tests from the source once: `node --test "C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot\scripts\release-scripts.test.mjs" "C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot\scripts\release-notes-markdown.test.mjs"` (expect 85 passing).
- Record the current branch, `git status --short` (must be clean apart from `docs/plans/`), the Node version, and `origin` remote branches (`git branch -r`).
- Read `.github/workflows/release-tag.yml`, `.github/workflows/windows-production-build.yml`, `.github/skills/release-update/SKILL.md`, `docs/HOW-TO-RELEASE.md`, `docs/HOW-TO-MAINTAIN-ONBOARDING.md`, `package.json` (`build`, `scripts`, `engines`), `.prettierignore`, `eslint.config.js`, `vitest.config.mts` (it includes only `src/**`, so the shared node:test files are not collected; confirm).
- `grep -rn "release-notes-from-changelog\|release:notes\|verify:production:win" . --include=*.{json,md,yml,yaml,ts,tsx,mjs,mts,js} --exclude-dir=node_modules --exclude-dir=docs/plans` to list every consumer of the old helper (the What's new tests and `verify-production-build.mjs` are suspects).
- Read-only: `gh release view <latest tag> --repo ChefMooon/personal-news --json assets,name,isDraft` to record the real installer asset names. Expect `Personal News-<v>-Setup-x64.exe`, its `.blockmap` and `latest.yml`; use the real names.
- Check `src/main/updates` for any logic that depends on `-alpha`/`-beta` tag suffixes or a `channel` setting. Record it; do not change updater behaviour in this plan.
- **Acceptance:** all checks recorded in the Run log, no edits made. If a hash mismatches or the worktree has unrelated changes, stop and set status BLOCKED.

### P1: Shared scripts, corpus fixture and test wiring

- Copy these from `C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot`: `release-lib.mjs`, `release-notes-markdown.mjs`, `release-notes-markdown.d.mts`, `release-notes-markdown.corpus.mjs`, `check-changelog.mjs`, `extract-release-notes.mjs`, `check-version-consistency.mjs`, `release-prepare.mjs`, `verify-release-draft.mjs`, `wait-for-run.mjs`, `release-scripts.test.mjs`, `release-notes-markdown.test.mjs` (all into `scripts/`), plus `fixtures/release-notes-md-v1/cases.json` at the repo root. Create `scripts/` and `fixtures/release-notes-md-v1/` if missing. Do not reformat anything.
- Add the npm script `"test:release-scripts": "node --test scripts/release-scripts.test.mjs scripts/release-notes-markdown.test.mjs"`.
- Exclude the two shared test files from the app's test runner config, and add the 12 script files and `fixtures/release-notes-md-v1/` to the ESLint ignore list and the Prettier ignore list (create the ignore file entries only where the tool is already used).
- Add the `eol=lf` rule for those paths to `.gitattributes` (create the file if absent; keep existing rules).
- `.gitattributes` does not exist in this repo: create it with only the canonical-file `eol=lf` rules.
- `eslint.config.js` and `.prettierignore` were touched by the renderer commit; add the new ignores without removing existing entries.
- **Files:** the 12 scripts, `fixtures/release-notes-md-v1/cases.json`, `package.json`, the app test runner config, the ESLint config, the Prettier ignore file, `.gitattributes`.
- **Acceptance:** `cmp` shows each copy identical to its source; `npm run test:release-scripts` passes (85 tests); the app's own test command still passes and does not pick up the node:test files; lint does not modify any canonical copy.
- **Checks:** `npm run test:release-scripts`, the app test command, the lint command (no `--fix` on canonical files), `git diff --stat` shows the canonical files only as additions.

### P2: `release.config.json`, example, and `lint:check`

- Create `release.config.json` from `C:\Users\justi\.claude\skills\release-skill-maintenance\references\release.config.example.electron.json`:
  - `schema: 1`, `stack: "electron"`, `productName: "Personal News"`, `releaseBranch: "main"`, `releaseTitle: "{tag}"` (confirm against the title of the last published release in P0).
  - `versionFiles: ["package.json", "package-lock.json"]`; `changelog: { "file": "CHANGELOG.md", "style": "user", "format": "release-notes-md-v1" }`.
  - `verify: ["npm run lint:check", "npm run typecheck", "npm test", "npm run verify:production:win"]`. (`npm run test:*` browser harnesses stay manual.) Confirm `verify:production:win` exists in `package.json`; it was used by the old skill.
  - `platforms.windows`: enabled, `build: "ci"`, assets from the real names found in P0; `macos` and `linux` present and disabled.
- Create `release.config.example.json` (full Electron example, macOS and Linux disabled).
- `package.json`: add `"lint:check": "eslint . --ext .js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts"` (same globs as `lint`, no `--fix`), and add `"releaseType": "draft"` to `build.publish[0]`.
- **Files:** `release.config.json`, `release.config.example.json`, `package.json`.
- **Acceptance:** `loadConfig` accepts the config; `check-version-consistency` exits 0; `npm run lint:check` runs and does not modify files (`git status` unchanged).
- **Checks:** those three commands plus `npm run typecheck`.

### P3: Workflow `.github/workflows/release.yml`

- `git mv .github/workflows/release-tag.yml .github/workflows/release.yml`, then rewrite from `C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot\workflow-electron.yml`:
  - `NODE_VERSION` `24`; no `PRE_BUILD_STEPS`; `PACKAGE_COMMAND_WINDOWS`: `npx electron-builder --win --publish always` (the template runs `npm run build` first, so do not call `npm run build:win`, which would build twice). Keep `CSC_IDENTITY_AUTO_DISCOVERY: "false"`.
  - Triggers `push` tags `v*.*.*` plus `workflow_dispatch` (retry only). Replace `npm install` with `npm ci` (the template already does).
  - In the template's "Build, lint and test" step use `npm run lint:check` instead of `npm run lint` so CI never autofixes.
- **Files:** `.github/workflows/release.yml` (and the removal of `release-tag.yml`).
- **Acceptance:** audit C1 to C6, C8, C9 pass; `verify` needs every build job; no job publishes.
- **Checks:** parse the YAML and confirm the job graph.

### P4: Rewrite `.github/skills/release-update/SKILL.md` from the template

- Regenerate from `C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot\release-update.SKILL.md`: `{{PRODUCT_NAME}}` = `Personal News`, `{{STACK_LABEL}}` = `Electron`, `{{STACK_PREFLIGHT}}` empty, `{{STACK_NOTES}}` the Electron fragment. The skill name stays `release-update`.
- This replaces the channel argument, the alpha/beta tag rules, the delete-and-recreate section and the "populate draft notes after the build" steps.
- **Files:** `.github/skills/release-update/SKILL.md`.
- **Acceptance:** audit A1 to A8 pass; no `channel`, `-alpha`, `-beta` argument or tag delete steps remain.
- **Checks:** diff against the rendered template; grep for `alpha` and `git tag -d`.

### P5: Reconcile the old release-notes helper

- `scripts/release-notes-from-changelog.mjs` (and the `release:notes` npm script) was written for the old flow (it sets the draft body after the build). With the `prepare` job writing the body this is redundant. Using the P0 consumer list:
  - If only the old skill and docs use it: delete the script and the npm script.
  - If the What's new bundling or its tests (`scripts/test-whats-new.mjs`, `scripts/verify-production-build.mjs`, `src/main/updates/bundled-notes.ts`) import it: keep only the part they need as a thin wrapper that imports the shared `findVersionSection`/`parseReleaseNotes`, and rename nothing the tests depend on. Report which case applied.
- Keep the bundled What's new build check.
- **Files:** `scripts/release-notes-from-changelog.mjs` (delete or wrapper), `package.json`, and any consumer P0 found.
- **Acceptance:** audit D4 passes; `npm test` and the What's new script tests (`npm run test:whats-new`) pass.
- **Checks:** `npm test`, `npm run test:whats-new`, `npm run typecheck`, `npm run lint:check`, `npm run verify:production:win` (Windows; slow, report if skipped).

### P6: Docs and instruction pointers

- `docs/HOW-TO-RELEASE.md`: rewrite to match the skill (steps, tag push, retry command, draft handoff, publish confirmation, `release.config.json`, `-beta.N` prereleases, how to add macOS or Linux using `C:\Users\justi\.claude\skills\release-skill-maintenance\references\release.config.md`).
- `docs/HOW-TO-MAINTAIN-ONBOARDING.md`: update only a reference to the removed helper or the old release steps if one exists.
- `.github/copilot-instructions.md`: point release work at `/release-update`.
- **Files:** `docs/HOW-TO-RELEASE.md`, `docs/HOW-TO-MAINTAIN-ONBOARDING.md` (if needed), `.github/copilot-instructions.md`.
- **Acceptance:** audit F1, F2 pass; no mention of `release:notes`, alpha/beta channels or the re-run tag procedure.
- **Checks:** grep for those strings.

### P7: Whole-repo verification (worker runs; read-only except fixing its own mistakes)

- Run every command in `release.config.json` `verify`, then `npm run test:release-scripts`, `node scripts/check-version-consistency.mjs --version <package.json version>` (exit 0), and `node scripts/check-changelog.mjs --version <package.json version>` (exit 0 or a clear message if the current version has no entry; do not create one).
- Hash-compare all 12 script files and the fixture against `C:\Users\justi\.claude\skills\release-skill-maintenance\templates\copilot` and report any mismatch.
- Walk `C:\Users\justi\.claude\skills\release-skill-maintenance\references\audit-checklist.md` sections A to F against the repo and write a table (id, pass/fail/warn/n/a, file, note) into the Run log. Check C7 by name only; if `gh secret list` cannot run, record "could not verify".
- Parse the new workflow YAML and confirm `release-tag.yml` is gone and the `-alpha`/`-beta` channel text is gone from the skill and docs.
- Run `git diff --check` and `git status --short`; list every changed path and confirm none is outside this plan's file list.
- **Acceptance:** every verify command passes, the audit table has zero fails (or each fail is listed with a reason), no canonical copy differs from the source.

### P8: Manual verification (human-run, not by an agent)

- Review the diff and the audit table.
- Decide whether to do a rehearsal release (a tag push), see Decisions. No agent pushes a tag.
- After the first real release, confirm the draft verifies and the in-app update flow shows the notes.

## Run log
### 1. Implementer started (2026-11-17)
harness=opencode model=opencode/deepseek-v4.1-flash-free (no effort), dispatch ctx_d6fbd5c45f07, run run_46110fa6fbaa. User chose opencode over configured claude default. Usage: n/a.
### 2. Worker stopped, free limit reached (2026-11-17)
opencode hit "free limit reached, resets 7:44 PM" after ~1.5 min. No worker_done. Partial work on disk (untracked): 12 scripts in scripts/ and fixtures/ (P1 copies only; package.json, ignores, .gitattributes not touched). Nothing verified. cost: stage=implement harness=opencode usage=n/a.
### 3. Codex implementer started (2026-11-17)
User chose codex after opencode quota stop. harness=codex model=gpt-6.1-terra/medium, dispatch ctx_de0337b61120 (same run). Pre-start usage: codex session 59%. Old opencode dispatch ctx_d6fbd5c45f07 left idle (could not release; ready state).
### 4. Decisions relayed (2026-11-17)
P0 passed. User chose releaseTitle {tag} (last published title was "1.6.1"), and allowed edits to release:notes mentions in docs/HOW-TO-RUN.md and AGENTS.md (outside plan file list).
### 5. Asset-name decision (2026-11-17)
Worker found published asset names are hyphenated (Personal-News-1.6.1-Setup-x64.exe) vs local builder output with spaces. Told it to keep hyphenated names in release.config.json, leave artifactName untouched, and flag for P8 confirmation. Pre-existing lint error noted by worker.
### 6. Lint fix authorized (2026-11-17)
User authorized smallest fix of unused maxBytes (src/main/security/network.ts:29, out of plan). verify:production:win smoke test failed (Chromium cache access denied); told worker to report as not passed.
### 7. Implementer report (2026-11-17)
STATUS partial. P0-P7 done via luna subagents (P1-P7 each + luna_fix_1 for lint); P8 human-only. Checks: test:release-scripts 85 pass; npm test 791 pass; test:whats-new pass; typecheck pass; lint:check pass (0 errors, 1321 warnings); check-version-consistency and check-changelog pass; workflow YAML/graph pass; canonical hashes pass; git diff --check pass. FAILED: verify:production:win (packaged smoke: Chromium cache access denied, no smoke-test-report.json). P5: delete case (old helper removed, release:notes removed). Audit A-F: all pass, C7/C10 n/a. Deviations: AGENTS.md, docs/HOW-TO-RUN.md, src/main/security/network.ts (authorized); P1 lint autofix touched ~50 unrelated files, restored, but git status still lists them modified with no content diff (CRLF); rename staged. Full report: personal-news-release-rollout-report.txt (temp).
cost: stage=implement harness=codex model=gpt-6.1-terra/medium (as launched) time=22:27 to 01:26 UTC (~3h) usage=n/a (not re-probed). Earlier cost: stage=implement harness=opencode time=~1.5min, stopped on quota.
<!-- run-log-end -->
