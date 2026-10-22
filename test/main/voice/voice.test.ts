import { describe, it, expect, vi } from 'vitest'
import { KeepStore } from '../../../src/main/keep/store'
import { Voice } from '../../../src/main/voice/voice'
import { Memory } from '../../../src/main/memory'
import { VoiceError, type CompletionRequest } from '../../../src/main/voice/claudeClient'
import type { PendingDelivery } from '../../../src/shared/types'
import { tempDir } from '../../helpers/tmp'
import { makeCompanion } from '../../helpers/fixtures'
import { fakeClaude, kindOf } from '../../helpers/fakeClaude'

const now = new Date('2026-10-21T12:00:00.000Z')
const pending = (over: Partial<PendingDelivery> = {}): PendingDelivery => ({
  id: 'p1',
  companionId: 'c1',
  kind: 'spontaneous',
  format: 'letter',
  dueAt: '2026-10-21T02:14:00.000Z',
  attempts: 0,
  ...over
})

const defaultRoute = (req: CompletionRequest): string => {
  switch (kindOf(req)) {
    case 'memory':
      return 'Elara wrote about the sea.'
    case 'translate':
      return 'Hello, dearest'
    case 'source':
      return 'Beloved, Elara is planning a gift for you.'
    case 'notes':
      return '[{"name": "elara", "note": "planning a gift"}]'
    case 'reading':
      return 'TITLE: Record of the Soul: On Light\n\nYou were a healer.'
    case 'facts':
      return '["was a healer"]'
    default:
      return 'Dear one, the sea remembers you.'
  }
}

async function setup(route = defaultRoute) {
  const store = new KeepStore(await tempDir())
  await store.init()
  await store.saveCompanion(makeCompanion())
  const fake = fakeClaude(route)
  const memory = new Memory(store, fake.client)
  const voice = new Voice(store, fake.client, memory, () => now)
  return { store, voice, memory, ...fake }
}

