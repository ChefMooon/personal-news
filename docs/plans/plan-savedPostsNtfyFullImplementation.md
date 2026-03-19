# Implementation Plan: Saved Posts (ntfy.sh) Full Implementation

**Objective:** Wire up the complete ntfy.sh → saved posts data pipeline with UI, onboarding, search, tags, and note support.

**Date:** 2026-03-19  
**Scope:** All 6 Saved Posts TODO items + note feature  
**Note Format:** First line of ntfy message = URL; remaining lines (after first `\n`) = user note (optional)

---

## Overview

The Reddit source module is currently a stub. The DB schema and FTS5 tables exist but need:
1. A `note` column migration (to store user notes with saved posts)
2. ntfy.sh polling logic with message parsing and Reddit metadata fetching
3. Seven new IPC handlers for CRUD, search, and staleness detection
4. Frontend: settings UI, 4-step onboarding wizard, full-page view with search/filters/tags, stale warning

Estimated implementation: 15–20 steps across 4 phases, parallelizable where noted.

---

## Phase 1: Backend — ntfy Polling & IPC Handlers

### Step 1: Create DB Migration — add `note` column

**File:** `src/main/db/migrations/005_add_saved_post_note.sql`

```sql
-- Add note column to saved_posts table
ALTER TABLE saved_posts ADD COLUMN note TEXT;
```

**Why:** Store optional user-provided notes sent with the URL from mobile.

---

### Step 2: Create ntfy.ts — ntfy.sh Poller Logic

**File:** `src/main/sources/reddit/ntfy.ts` (NEW)

**Implementation requirements:**

- Export async function `pollNtfy(db: Database): Promise<{ postsIngested: number }>`
- Read settings from DB:
  - `ntfy_topic` (string, may be null/empty)
  - `ntfy_server_url` (default: `'https://ntfy.sh'`)
  - `ntfy_last_message_id` (null on first poll)
- Fetch: `GET {serverUrl}/{topic}/json?poll=1&since={since}` where `since = lastMessageId ?? 'all'`
- Request timeouts: 10 seconds
- Parse NDJSON response, filter to `event === 'message'`
- **Message parsing with note support:**
  - Split `msg.message` string by first newline character
  - First line = candidate URL
  - Rest (after first newline) = user note (trim whitespace; `null` if no rest)
  - Example: `"https://reddit.com/r/rust/comments/abc123/post_title\nThis is my note"` → URL=`"https://reddit.com/r/rust/comments/abc123/post_title"`, note=`"This is my note"`
  - Validate URL with `isRedditPostUrl()` helper
- For each valid Reddit URL:
  - Call `fetchRedditPost(url)` to get metadata
  - Set the `note` field from parsed note
  - Upsert into `saved_posts` (post_id as PK)
  - Track count: `postsIngested++`
- On success:
  - Update setting: `ntfy_last_message_id` = last processed message ID
  - Update setting: `ntfy_last_polled_at` = `Math.floor(Date.now() / 1000)` (Unix seconds)
- On network/HTTP error:
  - Log warning, return `{ postsIngested: 0 }`
  - **Do NOT update** `ntfy_last_polled_at` (leave it unchanged so stale warning still works)

**Error handling:**
- Network timeout / fetch rejection → catch, log, return 0
- HTTP status != 200 → log, return 0
- Malformed JSON in response line → skip that line, continue
- Non-Reddit URL → log, skip
- Reddit metadata fetch fails → log warning, continue (cursor still advances)

**Reference:** See `docs/architecture/data-sources.md §2.3` for full spec.

---

### Step 3: Create metadata.ts — Reddit Post Metadata Fetcher

**File:** `src/main/sources/reddit/metadata.ts` (NEW)

**Implementation requirements:**

- Export async function `fetchRedditPost(url: string): Promise<SavedPostInput>`
- Input: Reddit post URL (e.g., `https://reddit.com/r/rust/comments/abc123/title`)
- Normalize URL:
  - Strip query parameters
  - Remove fragment (`#`)
  - Ensure trailing slash
- Construct API URL: `{normalized}.json`
- Fetch with:
  - `User-Agent: personal-news/1.0` header
  - 10 second timeout
