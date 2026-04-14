# Changelog

All notable changes to this project are documented in this file.

The format follows Keep a Changelog, and this project uses Semantic Versioning.

## [1.3.0] - 2026-04-14

### Added

- Added a customizable app title bar with native window controls and a notifications button for quicker access to unread alerts.
- Added a Sidebar settings tab that lets you reorder sidebar entries and hide optional sections without disabling their underlying features.
- Added a `Current + all` Weather widget display mode so one widget can show current conditions alongside both hourly and daily forecasts.
- Added a `No tags` filter in Saved Posts so you can quickly find items that still need tagging.

### Changed

- Improved the Reddit Digest page and widget column layouts so subreddit columns resize more naturally across available dashboard space.

### Fixed

- Tightened the Dashboard header layout and spacing to keep top-level controls more compact and usable.
- Polished the Sports widget refresh control for a more consistent inline action in the widget header.

## [1.2.0] - 2026-04-08

### Added

- Added a Weather widget with dashboard integration, shared location management, widget-level settings, and multiple compact forecast display modes.
- Added a Sports widget with tracked teams, league and event data, configurable widget views, and a Today games strip for quick access to live and upcoming matchups.
- Added dashboard view management, including creating, editing, duplicating, and deleting views, plus moving or copying widgets between views.
- Added editing for Saved Posts notes and tags, along with expanded saved-post actions and analytics handling.
- Added one-off subreddit syncs in Reddit Digest settings for manual refreshes on demand.

### Changed

- Expanded sports settings with configurable poll intervals, startup refresh staleness thresholds, clearer refresh success messages, and improved sport selection and widget defaults.
- Improved YouTube video handling with better livestream lifecycle support and database updates for video state management.
- Optimized weather hourly forecast mapping and indexing for more efficient weather data handling.
- Added dashboard icon mappings and supporting resources for broader icon coverage across the app.

### Fixed

- Fixed broken tray icon assets.
- Updated YouTube IPC refresh behavior so the app emits a post-check update event after channel checks complete.

## [1.1.0] - 2026-03-30

### Changed

- Consolidated Settings tabs by merging Features and App Behavior into a single General tab.
- Reorganized General settings into dedicated About, Features, and App Behavior sections for clearer navigation.
- Added backward compatibility for legacy settings query params (`tab=features` and `tab=app-behavior`) by mapping both to `tab=general`.

### Fixed

- Updated YouTube watched-state synchronization so per-channel watched counters update immediately when a video is opened or manually toggled watched/unwatched.
- Replaced broad watched-state refresh behavior with targeted state updates to prevent the visible widget refresh flash when changing watched status.
- Improved auto-update status handling with clearer user feedback and error messages.

## [1.0.0] - 2026-03-24

### Added

- Initial release of Personal News Dashboard as an Electron desktop app.
- Unified dashboard with configurable widget layout and drag-and-drop ordering.
- YouTube widget with channel management, RSS-based ingestion, and video/stream views.
- Reddit Digest widget for weekly top posts from selected subreddits.
- Saved Posts workflow using ntfy.sh ingestion for Reddit, X/Twitter, Bluesky, and generic links.
- Script Manager with manual and scheduled Python script execution, run history, and notifications.
- Local-first storage model using local persistence for settings and content.
- Optional desktop notifications, plus tray integration with close-to-tray and minimize-to-tray behavior.
- Build and packaging support for production installers and release workflow.
