import { describe, it, expect } from 'vitest'
import {
  MEAN_INTERVAL_HOURS,
  READ_DELAY_SECONDS,
  REPLY_AFTER_READ_SECONDS,
  VISIT_JITTER_MINUTES,
  LETTER_SHARE_WHEN_BOTH
} from '../../../src/main/postOffice/rates'
import { isHere, nextHereStart, visitsOn } from '../../../src/shared/presence'
import {
  nextInterval,
  pickFormat,
  catchUp,
  scheduleReply,
  scheduleFirstContact
} from '../../../src/main/postOffice/schedule'
import type { Companion, Format, Frequency } from '../../../src/shared/types'
import { seededRng } from '../../helpers/rng'
import { makeCompanion } from '../../helpers/fixtures'

const HOUR = 3600_000
const MIN = 60_000
const DAY = 24 * HOUR
const now = new Date('2026-10-21T12:00:00.000Z')
const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString()
const SEC = 1000

// A moment one minute into a visit with at least 10 minutes left.
function hereTime(c: Companion): Date {
  const day = Math.floor(now.getTime() / DAY)
  const v = visitsOn(c, day).find((x) => x.end - x.start > 11 * MIN)!
  return new Date(v.start + MIN)
}

// A moment one minute after a visit ends.
function awayTime(c: Companion): Date {
  const day = Math.floor(now.getTime() / DAY)
  const v = visitsOn(c, day).find((x) => x.end < (day + 1) * DAY - 2 * MIN)!
  const t = new Date(v.end + MIN)
  expect(isHere(c, t)).toBe(false)
  return t
}

describe('rates', () => {
  it('has the spec values', () => {
    expect(MEAN_INTERVAL_HOURS).toEqual({
      devoted: 3.5,
      chatty: 8,
      regular: 24,
      quiet: 67,
      rare: 252
    })
    expect(READ_DELAY_SECONDS).toEqual({
      text: { here: [5, 30], away: [0, 180] },
      letter: { here: [60, 300], away: [0, 600] }
    })
    expect(REPLY_AFTER_READ_SECONDS).toEqual({
      text: { here: [15, 60], away: [60, 300] },
      letter: { here: [1200, 3600], away: [3600, 10800] }
    })
    expect(VISIT_JITTER_MINUTES).toEqual([0, 5])
    expect(LETTER_SHARE_WHEN_BOTH).toBe(0.25)
  })
})

describe('nextInterval', () => {
  it('averages near the mean', () => {
    const rng = seededRng(1)
    for (const f of Object.keys(MEAN_INTERVAL_HOURS) as Frequency[]) {
      let total = 0
      for (let i = 0; i < 5000; i++) total += nextInterval(f, rng)
      const meanHours = total / 5000 / HOUR
      expect(meanHours).toBeGreaterThan(MEAN_INTERVAL_HOURS[f] * 0.85)
      expect(meanHours).toBeLessThan(MEAN_INTERVAL_HOURS[f] * 1.15)
    }
  })
})

