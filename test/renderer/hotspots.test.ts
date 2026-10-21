import { describe, it, expect } from 'vitest'
import {
  HOTSPOTS,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  fitImage,
  hotspotRect
} from '../../src/renderer/src/cottage/hotspots'

describe('cottage hotspots', () => {
  it('fitImage letterboxes a wide window', () => {
    const fit = fitImage(1920, 800, 1627, 967)
    expect(fit.height).toBe(800)
    expect(fit.width).toBeCloseTo((1627 * 800) / 967, 5)
    expect(fit.offsetY).toBe(0)
    expect(fit.offsetX).toBeCloseTo((1920 - fit.width) / 2, 5)
  })

  it('fitImage letterboxes a tall window', () => {
    const fit = fitImage(1000, 1000, 1627, 967)
    expect(fit.width).toBe(1000)
    expect(fit.offsetX).toBe(0)
    expect(fit.offsetY).toBeCloseTo((1000 - fit.height) / 2, 5)
  })

  it('hotspots do not overlap', () => {
    for (const a of HOTSPOTS) {
      for (const b of HOTSPOTS) {
        if (a === b) continue
        const apart =
          a.left + a.width <= b.left ||
          b.left + b.width <= a.left ||
          a.top + a.height <= b.top ||
          b.top + b.height <= a.top
        expect(apart, `${a.room} overlaps ${b.room}`).toBe(true)
      }
    }
  })

  it('has one hotspot per room', () => {
    expect(HOTSPOTS.map((h) => h.room).sort()).toEqual(
      ['contacts', 'letters', 'library', 'messages', 'settings', 'source'].sort()
    )
  })

  it('hotspotRect scales with window', () => {
    const desk = HOTSPOTS.find((h) => h.room === 'letters')!
    const small = hotspotRect(desk, fitImage(IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_WIDTH, IMAGE_HEIGHT))
    const big = hotspotRect(
      desk,
      fitImage(IMAGE_WIDTH * 2, IMAGE_HEIGHT * 2, IMAGE_WIDTH, IMAGE_HEIGHT)
    )
    expect(small.left).toBeCloseTo((desk.left / 100) * IMAGE_WIDTH, 5)
    expect(small.top).toBeCloseTo((desk.top / 100) * IMAGE_HEIGHT, 5)
    expect(big.width).toBeCloseTo(small.width * 2, 5)
    expect(big.height).toBeCloseTo(small.height * 2, 5)
  })

  it('hotspotRect includes the letterbox offset', () => {
    const desk = HOTSPOTS.find((h) => h.room === 'letters')!
    const fit = fitImage(1920, 800, IMAGE_WIDTH, IMAGE_HEIGHT)
    expect(hotspotRect(desk, fit).left).toBeCloseTo(fit.offsetX + (desk.left / 100) * fit.width, 5)
  })
})
