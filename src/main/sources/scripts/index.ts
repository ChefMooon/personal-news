import { app } from 'electron'
import type Database from 'better-sqlite3'
import { existsSync, readdirSync, statSync } from 'fs'
import { basename, dirname, extname, join, resolve } from 'path'
import type { DataSourceModule } from '../registry'
import type {
  DigestPost,
  ScriptWithLastRun,
  ScriptOutputChunk,
  ScriptRunCompleteEvent,
  ScriptRunTrigger
} from '../../../shared/ipc-types'
import { runScript, type ActiveRun, type ScriptRunCompletion } from './executor'
import { ScriptScheduler, type ScriptScheduleRunContext, type ScriptStartupWarning } from './scheduler'
import { deleteSetting, getSetting, setSetting } from '../../settings/store'
import {
  notifyRedditDigest,
  notifyScriptAutoRun
} from '../../notifications/notification-service'

export const activeRuns = new Map<number, ActiveRun>()
const SCRIPT_HOME_DIR_SETTING = 'script_home_dir'
const REDDIT_DIGEST_SUBREDDITS_SETTING = 'reddit_digest_subreddits'
const REDDIT_DIGEST_WEEK_START_SETTING = 'reddit_digest_week_start'
const REDDIT_DIGEST_AUTO_DISABLED_SETTING = 'reddit_digest_script_auto_disabled'
const REDDIT_DIGEST_SCRIPT_ID_SETTING = 'reddit_digest_script_id'
const DEFAULT_REDDIT_DIGEST_SCHEDULE = JSON.stringify({
  type: 'weekly',
  hour: 9,
  minute: 0,
  days_of_week: [1]
})

let emitOutput: ((chunk: ScriptOutputChunk) => void) | null = null
let emitUpdated: (() => void) | null = null
let emitRunComplete: ((event: ScriptRunCompleteEvent) => void) | null = null
let emitRedditUpdated: (() => void) | null = null

export function setScriptEmitters(
  outputFn: (chunk: ScriptOutputChunk) => void,
  updatedFn: () => void,
  runCompleteFn: (event: ScriptRunCompleteEvent) => void,
  redditUpdatedFn: () => void
): void {
  emitOutput = outputFn
  emitUpdated = updatedFn
  emitRunComplete = runCompleteFn
  emitRedditUpdated = redditUpdatedFn
}

const scheduler = new ScriptScheduler()

function formatScriptName(fileName: string): string {
  const stem = basename(fileName, extname(fileName)).trim()
  if (!stem) {
    return fileName
  }

  return stem
    .replace(/[._-]+/g, ' ')
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ')
}

function toRunMessage(scriptName: string, exitCode: number): string {
  if (exitCode === 0) {
    return `${scriptName} completed successfully.`
  }
  if (exitCode === -1) {
    return `${scriptName} failed to start.`
  }
  return `${scriptName} exited with code ${exitCode}.`
}

function toRunSeverity(exitCode: number): 'info' | 'error' {
  return exitCode === 0 ? 'info' : 'error'
}

function persistRunNotification(
  db: Database.Database,
  event: ScriptRunCompleteEvent
): void {
  db.prepare(
    `INSERT INTO script_notifications (script_id, run_id, severity, message, is_read, created_at, read_at)
     VALUES (?, ?, ?, ?, 0, ?, NULL)`
  ).run(event.scriptId, event.runId, event.severity, event.message, event.finishedAt)
}

function buildRunCompleteEvent(
  script: ScriptWithLastRun,
  completion: ScriptRunCompletion,
  trigger: ScriptRunTrigger
): ScriptRunCompleteEvent {
  const severity = toRunSeverity(completion.exitCode)
  const message = completion.message || toRunMessage(script.name, completion.exitCode)

  return {
    kind: 'run_complete',
    scriptId: script.id,
    scriptName: script.name,
    runId: completion.runId,
    startedAt: completion.startedAt,
    finishedAt: completion.finishedAt,
    exitCode: completion.exitCode,
    trigger,
    severity,
    message,
    missedRuns: null,
    downtimeSeconds: null
  }
}

