# Dashboard Sports Widget Data Sources and Refresh Flow

Status: Current implementation
Last updated: 2026-04-22

## Purpose

This document explains:

1. Which external data sources power the Sports dashboard widget.
2. How often each source is called.
3. How sports data is queried, stored, and read by:
- the dashboard Sports widget
- the full Sports page

## Scope

This covers the Sports module in the main process and the renderer consumers for:

- Dashboard widget: Sports widget card
- Sports page: full route with standings and expanded game details

## High-Level Architecture

1. The main process owns all external API calls and writes to SQLite.
2. Renderer UI (dashboard widget and Sports page) reads via IPC only.
3. Renderer does not call sports APIs directly.

## External Data Sources

## Source 1: TheSportsDB (primary schedule/event feed)

Used for:

- League catalog
- League daily events
- Team recent and upcoming events
- Event detail refresh
- Team badge backfill inputs

Endpoints currently used:

- all_leagues.php
- eventsday.php
- eventslast.php
- eventsnext.php
- lookupevent.php
- search_all_teams.php

## Source 2: ESPN scoreboard (targeted fallback)

Used for:

- MLB league-day event fallback when SportsDB data is stale/incomplete

Endpoint currently used:

- site API scoreboard by sport/league/date

Current fallback scope:

- Enabled only for MLB in this implementation.
- Triggered when SportsDB day data has no useful non-final events.

## Source 3: ESPN standings core API

Used for:

- League standings for supported major leagues (MLB/NBA/NHL)

When unavailable for a league/sport mapping, standings fall back to SportsDB lookuptable.php.

## Refresh Triggers and Cadence

## Startup refresh

Per enabled sport, the module attempts an initial refresh on app start.

Behavior:

- It skips if a cache meta entry already exists for today and force is false.
- In practice, this is a same-day cache gate.

Note on startup stale setting:

- Sports settings include startupRefreshStaleMinutes, but refresh gating is currently by same-day cache key, not minute-level staleness.

## Scheduled poll refresh

Per enabled sport, scheduled by poll interval setting.

Default interval:

- 5 minutes

Range:

- 1 to 1440 minutes

Behavior:

- Scheduled poll runs with force true, so refresh executes even if same-day cache exists.

## Manual refresh

Triggered from widget or Sports page refresh action.

Behavior:

- Calls sports refresh IPC with force true for selected sports.

## Live-game refresh loop

Per sport, when at least one local-today event is classified live:

- schedules a one-shot timer for 60 seconds
- on timer fire, re-fetches each currently live event by event id
- updates cache and re-schedules if live events still exist

This loop stops automatically when no live events remain.

## Badge refresh cadence

Opponent/team badge prefetch uses a separate freshness window:

- 7 days

Manual badge refresh bypasses that TTL.

## External Call Frequency by Path

## On each scheduled or manual refresh (per sport)

1. League catalog:
- all_leagues.php only when catalog sync is required.

2. For each enabled league:
- Fetches league events for 3 date keys: yesterday, today, tomorrow (local-date derived keys).
- For each date key:
  - SportsDB eventsday.php always.
  - ESPN scoreboard fallback conditionally (currently MLB-only and only if SportsDB day data is stale/incomplete).

3. For each tracked team in that sport:
- eventslast.php once
- eventsnext.php once

4. Badge backfill operations:
- search_all_teams.php conditionally by badge TTL and missing badge state.

## During live loop (per live sport)

Every 60 seconds:

- lookupevent.php once per currently live event id

## Data Query and Storage Model

## SQLite tables

Sports data storage is split across these tables:

- sports_leagues
- sports_teams
- sports_events
- sports_cache_meta
- sports_opponent_cache

## How events are written

1. Events are normalized into SportEvent shape.
2. Upsert writes into sports_events keyed by event_id.
3. fetched_date is updated on each write batch.
4. Cache meta (sport, fetch_date) stores fetched_at for gating/status.

## How "today" is resolved

The module now uses local-day derived logic from eventDate plus eventTime where available.

Important behavior:

- League-day fetch loads adjacent source dates and then filters by local day for reads.
- Team last/next partitioning uses local-day derived event date.

## Provider merge and dedupe behavior

When fallback provider data is merged for league-day fetch:

1. Events are merged into map by event id.
2. Then deduped by matchup signature:
- sport
- leagueId
- eventDate
- eventTime
- normalized home team
- normalized away team

Preference rule:

- Non-ESPN event id wins if both map to same matchup signature.

## Dashboard Widget Data Read Path

Dashboard Sports widget reads:

1. sports:getTodayEvents for selected sport filters
2. sports:getLeagues for selected sports
3. sports:getTrackedTeams
4. sports:getStatus
5. sports:getTeamEvents for each tracked team shown

Then renderer view mode decides presentation:

- all_games uses today events list
- today, summarized, standard, detailed modes use teamEvents.last and teamEvents.next

## Sports Page Data Read Path

Sports route reads:

1. sports:getTodayEvents for all supported sports
2. sports:getLeagues for all supported sports
3. sports:getTrackedTeams
4. sports:getTeamEvents per tracked team

Additional page-only reads:

- sports:getStandings per league card
- sports:getEventDetails when expanded game panel opens

## Freshness and Accuracy Notes

1. Same-day cache gating only affects force false paths (not scheduled/manual force true refreshes).
2. Live-game minute loop is the fastest updater and only runs while live events exist.
3. Provider ID mismatches can occur between SportsDB and fallback providers; team event queries include name fallback matching to keep tracked-team cards populated.
4. Fallback provider calls are intentionally scoped to reduce refresh latency.

## Practical Summary

1. Normal background cadence: every poll interval (default 5 minutes), per sport.
2. High-frequency cadence: every 60 seconds, only while games are live.
3. Storage model: all event snapshots are persisted in sports_events and served from SQLite to both widget and Sports page.
4. UI model: dashboard and Sports page are read-only IPC clients over the same cached sports data.
