let ctx: AudioContext | null = null

// A small synthesized bell: a few sine partials with a quick strike and a long decay.
const PARTIALS = [
  { ratio: 1, gain: 0.35, decay: 2.4 },
  { ratio: 2.76, gain: 0.12, decay: 1.4 },
  { ratio: 5.4, gain: 0.06, decay: 0.8 }
]
const BASE_HZ = 880

export function playChime(soundOn: boolean): void {
  if (!soundOn || typeof AudioContext === 'undefined') return
  try {
    ctx ??= new AudioContext()
    const start = ctx.currentTime
    for (const p of PARTIALS) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = BASE_HZ * p.ratio
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(p.gain, start + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + p.decay)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + p.decay + 0.05)
    }
  } catch {
    // Sound is a nicety; never let it break a delivery.
  }
}
