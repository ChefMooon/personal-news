import React, { useState, useEffect, useRef } from 'react'
import { useScripts } from '../hooks/useScripts'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { ScrollArea } from '../components/ui/scroll-area'
import { formatRelativeTime } from '../lib/time'
import { AlertTriangle, Play, Square, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import type { ScriptWithLastRun, ScriptRunRecord, ScriptOutputChunk } from '../../../shared/ipc-types'

function getScheduleDescription(schedule: string | null): string {
  if (!schedule) return 'Manual only'
  try {
    const s = JSON.parse(schedule) as { type: string; hour?: number; minute?: number; minutes?: number }
    if (s.type === 'on_app_start') return 'On app start'
    if (s.type === 'interval') return `Every ${s.minutes} minutes`
    if (s.type === 'fixed_time')
      return `Daily at ${String(s.hour ?? 0).padStart(2, '0')}:${String(s.minute ?? 0).padStart(2, '0')}`
  } catch {
    // ignore
  }
  return 'Unknown schedule'
}

function formatDuration(started: number, finished: number | null): string {
  if (!finished) return '…'
  const secs = finished - started
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

interface ScriptDetailPanelProps {
  script: ScriptWithLastRun
  isRunning: boolean
  outputLines: Map<number, ScriptOutputChunk[]>
  onRun: () => void
  onCancel: () => void
  getRunHistory: (id: number) => Promise<ScriptRunRecord[]>
}

function ScriptDetailPanel({
  script,
  isRunning,
  outputLines,
  onRun,
  onCancel,
  getRunHistory
}: ScriptDetailPanelProps): React.ReactElement {
  const [history, setHistory] = useState<ScriptRunRecord[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const outputEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHistoryLoading(true)
    getRunHistory(script.id)
      .then((h) => setHistory(h))
      .finally(() => setHistoryLoading(false))
  }, [script.id, getRunHistory, isRunning])

  // Latest run output — gather all chunks for the most recent runId
  const latestRunId = history?.[0]?.id ?? null
  const liveChunks: ScriptOutputChunk[] = latestRunId ? (outputLines.get(latestRunId) ?? []) : []

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [liveChunks.length])

  return (
    <div className="mt-2 pl-4 border-l-2 border-border space-y-3">
      {script.is_stale && (
        <div className="flex items-center gap-2 rounded-md bg-amber-500/10 text-amber-600 px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          This script is overdue — last successful run was longer ago than expected.
        </div>
      )}

      {/* Live output */}
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

      {/* Run history */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1">Run history</p>
        {historyLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !history || history.length === 0 ? (
          <p className="text-xs text-muted-foreground">No runs recorded.</p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Started</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Duration</th>
                  <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Exit</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map((run) => (
                  <tr key={run.id} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-muted-foreground">
                      {formatRelativeTime(run.started_at)}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">
                      {formatDuration(run.started_at, run.finished_at)}
                    </td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {isRunning ? (
          <Button size="sm" variant="destructive" onClick={onCancel} className="gap-1">
            <Square className="h-3.5 w-3.5" />
            Cancel
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={onRun} className="gap-1">
            <Play className="h-3.5 w-3.5" />
            Run Now
          </Button>
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
  getRunHistory: (id: number) => Promise<ScriptRunRecord[]>
}

function ScriptRow({
  script,
  isRunning,
  outputLines,
  onRun,
  onCancel,
  getRunHistory
}: ScriptRowProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b last:border-0 py-3">
      <div
        className="flex items-start gap-3 cursor-pointer select-none"
        onClick={() => setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setExpanded((prev) => !prev)}
      >
        <span className="mt-0.5 text-muted-foreground">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{script.name}</span>
            {isRunning && (
              <Badge variant="secondary" className="text-[10px] animate-pulse">Running…</Badge>
            )}
            {script.is_stale && !isRunning && (
              <span title="Script may be overdue" className="text-amber-500">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
            <p className="text-xs text-muted-foreground">
              <Clock className="h-3 w-3 inline mr-1 -mt-px" />
              {getScheduleDescription(script.schedule)}
            </p>
            <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]"
               title={script.file_path}>
              {script.file_path}
            </p>
          </div>
        </div>

        {/* Last run info */}
        <div className="text-right shrink-0" onClick={(e) => e.stopPropagation()}>
          {script.finished_at ? (
            <>
              <p className="text-xs text-muted-foreground">{formatRelativeTime(script.finished_at)}</p>
              {script.exit_code === 0 ? (
                <Badge variant="success" className="text-[10px] mt-1">Exit 0</Badge>
              ) : script.exit_code !== null ? (
                <Badge variant="destructive" className="text-[10px] mt-1">Exit {script.exit_code}</Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] mt-1">Running</Badge>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Never run</span>
          )}
        </div>

        {/* Quick run button */}
        <div onClick={(e) => e.stopPropagation()}>
          {isRunning ? (
            <Button
              size="sm"
              variant="destructive"
              className="shrink-0"
              onClick={() => onCancel(script.id)}
            >
              <Square className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => onRun(script.id)}
            >
              <Play className="h-3.5 w-3.5 mr-1" />
              Run Now
            </Button>
          )}
        </div>
      </div>

      {expanded && (
        <ScriptDetailPanel
          script={script}
          isRunning={isRunning}
          outputLines={outputLines}
          onRun={() => onRun(script.id)}
          onCancel={() => onCancel(script.id)}
          getRunHistory={getRunHistory}
        />
      )}
    </div>
  )
}

export default function ScriptManager(): React.ReactElement {
  const { scripts, loading, runningIds, outputLines, runScript, cancelScript, getRunHistory } =
    useScripts()

  const staleCount = scripts.filter((s) => s.is_stale).length

  return (
    <div className="flex flex-col h-full px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Script Manager</h1>
        {staleCount > 0 && (
          <Badge variant="warning" className="text-xs">
            {staleCount} stale {staleCount === 1 ? 'script' : 'scripts'}
          </Badge>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading scripts…</p>
      ) : scripts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scripts registered.</p>
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
              getRunHistory={getRunHistory}
            />
          ))}
        </div>
      )}
    </div>
  )
}

