import { describe, it, expect } from 'vitest'
import {
  HERE_SHARE,
  isHere,
  nextHereStart,
  visitsOn,
  type PresenceCompanion
} from '../../src/shared/presence'
import type { Frequency } from '../../src/shared/types'

const MIN = 60_000
const DAY = 24 * 60 * MIN
const c: PresenceCompanion = { id: 'c1', frequency: 'regular' }

describe('presence', () => {
  it('has the spec here shares', () => {
    expect(HERE_SHARE).toEqual({ devoted: 0.7, chatty: 0.5, regular: 0.35, quiet: 0.2, rare: 0.1 })
  })

  it('is deterministic', () => {
    expect(visitsOn(c, 20000)).toEqual(visitsOn(c, 20000))
  })

  it('here share matches the frequency', () => {
    for (const f of Object.keys(HERE_SHARE) as Frequency[]) {
      let here = 0
      for (let d = 20000; d < 20030; d++) {
        for (const v of visitsOn({ id: 'c1', frequency: f }, d)) here += v.end - v.start
      }
      expect(Math.abs(here / (30 * DAY) - HERE_SHARE[f])).toBeLessThan(0.08)
    }
  })

  it('visits last 30–90 minutes', () => {
    for (let d = 20000; d < 20010; d++) {
      for (const v of visitsOn(c, d)) {
        if (v.end === (d + 1) * DAY) continue
        expect(v.end - v.start).toBeGreaterThanOrEqual(30 * MIN)
        expect(v.end - v.start).toBeLessThanOrEqual(90 * MIN)
      }
    }
  })

  it('different companions differ', () => {
    expect(visitsOn({ id: 'a', frequency: 'regular' }, 20000)).not.toEqual(
      visitsOn({ id: 'b', frequency: 'regular' }, 20000)
    )
  })

  it('isHere agrees with visits', () => {
    const v = visitsOn(c, 20000)[0]
    expect(isHere(c, new Date(v.start))).toBe(true)
    expect(isHere(c, new Date(v.end - 1))).toBe(true)
    if (v.start !== 20000 * DAY) expect(isHere(c, new Date(v.start - 1))).toBe(false)
  })

  it('nextHereStart returns from when already here', () => {
    const v = visitsOn(c, 20000)[0]
    const at = new Date(v.start + MIN)
    expect(nextHereStart(c, at)).toEqual(at)
  })

  it('nextHereStart finds the start of the next visit when away', () => {
    const v = visitsOn(c, 20000)[0]
    const away = new Date(v.end + MIN)
    expect(isHere(c, away)).toBe(false)
    const next = nextHereStart(c, away)
    expect(next.getTime()).toBeGreaterThan(away.getTime())
    expect(isHere(c, next)).toBe(true)
    expect(isHere(c, new Date(next.getTime() - MIN))).toBe(false)
  })
})
