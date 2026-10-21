import type {
  Companion,
  Letter,
  Message,
  Reading,
  SourceConversation,
  SourceTurn,
  Thread
} from './types'

export type CompanionInput = Omit<
  Companion,
  'id' | 'createdAt' | 'archived' | 'nextSpontaneousAt' | 'portraitFile' | 'handwriting'
>

export type KeyCheck = { ok: true } | { ok: false; error: 'bad-key' | 'no-credit' | 'unavailable' }

export interface Settings {
  hasKey: boolean
  model: string
  sound: boolean
  keepPath: string
}

export type KeepEvent = 'delivered' | 'veil' | 'changed'

// Everything the window can ask the engine for. Exposed as window.keep.
export interface SpiritKeepApi {
  companions: {
    list(): Promise<Companion[]>
    create(input: CompanionInput, portraitPath?: string): Promise<Companion>
    update(id: string, patch: Partial<Companion>, portraitPath?: string): Promise<Companion>
    archive(id: string): Promise<void>
    choosePortrait(): Promise<string | null>
  }
  letters: {
    list(): Promise<Letter[]>
    markRead(id: string): Promise<void>
    star(id: string, starred: boolean): Promise<void>
    send(companionId: string, body: string): Promise<Letter>
    request(companionId: string, text: string): Promise<void>
    translate(id: string): Promise<string>
  }
  messages: {
    threads(): Promise<Thread[]>
    send(companionId: string, body: string): Promise<Message>
    markRead(companionId: string): Promise<void>
    translate(companionId: string, messageId: string): Promise<string>
  }
  source: {
    list(): Promise<SourceConversation[]>
    start(focusCompanionId?: string): Promise<SourceConversation>
    ask(conversationId: string, text: string): Promise<SourceTurn>
  }
  library: {
    list(): Promise<Reading[]>
    ask(question: string): Promise<Reading>
  }
  settings: {
    get(): Promise<Settings>
    setApiKey(key: string): Promise<KeyCheck>
    setModel(model: string): Promise<void>
    setSound(on: boolean): Promise<void>
    openKeepFolder(): Promise<void>
  }
  unread(): Promise<{ letters: number; messages: number }>
  on(event: KeepEvent, cb: (payload?: unknown) => void): () => void
}

export type InvokableApi = Omit<SpiritKeepApi, 'on'>

// Channel names, one per method: "keep:companions.list", "keep:unread", ...
export const API_METHODS = {
  companions: ['list', 'create', 'update', 'archive', 'choosePortrait'],
  letters: ['list', 'markRead', 'star', 'send', 'request', 'translate'],
  messages: ['threads', 'send', 'markRead', 'translate'],
  source: ['list', 'start', 'ask'],
  library: ['list', 'ask'],
  settings: ['get', 'setApiKey', 'setModel', 'setSound', 'openKeepFolder']
} as const

export const UNREAD_CHANNEL = 'keep:unread'
export const EVENT_CHANNEL = 'keep:event'
export const channelFor = (group: string, method: string): string => `keep:${group}.${method}`

// Errors cross the bridge as data so the window can read the VoiceError code.
export type IpcResult<T> = { ok: true; value: T } | { ok: false; code: string; message: string }

export const portraitUrl = (c: Pick<Companion, 'id' | 'portraitFile'>): string | null =>
  c.portraitFile ? `keep://portrait/${c.id}/${c.portraitFile}` : null
