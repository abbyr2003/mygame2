import { describe, it, expect } from 'vitest'
import { KeepStore } from '../../src/main/keep/store'
import { createHandlers, registerIpc, type IpcDeps } from '../../src/main/ipc'
import { VoiceError } from '../../src/main/voice/claudeClient'
import { channelFor, UNREAD_CHANNEL, type IpcResult } from '../../src/shared/api'
import type { Companion } from '../../src/shared/types'
import { tempDir } from '../helpers/tmp'
import { makeCompanion } from '../helpers/fixtures'

const now = new Date('2026-10-21T12:00:00.000Z')

async function setup(testKey: () => Promise<void> = async () => {}) {
  const store = new KeepStore(await tempDir())
  await store.init()
  const sent: unknown[][] = []
  const created: Companion[] = []
  let key: string | null = null
  const events: string[] = []
  const receipt: { readAt: string | undefined } = { readAt: '2026-10-21T12:00:20.000Z' }
  const deps: IpcDeps = {
    store,
    postOffice: {
      companionCreated: async (c) => {
        created.push(c)
        return { ...c, nextSpontaneousAt: 'later' }
      },
      userSent: async (...args) => {
        sent.push(args)
        return receipt.readAt
      }
    },
    voice: {
      translateLetter: async () => 'translated',
      translateMessage: async () => 'translated',
      askSource: async () => ({ role: 'source', text: 'Beloved', createdAt: 'x' }),
      askRecords: async () => {
        throw new VoiceError('unavailable')
      }
    },
    secrets: {
      setApiKey: async (k) => {
        key = k
      },
      hasApiKey: async () => key !== null,
      clear: async () => {
        key = null
      }
    },
    testKey,
    choosePortrait: async () => null,
    openKeepFolder: () => {},
    keepPath: 'C:/Users/me/Documents/Spirit Keep',
    now: () => now,
    emit: (e) => events.push(e)
  }
  return {
    store,
    deps,
    handlers: createHandlers(deps),
    sent,
    created,
    events,
    receipt,
    getKey: () => key
  }
}

const input = {
  name: 'Elara',
  role: 'spirit guide',
  voice: 'gentle',
  frequency: 'regular' as const,
  formatPref: 'both' as const,
  seal: { color: '#6b3fa0', symbol: 'moon' }
}

