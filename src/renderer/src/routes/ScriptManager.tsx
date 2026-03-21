import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useScripts } from '../hooks/useScripts'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { ScrollArea } from '../components/ui/scroll-area'
import { Switch } from '../components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { formatRelativeTime } from '../lib/time'
import { cn } from '../lib/utils'
import {
  AlertTriangle,
  Play,
  Square,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderOpen,
  RefreshCw,
  Settings,
  Save
} from 'lucide-react'
import { IPC } from '../../../shared/ipc-types'
import type {
  ScriptWithLastRun,
  ScriptRunRecord,
  ScriptOutputChunk,
  ScriptScheduleInput,
  ScriptUpdateInput
} from '../../../shared/ipc-types'

type ScriptScheduleType = ScriptScheduleInput['type']

interface ScriptDraft {
  name: string
  description: string
  filePath: string
  interpreter: string
  args: string
  scheduleType: ScriptScheduleType
  intervalMinutes: string
  intervalRunOnAppStart: boolean
  hour: string
  minute: string
  weeklyDays: number[]
  dayOfMonth: string
  enabled: boolean
}

const WEEKDAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' }
]

function normalizeWeekDays(days: number[]): number[] {
  const unique = new Set<number>()
  for (const value of days) {
    const day = Math.floor(value)
    if (Number.isFinite(day) && day >= 0 && day <= 6) {
      unique.add(day)
    }
  }
  const normalized = [...unique].sort((a, b) => a - b)
  return normalized.length > 0 ? normalized : [1]
}

function scheduleInputFromDraft(draft: ScriptDraft): ScriptScheduleInput {
  if (draft.scheduleType === 'manual') return { type: 'manual' }
  if (draft.scheduleType === 'on_app_start') return { type: 'on_app_start' }
  if (draft.scheduleType === 'interval') {
    return {
      type: 'interval',
      minutes: Number.parseInt(draft.intervalMinutes || '0', 10),
      runOnAppStart: draft.intervalRunOnAppStart
    }
  }
  if (draft.scheduleType === 'weekly') {
    return {
      type: 'weekly',
      hour: Number.parseInt(draft.hour || '0', 10),
      minute: Number.parseInt(draft.minute || '0', 10),
      daysOfWeek: normalizeWeekDays(draft.weeklyDays)
    }
  }
  if (draft.scheduleType === 'monthly') {
    return {
      type: 'monthly',
      hour: Number.parseInt(draft.hour || '0', 10),
      minute: Number.parseInt(draft.minute || '0', 10),
      dayOfMonth: Number.parseInt(draft.dayOfMonth || '1', 10)
    }
  }
  return {
    type: 'daily',
    hour: Number.parseInt(draft.hour || '0', 10),
    minute: Number.parseInt(draft.minute || '0', 10)
  }
}

function parseSchedule(
  schedule: string | null
): Pick<
  ScriptDraft,
  'scheduleType' | 'intervalMinutes' | 'intervalRunOnAppStart' | 'hour' | 'minute' | 'weeklyDays' | 'dayOfMonth'
