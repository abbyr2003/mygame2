import type { Companion, Frequency } from './types'

// Share of the day a companion spends "here".
export const HERE_SHARE: Record<Frequency, number> = {
  devoted: 0.7,
  chatty: 0.5,
  regular: 0.35,
  quiet: 0.2,
  rare: 0.1
}

export type PresenceCompanion = Pick<Companion, 'id' | 'frequency'>
export interface Visit {
  start: number
  end: number
}

const MIN = 60_000
const DAY = 24 * 60 * MIN
const SEARCH_DAYS = 14

function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// One generator per (companion, UTC day): gaps and 30–90 min visits alternate,
// with the gap mean chosen so visit / (visit + gap) ≈ HERE_SHARE.
export function visitsOn(c: PresenceCompanion, day: number): Visit[] {
  const rng = mulberry32(fnv1a(`${c.id}:${day}`))
  const share = HERE_SHARE[c.frequency]
  const gapMean = ((60 * (1 - share)) / share) * MIN
  const dayEnd = (day + 1) * DAY
  const visits: Visit[] = []
  // Whole milliseconds, so times survive a round trip through Date.
  let t = Math.round(day * DAY + rng() * gapMean)
  while (t < dayEnd) {
    const end = Math.min(Math.round(t + (30 + 60 * rng()) * MIN), dayEnd)
    visits.push({ start: t, end })
    t = Math.round(end + gapMean * (0.5 + rng()))
  }
  return visits
}

export function isHere(c: PresenceCompanion, at: Date): boolean {
  const ms = at.getTime()
  return visitsOn(c, Math.floor(ms / DAY)).some((v) => v.start <= ms && ms < v.end)
}

// `from` itself when already here; gives up after two weeks.
export function nextHereStart(c: PresenceCompanion, from: Date): Date {
  const ms = from.getTime()
  const first = Math.floor(ms / DAY)
  for (let day = first; day <= first + SEARCH_DAYS; day++) {
    const v = visitsOn(c, day).find((x) => x.end > ms)
    if (v) return new Date(Math.max(v.start, ms))
  }
  return new Date(ms + SEARCH_DAYS * DAY)
}