- Parse JSON response; extract first comment data:
  - Path: `[0].data.children[0].data`
- Extract fields:
  - `id` → `postId`
  - `title`
  - `url` (the outbound URL; may differ from permalink if crosspost)
  - `permalink`
  - `subreddit`
  - `author` (if `'[deleted]'`, set to `null`)
  - `score`
  - `selftext` → `body`
  - `savedAt` → `Math.floor(Date.now() / 1000]`
  - `tags` → `null`
- Return typed `SavedPostInput` object

**Error handling:**
- 404 → throw `new Error('Reddit post not found: {url}')`
- Other HTTP error → throw `new Error('Reddit API error: HTTP {status}')`
- Unexpected JSON shape → throw `new Error('Unexpected Reddit API response shape...')`

**Reference:** See `docs/architecture/data-sources.md §2.5` for full spec.

---

### Step 4: Create validation.ts — URL Validation Helpers

**File:** `src/main/sources/reddit/validation.ts` (NEW)

**Implementation requirements:**

- Export predicate function `isRedditPostUrl(url: unknown): url is string`
  - Returns true only if `url` is a string matching the Reddit post URL pattern
  - Pattern: `/^https?:\/\/(www\.)?reddit\.com\/r\/[^/]+\/comments\/[a-z0-9]+/i`
  - Test examples:
    - ✅ `https://reddit.com/r/rust/comments/abc123/title`
    - ✅ `http://www.reddit.com/r/programming/comments/xyz789/title?utm_source=share`
    - ❌ `https://reddit.com/user/somename`
    - ❌ `https://reddit.com/r/rust/` (no specific post)
- Export function `normalizeRedditUrl(url: string): string`
  - Remove query parameters (`?...`)
  - Remove fragment (`#...`)
  - Ensure ends with `/`
  - Return normalized URL

---

### Step 5: Replace Reddit Module Stub

**File:** `src/main/sources/reddit/index.ts` (MODIFY)

**Current state:**
```typescript
export const RedditModule: DataSourceModule = {
  id: 'reddit',
  displayName: 'Reddit',
  initialize(_db: Database.Database): void {
    console.log('[Reddit] Module initialized (stub — no ntfy polling in prototype)')
  },
  shutdown(): void {
    console.log('[Reddit] Module shutdown')
  }
}
```

**Replace with:**

```typescript
import type Database from 'better-sqlite3'
import { BrowserWindow } from 'electron'
import { IPC } from '../../../shared/ipc-types'
import type { DataSourceModule } from '../registry'
import { pollNtfy } from './ntfy'

let dbRef: Database.Database | null = null
let pollingInProgress = false

function emitNtfyIngestComplete(postsIngested: number, error?: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC.REDDIT_NTFY_INGEST_COMPLETE, { postsIngested, error })
  }
}

export const RedditModule: DataSourceModule = {
  id: 'reddit',
  displayName: 'Reddit',
  initialize(db: Database.Database): void {
    dbRef = db
    console.log('[Reddit] Module initialized')
    
    // Run startup poll immediately
    pollNtfyStartup()
  },
  shutdown(): void {
    console.log('[Reddit] Module shutdown')
    dbRef = null
  }
}

async function pollNtfyStartup(): Promise<void> {
  if (!dbRef || pollingInProgress) {
    return
  }
  
  pollingInProgress = true
  try {
    const result = await pollNtfy(dbRef)
    emitNtfyIngestComplete(result.postsIngested)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('[Reddit] ntfy startup poll failed:', msg)
    emitNtfyIngestComplete(0, msg)
  } finally {
    pollingInProgress = false
  }
}
```

**Why:**
- Calls `pollNtfy()` on app startup
- Emits push event to renderer when complete
- Mutex flag `pollingInProgress` prevents concurrent polls

---

### Step 6: Add IPC Handlers — Saved Posts CRUD & Search

**File:** `src/main/ipc/index.ts` (MODIFY)

Add the following 7 handlers. Follow the pattern already used in the file (use `ipcMain.handle()`; wrap DB operations in try-catch; return structured results).