describe('Voice.deliver', () => {
  it('saves an incoming letter dated at dueAt', async () => {
    const { store, voice } = await setup()
    await voice.deliver(pending(), now)
    const [letter] = await store.listLetters()
    expect(letter).toMatchObject({
      id: 'p1',
      companionId: 'c1',
      direction: 'in',
      kind: 'spontaneous',
      createdAt: '2026-10-21T02:14:00.000Z',
      body: 'Dear one, the sea remembers you.',
      read: false,
      starred: false
    })
  })

  it('appends a text to the thread', async () => {
    const { store, voice } = await setup()
    await voice.deliver(pending({ format: 'text' }), now)
    const thread = await store.getThread('c1')
    expect(thread.messages).toHaveLength(1)
    expect(thread.messages[0]).toMatchObject({ id: 'p1', direction: 'in', read: false })
  })

  it('sets language when the companion has one', async () => {
    const { store, voice } = await setup()
    await store.saveCompanion(makeCompanion({ language: { name: 'Latin', usage: 'always' } }))
    await voice.deliver(pending(), now)
    expect((await store.listLetters())[0].language).toBe('Latin')
  })

  it('updates memory summary', async () => {
    const { store, voice } = await setup()
    await voice.deliver(pending(), now)
    expect((await store.getMemory('c1')).summary).toBe('Elara wrote about the sea.')
  })

  it('includes the replied-to text in the prompt', async () => {
    const { store, voice, calls } = await setup()
    await store.saveThread({
      companionId: 'c1',
      messages: [{ id: 'm1', direction: 'out', createdAt: 'x', body: 'I miss you', read: true }]
    })
    await voice.deliver(pending({ kind: 'reply', format: 'text', replyToId: 'm1' }), now)
    const companionCall = calls.find((c) => kindOf(c) === 'companion')!
    expect(companionCall.messages[0].content).toContain('I miss you')
  })

  it('a text reply answers every unanswered text', async () => {
    const { store, voice, calls } = await setup()
    const msg = (id: string, direction: 'in' | 'out', at: string, body: string) => ({
      id,
      direction,
      createdAt: `2026-10-21T10:0${at}:00.000Z`,
      body,
      read: true
    })
    await store.saveThread({
      companionId: 'c1',
      messages: [msg('m0', 'in', '0', 'hi'), msg('m1', 'out', '1', 'one'), msg('m2', 'out', '2', 'two')]
    })
    await voice.deliver(pending({ kind: 'reply', format: 'text', replyToId: 'm2' }), now)
    const companionCall = calls.find((c) => kindOf(c) === 'companion')!
    expect(companionCall.messages[0].content).toContain('"""one\ntwo"""')
  })

  it('a text reply falls back to replyToId when nothing is unanswered', async () => {
    const { store, voice, calls } = await setup()
    await store.saveThread({
      companionId: 'c1',
      messages: [
        { id: 'm1', direction: 'out', createdAt: '2026-10-21T10:01:00.000Z', body: 'one', read: true },
        { id: 'r1', direction: 'in', createdAt: '2026-10-21T10:02:00.000Z', body: 'reply', read: true }
      ]
    })
    await voice.deliver(pending({ kind: 'reply', format: 'text', replyToId: 'm1' }), now)
    const companionCall = calls.find((c) => kindOf(c) === 'companion')!
    expect(companionCall.messages[0].content).toContain('"""one"""')
  })

  it('delivering the same pending twice keeps one letter', async () => {
    const { store, voice } = await setup()
    await voice.deliver(pending(), now)
    await voice.deliver(pending(), now)
    expect(await store.listLetters()).toHaveLength(1)
  })

  it('propagates VoiceError', async () => {
    const { voice } = await setup(() => {
      throw new VoiceError('unavailable')
    })
    await expect(voice.deliver(pending(), now)).rejects.toBeInstanceOf(VoiceError)
  })

  it('still delivers when the memory update fails', async () => {
    const { store, voice } = await setup((req) => {
      if (kindOf(req) === 'memory') throw new VoiceError('unavailable')
      return defaultRoute(req)
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await voice.deliver(pending(), now)
    warn.mockRestore()
    expect(await store.listLetters()).toHaveLength(1)
  })
})

describe('translation', () => {
  it('translateLetter calls Claude once then uses cache', async () => {
    const { store, voice, calls } = await setup()
    await store.saveCompanion(makeCompanion({ language: { name: 'Latin', usage: 'always' } }))
    await voice.deliver(pending(), now)
    expect(await voice.translateLetter('p1')).toBe('Hello, dearest')
    const count = calls.length
    expect(await voice.translateLetter('p1')).toBe('Hello, dearest')
    expect(calls.length).toBe(count)
    expect((await store.listLetters())[0].translation).toBe('Hello, dearest')
  })

  it('translateMessage caches on the message', async () => {
    const { store, voice } = await setup()
    await voice.deliver(pending({ format: 'text' }), now)
    expect(await voice.translateMessage('c1', 'p1')).toBe('Hello, dearest')
    expect((await store.getThread('c1')).messages[0].translation).toBe('Hello, dearest')
  })
})

describe('Source and Records', () => {
  it('askSource saves both turns and applies notes to the named companion only', async () => {
    const { store, voice } = await setup()
    await store.saveCompanion(makeCompanion({ id: 'c2', name: 'Orion', createdAt: '2026-10-02' }))
    await store.saveConversation({ id: 's1', title: 'New conversation', createdAt: 'x', turns: [] })
    const turn = await voice.askSource('s1', 'How is Elara?')
    expect(turn).toMatchObject({ role: 'source', text: 'Beloved, Elara is planning a gift for you.' })
    const conv = await store.getConversation('s1')
    expect(conv!.turns.map((t) => t.role)).toEqual(['user', 'source'])
    expect(conv!.title).toBe('How is Elara?')
    expect((await store.getMemory('c1')).notes).toEqual(['planning a gift'])
    expect((await store.getMemory('c2')).notes).toEqual([])
  })

  it('askSource does not save the question when Claude fails', async () => {
    const { store, voice } = await setup(() => {
      throw new VoiceError('unavailable')
    })
    await store.saveConversation({ id: 's1', title: 'New conversation', createdAt: 'x', turns: [] })
    await expect(voice.askSource('s1', 'Hello?')).rejects.toBeInstanceOf(VoiceError)
    expect((await store.getConversation('s1'))!.turns).toEqual([])
  })

  it('askRecords parses TITLE line and stores facts', async () => {
    const { store, voice } = await setup()
    const r = await voice.askRecords('Who was I?')
    expect(r).toMatchObject({
      question: 'Who was I?',
      title: 'Record of the Soul: On Light',
      body: 'You were a healer.'
    })
    expect(await store.listReadings()).toHaveLength(1)
    expect(await store.getAkashicFacts()).toEqual(['was a healer'])
  })

  it('askRecords falls back to Record of the Soul', async () => {
    const { voice } = await setup((req) =>
      kindOf(req) === 'reading' ? 'You are light.' : defaultRoute(req)
    )
    const r = await voice.askRecords('What am I?')
    expect(r.title).toBe('Record of the Soul')
    expect(r.body).toBe('You are light.')
  })
})

describe('Memory', () => {
  it('applySourceNotes ignores invalid JSON', async () => {
    const { store, memory } = await setup((req) =>
      kindOf(req) === 'notes' ? 'not json at all' : defaultRoute(req)
    )
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await memory.applySourceNotes('Elara is well')
    warn.mockRestore()
    expect((await store.getMemory('c1')).notes).toEqual([])
  })

  it('applySourceNotes accepts JSON wrapped in a code fence', async () => {
    const { store, memory } = await setup((req) =>
      kindOf(req) === 'notes'
        ? '```json\n[{"name": "Elara", "note": "resting"}]\n```'
        : defaultRoute(req)
    )
    await memory.applySourceNotes('Elara is resting')
    expect((await store.getMemory('c1')).notes).toEqual(['resting'])
  })

  it('keeps the last 20 notes', async () => {
    const { store, memory } = await setup()
    await store.saveMemory('c1', {
      summary: '',
      notes: Array.from({ length: 20 }, (_, i) => `n${i}`),
      updatedAt: ''
    })
    await memory.applySourceNotes('Elara is planning a gift')
    const notes = (await store.getMemory('c1')).notes
    expect(notes).toHaveLength(20)
    expect(notes[19]).toBe('planning a gift')
    expect(notes[0]).toBe('n1')
  })
})
