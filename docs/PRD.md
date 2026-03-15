# Product Requirements Document — Personal News Dashboard

**Project:** personal-news
**Status:** Draft
**Last Updated:** 2026-03-15 (rev 6)
**Related Docs:** [data-sources.md](./data-sources.md) | [ui-ux.md](./ui-ux.md) | [tech-notes.md](./tech-notes.md)

---

## 1. Overview

Personal News Dashboard is a distributable Electron desktop application that aggregates information from multiple data sources — YouTube channels, Reddit, personal scripts, and others — into a single configurable dashboard. Users decide which sources to enable, how the dashboard is laid out, and how each source is configured.

---

## 2. Problem Statement

Information about things a person cares about is spread across multiple platforms, each with its own interface, notification system, and algorithm. Checking YouTube, Reddit, and other sources individually is time-consuming and easy to miss. There is no single place to see "everything new that matters to me" in a layout the user controls.

---

## 3. Goals

- Provide a unified dashboard for personally relevant information from multiple sources.
- Allow users to decide exactly which sources are active and how they are displayed.
- Minimize external API usage through smart caching and RSS-first strategies.
- Support extension: adding new data sources should require minimal changes to core app code.
- Be distributable — other users should be able to install and configure the app for their own sources.

---

## 4. Non-Goals (Out of Scope for v1)

- Mobile or web versions — desktop only.
- Social features, sharing, or multi-user sync.
- Building a general-purpose RSS reader (sources are purpose-built integrations, not arbitrary feeds).
- Notifications or system tray alerts — deferred to v2.
- Monetization or account system.

---

## 5. Users

**Primary user:** An individual who follows content on YouTube and Reddit and wants a personal at-a-glance dashboard. Technically comfortable enough to obtain API keys and configure a settings screen.

**Distribution:** The app is designed to be installed by others. Each user configures their own API keys, data sources, and layout. No shared backend — all data is local.

---

## 6. User Stories

### Core Dashboard

| ID | As a user, I want to... | So that... |
|----|------------------------|------------|
| US-01 | See all my configured data sources on one screen | I don't have to visit each platform individually |
| US-02 | Rearrange widgets via drag and drop | The layout reflects my priorities |
| US-03 | Toggle individual data sources on or off | I can declutter the dashboard without losing configuration |
| US-04 | Open any linked content in my default browser | I can consume it in full without leaving my workflow |

### YouTube

| ID | As a user, I want to... | So that... |
|----|------------------------|------------|
| US-05 | See a row per YouTube channel I follow | I can scan channels at a glance |
| US-06 | See upcoming live streams with time-until-start | I don't miss scheduled streams |
| US-07 | Browse recent videos in a horizontal carousel | I can quickly find new uploads |
| US-08 | Have the app minimize YouTube v3 API calls | I don't exhaust my API quota |

### Reddit

| ID | As a user, I want to... | So that... |
|----|------------------------|------------|
| US-09 | View a weekly digest of top posts from configured subreddits | I stay informed without doomscrolling |
| US-10 | Save any Reddit post from my phone by sharing its URL to a private ntfy.sh topic | I can capture interesting posts while browsing on mobile without any extra app |
| US-11 | View and search my saved posts inside the dashboard | I can reference them later |
| US-17 | Be guided through ntfy.sh setup with a first-run onboarding flow | I can get mobile saving working without reading external documentation |
| US-18 | See a warning when the app hasn't polled my ntfy topic in over 24 hours | I know I may have missed saved posts before messages expired |

### Script Manager

| ID | As a user, I want to... | So that... |
|----|------------------------|------------|
| US-12 | Register Python scripts with the app | The app can manage data-gathering tasks centrally |
| US-13 | Run scripts manually or on a schedule | Data is collected when I want it |
| US-14 | View script output and run history | I can confirm scripts ran successfully and debug failures |
| US-19 | See a warning when a scheduled script is overdue | I know my data may be stale when the app was closed during a scheduled run window |

### Settings

| ID | As a user, I want to... | So that... |
|----|------------------------|------------|
| US-15 | Enter and save API keys in a settings screen | I don't have to edit config files manually |
| US-16 | Configure per-source options (channels, subreddits, etc.) | Each widget shows what I care about |

---

## 7. Functional Requirements

### 7.1 Dashboard

- FR-01: The dashboard shall display one widget per enabled data source.
- FR-02: Widget position shall be persisted between app restarts.
- FR-03: Users shall be able to toggle each source on/off without removing its configuration.
- FR-04: All external links shall open in the system default browser, not inside the app.

### 7.2 YouTube Widget

- FR-05: The YouTube widget shall display one row per configured channel.
- FR-06: Each row shall show a live stream card (if one is upcoming or in progress) on the left.
- FR-07: Live stream cards shall display the stream title, thumbnail, and time until start (or "LIVE" if in progress).
- FR-08: Each row shall show a horizontally scrollable carousel of recent videos on the right.
- FR-09: The app shall use RSS feeds as the primary source for video discovery.
- FR-10: The app shall only call the YouTube Data API v3 when new content is detected via RSS and additional metadata is required.
- FR-28: Each configured channel shall have an individual enabled/disabled toggle. Disabled channels are hidden from the dashboard but retain their configuration and cached data. The toggle shall be accessible from the channel row controls and from the YouTube Settings section.
- FR-29: The RSS polling interval shall be user-configurable via the Settings screen. The default interval is 15 minutes. The setting shall be stored in the `settings` table under the key `rss_poll_interval_minutes`.

