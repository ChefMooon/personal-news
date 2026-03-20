export function formatRelativeTime(unixTs: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = now - unixTs

  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  if (diff < 2592000) return `${Math.floor(diff / 604800)}w ago`
  return `${Math.floor(diff / 2592000)}mo ago`
}

export function formatFutureTime(unixTs: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = unixTs - now

  if (diff <= 0) return 'now'
  if (diff < 3600) return `Starts in ${Math.floor(diff / 60)}m`
  if (diff < 86400) {
    const hours = Math.floor(diff / 3600)
    const minutes = Math.floor((diff % 3600) / 60)
    return `Starts in ${hours}h ${minutes}m`
  }
  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  return `Starts in ${days}d ${hours}h`
}

export function formatAbsoluteTime(unixTs: number): string {
  return new Date(unixTs * 1000).toLocaleString()
}

export function formatDuration(seconds: number | null): string | null {
  if (seconds == null || seconds < 0) {
    return null
  }

  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}
