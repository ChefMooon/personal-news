import { SUPPORTED_SPORTS, isSupportedSport, type SupportedSport } from '../../../../shared/sports'

export const SPORTS_PAGE_SPORT_ORDER_KEY = 'sports_page_sport_order'

export function normalizeSportOrder(value: unknown): SupportedSport[] {
  if (typeof value !== 'string' || !value.trim()) {
    return SUPPORTED_SPORTS
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return SUPPORTED_SPORTS
    }

    const filtered = parsed.filter((entry): entry is SupportedSport => typeof entry === 'string' && isSupportedSport(entry))
    const merged = [...filtered]
    for (const sport of SUPPORTED_SPORTS) {
      if (!merged.includes(sport)) {
        merged.push(sport)
      }
    }
    return merged
  } catch {
    return SUPPORTED_SPORTS
  }
}