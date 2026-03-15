# UI/UX Design Spec — Personal News Dashboard

**Project:** personal-news
**Status:** Draft
**Last Updated:** 2026-03-15 (rev 7)
**Related Docs:** [PRD.md](./PRD.md) | [data-sources.md](./data-sources.md) | [tech-notes.md](./tech-notes.md)

---

## 1. Design Principles

- **Information density over decoration.** This is a personal dashboard, not a marketing page. Show more content, fewer chrome elements.
- **User-controlled layout.** The app should reflect the user's priorities, not impose a fixed structure.
- **Non-intrusive.** The app should not demand attention. No mandatory notifications, no forced onboarding on the main dashboard. Features that require external service configuration (e.g., ntfy.sh) may present a guided setup flow when first accessed — but only then, and only for that feature.
- **Fast perceived performance.** Render cached data immediately; update in place when fresh data arrives. Never show a blank screen while loading.

---

## 2. Application Shell

The app has four top-level sections, navigated via a **collapsible left sidebar**. The sidebar maximizes vertical content space on the dashboard. It has two states: expanded (200px, shows icon + label) and collapsed (56px, icon only). The active item is highlighted.

| Section | Description |
|---------|-------------|
| Dashboard | Main view — all enabled widgets in user-arranged layout |
| Saved Posts | List/search view for Reddit posts saved via ntfy.sh |
| Script Manager | Register, run, schedule, and view output for scripts. Nav item shows a subtle badge when one or more scheduled scripts are stale. |
| Settings | API keys, per-source config, app preferences |

---

## 3. Dashboard View

### 3.1 Layout Model

- The dashboard is a vertical stack of **widgets**.
- Each widget occupies the full width of the content area.
- Users can **reorder widgets** by drag and drop (vertical axis).
- Users can **toggle widgets** on/off via the Settings screen or a quick-toggle control on the dashboard (e.g., an edit mode toggle that reveals hide/show controls per widget).
- Widget order and visibility state are persisted between app restarts.

### 3.2 Dashboard Edit Mode

- A button (e.g., "Edit Layout") activates edit mode.
- In edit mode, drag handles appear on each widget. Widgets can be reordered.
- Each widget gains a toggle (eye icon or checkbox) to show/hide it.
- Exiting edit mode saves the layout.

### 3.3 Empty State

If no sources are configured, the dashboard shows a prompt directing the user to Settings to add their first source.

---

## 4. YouTube Widget

### 4.1 Widget Structure

The YouTube widget contains one **channel row** per configured channel. Channel rows are stacked vertically within the widget.

```
+------------------------------------------------------------+
|  YouTube                                           [gear]  |
+------------------------------------------------------------+
|  [Channel Thumbnail] Channel Name                          |
|  +---------------------+  +-----------------------------+  |
|  |  UPCOMING STREAMS   |  |  RECENT VIDEOS (carousel)   |  |
|  |                     |  |                    < scroll> |  |
|  |  [thumb] Stream 1   |  |  [v1] [v2] [v3] [v4] ...   |  |
|  |  Starts in 2h 14m   |  |                             |  |
|  |                     |  |                             |  |
|  |  [thumb] Stream 2   |  |                             |  |
|  |  LIVE NOW           |  |                             |  |
|  +---------------------+  +-----------------------------+  |
+------------------------------------------------------------+
|  [Channel Thumbnail] Channel Name 2                        |
|  ...                                                       |
+------------------------------------------------------------+
```

### 4.2 Left Panel — Live Streams

- Shows all upcoming and currently live streams for that channel.
- Each stream card displays:
  - Stream thumbnail
  - Stream title (truncated to 2 lines)
  - Status badge: "LIVE NOW" (red) or "Starts in Xh Ym" (neutral)
- Cards are sorted ascending by scheduled start time (soonest first).
- "LIVE NOW" streams always sort to the top.
- If no upcoming or live streams exist, the left panel is hidden or shows a minimal "No upcoming streams" placeholder.
- Clicking a stream card opens the YouTube URL in the default browser.

### 4.3 Right Panel — Recent Videos Carousel