function buildStartupWarningEvent(warning: ScriptStartupWarning): ScriptRunCompleteEvent {
  const createdAt = Math.floor(Date.now() / 1000)
  const message = `${warning.scriptName} missed ${warning.missedRuns} scheduled runs while the app was closed.`

  return {
    kind: 'startup_warning',
    scriptId: warning.scriptId,
    scriptName: warning.scriptName,
    runId: null,
    startedAt: null,
    finishedAt: createdAt,
    exitCode: null,
    trigger: 'startup_warning',
    severity: 'warning',
    message,
    missedRuns: warning.missedRuns,
    downtimeSeconds: warning.downtimeSeconds
  }
}

function persistStartupWarningNotification(
  db: Database.Database,
  event: ScriptRunCompleteEvent
): void {
  db.prepare(
    `INSERT INTO script_notifications (script_id, run_id, severity, message, is_read, created_at, read_at)
     VALUES (?, NULL, 'warning', ?, 0, ?, NULL)`
  ).run(event.scriptId, event.message, event.finishedAt)
}

function mapSchedulerTrigger(trigger: ScriptScheduleRunContext['trigger']): ScriptRunTrigger {
  if (trigger === 'scheduled') return 'scheduled'
  if (trigger === 'on_app_start') return 'on_app_start'
  return 'catch_up'
}

function getConfiguredDigestSubreddits(): string[] {
  const raw = getSetting(REDDIT_DIGEST_SUBREDDITS_SETTING)
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim().toLowerCase())
      .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
  } catch {
    return []
  }
}

