import { describe, it, expect } from 'vitest'
import {
  MEAN_INTERVAL_HOURS,
  REPLY_DELAY_MINUTES,
  LETTER_SHARE_WHEN_BOTH
} from '../../../src/main/postOffice/rates'
import {
  nextInterval,
  pickFormat,
  catchUp,
  scheduleReply,
  scheduleFirstContact
} from '../../../src/main/postOffice/schedule'
import type { Frequency } from '../../../src/shared/types'
import { seededRng } from '../../helpers/rng'
import { makeCompanion } from '../../helpers/fixtures'

const HOUR = 3600_000
const MIN = 60_000
const DAY = 24 * HOUR
const now = new Date('2026-10-21T12:00:00.000Z')
const ago = (ms: number): string => new Date(now.getTime() - ms).toISOString()

describe('rates', () => {
  it('has the spec values', () => {
    expect(MEAN_INTERVAL_HOURS).toEqual({ chatty: 8, regular: 24, quiet: 67, rare: 252 })
    expect(REPLY_DELAY_MINUTES).toEqual({
      chatty: [2, 20],
      regular: [60, 360],
      quiet: [360, 1440],
      rare: [1440, 4320]
    })
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
    expect(times.every((t) => t <= now.getTime())).toBe(true)
    expect(times[2]).toBeGreaterThan(now.getTime() - 2 * DAY)
    expect(new Date(nextSpontaneousAt!).getTime()).toBeGreaterThan(now.getTime())
    expect(deliveries.every((d) => d.kind === 'spontaneous' && d.companionId === 'c1')).toBe(true)
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
  it('delay within range for each frequency', () => {
    const rng = seededRng(6)
    for (const f of Object.keys(REPLY_DELAY_MINUTES) as Frequency[]) {
      for (let i = 0; i < 50; i++) {
        const p = scheduleReply(makeCompanion({ frequency: f }), 'reply', 'text', now, rng, {
          replyToId: 'm1'
        })
        const mins = (new Date(p.dueAt).getTime() - now.getTime()) / MIN
        expect(mins).toBeGreaterThanOrEqual(REPLY_DELAY_MINUTES[f][0])
        expect(mins).toBeLessThanOrEqual(REPLY_DELAY_MINUTES[f][1])
        expect(p).toMatchObject({ kind: 'reply', format: 'text', replyToId: 'm1', attempts: 0 })
      }
    }
  })

  it('carries request text', () => {
    const p = scheduleReply(makeCompanion(), 'request', 'letter', now, seededRng(7), {
      requestText: 'the stars'
    })
    expect(p).toMatchObject({ kind: 'request', format: 'letter', requestText: 'the stars' })
  })
})

describe('scheduleFirstContact', () => {
  it('is due within 1–5 minutes', () => {
    const rng = seededRng(8)
    for (let i = 0; i < 50; i++) {
      const p = scheduleFirstContact(makeCompanion(), now, rng)
      const mins = (new Date(p.dueAt).getTime() - now.getTime()) / MIN
      expect(mins).toBeGreaterThanOrEqual(1)
      expect(mins).toBeLessThanOrEqual(5)
      expect(p.kind).toBe('first-contact')
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
