import React from 'react'
import { cn } from '../../lib/utils'

export function GameCard({
  header,
  body,
  footer,
  tone = 'default',
  className
}: {
  header: React.ReactNode
  body?: React.ReactNode
  footer?: React.ReactNode
  tone?: 'default' | 'live' | 'muted'
  className?: string
}): React.ReactElement {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-3',
        tone === 'live' && 'border-emerald-400/40 bg-emerald-500/5',
        tone === 'muted' && 'bg-muted/30',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">{header}</div>
      {body ? <div className="mt-2">{body}</div> : null}
      {footer ? <div className="mt-2 text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  )
}

export default GameCard