#### Handler 1: `reddit:getSavedPosts`
- **Args:** `[options?: { search?: string; subreddit?: string; tag?: string; limit?: number; offset?: number }]`
- **Returns:** `{ posts: SavedPost[]; total: number }`
- **Implementation:**
  - If `search` provided: use FTS5 `saved_posts_fts` table with MATCH
  - If `subreddit` provided: add `WHERE subreddit = ?`
  - If `tag` provided: add `WHERE EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)`
  - Chain all conditions with AND
  - Query: `SELECT * FROM saved_posts WHERE {conditions} ORDER BY saved_at DESC LIMIT ? OFFSET ?`
  - Also count total matching: `SELECT COUNT(*) FROM saved_posts WHERE {conditions}`
  - Transform tags column from JSON string to `string[]` array
  - Return both `posts` (array) and `total` (count)

#### Handler 2: `reddit:updatePostTags`
- **Args:** `[postId: string, tags: string[]]`
- **Returns:** `{ ok: true }`
- **Implementation:**
  - Convert tags array to JSON: `JSON.stringify(tags)`
  - `UPDATE saved_posts SET tags = ? WHERE post_id = ?`
  - Return success object

#### Handler 3: `reddit:getAllTags`
- **Args:** none
- **Returns:** `string[]`
- **Implementation:**
  - Query: `SELECT DISTINCT json_each.value FROM saved_posts, json_each(saved_posts.tags) WHERE saved_posts.tags IS NOT NULL AND json_each.value IS NOT NULL`
  - Or simpler approach: SELECT all posts' tags, parse JSON client-side, deduplicate
  - Return sorted array of unique tag strings

#### Handler 4: `reddit:renameTag`
- **Args:** `[oldTag: string, newTag: string]`
- **Returns:** `{ affectedPosts: number }`
- **Implementation:**
  - SELECT all posts where `json_each(tags)` contains `oldTag`
  - For each post: parse JSON array, replace `oldTag` with `newTag`, update row
  - Use a transaction to batch updates
  - Return count of affected posts

#### Handler 5: `reddit:deleteTag`
- **Args:** `[tag: string]`
- **Returns:** `{ affectedPosts: number }`
- **Implementation:**
  - SELECT all posts where `json_each(tags)` contains `tag`
  - For each post: parse JSON array, remove `tag`, update row
  - Use a transaction
  - Return count of affected posts

#### Handler 6: `reddit:pollNtfy`
- **Args:** none
- **Returns:** `{ postsIngested: number; lastPolledAt: number }`
- **Throws:** `{ code: 'NTFY_UNREACHABLE' | 'NO_TOPIC_CONFIGURED', message: string }`
- **Implementation:**
  - Check if `ntfy_topic` setting is configured; if not, throw with `NO_TOPIC_CONFIGURED`
  - Call `pollNtfy(db)` (wrap in try-catch for network errors)
  - Catch network errors → throw `NTFY_UNREACHABLE`
  - Read updated `ntfy_last_polled_at` from settings
  - Return `{ postsIngested, lastPolledAt }`

#### Handler 7: `reddit:getNtfyStaleness`
- **Args:** none
- **Returns:** `{ lastPolledAt: number | null; isStale: boolean; topicConfigured: boolean }`
- **Implementation:**
  - `topicConfigured = Boolean(getSetting('ntfy_topic'))`
  - `lastPolledAt = parseInt(getSetting('ntfy_last_polled_at') ?? '0', 10) || null`
  - `STALE_THRESHOLD_SEC = 86400` (24 hours)
  - `now = Math.floor(Date.now() / 1000)`
  - `isStale = topicConfigured && (lastPolledAt === null || (now - lastPolledAt) > STALE_THRESHOLD_SEC)`
  - Return object with all three fields

---

### Step 7: Update IPC Types

**File:** `src/shared/ipc-types.ts` (MODIFY)

Add to the `IPC` constants object:
```typescript
REDDIT_GET_SAVED_POSTS: 'reddit:getSavedPosts',
REDDIT_UPDATE_POST_TAGS: 'reddit:updatePostTags',
REDDIT_GET_ALL_TAGS: 'reddit:getAllTags',
REDDIT_RENAME_TAG: 'reddit:renameTag',
REDDIT_DELETE_TAG: 'reddit:deleteTag',
REDDIT_POLL_NTFY: 'reddit:pollNtfy',
REDDIT_GET_NTFY_STALENESS: 'reddit:getNtfyStaleness',
REDDIT_NTFY_INGEST_COMPLETE: 'reddit:ntfyIngestComplete',
```

