# Personal News Dashboard

An Electron desktop application that brings YouTube, Reddit, saved links, and managed scripts into one configurable local-first dashboard.

## Features

- **Unified Dashboard** — View all your content sources in one place with a customizable layout
- **YouTube Integration** — Browse recent videos and live streams from configured channels via RSS, with zero-API-call overhead for unchanged content
- **Reddit Digest** — Weekly top posts from your favorite subreddits
- **Saved Posts** — Save Reddit, X/Twitter, Bluesky, and other links from mobile via ntfy.sh and review them in the dashboard
- **Script Manager** — Run Python scripts manually or on a schedule; view output and run history
- **Weather** — Track current conditions and forecasts for saved locations with per-widget display settings and threshold-based bad-weather alerts
- **Notifications and Tray** — Optional desktop notifications plus configurable close-to-tray and minimize-to-tray behavior
- **Drag-and-Drop Layout** — Customize your dashboard by reordering widgets
- **Local-First** — All data is stored locally; no cloud sync or external accounts required (except API keys for data sources)

## Prerequisites

- **Windows 10+**, macOS 10.15+, or Linux (Ubuntu 16.04+)
- **API Keys** (required to configure data sources):
  - [YouTube Data API v3 key](https://developers.google.com/youtube/registering_an_application) (for YouTube channels)
  - [ntfy.sh topic](https://ntfy.sh/docs/subscribe/#web) (for saving links from mobile)
  - No Reddit API key needed (public API access only)

## Installation

1. Download the latest installer from [GitHub Releases](https://github.com/ChefMooon/personal-news/releases)
2. Run the installer (`Personal News-*.exe` on Windows, `.dmg` on macOS, `.deb` or AppImage on Linux)
3. Launch the app — it will open to the Dashboard

## First-Run Setup

1. **YouTube** — Enter your YouTube Data API v3 key, then add channel names or URLs
2. **Reddit** — Add subreddit names (e.g., `python`, `learnprogramming`)
3. **Saved Posts** — Use the in-app ntfy.sh setup flow to send Reddit posts or other links from your phone into the app
4. **Weather** (optional) — Add saved locations, set refresh frequency, and configure threshold-based alerts
5. **Scripts** (optional) — Register Python scripts to run on a schedule or manually

Once configured, your dashboard will populate with content from all enabled sources.

## Daily Use

1. Open the app — your dashboard loads with the latest content from each source
2. Click any content card to open it in your default browser
3. Drag widgets to rearrange your layout (saved automatically)
4. Enable or disable sources in Settings → Features to show/hide them without losing configuration
5. Check Saved Posts or run Scripts from the left menu

## Configuration

All settings are stored locally in the app. To reconfigure:

- **Settings** → Enter or update API keys and per-source options
- **YouTube Settings** → Enable/disable individual channels, adjust RSS polling interval
- **Reddit Digest** → Manage tracked subreddits, week start day, and stored digest records
- **Saved Posts Settings** → Manage your ntfy.sh topic and optional custom server URL
- **Weather Settings** → Manage saved locations, refresh interval, units, and alert thresholds
- **Script Manager** → Register scripts, adjust schedule intervals, view run history

## Troubleshooting

**Dashboard is empty**  
→ Check that at least one source is configured in Settings. Ensure API keys are valid and content exists in those sources.

**YouTube widget shows nothing**  
→ Verify your YouTube Data API v3 key and that you have added valid channel names. Check that channels are enabled (toggle in YouTube Settings).

**Saved Posts not updating**  
→ The app polls ntfy.sh on startup and on a configurable interval afterward. Use the warning's "Sync Now" button or check that your phone is sending messages to the configured topic.

**Scripts not running**  
→ Verify the script path is valid and the file is executable. Check the run history in Script Manager for error output.

## Documentation

- [Changelog](CHANGELOG.md) — Release history and tracked updates
- [Architecture Overview](docs/architecture/overview.md) — System design and data flows
- [Data Sources Reference](docs/data-sources.md) — Detailed configuration for each source
- [How to Build, Package, and Release](docs/HOW-TO-RUN.md) — Source setup plus the verified Windows release workflow
- [Product Specification](docs/PRD.md) — Current product scope and requirements

## Asset Maintenance

- Run `npm run generate:icons` after updating `resources/icon.svg` to regenerate every non-tray app, favicon, manifest, and installer icon.
- Tray icons under `resources/tray/` are maintained separately and are not touched by the generator.

## Support

Found a bug or have a feature request? [Open an issue](https://github.com/ChefMooon/personal-news/issues).

## License

[MIT](LICENSE)
