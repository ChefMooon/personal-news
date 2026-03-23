import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '../../components/ui/button'
import { formatRelativeTime } from '../../lib/time'

interface StaleWarningProps {
  lastPolledAt: number | null
  isStale: boolean
  onDismiss: () => void
  onSyncNow: () => Promise<void>
  loading?: boolean
}

export function StaleWarning({
  lastPolledAt,
  isStale,
  onDismiss,
  onSyncNow,
  loading
}: StaleWarningProps): React.ReactElement | null {
  if (!isStale) return null

  const lastSyncText = lastPolledAt ? formatRelativeTime(lastPolledAt) : 'never'

  return (
    <div className="flex items-center gap-3 rounded-md border border-amber-600/50 bg-amber-600/10 dark:border-amber-400/50 dark:bg-amber-400/10 px-4 py-3 mb-4">
      <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-300 shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium text-amber-800 dark:text-amber-200">
          Last synced: {lastSyncText}.
        </span>{' '}
        Messages on ntfy.sh expire after 24 hours — some saved posts may have been lost.
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="outline" onClick={() => void onSyncNow()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Sync Now
        </Button>
        <Button size="sm" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}