Add new interfaces:
```typescript
export interface SavedPost {
  post_id: string
  title: string
  url: string
  permalink: string
  subreddit: string | null
  author: string | null
  score: number | null
  body: string | null
  saved_at: number
  note: string | null
  tags: string[]  // empty array if null in DB
}

export interface SavedPostInput {
  postId: string
  title: string
  url: string
  permalink: string
  subreddit: string | null
  author: string | null
  score: number | null
  body: string | null
  savedAt: number
  note: string | null
  tags: null  // always null on initial fetch
}

export interface NtfyStaleness {
  lastPolledAt: number | null
  isStale: boolean
  topicConfigured: boolean
}

export interface NtfyPollResult {
  postsIngested: number
  lastPolledAt: number
}
```

---

## Phase 2: Settings UI & Onboarding Wizard

### Step 8: Create ntfy Settings Panel

**File:** `src/renderer/src/routes/Settings.tsx` (MODIFY)

**Current state:** Saved Posts tab shows "coming soon" placeholder.

**Replace with:**

Implement a new settings tab section (reuse existing shadcn components: `Card`, `Input`, `Button`, `Dialog`, etc.):

- **If ntfy NOT configured:**
  - Show heading: "Set Up Mobile Post Saving"
  - Show paragraph explaining how to use ntfy
  - Button: "Set Up" → Opens `NtfyOnboardingWizard` modal

- **If ntfy IS configured:**
  - Display: Topic name (plain text or display field)
  - Display: Server URL (read-only, gray text)
  - Display: Last synced timestamp (e.g., "Today at 08:42" or "3 days ago")
    - If > 24h: show in amber/warning color
  - Button: "Test Connection" → Calls `reddit:pollNtfy` IPC, shows result inline (success or error message)
  - Button: "Edit" → Re-opens `NtfyOnboardingWizard` with topic/server pre-filled
  - Button: "Mobile Setup Guide" → Opens Step 4 of the wizard (iOS/Android instructions) in a read-only mode

---

### Step 9: Create ntfy Onboarding Wizard

**File:** `src/renderer/src/modules/saved-posts/NtfyOnboardingWizard.tsx` (NEW)

**Component signature:**
```typescript
interface NtfyOnboardingWizardProps {
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
  initialTopic?: string
  initialServerUrl?: string
}

export function NtfyOnboardingWizard({ isOpen, onClose, onComplete, initialTopic, initialServerUrl }: NtfyOnboardingWizardProps): JSX.Element
```

**Implementation requirements:**

- Multi-step modal (use shadcn `Dialog`)
- Step indicator in header showing current/total (e.g., "1 of 4")
- Four steps, each fits on screen without scrolling:

**Step 1: What is ntfy.sh?**
- Heading: "Set Up Mobile Post Saving"
- Body: Explanation paragraph (from `docs/ui-ux.md §8.4`)
- Buttons: "[Skip Setup]" (closes modal) | "[Next ->]" (→ Step 2)

**Step 2: Choose Your Topic**
- Heading: "Choose a Topic Name"
- Input field: Topic name (default: 20-char alphanumeric random, e.g., `xK9mQr4vLpTw8nZj2cY`)
- Button next to input: "[Regenerate]" → Generates new random string
- Input field: Server URL (placeholder: `https://ntfy.sh`, optional)
- Info box: "Note: ntfy.sh retains messages for 24 hours..." (from spec)
- Buttons: "[<- Back]" | "[Next ->]" (Next disabled if topic empty)

**Step 3: Test the Connection**
- Heading: "Test Your Topic"
- Display: Topic name (read-only)
- Display: Server URL (read-only)
- Button: "[Test Connection]"
  - On click: Call `reddit:pollNtfy` IPC
  - Show result inline: "Connected — N messages received" or "Could not reach server..."
- Instructions section: How to send a test message from phone (text + copy-able topic URL)
- Buttons: "[<- Back]" | "[Skip Test]" | "[Next ->]"

