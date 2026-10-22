import { randomUUID } from 'crypto'
import type { KeepStore } from '../keep/store'
import type { Memory } from '../memory'
import type { ClaudeClient } from './claudeClient'
import {
  MAX_TOKENS,
  companionPrompt,
  readingPrompt,
  sourcePrompt,
  translatePrompt,
  type RecentItem
} from './prompts'
import type {
  Companion,
  Letter,
  Message,
  PendingDelivery,
  Reading,
  SourceTurn
} from '../../shared/types'

const RECENT_WITH_COMPANION = 10
const RECENT_FOR_SOURCE = 20
const DEFAULT_READING_TITLE = 'Record of the Soul'
const NEW_CONVERSATION_TITLE = 'New conversation'

// Background bookkeeping must never undo a delivery that already arrived.
async function quietly(task: Promise<void>): Promise<void> {
  try {
    await task
  } catch (err) {
    console.warn('Spirit Keep: background memory update failed', err)
  }
}

interface Item extends RecentItem {
  id: string
  companionId: string
}

// The user's texts since the companion last texted, so one reply answers them all.
function unansweredTexts(items: Item[]): string {
  const texts = items.filter((i) => i.format === 'text')
  const lastTheirs = texts.map((i) => i.from).lastIndexOf('them')
  return texts
    .slice(lastTheirs + 1)
    .map((i) => i.text)
    .join('\n')
}

export class Voice {
  constructor(
    private readonly store: KeepStore,
    private readonly claude: ClaudeClient,
    private readonly memory: Memory,
    private readonly now: () => Date = () => new Date()
  ) {}

  // Letters and texts with every companion, oldest first.
  private async allItems(): Promise<Item[]> {
    const letters = (await this.store.listLetters()).map(
      (l): Item => ({
        id: l.id,
        companionId: l.companionId,
        from: l.direction === 'out' ? 'me' : 'them',
        format: 'letter',
        text: l.body,
        at: l.createdAt
      })
    )
    const texts = (await this.store.listThreads()).flatMap((t) =>
      t.messages.map(
        (m): Item => ({
          id: m.id,
          companionId: t.companionId,
          from: m.direction === 'out' ? 'me' : 'them',
          format: 'text',
          text: m.body,
          at: m.createdAt
        })
      )
    )
    return [...letters, ...texts].sort((a, b) => a.at.localeCompare(b.at))
  }

  async deliver(p: PendingDelivery, _now: Date): Promise<Letter | Message> {
    const companion = await this.store.getCompanion(p.companionId)
    if (!companion) throw new Error(`Unknown companion ${p.companionId}`)
    const memory = await this.store.getMemory(companion.id)
    const others = (await this.store.listCompanions())
      .filter((c) => c.id !== companion.id && !c.archived)
      .map((c) => ({ name: c.name, role: c.role }))
    const items = (await this.allItems()).filter((i) => i.companionId === companion.id)
    const replyTo =
      (p.format === 'text' && p.kind === 'reply' ? unansweredTexts(items) : '') ||
      (p.replyToId ? items.find((i) => i.id === p.replyToId)?.text : undefined)

    const body = await this.claude.complete({
      ...companionPrompt({
        companion,
        memory,
        others,
        recent: items.slice(-RECENT_WITH_COMPANION),
        delivery: p,
        replyTo
      }),
      maxTokens: p.format === 'letter' ? MAX_TOKENS.letter : MAX_TOKENS.text,
      effort: p.format === 'letter' ? 'medium' : 'low'
    })

    const saved = await this.save(companion, p, body)
    const exchange = (replyTo ? `User: ${replyTo}\n` : '') + `${companion.name}: ${body}`
    await quietly(this.memory.afterExchange(companion.id, exchange))
    return saved
  }

