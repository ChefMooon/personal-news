# How to Maintain Onboarding and Feature Enablement

This guide helps future contributors maintain the first-run wizard and add,
update, or remove optional features without changing existing users' choices or
deleting their data.

Use this guide together with [HOW-TO-RUN.md](HOW-TO-RUN.md),
[HOW-TO-RELEASE.md](HOW-TO-RELEASE.md), [ui-ux.md](ui-ux.md), and the
[Playwright harness guide](../scripts/PLAYWRIGHT-HARNESS.md).

## 1. Wizard flow

The wizard is implemented in
[`src/renderer/src/components/onboarding/`](../src/renderer/src/components/onboarding/).
It has three parts:

1. **Pick:** users choose features. By default, features without a setup
   requirement are selected.
2. **Detail:** the wizard plans a skippable step for each selected feature.
   Weather and Astronomy share one location step; the other steps appear in a
   stable order.
3. **Finish:** the wizard summarizes enabled features as ready or needing setup,
   lists disabled features, and may offer the current release notes. Users can
   finish even when setup is incomplete.

The plan is centralized in
[`src/shared/onboarding-steps.ts`](../src/shared/onboarding-steps.ts).
Completing the wizard persists the selection and completion marker. Skipping
setup is an early exit, not a requirement to configure every selected feature.
The wizard has no close button; quitting before completion leaves the marker
incomplete so the wizard can appear again on the next eligible launch.

## 2. Fresh versus existing profiles

[`src/main/db/onboarding-baseline.ts`](../src/main/db/onboarding-baseline.ts)
checks for a `meta.schema_version` row and a `settings` table before migrations
run. A database with neither is fresh. The baseline writes
`onboarding_completed = "false"` for a fresh database and `"true"` for an
existing database that has no marker. It does not overwrite an existing marker.
This preserves existing users and ensures quitting during setup does not make a
fresh profile look like an existing one after its next launch.

[`src/main/onboarding/onboarding-state.ts`](../src/main/onboarding/onboarding-state.ts)
controls whether the wizard is eligible to show:

- Packaged launches enable onboarding mode.
- Unpackaged launches enable it only when
  `PERSONAL_NEWS_ONBOARDING=1`; normal development, browser preview, and
  Electron harness launches are off by default.
- A fresh profile in disabled mode is marked complete, so development fixture
  seeding does not later trigger the wizard.
- A fresh profile in enabled mode starts `youtube_enabled` and
  `saved_posts_enabled` as `"false"` before feature modules initialize.
- An existing profile is left untouched. Existing feature flags that are
  absent continue to use their manifest defaults.

The database baseline also initializes `features_seen_ids` for existing
manifest entries. Keep the completion marker, feature flags, and seen list out
of the generic settings allowlist unless the IPC policy explicitly calls for
them; onboarding state uses dedicated IPC handlers.

## 3. Feature manifest

[`src/shared/feature-manifest.ts`](../src/shared/feature-manifest.ts) is the
single source of truth for the six optional features. Each
`FeatureManifestEntry` field has a specific consumer:

| Field | Purpose |
| --- | --- |
| `id` | Stable feature identifier used by enablement, wizard, and widget code. |
| `displayName` | User-facing feature name. |
| `blurb` | Short description shown in the picker and feature list. |
| `needsSetup` | Whether the feature needs user-provided setup before it is useful; controls its default wizard selection. |
| `setupHint` | Optional explanation shown with a setup-needed label. |
| `enabledWhenUnset` | Default when no persisted flag exists. Keep this `false` for a newly added feature so existing users do not get it enabled by upgrade. |
| `settingsTabId` | Existing Settings tab value used for feature-specific settings links. |
| `storage` | Where the enabled state is persisted; its `kind` selects a generic setting or `astronomy_settings_json`, and its `key` names the persisted setting. |

The current ids are `youtube`, `reddit_digest`, `saved_posts`, `sports`,
`weather`, and `astronomy`. Scripts are always on and are not an optional
feature; do not add them to the manifest. The Astronomy entry uses the
`astronomy_settings_json` storage kind and key; its enabled flag is the
`enabled` field inside that JSON value.

## 4. Defaults and setup requirements

The pick step selects a feature if and only if `needsSetup` is `false`.
Currently YouTube and Saved Posts need setup and start unchecked; the other
four start checked. A `setupHint` explains the missing prerequisite, such as a
YouTube API key or the ntfy phone app and topic.

Do not confuse the wizard's default selection with the persisted default for
existing profiles. All current entries use `enabledWhenUnset: true`, preserving
the behavior of users whose settings predate a feature flag. A newly introduced
feature must use `enabledWhenUnset: false`.

## 5. Adding a feature

Add a feature consistently across persistence, runtime, renderer, onboarding,
and release notes:

1. Add its id and entry to `FEATURE_IDS` and `FEATURE_MANIFEST`, with every
   manifest field populated. Add tests for the entry and its default behavior.
2. Choose a persisted flag key and storage kind. For a setting-backed flag,
   allow the key in `genericSettingKeys` in
   [`src/main/security/ipc-policy.ts`](../src/main/security/ipc-policy.ts);
   do not allow onboarding-only markers there. Add the flag's IPC contract or
   reuse the existing typed settings contract as appropriate.
3. Add a renderer `XEnabledContext` and provider, wire the provider in
   `src/renderer/src/App.tsx`, then include the context in
   `src/renderer/src/hooks/useFeatureEnablement.ts`. Keep renderer access to
   main-process behavior behind typed IPC and the preload API.