**Step 4: Phone Setup Guide**
- Heading: "Set Up Your Phone"
- Radio/toggle: Choose "iOS" or "Android"
- Conditional content:
  - **iOS:** Show Shortcuts setup instructions (1–6 steps from spec) with pre-filled topic URL in a code block
  - **Android:** Show HTTP Shortcuts setup instructions with pre-filled topic URL
- Note in instructions: "To add a note to your post, put the Reddit URL on the first line and your note on the following lines."
- Buttons: "[<- Back]" | "[Done]" (or "[Switch to Android/iOS]" as appropriate)

**On "Done":**
- Call `settings:set` IPC twice: set `ntfy_topic` and `ntfy_server_url` (trim whitespace)
- Close modal
- Call `onComplete?.()`
- If called from `/saved-posts` route: trigger `useSavedPosts` refetch + trigger `reddit:pollNtfy` if desired

**On "Skip Setup" or modal close:**
- Discard all values
- Do NOT save any settings

---

### Step 10: Wire up onboarding auto-trigger in routes

**Files to modify:**
- `src/renderer/src/routes/SavedPosts.tsx` (will be rewritten in Step 13)
- `src/renderer/src/routes/Settings.tsx` (modified in Step 8)

**Pattern:**
- On component mount, call `reddit:getNtfyStaleness` hook/IPC
- If `!topicConfigured`, render `NtfyOnboardingWizard` with `isOpen={true}`
- On `onComplete`, re-fetch data / close wizard / navigate as appropriate

---

## Phase 3: Full-Page Saved Posts View

### Step 11: Create data hooks

**File:** `src/renderer/src/hooks/useSavedPosts.ts` (NEW)

**Hook signature:**
```typescript
interface UseSavedPostsOptions {
  limit?: number
  offset?: number
  search?: string
  subreddit?: string | null
  tag?: string | null
}

export function useSavedPosts(options?: UseSavedPostsOptions) {
  return {
    posts: SavedPost[],
    total: number,
    loading: boolean,
    error: string | null,
    refetch: () => Promise<void>,
    setSearch: (search: string) => void,
    setSubreddit: (subreddit: string | null) => void,
    setTag: (tag: string | null) => void,
    setOffset: (offset: number) => void,
  }
}
```

**Implementation:**
- Call `reddit:getSavedPosts` IPC with current filter options
- Store results in state: `posts`, `total`, `loading`, `error`
- Expose `refetch()` function to manually re-query
- Expose setters for search, subreddit, tag, offset (each triggers re-fetch after small debounce)
- Listen to `reddit:ntfyIngestComplete` push event → auto-refetch on new posts ingested

**File:** `src/renderer/src/hooks/useNtfyStaleness.ts` (NEW)

**Hook signature:**
```typescript
export function useNtfyStaleness() {
  return {
    lastPolledAt: number | null,
    isStale: boolean,
    topicConfigured: boolean,
    loading: boolean,
  }
}
```

**Implementation:**
- Call `reddit:getNtfyStaleness` IPC on mount
- Store result in state
- Return all four fields

---

### Step 12: Create Stale Warning Banner Component

**File:** `src/renderer/src/modules/saved-posts/StaleWarning.tsx` (NEW)

**Component signature:**
```typescript
interface StaleWarningProps {
  lastPolledAt: number | null
  isStale: boolean
  onDismiss: () => void
  onSyncNow: () => Promise<void>
  loading?: boolean
}

export function StaleWarning({ lastPolledAt, isStale, onDismiss, onSyncNow, loading }: StaleWarningProps): JSX.Element | null
```

**Implementation:**
- Return `null` if `!isStale`
- Render warning banner (use shadcn `Alert` or `Card` with warning styling):
  - Icon: warning icon (amber)
  - Text: "Last synced: X ago. Messages on ntfy.sh expire after 24 hours — some saved posts may have been lost."
  - Button: "[Sync Now]" (calls `onSyncNow()`, disabled while loading)
  - Button: "[Dismiss]" (calls `onDismiss()`)
- On "Sync Now" success: auto-dismiss banner and trigger parent refetch
- Session-only dismiss (local state; banner reappears on next visit)

