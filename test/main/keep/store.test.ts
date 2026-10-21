import { describe, it, expect, vi } from 'vitest'
import { writeFile, readdir } from 'fs/promises'
import { join } from 'path'
import { KeepStore } from '../../../src/main/keep/store'
import type { Letter, PendingDelivery } from '../../../src/shared/types'
import { tempDir } from '../../helpers/tmp'
import { makeCompanion } from '../../helpers/fixtures'

const makeLetter = (id: string, createdAt: string): Letter => ({
  id,
  companionId: 'c1',
  direction: 'in',
  kind: 'spontaneous',
  createdAt,
  body: 'Dear one',
  read: false,
  starred: false
})

async function newStore(): Promise<{ store: KeepStore; root: string }> {
  const root = await tempDir()
  const store = new KeepStore(root)
  await store.init()
  return { store, root }
}

describe('KeepStore', () => {
  it('init creates folders and default state', async () => {
    const { store, root } = await newStore()
    expect(await store.getState()).toEqual({
      schemaVersion: 1,
      lastOpenedAt: null,
      sound: true,
      model: 'claude-sonnet-5-5'
    })
    expect(await readdir(root)).toEqual(
      expect.arrayContaining(['companions', 'letters', 'messages', 'source', 'library', 'keep.json'])
    )
  })

  it('setState merges a patch', async () => {
    const { store } = await newStore()
    await store.setState({ sound: false })
    expect((await store.getState()).sound).toBe(false)
  })

  it('saves and lists companions', async () => {
    const { store } = await newStore()
    await store.saveCompanion(makeCompanion())
    expect(await store.listCompanions()).toEqual([makeCompanion()])
    expect(await store.getCompanion('c1')).toEqual(makeCompanion())
    expect(await store.getCompanion('nope')).toBeNull()
  })

  it('listCompanions skips a corrupt profile but returns the others', async () => {
    const { store, root } = await newStore()
    await store.saveCompanion(makeCompanion())
    await store.saveCompanion(makeCompanion({ id: 'c2', name: 'Orion' }))
    await writeFile(join(root, 'companions', 'c2', 'profile.json'), 'garbage{')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const list = await store.listCompanions()
    warn.mockRestore()
    expect(list.map((c) => c.id)).toEqual(['c1'])
  })

  it('importPortrait copies jpg and returns portrait.jpg', async () => {
    const { store, root } = await newStore()
    await store.saveCompanion(makeCompanion())
    const src = join(await tempDir(), 'Elara Pic.JPG')
    await writeFile(src, 'fakejpg')
    expect(await store.importPortrait('c1', src)).toBe('portrait.jpg')
    expect(await readdir(join(root, 'companions', 'c1'))).toContain('portrait.jpg')
  })

  it('importPortrait rejects .gif', async () => {
    const { store } = await newStore()
    const src = join(await tempDir(), 'x.gif')
    await writeFile(src, 'gif')
    await expect(store.importPortrait('c1', src)).rejects.toThrow()
  })

  it('memory defaults to empty and round-trips', async () => {
    const { store } = await newStore()
    const m = await store.getMemory('c1')
    expect(m.summary).toBe('')
    expect(m.notes).toEqual([])
    await store.saveCompanion(makeCompanion())
    const next = { summary: 'We met.', notes: ['likes moons'], updatedAt: 'x' }
    await store.saveMemory('c1', next)
    expect(await store.getMemory('c1')).toEqual(next)
  })

  it('listLetters sorts newest first', async () => {
    const { store } = await newStore()
    await store.saveLetter(makeLetter('a', '2026-10-01T00:00:00.000Z'))
    await store.saveLetter(makeLetter('b', '2026-10-03T00:00:00.000Z'))
    await store.saveLetter(makeLetter('c', '2026-10-02T00:00:00.000Z'))
    expect((await store.listLetters()).map((l) => l.id)).toEqual(['b', 'c', 'a'])
  })

  it('threads default to empty and round-trip', async () => {
    const { store } = await newStore()
    expect(await store.getThread('c1')).toEqual({ companionId: 'c1', messages: [] })
    const t = {
      companionId: 'c1',
      messages: [{ id: 'm1', direction: 'in' as const, createdAt: 'x', body: 'hi', read: false }]
    }
    await store.saveThread(t)
    expect(await store.listThreads()).toEqual([t])
  })

  it('conversations, readings, akashic facts and pending round-trip', async () => {
    const { store } = await newStore()
    const conv = { id: 's1', title: 'First', createdAt: 'x', turns: [] }
    await store.saveConversation(conv)
    expect(await store.getConversation('s1')).toEqual(conv)
    expect(await store.listConversations()).toEqual([conv])
    const r = { id: 'r1', question: 'Who am I?', title: 'T', body: 'B', createdAt: 'x' }
    await store.saveReading(r)
    expect(await store.listReadings()).toEqual([r])
    expect(await store.getAkashicFacts()).toEqual([])
    await store.saveAkashicFacts(['lighthouse keeper'])
    expect(await store.getAkashicFacts()).toEqual(['lighthouse keeper'])
    expect(await store.getPending()).toEqual([])
    const p: PendingDelivery = {
      id: 'p1',
      companionId: 'c1',
      kind: 'reply',
      format: 'text',
      dueAt: 'x',
      attempts: 0
    }
    await store.savePending([p])
    expect(await store.getPending()).toEqual([p])
  })
})
