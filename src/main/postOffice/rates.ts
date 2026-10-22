import type { Format, Frequency } from '../../shared/types'

// Average time between spontaneous deliveries:
// devoted ≈ 7/day, chatty ≈ 3/day, regular ≈ 1/day, quiet ≈ 2.5/week, rare ≈ 1 per 10.5 days.
export const MEAN_INTERVAL_HOURS: Record<Frequency, number> = {
  devoted: 3.5,
  chatty: 8,
  regular: 24,
  quiet: 67,
  rare: 252
}

type Window = { here: [number, number]; away: [number, number] }

// How long until the companion reads what the user sent: from sending when
// here, from the start of their next visit when away.
export const READ_DELAY_SECONDS: Record<Format, Window> = {
  text: { here: [5, 30], away: [0, 180] },
  letter: { here: [60, 300], away: [0, 600] }
}

// How long after reading the reply arrives.
export const REPLY_AFTER_READ_SECONDS: Record<Format, Window> = {
  text: { here: [15, 60], away: [60, 300] },
  letter: { here: [1200, 3600], away: [3600, 10800] }
}

// Spontaneous messages that fall in an away period wait for the next visit.
export const VISIT_JITTER_MINUTES: [number, number] = [0, 5]

export const FIRST_CONTACT_MINUTES: [number, number] = [1, 5]

export const LETTER_SHARE_WHEN_BOTH = 0.25