describe('ipc handlers', () => {
  it('companions.create saves, assigns handwriting and calls companionCreated', async () => {
    const { handlers, created, store, events } = await setup()
    const c = await handlers.companions.create(input)
    expect(c.nextSpontaneousAt).toBe('later')
    expect(c.handwriting).toBe('Caveat')
    expect(created).toHaveLength(1)
    expect(await store.getCompanion(c.id)).not.toBeNull()
    expect(events).toContain('changed')
    const second = await handlers.companions.create({ ...input, name: 'Orion' })
    expect(second.handwriting).toBe('Dancing Script')
  })

  it('letters.send saves an outgoing letter and schedules a reply', async () => {
    const { handlers, store, sent } = await setup()
    await store.saveCompanion(makeCompanion())
    const letter = await handlers.letters.send('c1', 'Dear Elara')
    expect(letter).toMatchObject({ direction: 'out', kind: 'user', body: 'Dear Elara', read: true })
    expect((await store.listLetters())[0].id).toBe(letter.id)
    expect(sent).toEqual([['c1', 'reply', 'letter', { replyToId: letter.id }]])
  })

  it('letters.request schedules a request letter', async () => {
    const { handlers, store, sent } = await setup()
    await store.saveCompanion(makeCompanion())
    await handlers.letters.request('c1', 'the old forest')
    expect(sent).toEqual([['c1', 'request', 'letter', { requestText: 'the old forest' }]])
  })

  it('messages.send appends to the thread and schedules a reply', async () => {
    const { handlers, store, sent } = await setup()
    await store.saveCompanion(makeCompanion())
    const m = await handlers.messages.send('c1', 'hi!')
    expect((await store.getThread('c1')).messages.map((x) => x.id)).toEqual([m.id])
    expect(sent).toEqual([['c1', 'reply', 'text', { replyToId: m.id }]])
  })

  it('markRead and unread counts', async () => {
    const { handlers, store } = await setup()
    await store.saveThread({
      companionId: 'c1',
      messages: [
        { id: 'a', direction: 'in', createdAt: 'x', body: 'hi', read: false },
        { id: 'b', direction: 'out', createdAt: 'y', body: 'yo', read: false }
      ]
    })
    await store.saveLetter({
      id: 'l1',
      companionId: 'c1',
      direction: 'in',
      kind: 'spontaneous',
      createdAt: 'x',
      body: 'Dear',
      read: false,
      starred: false
    })
    expect(await handlers.unread()).toEqual({ letters: 1, messages: 1 })
    await handlers.messages.markRead('c1')
    await handlers.letters.markRead('l1')
    expect(await handlers.unread()).toEqual({ letters: 0, messages: 0 })
  })

  it('source.start focused on a companion names the conversation', async () => {
    const { handlers, store } = await setup()
    await store.saveCompanion(makeCompanion())
    const conv = await handlers.source.start('c1')
    expect(conv).toMatchObject({ focusCompanionId: 'c1', title: 'About Elara', turns: [] })
    expect(await handlers.source.list()).toHaveLength(1)
  })

  it('settings.get never includes the key', async () => {
    const { handlers } = await setup()
    await handlers.settings.setApiKey('sk-ant-secret')
    const s = await handlers.settings.get()
    expect(JSON.stringify(s)).not.toContain('sk-ant-secret')
    expect(s).toEqual({
      hasKey: true,
      model: 'claude-sonnet-5-5',
      sound: true,
      keepPath: 'C:/Users/me/Documents/Spirit Keep'
    })
  })

  it('setApiKey rejects and clears a bad key', async () => {
    const { handlers, getKey } = await setup(async () => {
      throw new VoiceError('bad-key')
    })
    expect(await handlers.settings.setApiKey('sk-ant-wrong')).toEqual({
      ok: false,
      error: 'bad-key'
    })
    expect(getKey()).toBeNull()
  })

  it('registerIpc wraps errors with their VoiceError code', async () => {
    const { deps } = await setup()
    const channels = new Map<string, (...args: unknown[]) => Promise<IpcResult<unknown>>>()
    registerIpc({ handle: (ch, fn) => channels.set(ch, (...a) => fn({}, ...a)) }, deps)
    expect(channels.has(UNREAD_CHANNEL)).toBe(true)
    expect(await channels.get(channelFor('library', 'ask'))!('Who am I?')).toMatchObject({
      ok: false,
      code: 'unavailable'
    })
    expect(await channels.get(channelFor('companions', 'list'))!()).toEqual({ ok: true, value: [] })
  })

  it('messages.send stores the readAt from userSent', async () => {
    const { handlers, store } = await setup()
    const m = await handlers.messages.send('c1', 'hello')
    expect(m.readAt).toBe('2026-10-21T12:00:20.000Z')
    expect((await store.getThread('c1')).messages[0].readAt).toBe('2026-10-21T12:00:20.000Z')
  })

  it('letters.send and letters.request store the readAt from userSent', async () => {
    const { handlers, store } = await setup()
    await handlers.letters.send('c1', 'dear one')
    await handlers.letters.request('c1', 'the stars')
    const letters = await store.listLetters()
    expect(letters).toHaveLength(2)
    expect(letters.every((l) => l.readAt === '2026-10-21T12:00:20.000Z')).toBe(true)
  })

  it('saves without readAt when userSent returns undefined', async () => {
    const { handlers, store, receipt } = await setup()
    receipt.readAt = undefined
    await handlers.messages.send('c1', 'hello')
    expect('readAt' in (await store.getThread('c1')).messages[0]).toBe(false)
  })
})