---

### Step 13: Rewrite Full-Page Saved Posts Route

**File:** `src/renderer/src/routes/SavedPosts.tsx` (MODIFY/REWRITE)

**Current state:** Placeholder "Full saved posts view coming soon."

**Replace with:**

```typescript
import { useEffect, useState } from 'react'
import { useNtfyStaleness, useSavedPosts } from '../hooks'
import { StaleWarning } from '../modules/saved-posts/StaleWarning'
import { NtfyOnboardingWizard } from '../modules/saved-posts/NtfyOnboardingWizard'
import { TagManagementModal } from '../modules/saved-posts/TagManagementModal'
import { Card, Button, Input, Select } from '../components/ui'

export function SavedPosts(): JSX.Element {
  const { posts, total, loading, setSearch, setSubreddit, setTag, refetch } = useSavedPosts()
  const { isStale, topicConfigured } = useNtfyStaleness()
  const [showOnboarding, setShowOnboarding] = useState(!topicConfigured)
  const [showTagManager, setShowTagManager] = useState(false)
  const [dismissedStaleWarning, setDismissedStaleWarning] = useState(false)
  const [searchInput, setSearchInput] = useState('')

  useEffect(() => {
    setShowOnboarding(!topicConfigured)
  }, [topicConfigured])

  const handleSyncNow = async () => {
    try {
      await invoke('reddit:pollNtfy')
      refetch()
      setDismissedStaleWarning(true)
    } catch (error) {
      console.error('Sync failed:', error)
    }
  }

  if (!topicConfigured) {
    return (
      <>
        <NtfyOnboardingWizard
          isOpen={showOnboarding}
          onClose={() => setShowOnboarding(false)}
          onComplete={() => {
            setShowOnboarding(false)
            refetch()
          }}
        />
        <div className="p-6">
          <h1 className="text-2xl font-bold">Saved Posts</h1>
          <p className="text-muted-foreground">Set up mobile post saving to get started.</p>
          <Button onClick={() => setShowOnboarding(true)}>Set Up Mobile Saving</Button>
        </div>
      </>
    )
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Saved Posts</h1>
        <Button variant="outline" onClick={() => setShowTagManager(true)}>
          Manage Tags
        </Button>
      </div>

      {isStale && !dismissedStaleWarning && (
        <StaleWarning
          isStale={isStale}
          onDismiss={() => setDismissedStaleWarning(true)}
          onSyncNow={handleSyncNow}
        />
      )}

      <div className="mb-6 space-y-4">
        <Input
          placeholder="Search posts..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value)
            setSearch(e.target.value)
          }}
        />
        <div className="flex gap-4">
          <Select
            placeholder="All subreddits"
            onChange={(value) => setSubreddit(value || null)}
          />
          <Select
            placeholder="All tags"
            onChange={(value) => setTag(value || null)}
          />
        </div>
      </div>

      {posts.length === 0 ? (
        <p className="text-muted-foreground">No saved posts yet. Share a Reddit URL from your phone to see it here.</p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <Card key={post.post_id} className="p-4">
              <div>
                <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                  {post.title}
                </a>
                {post.note && <p className="text-sm italic text-muted-foreground">{post.note}</p>}
              </div>
              <div className="mt-2 flex gap-2 items-center">
                {post.subreddit && <span className="badge">r/{post.subreddit}</span>}
                {post.author && <span className="text-sm text-muted-foreground">by {post.author}</span>}
                {post.score !== null && <span className="text-sm text-muted-foreground">{post.score} points</span>}
                <span className="text-sm text-muted-foreground">{formatRelativeTime(post.saved_at)}</span>
              </div>
              {post.tags && post.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {post.tags.map((tag) => (
                    <span key={tag} className="badge">{tag}</span>
                  ))}
                </div>
              )}
            </Card>
          ))}
          {posts.length < total && (
            <Button onClick={() => setOffset((prev) => prev + 20)}>Load More</Button>
          )}
        </div>
      )}

      <TagManagementModal
        isOpen={showTagManager}
        onClose={() => setShowTagManager(false)}
        onTagUpdated={refetch}
      />
    </div>
  )
}

function formatRelativeTime(unixSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - unixSeconds
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
```

