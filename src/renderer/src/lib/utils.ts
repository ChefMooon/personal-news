import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

export function toRedditPostUrl(permalinkOrUrl: string): string {
  const raw = permalinkOrUrl.trim()
  if (!raw) return 'https://reddit.com'

  const schemeFixed = raw.replace(/^https\/\//i, 'https://').replace(/^http\/\//i, 'http://')

  if (/^https?:\/\//i.test(schemeFixed)) {
    try {
      const parsed = new URL(schemeFixed)
      if (parsed.hostname.toLowerCase().endsWith('reddit.com')) {
        return `https://reddit.com${parsed.pathname}${parsed.search}${parsed.hash}`
      }
      return schemeFixed
    } catch {
      return 'https://reddit.com'
    }
  }

  if (/^(?:www\.)?reddit\.com\//i.test(schemeFixed)) {
    return `https://${schemeFixed.replace(/^https?:\/\//i, '')}`
  }

  const path = schemeFixed.startsWith('/') ? schemeFixed : `/${schemeFixed}`
  return `https://reddit.com${path}`
}
