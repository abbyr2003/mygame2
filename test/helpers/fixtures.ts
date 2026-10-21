import type { Companion } from '../../src/shared/types'

export const makeCompanion = (over: Partial<Companion> = {}): Companion => ({
  id: 'c1',
  name: 'Elara',
  portraitFile: null,
  role: 'spirit guide',
  voice: 'gentle, speaks in riddles',
  frequency: 'regular',
  formatPref: 'both',
  seal: { color: '#6b3fa0', symbol: 'moon' },
  handwriting: 'Caveat',
  archived: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  nextSpontaneousAt: null,
  ...over
})