function getBundledRedditDigestScriptPath(): string {
  const candidates = [
    resolve(join(process.resourcesPath, 'resources', 'scripts', 'reddit_digest.py')),
    resolve(join(app.getAppPath(), 'resources', 'scripts', 'reddit_digest.py')),
    resolve(join(process.cwd(), 'resources', 'scripts', 'reddit_digest.py'))
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return candidates[candidates.length - 1]
}

function isBundledRedditDigestScript(script: Pick<ScriptWithLastRun, 'id' | 'file_path'>): boolean {
  const configuredId = Number.parseInt(getSetting(REDDIT_DIGEST_SCRIPT_ID_SETTING) ?? '', 10)
  if (Number.isInteger(configuredId) && configuredId === script.id) {
    return true
  }

  return resolve(script.file_path) === getBundledRedditDigestScriptPath()
}

function getDatabasePath(db: Database.Database): string | null {
  const rows = db.prepare('PRAGMA database_list').all() as Array<{ name: string; file: string }>
  return rows.find((row) => row.name === 'main')?.file ?? null
}

function buildExtraArgs(db: Database.Database, script: ScriptWithLastRun): string[] {
  if (!isBundledRedditDigestScript(script)) {
    return []
  }

  const dbPath = getDatabasePath(db)
  if (!dbPath) {
    return []
  }

  const weekStart = getSetting(REDDIT_DIGEST_WEEK_START_SETTING)
  const normalizedWeekStart = weekStart === '0' ? '0' : '1'

  return ['--db-path', dbPath, '--week-start', normalizedWeekStart]
}

interface RedditDigestPayload {
  week_start_date?: string
  posts: DigestPost[]
}

function parseRedditDigestPayload(stdout: string): DigestPost[] {
  if (!stdout.trim()) {
    throw new Error('The Reddit Digest script did not emit any JSON output.')
  }

  const lines = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const payloadLine = lines[lines.length - 1]
  if (!payloadLine) {
    throw new Error('The Reddit Digest script did not emit a JSON payload line.')
  }

  const parsed = JSON.parse(payloadLine) as Partial<RedditDigestPayload>
  if (!parsed.posts || !Array.isArray(parsed.posts)) {
    throw new Error('The Reddit Digest script output is missing a posts array.')
  }
  if (parsed.week_start_date && !/^\d{4}-\d{2}-\d{2}$/.test(parsed.week_start_date)) {
    throw new Error('The Reddit Digest script output has an invalid week_start_date.')
  }

  return parsed.posts.map((post, index) => {
    if (!post || typeof post !== 'object') {
      throw new Error(`Digest post ${index + 1} is not an object.`)
    }
    if (!post.post_id || !post.subreddit || !post.title || !post.url || !post.permalink) {
      throw new Error(`Digest post ${index + 1} is missing required fields.`)
    }
    const weekStartDate = post.week_start_date ?? parsed.week_start_date
    if (!weekStartDate || !/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
      throw new Error(`Digest post ${index + 1} is missing a valid week_start_date.`)
    }
    if (!Number.isInteger(post.created_utc) || !Number.isInteger(post.fetched_at)) {
      throw new Error(`Digest post ${index + 1} has invalid timestamps.`)
    }

    return {
      post_id: post.post_id,
      week_start_date: weekStartDate,
      subreddit: post.subreddit,
      title: post.title,
      url: post.url,
      permalink: post.permalink,
      author: post.author ?? null,
      score: typeof post.score === 'number' ? post.score : null,
      num_comments: typeof post.num_comments === 'number' ? post.num_comments : null,
      created_utc: post.created_utc,
      fetched_at: post.fetched_at
    }
  })
}

function upsertRedditDigestPosts(db: Database.Database, posts: DigestPost[]): number {
  if (posts.length === 0) {
    return 0
  }

  const upsert = db.prepare(
    `INSERT INTO reddit_digest_posts
       (post_id, week_start_date, subreddit, title, url, permalink, author, score, num_comments, created_utc, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(post_id, week_start_date) DO UPDATE SET
       subreddit = excluded.subreddit,
       title = excluded.title,
       url = excluded.url,
       permalink = excluded.permalink,
       author = excluded.author,
       score = excluded.score,
       num_comments = excluded.num_comments,
       created_utc = excluded.created_utc,
       fetched_at = excluded.fetched_at`
  )

  const transact = db.transaction((rows: DigestPost[]) => {
    for (const post of rows) {
      upsert.run(
        post.post_id,
        post.week_start_date,
        post.subreddit,
        post.title,
        post.url,
        post.permalink,
        post.author,
        post.score,
        post.num_comments,
        post.created_utc,
        post.fetched_at
      )
    }
  })

  transact(posts)
  return posts.length
}

function markCompletionFailed(
  db: Database.Database,
  completion: ScriptRunCompletion,
  message: string
): ScriptRunCompletion {
  const combinedStderr = completion.stderr ? `${completion.stderr.trim()}\n${message}` : message
  db.prepare('UPDATE script_runs SET exit_code = ?, stderr = ? WHERE id = ?').run(-2, combinedStderr, completion.runId)

  return {
    ...completion,
    exitCode: -2,
    stderr: combinedStderr,
    message
  }
}

function postProcessCompletion(
  db: Database.Database,
  script: ScriptWithLastRun,
  completion: ScriptRunCompletion
): ScriptRunCompletion {
  if (!isBundledRedditDigestScript(script) || completion.exitCode !== 0) {
    return completion
  }

  if (completion.stdoutTruncated) {
    return markCompletionFailed(
      db,
      completion,
      'The Reddit Digest payload exceeded the maximum supported stdout size.'
    )
  }

  try {
    const posts = parseRedditDigestPayload(completion.stdout)
    const ingestedCount = upsertRedditDigestPosts(db, posts)
    emitRedditUpdated?.()
    return {
      ...completion,
      message: `${script.name} completed successfully and ingested ${ingestedCount} posts.`
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to ingest Reddit Digest output.'
    return markCompletionFailed(db, completion, message)
  }
}

function findBundledRedditDigestScript(db: Database.Database):
  | { id: number; description: string | null; enabled: number; file_path: string; interpreter: string }
  | undefined {
  const configuredId = Number.parseInt(getSetting(REDDIT_DIGEST_SCRIPT_ID_SETTING) ?? '', 10)
  if (Number.isInteger(configuredId)) {
    const configured = db
      .prepare('SELECT id, description, file_path, interpreter, enabled FROM scripts WHERE id = ?')
      .get(configuredId) as
      | { id: number; description: string | null; file_path: string; interpreter: string; enabled: number }
      | undefined
    if (configured) {
      return configured
    }
  }

  const currentPath = getBundledRedditDigestScriptPath()
  return db
    .prepare('SELECT id, description, file_path, interpreter, enabled FROM scripts WHERE file_path = ?')
    .get(currentPath) as
    | { id: number; description: string | null; file_path: string; interpreter: string; enabled: number }
    | undefined
}

export function ensureBundledRedditDigestScript(db: Database.Database): number | null {
  const existing = findBundledRedditDigestScript(db)
  const subreddits = getConfiguredDigestSubreddits()
  const filePath = getBundledRedditDigestScriptPath()
  const interpreter = process.platform === 'win32' ? 'python' : 'python3'

  if (subreddits.length === 0) {
    if (existing && existing.enabled === 1) {
      db.prepare('UPDATE scripts SET enabled = 0 WHERE id = ?').run(existing.id)
      setSetting(REDDIT_DIGEST_AUTO_DISABLED_SETTING, '1')
      setSetting(REDDIT_DIGEST_SCRIPT_ID_SETTING, String(existing.id))
      return existing.id
    }
    return existing?.id ?? null
  }

  if (!existsSync(filePath)) {
    console.warn(`[Scripts] Bundled Reddit Digest script not found at ${filePath}`)
    return null
  }

  if (existing) {
    setSetting(REDDIT_DIGEST_SCRIPT_ID_SETTING, String(existing.id))
    if (resolve(existing.file_path) !== filePath || existing.interpreter !== interpreter) {
      db.prepare('UPDATE scripts SET file_path = ?, interpreter = ? WHERE id = ?').run(
        filePath,
        interpreter,
        existing.id
      )
    }
    if (getSetting(REDDIT_DIGEST_AUTO_DISABLED_SETTING) === '1' && existing.enabled === 0) {
      db.prepare('UPDATE scripts SET enabled = 1 WHERE id = ?').run(existing.id)
      deleteSetting(REDDIT_DIGEST_AUTO_DISABLED_SETTING)
    }
    if (!existing.description) {
      db.prepare('UPDATE scripts SET description = ? WHERE id = ?').run(
        'Collects top Reddit posts for your configured subreddits.',
        existing.id
      )
    }
    return existing.id
  }

  const now = Math.floor(Date.now() / 1000)
  const result = db.prepare(
    `INSERT INTO scripts (name, description, file_path, interpreter, args, schedule, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    'Reddit Digest',
    'Collects top Reddit posts for your configured subreddits.',
    filePath,
    interpreter,
    null,
    DEFAULT_REDDIT_DIGEST_SCHEDULE,
    1,
    now
  )
  setSetting(REDDIT_DIGEST_SCRIPT_ID_SETTING, String(result.lastInsertRowid))
  deleteSetting(REDDIT_DIGEST_AUTO_DISABLED_SETTING)
  return result.lastInsertRowid as number
}

export function syncScriptsFromHomeDir(db: Database.Database): void {
  db.prepare('UPDATE scripts SET enabled = 0 WHERE schedule IS NULL AND enabled != 0').run()

  const scriptHomeDir = getSetting(SCRIPT_HOME_DIR_SETTING)
  if (!scriptHomeDir) {
    return
  }

  if (!existsSync(scriptHomeDir)) {
    return
  }

  let stats: ReturnType<typeof statSync>
  try {
    stats = statSync(scriptHomeDir)
  } catch {
    return
  }

  if (!stats.isDirectory()) {
    return
  }

  const normalizedHomeDir = resolve(scriptHomeDir).toLowerCase()

  const existingScripts = db
    .prepare('SELECT id, file_path FROM scripts')
    .all() as Array<{ id: number; file_path: string }>
  const existingByPath = new Map(existingScripts.map((script) => [script.file_path, script]))

  const entries = readdirSync(scriptHomeDir, { withFileTypes: true })
  const insertScript = db.prepare(
    'INSERT INTO scripts (name, description, file_path, interpreter, args, schedule, enabled, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const deleteScript = db.prepare('DELETE FROM scripts WHERE id = ?')

  const discoveredPaths = new Set<string>()

  const now = Math.floor(Date.now() / 1000)
  for (const entry of entries) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.py') {
      continue
    }

    const filePath = resolve(join(scriptHomeDir, entry.name))
    discoveredPaths.add(filePath)
    if (existingByPath.has(filePath)) {
      continue
    }

    // Manual schedule implies auto-run is off until the user selects a schedule.
    insertScript.run(formatScriptName(entry.name), null, filePath, 'python3', null, null, 0, now)
  }

  for (const script of existingScripts) {
    const scriptPath = resolve(script.file_path)
    const scriptDir = resolve(dirname(scriptPath)).toLowerCase()
    if (scriptDir === normalizedHomeDir && !discoveredPaths.has(scriptPath)) {
      deleteScript.run(script.id)
    }
  }
}

export function runScriptById(
  db: Database.Database,
  script: ScriptWithLastRun,
  trigger: ScriptRunTrigger = 'manual'
): Promise<void> {
  return runScript(
    db,
    script,
    {
      extraArgs: buildExtraArgs(db, script),
      persistFullStdout: isBundledRedditDigestScript(script)
    },
    (chunk) => emitOutput?.(chunk),
    activeRuns
  ).then((completion) => {
    const finalizedCompletion = postProcessCompletion(db, script, completion)
    const event = buildRunCompleteEvent(script, finalizedCompletion, trigger)
    try {
      persistRunNotification(db, event)
    } catch (err) {
      console.error(`[Scripts] Failed to persist run notification for script ${script.id}:`, err)
    } finally {
      emitRunComplete?.(event)
      emitUpdated?.()
      if (event.trigger !== 'manual' && event.kind === 'run_complete') {
        if (isBundledRedditDigestScript(script)) {
          notifyRedditDigest(event.severity, event.message)
        } else {
          notifyScriptAutoRun(event.scriptName, event.trigger, event.severity, event.message)
        }
      }
    }
  })
}

export function refreshScriptSchedule(
  db: Database.Database,
  scriptId: number,
  options?: { runOnAppStart?: boolean }
): void {
  const script = db
    .prepare(
      `SELECT s.*, r.started_at, r.finished_at, r.exit_code, 0 AS is_stale
       FROM scripts s
       LEFT JOIN script_runs r ON r.id = (
         SELECT id FROM script_runs WHERE script_id = s.id ORDER BY started_at DESC LIMIT 1
       )
       WHERE s.id = ?`
    )
    .get(scriptId) as ScriptWithLastRun | undefined

  if (!script) {
    scheduler.unregisterScript(scriptId)
    return
  }

  scheduler.registerScript(script, options)
}

export const ScriptManagerModule: DataSourceModule = {
  id: 'scripts',
  displayName: 'Script Manager',
  initialize(db: Database.Database): void {
    ensureBundledRedditDigestScript(db)
    syncScriptsFromHomeDir(db)
    scheduler.initialize(
      db,
      (script, context) => runScriptById(db, script, mapSchedulerTrigger(context.trigger)),
      (warning) => {
        const event = buildStartupWarningEvent(warning)
        try {
          persistStartupWarningNotification(db, event)
        } catch (err) {
          console.error(
            `[Scripts] Failed to persist startup warning for script ${warning.scriptId}:`,
            err
          )
        } finally {
          emitRunComplete?.(event)
          emitUpdated?.()
          notifyScriptAutoRun(event.scriptName, 'startup_warning', event.severity, event.message)
        }
      }
    )
    console.log('[Scripts] Module initialized')
  },
  shutdown(): void {
    scheduler.shutdown()
    emitRedditUpdated = null
    console.log('[Scripts] Module shutdown')
  }
}