- Horizontally scrollable row of video cards.
- Each video card displays:
  - Thumbnail (fixed aspect ratio 16:9)
  - Title (truncated to 2 lines)
  - Published date (relative: "3 days ago")
- Cards scroll left/right. Scroll arrows appear on hover.
- Clicking a video card opens the YouTube URL in the default browser.
- Assumed: 15–20 most recent videos per channel are shown (limited by RSS feed size).

### 4.4 Channel Row Controls

A gear icon on each channel row opens an inline config popover or modal containing:

- **Enable/Disable toggle** — hides or shows this channel's row on the dashboard without removing the channel or its cached data. When disabled, the row is absent from the dashboard but the channel remains listed in Settings. This is the primary way to temporarily hide a channel.
- **Remove channel** — permanently removes the channel and its cached data. Requires confirmation.
- Display preferences (future: e.g., number of videos shown in carousel).

The enabled/disabled state is also accessible from the YouTube section of the Settings screen as a list with toggles, so users can manage multiple channels at once without visiting the dashboard.

---

## 5. Reddit Digest Widget

### 5.1 Widget Structure

```
+------------------------------------------------------------+
|  Reddit Digest                                     [gear]  |
|  Last updated: Today at 06:00    [Sort: Score ▾] [Columns] |
+------------------------------------------------------------+
|  r/subreddit1          r/subreddit2          r/subreddit3  |
|  +------------------+  +-----------------+  +-----------+  |
|  | Post title here  |  | Post title here |  | ...       |  |
|  | 1.2k upvotes     |  | 834 upvotes     |  |           |  |
|  | 243 comments     |  | 97 comments     |  |           |  |
|  +------------------+  +-----------------+  +-----------+  |
|  | Post title here  |  | ...             |                  |
|  | ...              |                                       |
+------------------------------------------------------------+
```

- Each post shows: title (linked), score, comment count, age.
- Clicking a post title opens the Reddit permalink in the default browser.
- A "Last updated" timestamp shows when the digest script last ran.
- If the script has never run, the widget shows a prompt to run it for the first time.

### 5.2 Sorting

Posts within each subreddit (or within a grouped view) can be sorted by any of the following fields:

| Sort field | Label | Direction |
|------------|-------|-----------|
| `score` | Score | Descending (default) |
| `num_comments` | Comments | Descending |
| `created_utc` | Age | Descending (newest first) |
| `fetched_at` | Date collected | Descending |

The active sort field and direction are shown in the widget header as a small dropdown control (e.g., "Sort: Score ▾"). The sort preference is per-widget and is persisted in the `reddit_digest_view_config` settings key (see Section 5.5).

### 5.3 Grouping

Posts can be grouped by:

| Group by | Behaviour |
|----------|-----------|
| `subreddit` (default) | One column (or tab) per subreddit |
| `none` | All posts in a single flat list, sorted by the active sort field |

Grouping and layout mode are independent axes: a user can have grouped columns, grouped tabs, or a flat list in either layout mode.

### 5.4 Layout Mode

The widget supports two layout modes, toggled by a control in the widget header:

| Mode | Description |
|------|-------------|
| **Columns** (default) | Subreddits rendered in a CSS grid of columns. Column count is auto-fit based on widget width (`minmax(220px, 1fr)`). Suitable for 2–5 subreddits. |
| **Tabs** | Subreddits rendered as shadcn `Tabs`. One tab per subreddit (or "All" tab when group_by is `none`). Suitable for many subreddits (6+). |

Layout mode is preserved per-widget in `reddit_digest_view_config`.

### 5.5 View Config Persistence

The full view configuration for the Reddit Digest widget is stored as a JSON value under the settings key `reddit_digest_view_config`:

```json
{
  "sort_by": "score",
  "sort_dir": "desc",
  "group_by": "subreddit",
  "layout_mode": "columns"
}
```

Defaults (applied if the key is missing or any field is absent):
- `sort_by`: `"score"`
- `sort_dir`: `"desc"`
- `group_by`: `"subreddit"`
- `layout_mode`: `"columns"`

This config is read and written via `settings:get` / `settings:set` using the `reddit_digest_view_config` key. No separate IPC channel is needed — it is a plain settings value. The widget reads it on mount and writes it on any control interaction.

---

