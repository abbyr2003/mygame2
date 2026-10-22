import { describe, it, expect, vi, afterEach } from 'vitest'
import { KeepStore } from '../../../src/main/keep/store'
import { PostOffice } from '../../../src/main/postOffice/runner'
import { VoiceError } from '../../../src/main/voice/claudeClient'
import type { PendingDelivery } from '../../../src/shared/types'
import { tempDir } from '../../helpers/tmp'
import { makeCompanion } from '../../helpers/fixtures'
import { seededRng } from '../../helpers/rng'
import { isHere, visitsOn } from '../../../src/shared/presence'

const DAY = 24 * 3600_000
const MIN = 60_000

async function setup(opts: { fail?: VoiceError; slow?: boolean } = {}) {
  const store = new KeepStore(await tempDir())
  await store.init()
  let now = new Date('2026-10-21T12:00:00.000Z')
  const delivered: string[] = []
  const events: string[] = []
  let changes = 0
  const voice = {
    deliver: async (p: PendingDelivery) => {
      if (opts.slow) await new Promise((r) => setTimeout(r, 10))
      if (opts.fail) throw opts.fail
      delivered.push(p.id)
      return { id: p.id } as never
    }
  }
  const po = new PostOffice(store, voice, {
    now: () => now,
    rng: seededRng(42),
    onDelivered: (item) => events.push(`delivered:${item.companionId}:${item.format}`),
    onVeil: () => events.push('veil'),
    onChanged: () => changes++
  })
  return {
    store,
    po,
    delivered,
    events,
    setNow: (d: Date) => (now = d),
    getNow: () => now,
    changes: () => changes
  }
}

const due = (over: Partial<PendingDelivery>): PendingDelivery => ({
  id: 'p1',
  companionId: 'c1',
  kind: 'reply',
  format: 'text',
  dueAt: '2026-10-21T11:00:00.000Z',
  attempts: 0,
  ...over
})

