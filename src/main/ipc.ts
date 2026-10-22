import { randomUUID } from 'crypto'
import type { KeepStore } from './keep/store'
import type { PostOffice } from './postOffice/runner'
import type { Voice } from './voice/voice'
import type { Secrets } from './secrets'
import { VoiceError } from './voice/claudeClient'
import { NEW_CONVERSATION_TITLE } from './voice/voice'
import { HANDWRITING_FONTS } from '../shared/fonts'
import {
  API_METHODS,
  UNREAD_CHANNEL,
  channelFor,
  type InvokableApi,
  type IpcResult,
  type KeepEvent,
  type KeyCheck
} from '../shared/api'
import type { Companion, Letter, Message, SourceConversation } from '../shared/types'

export interface IpcDeps {
  store: KeepStore
  postOffice: Pick<PostOffice, 'companionCreated' | 'userSent'>
  voice: Pick<Voice, 'translateLetter' | 'translateMessage' | 'askSource' | 'askRecords'>
  secrets: Pick<Secrets, 'setApiKey' | 'hasApiKey' | 'clear'>
  testKey: () => Promise<void>
  choosePortrait: () => Promise<string | null>
  openKeepFolder: () => void
  keepPath: string
  now: () => Date
  emit: (event: KeepEvent, payload?: unknown) => void
}

