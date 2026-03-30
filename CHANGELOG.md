# Changelog

All notable changes to this project are documented in this file.

The format follows Keep a Changelog, and this project uses Semantic Versioning.

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