## 6. Saved Posts

Saved Posts exist in two places:

1. **Dashboard widget (`SavedPostsWidget`)** — a compact at-a-glance summary on the dashboard, showing the N most recently saved posts with title, subreddit, and saved date. No filtering or search. Clicking any post opens the Reddit permalink in the default browser. Clicking a "View All" link navigates to the full Saved Posts route.
2. **Full-page view (`/saved-posts` route)** — the complete list/search/tag management experience described in the sections below.

Both are registered as a module in the widget registry (module ID: `saved_posts`), so the dashboard widget can be shown/hidden and reordered alongside YouTube and Reddit Digest.

### SavedPostsWidget (Dashboard)

```
+------------------------------------------------------------+
|  Saved Posts                                   [View All]  |
+------------------------------------------------------------+
|  r/rust  •  Why Rust async is finally good      2h ago    |
|  r/programming  •  I built a news dashboard     1d ago    |
|  r/golang  •  New generics patterns in Go 1.22  3d ago    |
|  ...  (up to 5 most recent posts)                          |
+------------------------------------------------------------+
```

- Shows up to 5 most recently saved posts.
- Each row: subreddit chip, title (linked), relative saved date.
- If ntfy is not configured, the widget shows a "Set up mobile saving" prompt with a link to Settings.
- "View All" link in the widget header navigates to `/saved-posts`.

Posts are ingested from a user-configured ntfy.sh topic on app startup. See [data-sources.md](./data-sources.md) Section 3 for the ingestion flow.

### 6.0 Stale Poll Warning

If the last successful ntfy poll was more than 24 hours ago, a non-blocking warning banner appears at the top of the Saved Posts view:

```
+------------------------------------------------------------+
|  [!] Last synced: 3 days ago. Messages on ntfy.sh expire  |
|  after 24 hours — some saved posts may have been lost.    |
|  [Sync Now]  [Dismiss]                                    |
+------------------------------------------------------------+
```

- "Sync Now" triggers an immediate ntfy poll (`reddit:pollNtfy` IPC call) and dismisses the banner on success.
- "Dismiss" hides the banner for the current session only. It reappears on next launch if the condition still holds.
- The warning is informational, not blocking — the rest of the view remains fully usable.
- The banner is not shown if ntfy is not configured (the onboarding flow is shown instead — see Section 8.4).

### 6.1 Layout

- A list/card view of all saved posts, sorted by saved date (newest first).
- Each entry shows: title, subreddit, author, score, saved date, tags (if any).
- Clicking a post opens the Reddit permalink in the default browser.

### 6.2 Search and Filter

- A search bar filters by title text.
- Filter controls: by subreddit, by tag, by date range.
- Assumed: client-side search over SQLite (FTS5 or simple LIKE query) — no external search service.

### 6.3 Tags

- Tags are required in v1.
- Users can apply one or more text tags to any saved post inline from the post card.
- Tags are displayed as small chips on each post card.
- Filtering by tag shows all posts with that tag.
- Tag management (rename, delete) is a v1 requirement — a tag management panel should be accessible from the Saved Posts view (e.g., a "Manage Tags" button that opens a modal listing all tags with rename and delete actions).

---

## 7. Script Manager View

### 7.1 Layout

- A list of registered scripts with name, schedule, last run time, and last exit code.
- Each row has: Run Now button, Edit button, Delete button.
- A status indicator reflects the last run result and staleness state (see Section 7.4 for staleness rules):
  - **Green** — last run succeeded and script is not stale.
  - **Red** — last run failed (non-zero exit code).
  - **Amber** — script is stale (scheduled but overdue; see Section 7.4).
  - **Grey** — script has never run, or is manual-only with no run history.

### 7.2 Script Detail / Edit Panel

Opens when a script row is clicked or Edit is pressed. Contains:
- Display name (editable)
- File path (editable, `.py` files only in v1)
- Interpreter (read-only display: `python3` — not user-editable in v1)
- Arguments (editable)
- Schedule configuration (radio: Manual / On app start / Every N minutes / Daily at time)
- Output history: a list of past runs with timestamp, duration, exit code, and an expandable output pane.

### 7.3 Live Output

