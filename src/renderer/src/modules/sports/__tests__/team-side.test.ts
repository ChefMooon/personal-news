import { describe, expect, it } from 'vitest'
import type { SportEvent, SportTeamEvents } from '../../../../../shared/ipc-types'
import { getTodayGame, resolveTrackedTeamSide } from '../side-resolution'

function makeEvent(overrides: Partial<SportEvent> = {}): SportEvent {
  return {
    eventId: 'evt-1',
    leagueId: '4387',
    sport: 'Basketball',
    homeTeamId: 'team-raptors',
    awayTeamId: 'team-celtics',
    homeTeam: 'Toronto Raptors',
    awayTeam: 'Boston Celtics',
    homeTeamBadgeUrl: null,
    awayTeamBadgeUrl: null,
    homeScore: null,
    awayScore: null,
    eventDate: '2026-04-23',
    eventTime: '19:00',
    status: 'Scheduled',
    venue: 'Scotiabank Arena',
    ...overrides
  }
}

describe('team side resolution and today selection', () => {
  it('resolves side by team ID when present', () => {
    const side = resolveTrackedTeamSide(makeEvent(), 'team-raptors', 'Toronto Raptors')
    expect(side).toBe('home')
  })

  it('falls back to normalized team-name when IDs mismatch', () => {
    const side = resolveTrackedTeamSide(
      makeEvent({ homeTeamId: 'sportsdb:133602', awayTeamId: 'sportsdb:133600', homeTeam: 'Toronto-Raptors' }),
      'espn:16',
      'Toronto Raptors'
    )

    expect(side).toBe('home')
  })

  it('returns null for ambiguous same-name matchup', () => {
    const side = resolveTrackedTeamSide(
      makeEvent({ homeTeam: 'Toronto Raptors', awayTeam: 'Toronto Raptors', homeTeamId: null, awayTeamId: null }),
      'espn:16',
      'Toronto Raptors'
    )

    expect(side).toBeNull()
  })

  it('prefers next-today game over last-today game', () => {
    const events: SportTeamEvents = {
      last: [makeEvent({ eventId: 'evt-last', status: 'Final', homeScore: '99', awayScore: '90' })],
      next: [makeEvent({ eventId: 'evt-next', status: 'Scheduled' })]
    }

    const game = getTodayGame(events, '2026-04-23')
    expect(game?.eventId).toBe('evt-next')
  })
})
