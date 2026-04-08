export const SPORTS_OPTIONS = [
  { id: 'Baseball', label: 'Baseball' },
  { id: 'Basketball', label: 'Basketball' },
  { id: 'Ice Hockey', label: 'Hockey' }
] as const

export type SupportedSport = (typeof SPORTS_OPTIONS)[number]['id']

export const ALL_SPORTS_ID = 'all'

export type WidgetSport = SupportedSport | typeof ALL_SPORTS_ID

export const SPORTS_WIDGET_OPTIONS = [
  { id: ALL_SPORTS_ID, label: 'All Sports' },
  ...SPORTS_OPTIONS
] as const

export const DEFAULT_SPORT: SupportedSport = SPORTS_OPTIONS[0].id

export const SUPPORTED_SPORTS = SPORTS_OPTIONS.map((option) => option.id) as SupportedSport[]

export function isSupportedSport(value: string): value is SupportedSport {
  return SUPPORTED_SPORTS.includes(value as SupportedSport)
}

export function isWidgetSport(value: string): value is WidgetSport {
  return value === ALL_SPORTS_ID || isSupportedSport(value)
}

export function getSportLabel(sport: string): string {
  return SPORTS_WIDGET_OPTIONS.find((option) => option.id === sport)?.label ?? sport
}