export function createHandlers(d: IpcDeps): InvokableApi {
  const { store } = d
  const stamp = (): string => d.now().toISOString()
  const changed = (): void => d.emit('changed')

  const findLetter = async (id: string): Promise<Letter> => {
    const letter = (await store.listLetters()).find((l) => l.id === id)
    if (!letter) throw new Error(`Unknown letter ${id}`)
    return letter
  }

  return {
    companions: {
      list: () => store.listCompanions(),
      async create(input, portraitPath) {
        const count = (await store.listCompanions()).length
        let c: Companion = {
          ...input,
          id: randomUUID(),
          createdAt: stamp(),
          archived: false,
          nextSpontaneousAt: null,
          portraitFile: null,
          handwriting: HANDWRITING_FONTS[count % HANDWRITING_FONTS.length]
        }
        await store.saveCompanion(c)
        if (portraitPath) c = { ...c, portraitFile: await store.importPortrait(c.id, portraitPath) }
        c = await d.postOffice.companionCreated(c)
        changed()
        return c
      },
      async update(id, patch, portraitPath) {
        const existing = await store.getCompanion(id)
        if (!existing) throw new Error(`Unknown companion ${id}`)
        let c: Companion = { ...existing, ...patch, id }
        if (portraitPath) c.portraitFile = await store.importPortrait(id, portraitPath)
        await store.saveCompanion(c)
        changed()
        return c
      },
      async archive(id) {
        const existing = await store.getCompanion(id)
        if (!existing) return
        await store.saveCompanion({ ...existing, archived: true })
        changed()
      },
      choosePortrait: () => d.choosePortrait()
    },

    letters: {
      list: () => store.listLetters(),
      async markRead(id) {
        await store.saveLetter({ ...(await findLetter(id)), read: true })
        changed()
      },
      async star(id, starred) {
        await store.saveLetter({ ...(await findLetter(id)), starred })
        changed()
      },
      async send(companionId, body) {
        const id = randomUUID()
        const readAt = await d.postOffice.userSent(companionId, 'reply', 'letter', { replyToId: id })
        const letter: Letter = {
          id,
          companionId,
          direction: 'out',
          kind: 'user',
          createdAt: stamp(),
          body,
          read: true,
          starred: false,
          ...(readAt ? { readAt } : {})
        }
        await store.saveLetter(letter)
        changed()
        return letter
      },
      async request(companionId, text) {
        const readAt = await d.postOffice.userSent(companionId, 'request', 'letter', {
          requestText: text
        })
        await store.saveLetter({
          id: randomUUID(),
          companionId,
          direction: 'out',
          kind: 'user',
          createdAt: stamp(),
          body: text,
          requestText: text,
          read: true,
          starred: false,
          ...(readAt ? { readAt } : {})
        })
        changed()
      },
      translate: (id) => d.voice.translateLetter(id)
    },

    messages: {
      threads: () => store.listThreads(),
      async send(companionId, body) {
        const id = randomUUID()
        const readAt = await d.postOffice.userSent(companionId, 'reply', 'text', { replyToId: id })
        const message: Message = {
          id,
          direction: 'out',
          createdAt: stamp(),
          body,
          read: true,
          ...(readAt ? { readAt } : {})
        }
        const thread = await store.getThread(companionId)
        await store.saveThread({ ...thread, messages: [...thread.messages, message] })
        changed()
        return message
      },
      async markRead(companionId) {
        const thread = await store.getThread(companionId)
        await store.saveThread({
          ...thread,
          messages: thread.messages.map((m) => ({ ...m, read: true }))
        })
        changed()
      },
      translate: (companionId, messageId) => d.voice.translateMessage(companionId, messageId)
    },

    source: {
      list: () => store.listConversations(),
      async start(focusCompanionId) {
        const focus = focusCompanionId ? await store.getCompanion(focusCompanionId) : null
        const conv: SourceConversation = {
          id: randomUUID(),
          title: focus ? `About ${focus.name}` : NEW_CONVERSATION_TITLE,
          ...(focus ? { focusCompanionId: focus.id } : {}),
          createdAt: stamp(),
          turns: []
        }
        await store.saveConversation(conv)
        return conv
      },
      ask: (conversationId, text) => d.voice.askSource(conversationId, text)
    },

    library: {
      list: () => store.listReadings(),
      ask: (question) => d.voice.askRecords(question)
    },

    settings: {
      async get() {
        const state = await store.getState()
        return {
          hasKey: await d.secrets.hasApiKey(),
          model: state.model,
          sound: state.sound,
          keepPath: d.keepPath
        }
      },
      async setApiKey(key): Promise<KeyCheck> {
        await d.secrets.setApiKey(key)
        try {
          await d.testKey()
          return { ok: true }
        } catch (err) {
          const code = err instanceof VoiceError ? err.code : 'unavailable'
          if (code === 'bad-key' || code === 'no-key') {
            await d.secrets.clear()
            return { ok: false, error: 'bad-key' }
          }
          return { ok: false, error: code === 'no-credit' ? 'no-credit' : 'unavailable' }
        }
      },
      setModel: (model) => store.setState({ model }),
      setSound: (on) => store.setState({ sound: on }),
      async openKeepFolder() {
        d.openKeepFolder()
      }
    },

    async unread() {
      const letters = (await store.listLetters()).filter((l) => l.direction === 'in' && !l.read)
      const messages = (await store.listThreads()).flatMap((t) =>
        t.messages.filter((m) => m.direction === 'in' && !m.read)
      )
      return { letters: letters.length, messages: messages.length }
    }
  }
}

type Handler = (...args: unknown[]) => Promise<unknown>

async function wrap(fn: Handler, args: unknown[]): Promise<IpcResult<unknown>> {
  try {
    return { ok: true, value: await fn(...args) }
  } catch (err) {
    const code = err instanceof VoiceError ? err.code : 'error'
    return { ok: false, code, message: err instanceof Error ? err.message : String(err) }
  }
}

export function registerIpc(
  ipc: { handle(channel: string, fn: (event: unknown, ...args: unknown[]) => unknown): void },
  deps: IpcDeps
): void {
  const handlers = createHandlers(deps)
  for (const [group, methods] of Object.entries(API_METHODS)) {
    const target = handlers[group as keyof typeof API_METHODS] as unknown as Record<string, Handler>
    for (const method of methods) {
      ipc.handle(channelFor(group, method), (_e, ...args) => wrap(target[method], args))
    }
  }
  ipc.handle(UNREAD_CHANNEL, (_e, ...args) => wrap(handlers.unread as Handler, args))
}
