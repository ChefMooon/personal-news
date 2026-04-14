type SportEventState = 'scheduled' | 'live' | 'final' | 'unknown'

type SportEventStatusInput = {
  status: string | null | undefined
  homeScore?: string | null | undefined
  awayScore?: string | null | undefined
  eventDate?: string | null | undefined
  eventTime?: string | null | undefined
  now?: number
}

const FINAL_STATUS_PATTERN = /(finished|final|completed|game over|ended|after penalties|after extra time|full time|full-time|match finished|final score|result|ft|aet)/i
const LIVE_STATUS_PATTERN = /(live|in progress|half time|halftime|break|period|quarter|inning|set\s*\d|overtime|extra time|top\s*\d|bottom\s*\d|ot|shootout|penalties|intermission|1st inning|2nd inning|3rd inning|4th inning|5th inning|6th inning|7th inning|8th inning|9th inning|\b(?:1st|2nd|3rd|4th)\b|\d{1,3}(?:\+\d{1,2})?['’])/i
const SCHEDULED_STATUS_PATTERN = /(scheduled|not started|not begun|preview|to be played|fixture|time tba|tba|tbd|upcoming)/i
const NON_LIVE_STATUS_PATTERN = /(postponed|cancelled|canceled|abandoned|suspended|delayed|no contest|n\/c)/i
const SCORE_STARTED_GRACE_MS = 15 * 60 * 1000
const SCORE_LIVE_WINDOW_MS = 6 * 60 * 60 * 1000

function normalizeStatusText(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function parseEventTimestamp(eventDate: string | null | undefined, eventTime: string | null | undefined): number | null {
  if (!eventDate) {
    return null
  }

  const normalizedTime = eventTime?.trim() ? `${eventTime.trim()}:00` : '12:00:00'
  const timestamp = Date.parse(`${eventDate}T${normalizedTime}Z`)
  return Number.isNaN(timestamp) ? null : timestamp
}

function hasRecordedScore(homeScore: string | null | undefined, awayScore: string | null | undefined): boolean {
  return Boolean((homeScore != null && homeScore !== '') || (awayScore != null && awayScore !== ''))
}

export function classifySportEventState({
  status,
  homeScore,
  awayScore,
  eventDate,
  eventTime,
  now = Date.now()
}: SportEventStatusInput): SportEventState {
  const normalizedStatus = normalizeStatusText(status)

  if (normalizedStatus) {
    if (FINAL_STATUS_PATTERN.test(normalizedStatus)) {
      return 'final'
    }

    if (NON_LIVE_STATUS_PATTERN.test(normalizedStatus)) {
      return 'scheduled'
    }

    if (LIVE_STATUS_PATTERN.test(normalizedStatus)) {
      return 'live'
    }

    if (SCHEDULED_STATUS_PATTERN.test(normalizedStatus)) {
      return 'scheduled'
    }
  }

  const eventTimestamp = parseEventTimestamp(eventDate, eventTime)
  const hasScore = hasRecordedScore(homeScore, awayScore)
  if (hasScore) {
    if (eventTimestamp == null) {
      return 'unknown'
    }

    if (eventTimestamp > now + SCORE_STARTED_GRACE_MS) {
      return 'scheduled'
    }

    if (eventTimestamp >= now - SCORE_LIVE_WINDOW_MS) {
      return 'live'
    }
  }

  if (eventTimestamp != null && eventTimestamp > now) {
    return 'scheduled'
  }

  return 'unknown'
}

export function isLiveSportEvent(input: SportEventStatusInput): boolean {
  return classifySportEventState(input) === 'live'
}

export function isFinalSportEvent(input: SportEventStatusInput): boolean {
  return classifySportEventState(input) === 'final'
}

export function normalizeEventStatus(status: string | null | undefined, progress: string | null | undefined): string | null {
  const statusText = normalizeStatusText(status)
  const progressText = normalizeStatusText(progress)

  if (!statusText) {
    return progressText
  }

  if (!progressText) {
    return statusText
  }

  const statusState = classifySportEventState({ status: statusText })
  const progressState = classifySportEventState({ status: progressText })

  if (progressState === 'final' && statusState !== 'final') {
    return progressText
  }

  if (progressState === 'live' && statusState !== 'live') {
    return progressText
  }

  if (progressState !== 'unknown' && statusState === 'unknown') {
    return progressText
  }

  return statusText
}