4. Implement `applyXEnabled` beside the feature's main-process module and
   register it in
   [`src/main/features/register-feature-hooks.ts`](../src/main/features/register-feature-hooks.ts).
   The registration assertion requires a hook for every manifest id.
5. Gate the feature's notifications and every manual refresh or run entry
   point. The hook must stop and restart its background work when the flag
   changes. Do not delete feature data when disabling it.
6. Add the feature's widget footprint to
   [`src/shared/dashboard-grid.ts`](../src/shared/dashboard-grid.ts) when it
   has a dashboard widget. Verify hidden widgets retain their stored layout and
   data while disabled.
7. Add its detail step and selected-feature planning to
   [`src/shared/onboarding-steps.ts`](../src/shared/onboarding-steps.ts).
   Define its readiness rule in
   [`src/renderer/src/lib/onboardingReadiness.ts`](../src/renderer/src/lib/onboardingReadiness.ts)
   so Finish can report whether setup is complete.
8. Add its feature-specific Settings tab and manifest-driven Features-tab
   behavior. Use `settingsTabId` for links, and verify disabled features are
   hidden from the appropriate routes, navigation, and widget picker.
9. Add a plain-text `CHANGELOG.md` bullet explaining that the new feature is
   off by default for existing users. Follow the
   [release guide](HOW-TO-RELEASE.md): release-note bullets cannot contain
   Markdown formatting, links, URLs, or inline HTML.

## 6. Updating setup requirements

When a feature's required inputs change, update `needsSetup` and `setupHint` in
the manifest, the corresponding detail step and its step-planning tests, and
the feature's `getFeatureReadiness` rule. Check both the pick-step default and
the Finish summary after the change. Do not change `enabledWhenUnset` to
`true` for a new feature merely because its setup flow changed.

## 7. Removing a feature

Removing a feature from the product must not erase a user's configuration,
cached content, run history, or dashboard data. Stop its background work and
remove its UI and feature-specific behavior first; retain persisted rows and
data. Update the handling of `features_seen_ids` as needed, and remove the
feature's manifest entry last, after all consumers and registrations have been
updated. Never make the manifest removal itself a data-deletion mechanism.

## 8. New badge and What's New rules

The Features tab shows a "New" badge for manifest ids absent from
`features_seen_ids`. The initial baseline marks the existing manifest ids seen;
a feature added later is therefore new to existing profiles. The tab marks
shown ids seen when it is left. Missing or malformed seen-list data is treated
as all seen, not as a reason to show every badge.

The wizard's optional "What's in this version" action reads the current
release's bundled notes and does not acknowledge the separate post-update
What's New flow. Add user-facing release notes as plain-text CHANGELOG bullets
that pass the release-note validator. For every newly added feature, explicitly
say in that release's CHANGELOG that it starts off for existing users.

## 9. Testing and known gotchas

Use the isolated Electron harness for onboarding persistence and startup
behavior. To opt in a harness run, pass
`extraEnv: { PERSONAL_NEWS_ONBOARDING: "1" }` to `runElectronHarness`; do not
set the variable globally for unrelated tests. For an unpackaged development
run, set `PERSONAL_NEWS_ONBOARDING=1` in the environment before launching
`npm run dev`.

Renderer-browser scenarios use the `__rendererBrowserScenario` object. The
onboarding and feature-enablement mock keys are:

- `onboardingRequired` — opt the browser mock into showing the wizard.
- `unseenFeatureIds` — ids shown as new in the Features tab.
- `currentReleaseNotes` — release notes shown by the wizard's optional action.
- `dashboardViewsOverride` — deterministic dashboard layout for feature
  visibility scenarios.

Relevant scenarios are `npm run test:onboarding-browser`,
`npm run test:feature-enablement-browser`, and `npm run test:onboarding`.
These scripts and the mock keys are defined in `package.json`,
`scripts/renderer-browser-api.mjs`, and the corresponding test scripts.
Development fixture seed/reset paths write some feature flags directly, so
their in-process modules are not synchronized through the enablement
dispatcher; restart the app after changing fixture state.

The Saved Posts setup flow embeds
[`NtfyOnboardingWizard.tsx`](../src/renderer/src/modules/saved-posts/NtfyOnboardingWizard.tsx).
Known behavior: Test Connection persists `ntfy_topic` and `ntfy_server_url`
before the user selects Done. The onboarding step's topic status reflects
persisted state, so do not assume testing a connection leaves settings
unchanged.

## Common Mistakes

- Using the wrong feature default rule: a feature is selected iff `needsSetup` is false.
- Forgetting `enabledWhenUnset: false` for a new feature.
- Adding a feature without a hook so `assertAllFeatureHooksRegistered` throws at startup.
- Writing flags directly in the database and bypassing the dispatcher (dev fixtures do this).
- Adding `onboarding_completed` or `features_seen_ids` to `genericSettingKeys`.
- Using `npm run lint` as a check; its script passes `--fix` and rewrites files.
- Adding backticks, bold, or links to CHANGELOG bullets; `validateReleaseNotesMarkdown` rejects them.

## Quick verification

Run the focused checks that cover the changed surface:

```powershell
npm test -- changelog-notes
npm test -- onboarding
npm run test:feature-enablement-browser
npm run test:onboarding-browser
npm run test:onboarding
npm run typecheck
```

Use `npm run test:renderer-browser` when renderer changes affect the broader
dashboard and Settings matrix, and `npm run build` for a production build
check. Follow the test isolation guidance in
[`HOW-TO-RUN.md`](HOW-TO-RUN.md); never use the live production database for
tests or test writes.