### 7.3 Reddit Digest Widget

- FR-11: The Reddit digest shall display top posts per configured subreddit for a configurable time window (default: past 7 days).
- FR-12: Post data shall be collected by a managed script, not by real-time API calls from the UI.

### 7.4 Saved Posts

- FR-13: On startup, the app shall poll a user-configured ntfy.sh topic for new messages and ingest any Reddit URLs found as saved posts.
- FR-14: Ingested URLs shall be fetched and stored with title, URL, subreddit, author, and timestamp.
- FR-15: Saved posts shall be viewable and searchable within the dashboard.
- FR-16: Saved posts shall support manual tagging in v1.
- FR-25: The app shall provide a guided first-run onboarding flow for ntfy.sh setup. The flow shall trigger the first time the user navigates to Saved Posts (or the ntfy Settings section) with no topic configured. See ui-ux.md Section 8.4 for the full flow spec.
- FR-26: If the time elapsed since the last successful ntfy poll exceeds 24 hours, the app shall display a visible warning informing the user that messages may have expired and they may have missed saved posts. The warning shall include the timestamp of the last successful poll and a button to dismiss or manually re-poll.

### 7.5 Script Manager

- FR-17: Users shall be able to register Python scripts by providing a file path. The interpreter is fixed to `python3` in v1. The module interface shall be designed to support additional interpreters in future versions without structural changes.
- FR-18: Scripts shall be runnable manually via the UI.
- FR-19: Scripts shall support scheduled execution (cron-style interval or fixed time).
- FR-20: Script stdout/stderr shall be captured and displayed in the UI.
- FR-21: Run history (timestamp, exit code, truncated output) shall be persisted in the local database.
- FR-27: For scripts with an interval or fixed-time schedule, the app shall display a stale warning when the elapsed time since the last successful run exceeds one full schedule interval. The warning shall show the last run timestamp, a human-readable staleness description (e.g., "last ran 3 days ago"), and a Run Now action. Scripts configured as manual-only or on-app-start shall not trigger this warning. See ui-ux.md Section 7.4 for the visual spec.

### 7.6 Settings

- FR-22: The settings screen shall provide fields for all required API keys and external service configuration (YouTube Data API v3 key, ntfy.sh topic name, and optional custom ntfy server URL).
- FR-23: The YouTube Data API v3 key shall be stored using Electron's `safeStorage` API — not plaintext. The ntfy topic name and ntfy server URL are not credentials and shall be stored as plain text values in the `settings` table.
- FR-24: Per-source configuration (channel list, subreddit list, script paths) shall be stored in the local SQLite database.

---

## 8. Non-Functional Requirements

- NFR-01: The app shall start and render the dashboard in under 3 seconds on a modern machine.
- NFR-02: Background data refresh shall not block or degrade UI responsiveness.
- NFR-03: The app shall function fully offline for previously cached data.
- NFR-04: Adding a new data source module shall not require changes to core dashboard or layout code.
- NFR-05: The app shall be packaged and installable on Windows, macOS, and Linux via electron-builder.

---

## 9. Open Questions

| # | Question | Impact | Status |
|---|----------|--------|--------|
| OQ-01 | Should individual YouTube channels be toggle-able on/off in v1? | Scope of FR-28 | **Resolved: Yes, per-channel toggle required in v1. Deferred: system tray/notifications to v2.** |
| OQ-02 | Should saved posts support tags/folders in v1? | Scope of FR-16 | **Resolved: Yes, tags required in v1.** |
| OQ-03 | What is the credential storage mechanism? | Security, tech-notes.md | **Resolved: `safeStorage` for YouTube API key only. ntfy topic name and server URL stored as plain text in `settings` table.** |
| OQ-04 | Is Reddit API auth (OAuth) required for the digest script, or is public API access sufficient? | Data Sources | **Resolved: Public Reddit JSON API only. No OAuth, no user login required. Scoped to public subreddits.** |
| OQ-05 | Should the Script Manager support non-Python scripts in v1? | Scope of FR-17 | **Resolved: Python only in v1. Interface must be extensible.** |
| OQ-06 | What is the refresh interval for YouTube RSS polling? (User-configurable or fixed?) | FR-29, API strategy | **Resolved: User-configurable. Default 15 minutes. Stored in `settings` table as `rss_poll_interval_minutes`.** |
| TD-07 | Show a warning when ntfy poll is stale (>24h)? | FR-26 | **Resolved: Yes, warning required in v1.** |
| TD-08 | Support custom ntfy server URL in v1 Settings? | FR-22, FR-25 | **Resolved: Yes, supported in v1 with onboarding flow.** |
