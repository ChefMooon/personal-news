import { describe, expect, it } from 'vitest'
import {
  classifySportEventState,
  getSportEventLocalDateKey,
  isSportEventOnLocalDate
} from '../sports-event-utils'

describe('sports-event-utils', () => {
  it('classifies scheduled events', () => {
    const state = classifySportEventState({
      status: 'Scheduled',
      homeScore: null,
      awayScore: null,
      eventDate: '2026-04-24',
      eventTime: '19:30'
    })

    expect(state).toBe('scheduled')
  })

  it('classifies live events', () => {
    const state = classifySportEventState({
      status: '3rd Quarter',
      homeScore: '58',
      awayScore: '62',
      eventDate: '2026-04-23',
      eventTime: '19:00'
    })

    expect(state).toBe('live')
  })

  it('classifies final events', () => {
    const state = classifySportEventState({
      status: 'Final',
      homeScore: '102',
      awayScore: '98',
      eventDate: '2026-04-22',
      eventTime: '19:00'
    })

    expect(state).toBe('final')
  })

  it('derives local-date key from event date/time', () => {
    const localDate = getSportEventLocalDateKey('2026-04-23', '19:00')
    expect(localDate).not.toBeNull()
    expect(isSportEventOnLocalDate('2026-04-23', '19:00', localDate as string)).toBe(true)
  })

  it('uses raw date when event time is missing', () => {
    expect(getSportEventLocalDateKey('2026-04-23', null)).toBe('2026-04-23')
    expect(isSportEventOnLocalDate('2026-04-23', null, '2026-04-23')).toBe(true)
  })
})
