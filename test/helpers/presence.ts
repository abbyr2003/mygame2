import { isHere, visitsOn, type PresenceCompanion } from '../../src/shared/presence'

const MIN = 60_000
const DAY = 24 * 60 * MIN
const DAY_NUMBER = Math.floor(new Date('2026-10-21T12:00:00.000Z').getTime() / DAY)

// One minute into a visit with at least 10 minutes left.
export function hereAt(c: PresenceCompanion): Date {
  const v = visitsOn(c, DAY_NUMBER).find((x) => x.end - x.start > 11 * MIN)!
  return new Date(v.start + MIN)
}

// One minute after a visit ends.
export function awayAt(c: PresenceCompanion): Date {
  const v = visitsOn(c, DAY_NUMBER).find((x) => x.end < (DAY_NUMBER + 1) * DAY - 2 * MIN)!
  const t = new Date(v.end + MIN)
  if (isHere(c, t)) throw new Error('awayAt found a here time')
  return t
}
