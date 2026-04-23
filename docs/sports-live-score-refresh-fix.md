# Sports Live Score Refresh Fix

## Summary
The Sports widget showed stale in-progress game data (for example, Blue Jays game stuck at an older score/inning) even though the game was still live.

The issue was resolved by improving live refresh fallback behavior and deduplicating provider records so the UI consistently selects the freshest game entry.

## Problem
### User-visible symptoms
- Live game card showed outdated score and inning details.
- Game could remain marked as live, but values did not move forward as expected.
- The same matchup could appear from multiple providers with conflicting freshness.

### What logs revealed
- Scheduled live refresh was running on the expected 60-second interval.
- ESPN fallback was returning fresher live data for the same matchup.
- Data was being upserted successfully, but stale entries could still be selected in team-event views when duplicate matchup rows existed.

## Root Cause
The issue had two linked causes:

1. Provider identity mismatch during fallback selection
- SportsDB and ESPN often use different event IDs for the same real-world game.
- Matching fallback candidates by event ID alone missed valid fresh replacements.

2. Duplicate matchup rows in team-event selection
- Team event queries could include both SportsDB and ESPN variants of the same matchup.
- Selection order could surface a stale row instead of the fresher live row.

## Solution
### 1. Strengthened live refresh fallback matching
- Added forced ESPN merge support during live refresh checks.
- Allowed live fallback flow to find the same matchup by team/date, not only by provider event ID.
- Preferred ESPN candidates when matchup-equivalent records were present and fresher.

### 2. Added matchup-level deduplication in team event retrieval
- Deduplicated events by matchup signature (sport, league, date/time, home, away).
- Added quality scoring to choose the best row among duplicates.

Quality preference order:
- Final over Live over Scheduled
- Rows with real scores over null-score rows
- ESPN row as tie-breaker when otherwise equivalent

### 3. Preserved resilience behavior
- Live refresh remained interval-driven at 60 seconds.
- Retry/backoff and warning-path behavior remained in place for fallback failures.

## Verification
### Functional verification
- Live refresh timer fired repeatedly at the expected interval.
- Fallback selected the correct live Angels vs Blue Jays ESPN record.
- Upsert path wrote the selected live record.
- Widget and Today’s Games display updated to current values (example observed: 3-3, Bot 7th).

### Build verification
- Typecheck passed after changes.
- Build passed after changes.

## Final State
The Sports widget now updates in-progress game score/status reliably and stays aligned with the Sports page cards for live data behavior.
