import { describe, expect, it } from 'vitest'
import { timeAgo } from '../timeAgo.ts'

const NOW = new Date('2026-11-16T12:00:00Z')
const ago = (seconds: number) => new Date(NOW.getTime() - seconds * 1000).toISOString()

const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe('timeAgo', () => {
  it('says "now" for under a minute', () => {
    expect(timeAgo(ago(0), NOW)).toBe('now')
    expect(timeAgo(ago(59), NOW)).toBe('now')
  })

  it('says "now" for a timestamp in the future (clock skew)', () => {
    expect(timeAgo(ago(-300), NOW)).toBe('now')
  })

  it.each([
    [MINUTE, '1m'],
    [59 * MINUTE + 59, '59m'],
    [HOUR, '1h'],
    [23 * HOUR + 59 * MINUTE, '23h'],
    [DAY, '1d'],
    [6 * DAY, '6d'],
    [7 * DAY, '1w'],
    [29 * DAY, '4w'],
    [30 * DAY, '1mo'],
    [364 * DAY, '12mo'],
    [365 * DAY, '1y'],
    [800 * DAY, '2y'],
  ])('shows %i seconds as %s (largest whole unit, rounded down)', (seconds, expected) => {
    expect(timeAgo(ago(seconds), NOW)).toBe(expected)
  })

  it('uses the current time by default', () => {
    expect(timeAgo(new Date().toISOString())).toBe('now')
    expect(timeAgo(new Date(Date.now() - 2 * HOUR * 1000).toISOString())).toBe('2h')
  })
})