When a script is running:
- The output pane shows a live-scrolling stdout/stderr stream.
- A "Running..." indicator and cancel button are shown.

### 7.4 Stale Script Warning

Applies to scripts with an **interval** or **fixed-time** schedule only. Scripts configured as manual-only or on-app-start do not show this warning. See data-sources.md Section 4.3a for the staleness threshold logic.

**Script list row — stale state:**

```
+------------------------------------------------------------+
|  [!] Reddit Digest          Daily at 06:00                |
|      Last ran: 3 days ago                    [Run Now]    |
+------------------------------------------------------------+
```

- The amber `[!]` indicator replaces the green status dot.
- "Last ran: X days/hours ago" is shown inline on the row (replaces the normal last-run timestamp display).
- A "Run Now" button appears directly on the row — no need to open the detail panel to act on the warning.
- "Run Now" triggers immediate execution. On successful completion (exit code 0), the amber indicator clears and the row returns to green.
- If the script has never run and has a schedule configured, the row shows "Never run" in place of a timestamp.

**Script detail panel — stale state:**

When a stale script's detail panel is open, the staleness information is shown prominently above the run history:

```
+------------------------------------------------------------+
|  [!] This script is overdue.                              |
|  Last successful run: Wednesday at 06:00 (3 days ago)     |
|  Scheduled: Daily at 06:00                                |
|                                        [Run Now]          |
+------------------------------------------------------------+
|  Run History                                              |
|  ...                                                      |
+------------------------------------------------------------+
```

**Nav item badge:**

When one or more scripts are stale, the Script Manager nav item shows a small amber dot badge. The badge clears when all stale scripts either run successfully or have their schedule removed/changed to manual. The badge does not show a count — it is a presence indicator only.

```
  Script Manager  •
```

The badge is subtle (small dot, not a numbered chip) to respect the non-intrusive design principle — it signals "something needs attention" without demanding immediate action.

---

## 8. Settings View

### 8.1 Sections

| Section | Contents |
|---------|----------|
| API Keys | YouTube Data API v3 key; fields are masked by default with a "reveal" toggle |
| YouTube | List of configured channels — add by channel URL or ID; per-channel enabled/disabled toggle; remove channel; RSS poll interval (minutes) |
| Reddit Digest | List of configured subreddits — add/remove; time window setting (week/month/all) |
| Saved Posts | ntfy.sh topic name (plain text input); optional custom ntfy server URL (plain text) |
| Appearance | Theme selector: System Default, Light, Dark. Custom themes (future) are extensible via the `themes` table — see data-model.md §2.9. |

### 8.2 API Key Fields

- Input fields for secrets are type `password` by default.
- A "Show" toggle reveals the value.
- On save, the key is stored in secure local storage (see tech-notes.md).
- A "Test" button validates the key by making a minimal API call.

### 8.3 ntfy.sh Configuration (Settings — Saved Posts Section)

Once ntfy is configured, the Saved Posts settings section shows:

- **Topic name** — plain text field displaying the saved topic name. An "Edit" button re-enters the onboarding flow (Section 8.4) pre-filled with current values.
- **Server URL** — read-only display of the active server (e.g., `https://ntfy.sh`). An "Edit" button allows changing it. Defaults to `https://ntfy.sh` if blank.
- **Last synced** — timestamp of the last successful poll, e.g., "Today at 08:42" or "3 days ago." If more than 24 hours ago, shown in amber with the warning text from Section 6.0.
- **Test Connection** button — sends a single poll request and reports success or failure inline (e.g., "Connected — 0 new messages" or an error message).
- **Mobile Setup Guide** button — opens the phone setup guide panel (Section 8.4, Step 4) so the user can revisit the iOS/Android instructions at any time without re-running the full onboarding.

### 8.4 ntfy.sh First-Run Onboarding Flow

**Trigger:** The onboarding flow opens automatically the first time the user visits the Saved Posts section (or the Saved Posts settings subsection) and no ntfy topic has been configured. It can also be re-entered from Settings (Section 8.3).

The flow is presented as a **multi-step modal or full-pane wizard** with forward/back navigation and a step indicator. Each step fits on a single screen without scrolling.

---

**Step 1 — What is ntfy.sh?**