describe('catchUp', () => {
  it('after 10 days caps at 3 and keeps the most recent', () => {
    const c = makeCompanion({ frequency: 'chatty', nextSpontaneousAt: ago(10 * DAY) })
    const { deliveries, nextSpontaneousAt } = catchUp(c, now, seededRng(2))
    expect(deliveries).toHaveLength(3)
    const times = deliveries.map((d) => new Date(d.dueAt).getTime())
    expect([...times].sort((a, b) => a - b)).toEqual(times)
    expect(times.every((t) => t <= nextHereStart(c, now).getTime() + 5 * MIN)).toBe(true)
    expect(times[2]).toBeGreaterThan(now.getTime() - 2 * DAY)
    expect(new Date(nextSpontaneousAt!).getTime()).toBeGreaterThan(now.getTime())
    expect(deliveries.every((d) => d.kind === 'spontaneous' && d.companionId === 'c1')).toBe(true)
  })

  it('places spontaneous messages in visits', () => {
    const c = makeCompanion({ frequency: 'chatty', nextSpontaneousAt: ago(2 * DAY) })
    const { deliveries } = catchUp(c, now, seededRng(12))
    expect(deliveries.length).toBeGreaterThan(0)
    for (const d of deliveries) expect(isHere(c, new Date(d.dueAt))).toBe(true)
  })

  it('on first launch produces nothing', () => {
    const { deliveries, nextSpontaneousAt } = catchUp(makeCompanion(), now, seededRng(3))
    expect(deliveries).toEqual([])
    expect(new Date(nextSpontaneousAt!).getTime()).toBeGreaterThan(now.getTime())
  })

  it('with clock moved backwards produces nothing', () => {
    const future = new Date(now.getTime() + 5 * DAY).toISOString()
    const { deliveries, nextSpontaneousAt } = catchUp(
      makeCompanion({ nextSpontaneousAt: future }),
      now,
      seededRng(4)
    )
    expect(deliveries).toEqual([])
    expect(nextSpontaneousAt).toBe(future)
  })

  it('skips archived companions', () => {
    const due = ago(5 * DAY)
    const { deliveries, nextSpontaneousAt } = catchUp(
      makeCompanion({ archived: true, nextSpontaneousAt: due }),
      now,
      seededRng(5)
    )
    expect(deliveries).toEqual([])
    expect(nextSpontaneousAt).toBe(due)
  })
})

describe('scheduleReply', () => {
  const windows: [Format, 'here' | 'away'][] = [
    ['text', 'here'],
    ['text', 'away'],
    ['letter', 'here'],
    ['letter', 'away']
  ]
  for (const [format, where] of windows) {
    it(`${format} reply when ${where} reads and replies within the spec windows`, () => {
      const rng = seededRng(6)
      const c = makeCompanion()
      const at = where === 'here' ? hereTime(c) : awayTime(c)
      const base = where === 'here' ? at : nextHereStart(c, at)
      for (let i = 0; i < 50; i++) {
        const p = scheduleReply(c, 'reply', format, at, rng, { replyToId: 'm1' })
        const read = new Date(p.readAt!).getTime()
        const readSecs = (read - base.getTime()) / SEC
        const replySecs = (new Date(p.dueAt).getTime() - read) / SEC
        expect(readSecs).toBeGreaterThanOrEqual(READ_DELAY_SECONDS[format][where][0])
        expect(readSecs).toBeLessThanOrEqual(READ_DELAY_SECONDS[format][where][1])
        expect(replySecs).toBeGreaterThanOrEqual(REPLY_AFTER_READ_SECONDS[format][where][0])
        expect(replySecs).toBeLessThanOrEqual(REPLY_AFTER_READ_SECONDS[format][where][1])
        expect(p).toMatchObject({ kind: 'reply', format, replyToId: 'm1', attempts: 0 })
      }
    })
  }

  it('carries request text', () => {
    const p = scheduleReply(makeCompanion(), 'request', 'letter', now, seededRng(7), {
      requestText: 'the stars'
    })
    expect(p).toMatchObject({ kind: 'request', format: 'letter', requestText: 'the stars' })
  })
})

describe('scheduleFirstContact', () => {
  it('lands in a visit at least a minute from now', () => {
    const rng = seededRng(8)
    const c = makeCompanion()
    for (const at of [hereTime(c), awayTime(c)]) {
      for (let i = 0; i < 20; i++) {
        const p = scheduleFirstContact(c, at, rng)
        const due = new Date(p.dueAt)
        expect(due.getTime() - at.getTime()).toBeGreaterThanOrEqual(MIN)
        expect(isHere(c, due)).toBe(true)
        expect(p.kind).toBe('first-contact')
      }
    }
  })
})

describe('pickFormat', () => {
  it('honours letters/texts and gives ~25% letters for both', () => {
    const rng = seededRng(9)
    expect(pickFormat('letters', rng)).toBe('letter')
    expect(pickFormat('texts', rng)).toBe('text')
    let letters = 0
    for (let i = 0; i < 4000; i++) if (pickFormat('both', rng) === 'letter') letters++
    expect(letters / 4000).toBeGreaterThan(0.2)
    expect(letters / 4000).toBeLessThan(0.3)
  })
})
