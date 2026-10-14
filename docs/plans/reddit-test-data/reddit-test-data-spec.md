# Specification Change Impact Assessment: Reddit Test Data

## Decision Summary
- Overall disposition: hand off to planning agent
- Confidence: high
- Scope assessed: deterministic synthetic data for local Reddit Digest and Saved Posts testing, without changing production behavior.

## Proposed Changes
### C1: Loading local Reddit fixtures
- Intended outcome: let developers inspect realistic Reddit Digest and Saved Posts states without depending on live Reddit or ntfy data.
- In scope: an explicit, repeatable way to seed synthetic rows into both existing tables; use an isolated test database by default and support the persistent Development database only through an explicit opt-in.
- Out of scope: production sample data, automatic seeding at app startup, real Reddit content, and schema changes.
- Dependencies: main-process database access, existing Reddit IPC queries, and the Electron Playwright harness.
- Open assumptions: test content can be synthetic and should have stable identifiers so it can be safely refreshed and removed.

## Clarifications
- Asked and answered: none; the request is sufficiently clear for a feasibility assessment.
- Still needed before implementation: whether manual seeding of the persistent Development database is required, or whether isolated harness runs are enough.
- Assumptions used: developers want data for local UI inspection and tests, and normal application startup should remain unchanged.

## Current-State Evidence
- [001_initial.sql](../../../src/main/db/migrations/001_initial.sql) already defines `reddit_digest_posts` and `saved_posts`, including the fields needed for dates, subreddit, score, read state, tags, and notes. Saved-post insert and delete triggers maintain the FTS index, so fixture writes should go through the main database connection and preserve those triggers.
- [src/main/ipc/index.ts](../../../src/main/ipc/index.ts) exposes queries for both tables through Reddit IPC handlers; the renderer already loads them through these contracts.
- [src/main/sources/scripts/index.ts](../../../src/main/sources/scripts/index.ts) upserts Reddit Digest results, while normal Reddit polling is coordinated in [src/main/sources/reddit/index.ts](../../../src/main/sources/reddit/index.ts). The harness disables startup polling.
- [HOW-TO-RUN.md](../../HOW-TO-RUN.md) documents that `dev` and `start` share a persistent Development database. The packaged app uses a separate profile.
- [database-profile.ts](../../../src/main/db/database-profile.ts) rejects development or harness database paths that alias the production database, and requires harness data to stay inside its unique temporary root.
- [PLAYWRIGHT-HARNESS.md](../../../scripts/PLAYWRIGHT-HARNESS.md) recommends IPC for deterministic scenario setup and supports cleanup callbacks. [package.json](../../../package.json) already provides the harness test command, but no Reddit fixture or seed command.
- No current test-data seeder for these Reddit tables was found.

## Impact Findings
### C1: Loading local Reddit fixtures
- Classification: beneficial with conditions
- Positive impact: stable synthetic rows can exercise multiple weeks, subreddits, scores, viewed/unviewed states, and Saved Posts tags/notes without credentials, network calls, or personal data.
- Negative impact or unintended consequence: writing into the persistent Development database can clutter a developer's real local state. A broad delete or startup seed could overwrite or mix with actual saved posts.
- Affected surfaces: main-process fixture/seeding logic, shared IPC only if a development-only action is exposed, and the Electron harness scenario. No renderer Node access is needed.
- Dependencies and interactions: preserve the Saved Posts FTS triggers; use stable fixture IDs and targeted cleanup. No schema migration is needed.
- Confidence and rationale: high; both storage schemas and read paths already exist, and the repository has an isolated UI harness.
- Discriminating check: seed the disposable harness database, verify both existing Reddit queries and screens show the fixture rows, then confirm the harness removes the isolated profile without changing the Development or production databases.
- Recommendation: proceed with a shared synthetic fixture set and an idempotent main-process seeder. Make isolated harness seeding the default. If manual inspection in the persistent Development profile is needed, add a separate explicit seed/clear action; never seed automatically at startup.

## Cross-Change Considerations
- Keep fixture creation and deletion in the main process so database ownership, saved-post FTS triggers, and IPC boundaries remain consistent.
- Use one fixture definition for automated harness scenarios and any opt-in Development database action to avoid divergent sample content.

## Handoff Options
1. **Continue specification assessment**: confirm whether developers need manual seeding in the persistent Development profile, or only isolated harness scenarios.
2. **Hand off to the planning agent**: plan a shared synthetic fixture set, a guarded main-process seeder, harness setup/cleanup, and an optional explicit Development-profile seed/clear path. Keep production, startup seeding, and schema changes out of scope.

## Quality Gate
- The single requested change is identified and mapped to its intended outcome.
- Material uncertainty about writing to the persistent Development database is visible before implementation.
- Repository behavior is supported by the schema, IPC, database-profile, and harness documentation.
- Benefits, contamination risks, dependencies, and the no-migration option are explicit.
- The verification approach checks both visible data and profile isolation.