// One minute into a visit of companion c1 with at least 10 minutes left.
function hereTime(): Date {
  const c = makeCompanion()
  const day = Math.floor(new Date('2026-10-21T12:00:00.000Z').getTime() / DAY)
  const v = visitsOn(c, day).find((x) => x.end - x.start > 11 * MIN)!
  return new Date(v.start + MIN)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('PostOffice', () => {
  it('open delivers catch-up items and updates lastOpenedAt', async () => {
    const { store, po, delivered, events, getNow } = await setup()
    await store.saveCompanion(
      makeCompanion({
        frequency: 'chatty',
        nextSpontaneousAt: new Date(getNow().getTime() - 2 * DAY).toISOString()
      })
    )
    await po.open()
    expect(delivered.length).toBeGreaterThan(0)
    expect(delivered.length).toBeLessThanOrEqual(3)
    expect(events.filter((e) => e.startsWith('delivered:c1')).length).toBe(delivered.length)
    expect((await store.getState()).lastOpenedAt).toBe(getNow().toISOString())
    expect(await store.getPending()).toEqual([])
    const c = await store.getCompanion('c1')
    expect(new Date(c!.nextSpontaneousAt!).getTime()).toBeGreaterThan(getNow().getTime())
  })

  it('concurrent open and tick never deliver the same pending twice', async () => {
    const { store, po, delivered, getNow } = await setup({ slow: true })
    await store.saveCompanion(
      makeCompanion({
        frequency: 'chatty',
        nextSpontaneousAt: new Date(getNow().getTime() - 2 * DAY).toISOString()
      })
    )
    await store.savePending([due({ id: 'r1' }), due({ id: 'r2' })])
    await Promise.all([po.open(), po.tick(), po.tick()])
    expect(new Set(delivered).size).toBe(delivered.length)
    expect(delivered).toEqual(expect.arrayContaining(['r1', 'r2']))
    expect(delivered.length).toBeLessThanOrEqual(5)
  })

  it('failed delivery stays pending with attempts+1 and calls onVeil once', async () => {
    const { store, po, events } = await setup({ fail: new VoiceError('unavailable') })
    await store.saveCompanion(makeCompanion())
    await store.savePending([due({ id: 'a' }), due({ id: 'b' })])
    await po.processDue()
    const pending = await store.getPending()
    expect(pending.map((p) => [p.id, p.attempts])).toEqual([
      ['a', 1],
      ['b', 0]
    ])
    expect(events.filter((e) => e === 'veil')).toHaveLength(1)
  })

  it('refused delivery is dropped', async () => {
    const { store, po } = await setup({ fail: new VoiceError('refused') })
    await store.saveCompanion(makeCompanion())
    await store.savePending([due({ id: 'a' })])
    await po.processDue()
    expect(await store.getPending()).toEqual([])
  })

  it('pending for archived companion is dropped without delivering', async () => {
    const { store, po, delivered } = await setup()
    await store.saveCompanion(makeCompanion({ archived: true }))
    await store.savePending([due({ id: 'a' })])
    await po.processDue()
    expect(delivered).toEqual([])
    expect(await store.getPending()).toEqual([])
  })

  it('pending for a missing companion is dropped', async () => {
    const { store, po, delivered } = await setup()
    await store.savePending([due({ id: 'a', companionId: 'ghost' })])
    await po.processDue()
    expect(delivered).toEqual([])
    expect(await store.getPending()).toEqual([])
  })

  it('future reply is not delivered until its dueAt', async () => {
    const { store, po, delivered, setNow, getNow } = await setup()
    const c = makeCompanion({ frequency: 'chatty' })
    await store.saveCompanion(c)
    await po.userSent('c1', 'reply', 'text', { replyToId: 'm1' })
    await po.processDue()
    expect(delivered).toEqual([])
    const [p] = await store.getPending()
    setNow(new Date(p.dueAt))
    await po.processDue()
    expect(delivered).toHaveLength(1)
  })

  it('userSent returns readAt and stores it on the pending reply', async () => {
    const { store, po } = await setup()
    await store.saveCompanion(makeCompanion())
    const readAt = await po.userSent('c1', 'reply', 'text', { replyToId: 'm1' })
    const [p] = await store.getPending()
    expect(readAt).toBeDefined()
    expect(p.readAt).toBe(readAt)
  })

  it('batches texts while the first is still unread', async () => {
    const { store, po } = await setup()
    await store.saveCompanion(makeCompanion())
    const a = await po.userSent('c1', 'reply', 'text', { replyToId: 'm1' })
    const b = await po.userSent('c1', 'reply', 'text', { replyToId: 'm2' })
    expect(await store.getPending()).toHaveLength(1)
    expect(b).toBe(a)
  })

  it('does not batch once the companion has read', async () => {
    const { store, po, setNow } = await setup()
    await store.saveCompanion(makeCompanion())
    const a = await po.userSent('c1', 'reply', 'text', { replyToId: 'm1' })
    setNow(new Date(new Date(a!).getTime() + 1000))
    await po.userSent('c1', 'reply', 'text', { replyToId: 'm2' })
    expect(await store.getPending()).toHaveLength(2)
  })

  it('does not batch letters', async () => {
    const { store, po } = await setup()
    await store.saveCompanion(makeCompanion())
    await po.userSent('c1', 'reply', 'letter', { replyToId: 'l1' })
    await po.userSent('c1', 'reply', 'letter', { replyToId: 'l2' })
    expect(await store.getPending()).toHaveLength(2)
  })

  it('userSent to an archived companion returns undefined', async () => {
    const { store, po } = await setup()
    await store.saveCompanion(makeCompanion({ archived: true }))
    expect(await po.userSent('c1', 'reply', 'text', { replyToId: 'm1' })).toBeUndefined()
    expect(await store.getPending()).toEqual([])
  })

  it('wake timer delivers a live reply before the 3-minute tick', async () => {
    const { store, po, delivered, setNow, changes } = await setup()
    setNow(hereTime())
    await store.saveCompanion(makeCompanion())
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    po.start()
    await po.userSent('c1', 'reply', 'text', { replyToId: 'm1' })
    const [p] = await store.getPending()
    const wait = new Date(p.dueAt).getTime() - hereTime().getTime() + 1000
    expect(wait).toBeLessThan(3 * MIN)
    setNow(new Date(new Date(p.dueAt).getTime() + 1000))
    await vi.advanceTimersByTimeAsync(wait)
    await vi.waitFor(() => expect(delivered).toEqual([p.id]))
    expect(changes()).toBeGreaterThan(0)
    po.stop()
  })

  it('old pending without readAt is still delivered', async () => {
    const { store, po, delivered } = await setup()
    await store.saveCompanion(makeCompanion())
    await store.savePending([due({ id: 'old' })])
    await po.tick()
    expect(delivered).toEqual(['old'])
  })

  it('stop clears the wake timer', async () => {
    const { store, po, delivered, setNow } = await setup()
    setNow(hereTime())
    await store.saveCompanion(makeCompanion())
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    po.start()
    await po.userSent('c1', 'reply', 'text', { replyToId: 'm1' })
    po.stop()
    const [p] = await store.getPending()
    setNow(new Date(new Date(p.dueAt).getTime() + 1000))
    await vi.advanceTimersByTimeAsync(10 * MIN)
    expect(delivered).toEqual([])
  })

  it('companionCreated schedules first contact during a visit', async () => {
    const { store, po, getNow } = await setup()
    const c = await po.companionCreated(makeCompanion())
    const [p] = await store.getPending()
    expect(p.kind).toBe('first-contact')
    const mins = (new Date(p.dueAt).getTime() - getNow().getTime()) / MIN
    expect(mins).toBeGreaterThanOrEqual(1)
    expect(isHere(c, new Date(p.dueAt))).toBe(true)
    expect(new Date(c.nextSpontaneousAt!).getTime()).toBeGreaterThan(getNow().getTime())
    expect((await store.getCompanion('c1'))!.nextSpontaneousAt).toBe(c.nextSpontaneousAt)
  })
})
