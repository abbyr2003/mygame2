export const SEAL_COLORS = ['#6b3fa0', '#c1272d', '#3fb8a8', '#e8b04a', '#2b4a8a', '#2f6b3a', '#1c1424']

export const SEAL_SYMBOLS: Record<string, string> = {
  moon: '☾',
  star: '★',
  rose: '❀',
  eye: '◉',
  rune: 'ᚱ',
  sun: '☀',
  flame: '♨',
  key: '⚷'
}

export const sealGlyph = (symbol: string): string => SEAL_SYMBOLS[symbol] ?? '✦'
