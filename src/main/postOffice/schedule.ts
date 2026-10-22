import { randomUUID } from 'crypto'
import type {
  Companion,
  Format,
  FormatPref,
  Frequency,
  PendingDelivery
} from '../../shared/types'
import {
  FIRST_CONTACT_MINUTES,
  LETTER_SHARE_WHEN_BOTH,
  MEAN_INTERVAL_HOURS,
  READ_DELAY_SECONDS,
  REPLY_AFTER_READ_SECONDS,
  VISIT_JITTER_MINUTES
} from './rates'
import { isHere, nextHereStart } from '../../shared/presence'

export type Rng = () => number

const HOUR = 3600_000
const MIN = 60_000
const SEC = 1000

// Exponential draw around the mean, clamped so arrivals are never
// back-to-back or absurdly far apart.
export function nextInterval(freq: Frequency, rng: Rng): number {
  const mean = MEAN_INTERVAL_HOURS[freq] * HOUR
  const draw = -Math.log(1 - rng()) * mean
  return Math.min(Math.max(draw, 0.15 * mean), 3 * mean)
}

export function pickFormat(pref: FormatPref, rng: Rng): Format {
  if (pref === 'letters') return 'letter'
  if (pref === 'texts') return 'text'
  return rng() < LETTER_SHARE_WHEN_BOTH ? 'letter' : 'text'
}

const between = ([lo, hi]: [number, number], rng: Rng): number => lo + (hi - lo) * rng()

// Companions only reach out while here; an away time waits for the next visit.
export function intoVisit(c: Companion, at: Date, rng: Rng): Date {
  if (isHere(c, at)) return at
  return new Date(nextHereStart(c, at).getTime() + between(VISIT_JITTER_MINUTES, rng) * MIN)
}

function delivery(
  c: Companion,
  kind: PendingDelivery['kind'],
  format: Format,
  dueAt: Date,
  extra: { replyToId?: string; requestText?: string; readAt?: string } = {}
): PendingDelivery {
  return {
    id: randomUUID(),
    companionId: c.id,
    kind,
    format,
    dueAt: dueAt.toISOString(),
    ...extra,
    attempts: 0
  }
}

export function catchUp(
  c: Companion,
  now: Date,
  rng: Rng,
  cap = 3
): { deliveries: PendingDelivery[]; nextSpontaneousAt: string | null } {
  if (c.archived) return { deliveries: [], nextSpontaneousAt: c.nextSpontaneousAt }
  if (c.nextSpontaneousAt === null) {
    return {
      deliveries: [],
      nextSpontaneousAt: new Date(now.getTime() + nextInterval(c.frequency, rng)).toISOString()
    }
  }
  const deliveries: PendingDelivery[] = []
  let t = new Date(c.nextSpontaneousAt).getTime()
  while (t <= now.getTime()) {
    const at = intoVisit(c, new Date(t), rng)
    deliveries.push(delivery(c, 'spontaneous', pickFormat(c.formatPref, rng), at))
    t += nextInterval(c.frequency, rng)
  }
  return {
    deliveries: deliveries.slice(-cap),
    nextSpontaneousAt: deliveries.length ? new Date(t).toISOString() : c.nextSpontaneousAt
  }
}

export function scheduleReply(
  c: Companion,
  kind: 'reply' | 'request',
  format: Format,
  now: Date,
  rng: Rng,
  extra: { replyToId?: string; requestText?: string }
): PendingDelivery {
  const where = isHere(c, now) ? 'here' : 'away'
  const from = where === 'here' ? now : nextHereStart(c, now)
  const read = from.getTime() + between(READ_DELAY_SECONDS[format][where], rng) * SEC
  const due = new Date(read + between(REPLY_AFTER_READ_SECONDS[format][where], rng) * SEC)
  return delivery(c, kind, format, due, { ...extra, readAt: new Date(read).toISOString() })
}

export function scheduleFirstContact(c: Companion, now: Date, rng: Rng): PendingDelivery {
  const due = intoVisit(c, new Date(now.getTime() + between(FIRST_CONTACT_MINUTES, rng) * MIN), rng)
  return delivery(c, 'first-contact', pickFormat(c.formatPref, rng), due)
}
