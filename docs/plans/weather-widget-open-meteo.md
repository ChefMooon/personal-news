# Weather Widget Plan

Status: implemented baseline

## Scope

Add a new Weather widget backed by Open-Meteo with:

- shared saved locations
- per-widget inline settings following the widget settings spec
- app-level Weather settings for refresh cadence, display defaults, and alert thresholds
- threshold-based bad-weather alerts when official alert coverage is unavailable

## Implemented Baseline

- Main-process weather source module with Open-Meteo geocoding and forecast fetches
- SQLite persistence for saved locations, cached weather snapshots, and alert dedupe state
- Weather widget with instance-scoped settings
- Shared Weather settings tab in Settings
- Feature flag in General settings
- Weather alert desktop notification toggle in Notifications settings
- Temporary icon mapping using Lucide icons

## Widget Settings

- Location selection from shared saved locations
- Inline location search and add flow
- Detail level: `summary`, `standard`, `detailed`
- Display mode: `current`, `current_hourly`, `current_daily`
- Toggles for alerts, precipitation, wind, humidity, feels-like, sunrise/sunset

## App-Level Weather Settings

- Feature enabled toggle
- Poll interval
- Shared saved locations manager
- Default location
- Temperature, wind, and precipitation units
- Time format
- Show alerts in widgets
- Thresholds for rain, snow, wind, freeze, and heat
- Manual refresh and sync status

## Temporary Icon Strategy

The current implementation uses Lucide icons so the widget is usable immediately without external assets.

Current fallback mapping groups WMO weather codes into:

- clear day
- clear night
- partly cloudy day
- partly cloudy night
- cloudy
- fog
- drizzle
- rain
- snow
- thunderstorm
- unknown/cloud fallback

## Recommended SVG Inventory

If you want to replace the temporary icons with custom SVGs, this is the asset list to source:

- clear-day
- clear-night
- partly-cloudy-day
- partly-cloudy-night
- cloudy
- fog
- drizzle
- rain
- heavy-rain
- freezing-rain
- sleet
- snow
- heavy-snow
- thunderstorm
- thunderstorm-hail
- wind
- hail
- unknown

## Follow-Up Options

- Add official weather alert support where regional API coverage exists
- Replace temporary icon mapping with bundled SVG assets
- Add richer forecast sections or a future full-page weather route if needed