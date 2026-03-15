import React from 'react'
import { useScripts } from '../hooks/useScripts'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { formatRelativeTime } from '../lib/time'
import { AlertTriangle, Play } from 'lucide-react'
import type { ScriptWithLastRun } from '../../../shared/ipc-types'

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

function isScriptStale(script: ScriptWithLastRun): boolean {
  if (!script.schedule || !script.finished_at || script.exit_code !== 0) return false
  const now = Math.floor(Date.now() / 1000)
  try {
    const s = JSON.parse(script.schedule) as { type: string; hour?: number; minute?: number; minutes?: number }
    if (s.type === 'interval' && s.minutes) {
      return now - script.finished_at > s.minutes * 60 * 1.5
    }
    if (s.type === 'fixed_time') {
      // Stale if last run was more than 25 hours ago
      return now - script.finished_at > 25 * 3600
    }
  } catch {
    // ignore
  }
  return false
}

interface ScriptRowProps {
  script: ScriptWithLastRun
}

function ScriptRow({ script }: ScriptRowProps): React.ReactElement {
  const stale = isScriptStale(script)

  return (
    <div className="flex items-start gap-4 py-4 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">{script.name}</span>
          {stale && (
            <span title="Script may be stale" className="text-yellow-500">
              <AlertTriangle className="h-4 w-4" />
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{getScheduleDescription(script.schedule)}</p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">{script.file_path}</p>
      </div>

      {/* Last run info */}
      <div className="text-right shrink-0">
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

      {/* Run Now button — no-op in prototype */}
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={() => {
          console.log(`[ScriptManager] Run Now clicked for script ${script.id}: ${script.name}`)
        }}
      >
        <Play className="h-3.5 w-3.5 mr-1" />
        Run Now
      </Button>
    </div>
  )
}

export default function ScriptManager(): React.ReactElement {
  const { scripts, loading } = useScripts()

  return (
    <div className="flex flex-col h-full px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Script Manager</h1>
        <Badge variant="warning" className="text-xs">
          1 stale script
        </Badge>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading scripts...</p>
      ) : scripts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No scripts registered.</p>
      ) : (
        <div>
          {scripts.map((script) => (
            <ScriptRow key={script.id} script={script} />
          ))}
        </div>
      )}
    </div>
  )
}