**Key features:**
- Search bar (debounced)
- Subreddit dropdown (populate from unique subreddits in current results)
- Tag dropdown (populate from `reddit:getAllTags`)
- Stale warning banner (conditionally shown)
- Onboarding wizard auto-trigger if not configured
- Post rows with title, note, subreddit, author, score, tags, relative time
- Note display: italicized below title if present
- Tag management button opens modal
- Load more button for pagination

---

### Step 14: Create Tag Management Modal

**File:** `src/renderer/src/modules/saved-posts/TagManagementModal.tsx` (NEW)

**Component signature:**
```typescript
interface TagManagementModalProps {
  isOpen: boolean
  onClose: () => void
  onTagUpdated: () => void  // callback to parent to refetch posts
}

export function TagManagementModal({ isOpen, onClose, onTagUpdated }: TagManagementModalProps): JSX.Element
```

**Implementation:**
- Fetch all tags on modal open: `reddit:getAllTags`
- Display list of tags with usage count
- For each tag:
  - Show current name + usage count (number of posts with that tag)
  - Inline edit button → text input + save/cancel
  - Delete button → confirmation dialog → call `reddit:deleteTag` on confirm
  - Rename: on save, call `reddit:renameTag` with old/new name
- After any operation: refetch tag list + call `onTagUpdated()` to refresh parent post list
- Use shadcn `Dialog`, `Input`, `Button`, `AlertDialog` for confirmations

---

### Step 15: Update Dashboard Widget

**File:** `src/renderer/src/modules/saved-posts/SavedPostsWidget.tsx` (MODIFY)

**Current state:** Shows 5 most recent posts.

**Update:**
- Call `reddit:getNtfyStaleness` on mount
- If `!topicConfigured`, show:
  ```
  +------------------------------------------------------------+
  |  Saved Posts                                               |
  +------------------------------------------------------------+
  |  Set up mobile saving to get started.                      |
  |  [Set Up]                                                  |
  +------------------------------------------------------------+
  ```
  Button opens onboarding wizard.
- Otherwise, show existing 5-post list (no changes)
- Listen to `reddit:ntfyIngestComplete` push event → auto-refetch via `reddit:getSavedPostsSummary`
- Optionally show truncated note preview on rows (e.g., first line of note if present)

---

## Phase 4: Wrap-up & Testing

### Step 16: Verify all implementations

**Checklist:**
- [ ] All 9 new backend files created with correct logic
- [ ] All 7 IPC handlers in `ipc/index.ts` added
- [ ] IPC types updated in `shared/ipc-types.ts`
- [ ] RedditModule calls `pollNtfy()` on startup
- [ ] Database migration 005 applied (test: `sqlite3 data.db ".schema saved_posts"` should show `note` column)
- [ ] React components compile without TypeScript errors
- [ ] All imports/exports correctly wired

### Step 17: Integration Testing

**Startup poll test:**
1. Set a test ntfy topic in `settings` DB: `INSERT OR REPLACE INTO settings (key, value) VALUES ('ntfy_topic', 'test-topic-12345')`
2. Also set custom server URL (optional): `INSERT OR REPLACE INTO settings (key, value) VALUES ('ntfy_server_url', 'https://ntfy.sh')`
3. Post a test message to ntfy via curl: `curl -d "https://reddit.com/r/rust/comments/abc123/title" https://ntfy.sh/test-topic-12345`
4. Launch app
5. Verify: DB contains new saved post row with correct metadata + no note
6. Verify: Renderer receives `reddit:ntfyIngestComplete` event with `postsIngested: 1`

**Manual poll test:**
1. Start app with topic configured
2. Post another ntfy message with URL + note: `curl -d $'https://reddit.com/r/programming/comments/xyz789/title\nGreat article!' https://ntfy.sh/test-topic-12345`
3. Click "Sync Now" in stale warning or "Test Connection" in Settings
4. Verify: New post appears in list with note displayed below title

**FTS5 search test:**
1. Ensure multiple posts in DB with varied subreddits/titles
2. Search for keyword → verify results filtered correctly
3. Test filtering by subreddit
4. Test filtering by tag (after adding tags)