```
+------------------------------------------------------------+
|  Set Up Mobile Post Saving                     [1 of 4]   |
+------------------------------------------------------------+
|                                                            |
|  ntfy.sh is a free, open-source notification service.     |
|  You'll use it as a private message channel between your  |
|  phone and this app.                                       |
|                                                            |
|  When you find a Reddit post on your phone, you share     |
|  its URL to your private ntfy topic. This app checks      |
|  that topic every time it opens and saves any new posts   |
|  automatically.                                           |
|                                                            |
|  No account required on ntfy.sh. Anyone who knows your   |
|  topic name can post to it, so use a long random name.   |
|                                                            |
|  [Skip Setup]                           [Next ->]         |
+------------------------------------------------------------+
```

- "Skip Setup" closes the modal and shows the empty Saved Posts view with a persistent "Set up mobile saving" prompt in the header.

---

**Step 2 — Choose Your Topic**

```
+------------------------------------------------------------+
|  Choose a Topic Name                           [2 of 4]   |
+------------------------------------------------------------+
|                                                            |
|  Your topic name is your private channel. Make it long    |
|  and random so no one else can guess it.                  |
|                                                            |
|  Topic name:  [  xK9mQr4vLpTw8nZj2cY  ]  [Regenerate]   |
|                                                            |
|  Server URL (optional):                                   |
|  [  https://ntfy.sh                    ]                  |
|  Leave blank to use ntfy.sh. Enter your own server URL    |
|  if you self-host ntfy.                                   |
|                                                            |
|  [!] Note: ntfy.sh retains messages for 24 hours.        |
|  If you don't open this app for more than 24 hours,       |
|  posts shared during that window may be lost. To avoid    |
|  this, consider self-hosting ntfy (see ntfy docs).        |
|                                                            |
|  [<- Back]                              [Next ->]         |
+------------------------------------------------------------+
```

- The topic name field is pre-populated with a randomly generated 20-character alphanumeric string.
- "Regenerate" replaces it with a new random value.
- The user can type a custom topic name if they prefer.
- Server URL defaults to `https://ntfy.sh`. If modified, basic URL validation is applied (must be `https://`, non-empty host).
- The 24-hour retention notice is always visible on this step — it is part of informed setup, not a warning the user has to go looking for.
- "Next" is disabled until the topic name field is non-empty.

---

**Step 3 — Test the Connection**

```
+------------------------------------------------------------+
|  Test Your Topic                               [3 of 4]   |
+------------------------------------------------------------+
|                                                            |
|  Let's make sure the app can reach your topic.            |
|                                                            |
|  Your topic:  xK9mQr4vLpTw8nZj2cY                        |
|  Server:      https://ntfy.sh                             |
|                                                            |
|  [Test Connection]                                        |
|                                                            |
|  -- Before testing: --                                    |
|  On your phone, send a test message to your topic now.   |
|  Open the ntfy app (or use curl) and publish any text    |
|  to:  https://ntfy.sh/xK9mQr4vLpTw8nZj2cY  [Copy]       |
|                                                            |
|  Result: (waiting for test...)                            |
|                                                            |
|  [<- Back]                   [Skip Test]  [Next ->]       |
+------------------------------------------------------------+
```

- "Test Connection" polls the topic and reports the result inline:
  - Success with messages present: "Connected — 1 message received."
  - Success with no messages: "Connected — no messages yet. Send a test message from your phone and try again."
  - Failure: "Could not reach [server]. Check the URL and your internet connection."
- "Next" is enabled immediately (the test is not mandatory). "Skip Test" navigates to Step 4 without testing.
- The topic URL is shown in a copyable code block so the user can paste it into their phone's ntfy app or a curl command to send a test message.

---

**Step 4 — Phone Setup Guide**