  // The pending id becomes the item id, so a repeated delivery overwrites
  // instead of duplicating.
  private async save(c: Companion, p: PendingDelivery, body: string): Promise<Letter | Message> {
    const language = c.language?.name
    if (p.format === 'letter') {
      const letter: Letter = {
        id: p.id,
        companionId: c.id,
        direction: 'in',
        kind: p.kind,
        createdAt: p.dueAt,
        body,
        ...(language ? { language } : {}),
        ...(p.requestText ? { requestText: p.requestText } : {}),
        read: false,
        starred: false
      }
      await this.store.saveLetter(letter)
      return letter
    }
    const message: Message = {
      id: p.id,
      direction: 'in',
      createdAt: p.dueAt,
      body,
      ...(language ? { language } : {}),
      read: false
    }
    const thread = await this.store.getThread(c.id)
    const messages = [...thread.messages.filter((m) => m.id !== p.id), message].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt)
    )
    await this.store.saveThread({ companionId: c.id, messages })
    return message
  }

  private async translate(text: string, language: string | undefined): Promise<string> {
    return this.claude.complete({
      ...translatePrompt(text, language ?? 'its original language'),
      maxTokens: MAX_TOKENS.translate
    })
  }

  async translateLetter(id: string): Promise<string> {
    const letter = (await this.store.listLetters()).find((l) => l.id === id)
    if (!letter) throw new Error(`Unknown letter ${id}`)
    if (letter.translation) return letter.translation
    const translation = await this.translate(letter.body, letter.language)
    await this.store.saveLetter({ ...letter, translation })
    return translation
  }

  async translateMessage(companionId: string, messageId: string): Promise<string> {
    const thread = await this.store.getThread(companionId)
    const message = thread.messages.find((m) => m.id === messageId)
    if (!message) throw new Error(`Unknown message ${messageId}`)
    if (message.translation) return message.translation
    const translation = await this.translate(message.body, message.language)
    await this.store.saveThread({
      ...thread,
      messages: thread.messages.map((m) => (m.id === messageId ? { ...m, translation } : m))
    })
    return translation
  }

  async askSource(conversationId: string, text: string): Promise<SourceTurn> {
    const conversation = await this.store.getConversation(conversationId)
    if (!conversation) throw new Error(`Unknown conversation ${conversationId}`)
    const companions = (await this.store.listCompanions()).filter((c) => !c.archived)
    const names = new Map(companions.map((c) => [c.id, c.name]))
    const recent = (await this.allItems()).slice(-RECENT_FOR_SOURCE).map((i) => {
      const name = names.get(i.companionId) ?? 'a companion'
      return i.from === 'me'
        ? `[${i.at}] User wrote to ${name} (${i.format}): ${i.text}`
        : `[${i.at}] ${name} wrote (${i.format}): ${i.text}`
    })
    const focus = conversation.focusCompanionId
      ? names.get(conversation.focusCompanionId)
      : undefined
    const question =
      focus && conversation.turns.length === 0 ? `(I am asking about ${focus}.) ${text}` : text

    const answer = await this.claude.complete({
      ...sourcePrompt({
        companions: await Promise.all(
          companions.map(async (companion) => ({
            companion,
            memory: await this.store.getMemory(companion.id)
          }))
        ),
        recent,
        conversation,
        question
      }),
      maxTokens: MAX_TOKENS.source,
      effort: 'medium'
    })

    const at = this.now().toISOString()
    const reply: SourceTurn = { role: 'source', text: answer, createdAt: at }
    await this.store.saveConversation({
      ...conversation,
      title:
        conversation.title === NEW_CONVERSATION_TITLE && conversation.turns.length === 0
          ? text.slice(0, 40)
          : conversation.title,
      turns: [...conversation.turns, { role: 'user', text, createdAt: at }, reply]
    })
    await quietly(this.memory.applySourceNotes(answer))
    return reply
  }

  async askRecords(question: string): Promise<Reading> {
    const facts = await this.store.getAkashicFacts()
    const pastTitles = (await this.store.listReadings()).map((r) => r.title)
    const raw = await this.claude.complete({
      ...readingPrompt({ facts, pastTitles, question }),
      maxTokens: MAX_TOKENS.reading,
      effort: 'medium'
    })
    const match = raw.match(/^\s*TITLE:\s*(.+)\n?/)
    const reading: Reading = {
      id: randomUUID(),
      question,
      title: match ? match[1].trim() : DEFAULT_READING_TITLE,
      body: (match ? raw.slice(match[0].length) : raw).trim(),
      createdAt: this.now().toISOString()
    }
    await this.store.saveReading(reading)
    await quietly(this.memory.addAkashicFacts(reading.body))
    return reading
  }
}

export { NEW_CONVERSATION_TITLE }