> {
  if (!schedule) {
    return {
      scheduleType: 'manual',
      intervalMinutes: '60',
      intervalRunOnAppStart: false,
      hour: '9',
      minute: '0',
      weeklyDays: [1],
      dayOfMonth: '1'
    }
  }

  try {
    const parsed = JSON.parse(schedule) as {
      type: string
      minutes?: number
      run_on_app_start?: boolean
      hour?: number
      minute?: number
      days_of_week?: number[]
      day_of_month?: number
    }
    if (parsed.type === 'on_app_start') {
      return {
        scheduleType: 'on_app_start',
        intervalMinutes: '60',
        intervalRunOnAppStart: false,
        hour: '9',
        minute: '0',
        weeklyDays: [1],
        dayOfMonth: '1'
      }
    }
    if (parsed.type === 'interval') {
      return {
        scheduleType: 'interval',
        intervalMinutes: String(parsed.minutes ?? 60),
        intervalRunOnAppStart: Boolean(parsed.run_on_app_start),
        hour: '9',
        minute: '0',
        weeklyDays: [1],
        dayOfMonth: '1'
      }
    }
    if (parsed.type === 'daily' || parsed.type === 'fixed_time') {
      return {
        scheduleType: 'daily',
        intervalMinutes: '60',
        intervalRunOnAppStart: false,
        hour: String(parsed.hour ?? 9),
        minute: String(parsed.minute ?? 0),
        weeklyDays: [1],
        dayOfMonth: '1'
      }
    }
    if (parsed.type === 'weekly') {
      return {
        scheduleType: 'weekly',
        intervalMinutes: '60',
        intervalRunOnAppStart: false,
        hour: String(parsed.hour ?? 9),
        minute: String(parsed.minute ?? 0),
        weeklyDays: normalizeWeekDays(parsed.days_of_week ?? [1]),
        dayOfMonth: '1'
      }
    }
    if (parsed.type === 'monthly') {
      return {
        scheduleType: 'monthly',
        intervalMinutes: '60',
        intervalRunOnAppStart: false,
        hour: String(parsed.hour ?? 9),
        minute: String(parsed.minute ?? 0),
        weeklyDays: [1],
        dayOfMonth: String(parsed.day_of_month ?? 1)
      }
    }
  } catch {
    // Ignore malformed schedule data and fall back to manual.
  }

  return {
    scheduleType: 'manual',
    intervalMinutes: '60',
    intervalRunOnAppStart: false,
    hour: '9',
    minute: '0',
    weeklyDays: [1],
    dayOfMonth: '1'
  }
}

function makeDraft(script: ScriptWithLastRun): ScriptDraft {
  const schedule = parseSchedule(script.schedule)
  return {
    name: script.name,
    description: script.description ?? '',
    filePath: script.file_path,
    interpreter: script.interpreter,
    args: script.args ?? '',
    scheduleType: schedule.scheduleType,
    intervalMinutes: schedule.intervalMinutes,
    intervalRunOnAppStart: schedule.intervalRunOnAppStart,
    hour: schedule.hour,
    minute: schedule.minute,
    weeklyDays: schedule.weeklyDays,
    dayOfMonth: schedule.dayOfMonth,
    enabled: script.enabled === 1
  }
}

function normalizeInterpreter(value: string): string {
  const v = value.trim().toLowerCase()
  if (v === 'python' || v === 'python3' || v === 'py') {
    return 'python3'
  }
  return value.trim()
}

function getInterpreterOptions(scriptInterpreter: string): Array<{ value: string; label: string }> {
  const options: Array<{ value: string; label: string }> = [
    { value: 'python3', label: 'Python' }
  ]
  const normalizedScript = normalizeInterpreter(scriptInterpreter)
  if (normalizedScript && !options.some((o) => o.value === normalizedScript)) {
    options.push({ value: normalizedScript, label: normalizedScript })
  }
  return options
}

function getScheduleDescription(schedule: string | null): string {
  if (!schedule) return 'Manual only'
  try {
    const s = JSON.parse(schedule) as {
      type: string
      hour?: number
      minute?: number
      minutes?: number
      run_on_app_start?: boolean
      days_of_week?: number[]
      day_of_month?: number
    }
    if (s.type === 'on_app_start') return 'On app start'
    if (s.type === 'interval') {
      const base = `Every ${s.minutes} minutes`
      return s.run_on_app_start ? `${base} (plus once at app start)` : base
    }
    if (s.type === 'daily' || s.type === 'fixed_time') {
      return `Daily at ${String(s.hour ?? 0).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')}`
    }
    if (s.type === 'weekly') {
      const days = normalizeWeekDays(s.days_of_week ?? [1]).map((day) => WEEKDAY_OPTIONS.find((o) => o.value === day)?.label ?? String(day))
      return `Weekly on ${days.join(', ')} at ${String(s.hour ?? 0).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')}`
    }
    if (s.type === 'monthly') {
      return `Monthly on day ${s.day_of_month ?? 1} at ${String(s.hour ?? 0).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')}`
    }
  } catch {
    // Ignore malformed schedule display data.
  }
  return 'Unknown schedule'
}

function getLocalTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your system time zone'
}

function formatDuration(started: number, finished: number | null): string {
  if (!finished) return '...'
  const secs = finished - started
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

interface ScriptDetailPanelProps {
  script: ScriptWithLastRun
  isRunning: boolean
  outputLines: Map<number, ScriptOutputChunk[]>
  getRunHistory: (id: number) => Promise<ScriptRunRecord[]>
  onUpdate: (input: ScriptUpdateInput) => Promise<{ ok: boolean; error: string | null }>
}

function ScriptDetailPanel({
  script,
  isRunning,
  outputLines,
  getRunHistory,
  onUpdate
}: ScriptDetailPanelProps): React.ReactElement {
  const [history, setHistory] = useState<ScriptRunRecord[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null)
  const [initialDraft, setInitialDraft] = useState<ScriptDraft>(() => makeDraft(script))
  const [draft, setDraft] = useState<ScriptDraft>(() => makeDraft(script))
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const outputEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const next = makeDraft(script)
    setInitialDraft(next)
    setDraft(next)
  }, [script])

  useEffect(() => {
    setHistoryLoading(true)
    getRunHistory(script.id)
      .then((h) => setHistory(h))
      .finally(() => setHistoryLoading(false))
  }, [script.id, getRunHistory, isRunning])

  const latestRunId = history?.[0]?.id ?? null
  const liveChunks: ScriptOutputChunk[] = latestRunId ? (outputLines.get(latestRunId) ?? []) : []

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveChunks.length])

  const interpreterOptions = useMemo(() => getInterpreterOptions(script.interpreter), [script.interpreter])
  const localTimeZone = useMemo(() => getLocalTimeZone(), [])

  const hasChanges = useMemo(() => {
    return JSON.stringify(draft) !== JSON.stringify(initialDraft)
  }, [draft, initialDraft])

  const save = async (): Promise<void> => {
    setSaveError(null)
    setSaveSuccess(null)
    setSaving(true)
    const result = await onUpdate({
      id: script.id,
      name: draft.name,
      description: draft.description.trim() || null,
      file_path: draft.filePath,
      interpreter: normalizeInterpreter(draft.interpreter),
      args: draft.args.trim() || null,
      schedule: scheduleInputFromDraft(draft),
      enabled: script.enabled === 1
    })
    setSaving(false)
    if (!result.ok) {
      setSaveError(result.error ?? 'Failed to save script settings.')
      return
    }
    setSaveSuccess('Saved')
  }

  return (
    <div className="mt-2 pl-4 border-l-2 border-border space-y-4">
      {script.is_stale && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 text-amber-600 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          This script is overdue. Last successful run was longer ago than expected.
        </div>
      )}

      <div className="rounded-md border p-3 space-y-3 bg-muted/20">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Script configuration</p>
          <div className="flex items-center gap-2">
            {saveSuccess && <span className="text-xs text-emerald-600">{saveSuccess}</span>}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDraft(initialDraft)}
              disabled={!hasChanges}
            >
              Reset
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={saving || !hasChanges}>
              <Save className="h-3.5 w-3.5 mr-1" />
              Save
            </Button>
          </div>
        </div>

        {saveError && <p className="text-xs text-red-600">{saveError}</p>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Name</span>
            <Input value={draft.name} onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))} />
          </label>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Description</span>
            <Input
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Optional summary"
            />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-xs text-muted-foreground">File path</span>
            <Input value={draft.filePath} readOnly disabled />
          </label>

          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Interpreter</span>
            <Select
              value={draft.interpreter}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, interpreter: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select interpreter" />
              </SelectTrigger>
              <SelectContent>
                {interpreterOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Arguments</span>
            <Input
              value={draft.args}
              onChange={(e) => setDraft((prev) => ({ ...prev, args: e.target.value }))}
              placeholder="Optional"
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md border p-3 space-y-2 h-full">
            <span className="text-xs text-muted-foreground">Schedule</span>
            <Select
              value={draft.scheduleType}
              onValueChange={(value) => {
                const scheduleType = value as ScriptScheduleType
                setDraft((prev) => ({
                  ...prev,
                  scheduleType
                }))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select schedule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual (Run Now only)</SelectItem>
                <SelectItem value="on_app_start">On app start (one-time)</SelectItem>
                <SelectItem value="interval">Interval (app must be running)</SelectItem>
                <SelectItem value="daily">Daily (app must be running)</SelectItem>
                <SelectItem value="weekly">Weekly (app must be running)</SelectItem>
                <SelectItem value="monthly">Monthly (app must be running)</SelectItem>
              </SelectContent>
            </Select>

            {draft.scheduleType === 'manual' && (
              <p className="text-[11px] text-muted-foreground">
                Runs only when you click Run Now.
              </p>
            )}

            {draft.scheduleType === 'on_app_start' && (
              <p className="text-[11px] text-muted-foreground">
                Runs once when the app starts.
              </p>
            )}

            {draft.scheduleType === 'interval' && (
              <>
                <label className="space-y-1 block">
                  <span className="text-xs text-muted-foreground">Minutes</span>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={draft.intervalMinutes}
                    onChange={(e) => setDraft((prev) => ({ ...prev, intervalMinutes: e.target.value }))}
                  />
                </label>
                <div className="flex items-center justify-between rounded-md border px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">Also run once when app starts</p>
                  <Switch
                    checked={draft.intervalRunOnAppStart}
                    onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, intervalRunOnAppStart: checked }))}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Interval runs only while the app is open.
                </p>
              </>
            )}

            {(draft.scheduleType === 'daily' || draft.scheduleType === 'fixed_time') && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Hour (24h)</span>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={draft.hour}
                      onChange={(e) => setDraft((prev) => ({ ...prev, hour: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Minute</span>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={draft.minute}
                      onChange={(e) => setDraft((prev) => ({ ...prev, minute: e.target.value }))}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Uses your local time zone ({localTimeZone}) from Windows system time zone settings.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Change it in Windows Settings &gt; Time &amp; language &gt; Date &amp; time &gt; Time zone.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Runs only while the app is open.
                </p>
              </>
            )}

            {draft.scheduleType === 'weekly' && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Hour (24h)</span>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={draft.hour}
                      onChange={(e) => setDraft((prev) => ({ ...prev, hour: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Minute</span>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={draft.minute}
                      onChange={(e) => setDraft((prev) => ({ ...prev, minute: e.target.value }))}
                    />
                  </label>
                </div>
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">Days of week</span>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
                    {WEEKDAY_OPTIONS.map((option) => {
                      const selected = draft.weeklyDays.includes(option.value)
                      return (
                        <Button
                          key={option.value}
                          type="button"
                          size="sm"
                          variant="outline"
                          className={cn(selected && 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground')}
                          onClick={() =>
                            setDraft((prev) => {
                              const hasDay = prev.weeklyDays.includes(option.value)
                              if (hasDay) {
                                const next = prev.weeklyDays.filter((d) => d !== option.value)
                                return { ...prev, weeklyDays: next.length > 0 ? next : prev.weeklyDays }
                              }
                              return { ...prev, weeklyDays: [...prev.weeklyDays, option.value].sort((a, b) => a - b) }
                            })
                          }
                        >
                          {option.label}
                        </Button>
                      )
                    })}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Uses your local time zone ({localTimeZone}) from Windows system time zone settings.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Runs only while the app is open.
                </p>
              </>
            )}

            {draft.scheduleType === 'monthly' && (
              <>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Day (1-31)</span>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={draft.dayOfMonth}
                      onChange={(e) => setDraft((prev) => ({ ...prev, dayOfMonth: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Hour (24h)</span>
                    <Input
                      type="number"
                      min={0}
                      max={23}
                      value={draft.hour}
                      onChange={(e) => setDraft((prev) => ({ ...prev, hour: e.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs text-muted-foreground">Minute</span>
                    <Input
                      type="number"
                      min={0}
                      max={59}
                      value={draft.minute}
                      onChange={(e) => setDraft((prev) => ({ ...prev, minute: e.target.value }))}
                    />
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  On months with fewer days than selected (for example day 31 in April), that month is skipped.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Uses your local time zone ({localTimeZone}) from Windows system time zone settings.
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Runs only while the app is open.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {liveChunks.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Live output</p>
          <ScrollArea className="h-32 rounded-md border bg-muted/40 p-2">
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
              {liveChunks.map((c) => c.text).join('')}
            </pre>
            <div ref={outputEndRef} />
          </ScrollArea>
        </div>
      )}

      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Run history</p>
        {historyLoading ? (
          <p className="text-xs text-muted-foreground">Loading...</p>
        ) : !history || history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No runs recorded.</p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground w-4"></th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Started</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Duration</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Exit</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map((run) => (
                  <React.Fragment key={run.id}>
                    <tr
                      className="border-b last:border-0 cursor-pointer hover:bg-muted/30"
                      onClick={() => setSelectedRunId((prev) => (prev === run.id ? null : run.id))}
                    >
                      <td className="px-3 py-1.5 text-muted-foreground">
                        {selectedRunId === run.id ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{formatRelativeTime(run.started_at)}</td>
                      <td className="px-3 py-1.5 font-mono text-muted-foreground">{formatDuration(run.started_at, run.finished_at)}</td>
                      <td className="px-3 py-1.5">
                        {run.exit_code === null ? (
                          <Badge variant="secondary" className="text-[10px]">Running</Badge>
                        ) : run.exit_code === 0 ? (
                          <Badge variant="success" className="text-[10px]">0</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">{run.exit_code}</Badge>
                        )}
                      </td>
                    </tr>
                    {selectedRunId === run.id && (
                      <tr className="border-b last:border-0 bg-muted/20">
                        <td colSpan={4} className="px-3 py-2">
                          {run.stdout || run.stderr ? (
                            <ScrollArea className="h-32 rounded-md border bg-muted/40 p-2">
                              <pre className="text-[11px] font-mono whitespace-pre-wrap break-all">
                                {[run.stdout, run.stderr].filter(Boolean).join('\n--- stderr ---\n')}
                              </pre>
                            </ScrollArea>
                          ) : (
                            <p className="text-xs text-muted-foreground">No output captured.</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

interface ScriptRowProps {
  script: ScriptWithLastRun
  isRunning: boolean
  outputLines: Map<number, ScriptOutputChunk[]>
  onRun: (id: number) => void
  onCancel: (id: number) => void
  onSetEnabled: (id: number, enabled: boolean) => Promise<{ ok: boolean; error: string | null }>
  getRunHistory: (id: number) => Promise<ScriptRunRecord[]>
  onUpdate: (input: ScriptUpdateInput) => Promise<{ ok: boolean; error: string | null }>
}

function ScriptRow({
  script,
  isRunning,
  outputLines,
  onRun,
  onCancel,
  onSetEnabled,
  getRunHistory,
  onUpdate
}: ScriptRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)

  const isManual = !script.schedule

  const handleEnabledToggle = async (checked: boolean): Promise<void> => {
    setToggleError(null)
    const result = await onSetEnabled(script.id, checked)
    if (!result.ok) {
      setToggleError(result.error ?? 'Failed to update auto-run setting.')
    }
  }

  return (
    <div className="border-b last:border-0 py-3">
      <div
        className="flex items-center gap-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((prev) => !prev)}
      >
        <span className="text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0 py-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{script.name}</span>
            {isRunning && (
              <Badge variant="secondary" className="text-[10px] animate-pulse">Running...</Badge>
            )}
            {script.is_stale && !isRunning && (
              <span title="Script may be overdue" className="text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
            {script.enabled === 1 ? (
              <Badge variant="outline" className="text-[10px]">Auto-run on</Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px]">Auto-run off</Badge>
            )}
          </div>
          {script.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{script.description}</p>
          )}
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1 -mt-px" />
              {getScheduleDescription(script.schedule)}
            </p>
            <p className="text-xs text-muted-foreground font-mono truncate max-w-[320px]" title={script.file_path}>
              {script.file_path}
            </p>
          </div>
        </div>

        <div className="text-right shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
          {script.finished_at ? (
            <div className="flex items-center gap-2 justify-end whitespace-nowrap">
              <p className="text-xs text-muted-foreground">{formatRelativeTime(script.finished_at)}</p>
              {script.exit_code === 0 ? (
                <Badge variant="success" className="text-[10px]">Exit 0</Badge>
              ) : script.exit_code !== null ? (
                <Badge variant="destructive" className="text-[10px]">Exit {script.exit_code}</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px]">Running</Badge>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Never run</span>
          )}
        </div>

        <div className="self-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-md border px-3 py-2">
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">Auto-run</span>
              <Switch
                checked={script.enabled === 1}
                disabled={isManual}
                onCheckedChange={(checked) => {
                  void handleEnabledToggle(checked)
                }}
              />
            </div>
            {isRunning ? (
              <Button size="sm" variant="destructive" className="shrink-0 self-center" onClick={() => onCancel(script.id)}>
                <Square className="h-3.5 w-3.5 mr-1" />
                Cancel
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="shrink-0 self-center" onClick={() => onRun(script.id)}>
                <Play className="h-3.5 w-3.5 mr-1" />
                Run Now
              </Button>
            )}
          </div>
        </div>
      </div>

      {toggleError && <p className="text-xs text-red-600 mt-2 pl-7">{toggleError}</p>}

      {expanded && (
        <ScriptDetailPanel
          script={script}
          isRunning={isRunning}
          outputLines={outputLines}
          getRunHistory={getRunHistory}
          onUpdate={onUpdate}
        />
      )}
    </div>
  )
}

export default function ScriptManager(): React.ReactElement {
  const navigate = useNavigate()
  const {
    scripts,
    loading,
    refreshing,
    runningIds,
    outputLines,
    runScript,
    cancelScript,
    updateScript,
    setScriptEnabled,
    getRunHistory,
    refresh
  } = useScripts()
  const [scriptHomeDir, setScriptHomeDir] = useState<string>('')
  const [openFolderError, setOpenFolderError] = useState<string | null>(null)

  useEffect(() => {
    window.api
      .invoke(IPC.SETTINGS_GET, 'script_home_dir')
      .then((v) => {
        setScriptHomeDir(typeof v === 'string' ? v : '')
      })
      .catch(() => {})
  }, [])

  const openScriptFolder = async (): Promise<void> => {
    setOpenFolderError(null)
    const errMsg = (await window.api.invoke(IPC.SHELL_OPEN_PATH, scriptHomeDir)) as string
    if (errMsg) {
      setOpenFolderError(`Could not open folder: ${errMsg}`)
    }
  }

  const staleCount = scripts.filter((s) => s.is_stale).length

  return (
    <div className="flex flex-col h-full px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Script Manager</h1>
        <div className="flex items-center gap-2">
          {staleCount > 0 && (
            <Badge variant="warning" className="text-xs">
              {staleCount} stale {staleCount === 1 ? 'script' : 'scripts'}
            </Badge>
          )}
          <Button
            size="icon"
            variant="outline"
            disabled={!scriptHomeDir || refreshing}
            onClick={() => {
              void refresh()
            }}
            aria-label="Refresh scripts"
            title="Refresh scripts"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!scriptHomeDir}
            onClick={() => {
              void openScriptFolder()
            }}
          >
            <FolderOpen className="h-3.5 w-3.5 mr-1" />
            Open Folder
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/settings?tab=scripts')}>
            <Settings className="h-3.5 w-3.5 mr-1" />
            Script Settings
          </Button>
        </div>
      </div>
      {openFolderError && <p className="text-xs text-red-600 mb-2">{openFolderError}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading scripts...</p>
      ) : scripts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scripts found in the configured Script Home Directory.</p>
      ) : (
        <div>
          {scripts.map((script) => (
            <ScriptRow
              key={script.id}
              script={script}
              isRunning={runningIds.has(script.id)}
              outputLines={outputLines}
              onRun={runScript}
              onCancel={cancelScript}
              onSetEnabled={setScriptEnabled}
              getRunHistory={getRunHistory}
              onUpdate={updateScript}
            />
          ))}
        </div>
      )}
    </div>
  )
}