**Tag operations test:**
1. Add tags to a few posts via UI
2. Rename a tag → verify all affected posts updated
3. Delete a tag → verify removed from all posts
4. Filter by tag → verify only correct posts shown

**Onboarding flow test:**
1. Clear topic from settings: `DELETE FROM settings WHERE key = 'ntfy_topic'`
2. Navigate to `/saved-posts` → onboarding should auto-open
3. Walk through all 4 steps:
   - Step 1: Skip → modal closes, topic stays empty
   - Step 1 again: Next → Step 2
   - Step 2: Generate new topic → should change random string
   - Step 2: Edit server URL → should accept https URL
   - Step 2: Empty topic → Next disabled
   - Step 3: Test Connection button → should show result (will fail without actual ntfy post)
   - Step 3: Skip Test → proceed to Step 4
   - Step 4: Toggle iOS/Android → instructions should switch
   - Step 4: Done → settings saved, modal closes, /saved-posts shows post list

**Stale warning test:**
1. Set `ntfy_last_polled_at` to >24h ago: `INSERT OR REPLACE INTO settings (key, value) VALUES ('ntfy_last_polled_at', '123456789')` (use old Unix timestamp)
2. Navigate to `/saved-posts`
3. Warning banner should appear with "Last synced: X days ago"
4. Click "Sync Now" → calls poll → banner dismisses on success
5. Click "Dismiss" → banner hides for session (reappears on page refresh? or next launch — define behavior)

---

## Reference Materials

- **Spec docs:**
  - `docs/architecture/data-sources.md` § 2 (Reddit module)
  - `docs/architecture/ipc.md` § 3 (Saved Posts channels)
  - `docs/architecture/data-model.md` § 2.6 (saved_posts schema)
  - `docs/ui-ux.md` § 6 (Saved Posts view), § 8.3–8.4 (ntfy settings & onboarding)

- **Code patterns:**
  - YouTube module (`src/main/sources/youtube/index.ts`) for `DataSourceModule` pattern
  - YouTube IPC handlers (`src/main/ipc/index.ts`) for handler pattern and error handling
  - `useRedditDigest.ts` hook pattern for renderer data fetching
  - `YouTubeSettingsDialog.tsx` for settings modal pattern

- **Dependencies:**
  - `better-sqlite3` — already in project (DB)
  - `electron` — BrowserWindow.webContents.send for push events
  - `react`, `shadcn/ui` — UI components
  - `date-fns` (optional) — for formatting timestamps (or implement custom)

---

## Success Criteria

- ✅ App starts and loads without errors
- ✅ ntfy.sh topic configured in settings → app polls on startup, posts appear in DB and UI
- ✅ FTS5 search finds posts by title/body/subreddit
- ✅ Tag operations (add/rename/delete) work correctly
- ✅ Onboarding wizard completes and saves config
- ✅ Stale warning shows when >24h since last poll
- ✅ "Sync Now" / "Test Connection" buttons trigger manual polls
- ✅ Note field populated from ntfy message (URL + newline + note)
- ✅ All 6 TODO items checked off; note feature working

---

## Implementation Notes

- **Concurrent polling:** The mutex flag `pollingInProgress` in RedditModule prevents double-polling if "Sync Now" is clicked during startup poll.
- **Note format:** ntfy message body is parsed as: first line = URL, rest = note. Trailing/leading whitespace on note is trimmed. No note = `null` in DB.
- **FTS5 query:** When search is provided, query must JOIN `saved_posts_fts` and maintain order by `saved_at DESC`.
- **Error handling:** All IPC handlers should return error objects with `code` and `message` fields per existing patterns.
- **Settings API:** Use `getSetting()` / `setSetting()` from `src/main/settings/store.ts` — these handle the `settings` table transparently.
- **Push events:** Always check `BrowserWindow.getAllWindows()` before sending (may be no windows during shutdown).

---

## Future Enhancements

- Add note indexing to FTS5 (currently user-annotations only, not full-text searchable)
- Implement periodic polling via `node-cron` (currently startup + manual only)
- Add date range filters on saved posts
- Custom servers & auth if ntfy self-hosting becomes popular
- Desktop notifications when posts arrive while app is running
