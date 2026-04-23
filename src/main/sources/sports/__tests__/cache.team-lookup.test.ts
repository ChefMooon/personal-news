import { describe, expect, it } from 'vitest'
import { normalizeTeamLookupKey } from '../cache'

describe('sports cache lookup normalization', () => {
  it('normalizes provider name variants for Raptors', () => {
    expect(normalizeTeamLookupKey('Toronto Raptors')).toBe('torontoraptors')
    expect(normalizeTeamLookupKey('Toronto-Raptors')).toBe('torontoraptors')
    expect(normalizeTeamLookupKey('  TORONTO   RAPTORS  ')).toBe('torontoraptors')
  })

  it('normalizes punctuation differences consistently', () => {
    expect(normalizeTeamLookupKey("St. Louis Blues")).toBe('stlouisblues')
    expect(normalizeTeamLookupKey('St Louis Blues')).toBe('stlouisblues')
    expect(normalizeTeamLookupKey("St-Louis Blues")).toBe('stlouisblues')
  })

  it('keeps numeric tokens used by some teams', () => {
    expect(normalizeTeamLookupKey('76ers')).toBe('76ers')
    expect(normalizeTeamLookupKey('Club 76ers')).toBe('club76ers')
  })
})
