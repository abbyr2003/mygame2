import type { Frequency } from '../../shared/types'

// Average time between spontaneous deliveries:
// chatty ≈ 3/day, regular ≈ 1/day, quiet ≈ 2.5/week, rare ≈ 1 per 10.5 days.
export const MEAN_INTERVAL_HOURS: Record<Frequency, number> = {
  chatty: 8,
  regular: 24,
  quiet: 67,
  rare: 252
}

// How long a companion takes to answer something the user sent.
export const REPLY_DELAY_MINUTES: Record<Frequency, [number, number]> = {
  chatty: [2, 20],
  regular: [60, 360],
  quiet: [360, 1440],
  rare: [1440, 4320]
}

export const FIRST_CONTACT_MINUTES: [number, number] = [1, 5]

export const LETTER_SHARE_WHEN_BOTH = 0.25