```
+------------------------------------------------------------+
|  Set Up Your Phone                             [4 of 4]   |
+------------------------------------------------------------+
|                                                            |
|  Choose your phone's OS for setup instructions:           |
|                                                            |
|  ( ) iOS — iPhone / iPad                                  |
|  ( ) Android                                              |
|                                                            |
|  -- iOS Instructions --                                   |
|  1. Open the Shortcuts app.                               |
|  2. Create a new Shortcut.                                |
|  3. Add action: "Get Clipboard" (or "URL" if using the   |
|     Reddit share sheet).                                  |
|  4. Add action: "Get Contents of URL" with:              |
|     URL:     https://ntfy.sh/xK9mQr4vLpTw8nZj2cY [Copy] |
|     Method:  POST                                         |
|     Body:    Shortcut Input (the shared URL)              |
|  5. Add the Shortcut to your Share Sheet.                 |
|  6. On any Reddit post, tap Share -> your shortcut.       |
|                                                            |
|  [Switch to Android]                                      |
|                                                            |
|  [<- Back]                              [Done]            |
+------------------------------------------------------------+
```

- The OS selector switches the instructions between iOS and Android without leaving the step.
- The ntfy topic URL is pre-filled and copyable in the instruction text.
- **iOS instructions** cover creating a Share Sheet shortcut using the Shortcuts app.
- **Android instructions** cover configuring the HTTP Shortcuts app to POST to the topic URL via the Android Share intent.
- "Done" saves the topic name and server URL as plain text values in the `settings` table, closes the modal, and navigates to the Saved Posts view.
- If the user re-enters the flow from Settings, "Done" updates the stored values.

---

**Onboarding flow state rules:**

- If the user dismisses the flow at any step before Step 4 "Done", no topic is saved and the "Set up mobile saving" prompt remains in the Saved Posts header.
- Completing Step 4 with "Done" is the only action that persists the configuration.
- The flow is re-enterable from Settings at any time — it does not require unconfiguring first.

### 8.5 YouTube Settings Section

The YouTube settings section contains:

- **Channel list** — one row per configured channel showing thumbnail, name, and two controls:
  - **Toggle (Switch component)** — enables or disables the channel's row on the dashboard. Toggling off hides the row immediately without removing the channel or its cached data. State is persisted to `yt_channels.enabled`.
  - **Remove button** — permanently deletes the channel and its cached videos after a confirmation prompt.
- **Add channel** — a text input accepting a YouTube channel URL (e.g., `https://www.youtube.com/@ChannelName`) or a bare channel ID. On submit, the app resolves the channel ID (if a URL was entered), calls `channels.list` to fetch the name and thumbnail, and adds the row.
- **RSS poll interval** — a numeric input (minutes) with a minimum of 5 and a sensible maximum (e.g., 1440). Displays the current value, defaults to 15. Changes take effect immediately on save, restarting the poller with the new interval. Stored in `settings` as `rss_poll_interval_minutes`.

---

## 9. Component Library

All UI components use **shadcn/ui** built on Radix UI primitives. This ensures:
- Accessible by default (keyboard navigation, ARIA attributes).
- Consistent design tokens (spacing, color, radius).
- Easy to theme (light/dark via Tailwind CSS variables).

Key components expected:
- `Card` — widget containers, video cards, stream cards
- `ScrollArea` — horizontal video carousels, output log panes
- `Dialog` / `Sheet` — modals for channel config, script edit
- `Badge` — LIVE NOW, exit code status, tags
- `Input`, `Button`, `Switch` — settings forms
- Widget reordering uses `@dnd-kit/core` (confirmed — see tech-notes.md TD-03)

---

## 10. Responsive and Window Behavior

- Minimum window size: 900px wide, 600px tall (Assumed).
- The app is not designed for small screens — it is a desktop tool.
- Layout is responsive to window width in the sense that carousels and columns reflow gracefully, but no mobile breakpoints are required.
- The window can be resized freely. Widget layout remains single-column vertical stack regardless of width.

---

## 11. Accessibility

- All interactive elements are keyboard-focusable.
- Color is not the sole means of conveying status (e.g., "LIVE NOW" badge uses both color and text).
- Font sizes follow Tailwind defaults (minimum 14px for body text).
- WCAG AA compliance is a stated v1 goal. Not formally audited, but targeted throughout. shadcn/ui Radix primitives provide the baseline (focus rings, ARIA roles, keyboard navigation). Color contrast for all text/background pairings must meet the 4.5:1 ratio minimum. Theme token values must be checked against this ratio before shipping any custom palette.
