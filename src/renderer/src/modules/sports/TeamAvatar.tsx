import React from 'react'
import { cn } from '../../lib/utils'
import { getTeamInitials } from './page-utils'

function normalizeTeamImageUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function TeamAvatar({
  name,
  src,
  className,
  fallbackClassName
}: {
  name: string
  src: string | null | undefined
  className: string
  fallbackClassName?: string
}): React.ReactElement {
  const imageUrl = normalizeTeamImageUrl(src)

  if (imageUrl) {
    return <img src={imageUrl} alt="" className={cn('shrink-0 border bg-muted/40 object-contain p-0.5', className)} loading="lazy" />
  }

  return (
    <div className={cn('flex shrink-0 items-center justify-center border bg-muted text-xs font-semibold text-muted-foreground', className, fallbackClassName)}>
      {getTeamInitials(name)}
    </div>
  )
}

export default TeamAvatar