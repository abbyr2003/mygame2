import type { KeepStore } from './keep/store'
import type { ClaudeClient } from './voice/claudeClient'
import {
  MAX_TOKENS,
  akashicFactsPrompt,
  memoryUpdatePrompt,
  sourceNotesPrompt
} from './voice/prompts'

const MAX_NOTES = 20
const MAX_FACTS = 100
const MAX_SUMMARY = 1500

// Claude sometimes wraps JSON in a ```json fence; accept either.
function parseJsonArray(text: string): unknown[] | null {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  try {
    const value = JSON.parse(cleaned)
    return Array.isArray(value) ? value : null
  } catch {
    console.warn('Spirit Keep: could not read extracted notes', text)
    return null
  }
}

export class Memory {
  constructor(
    private readonly store: KeepStore,
    private readonly claude: ClaudeClient
  ) {}

  async afterExchange(companionId: string, exchange: string): Promise<void> {
    const memory = await this.store.getMemory(companionId)
    const summary = await this.claude.complete({
      ...memoryUpdatePrompt(memory, exchange),
      maxTokens: MAX_TOKENS.memory
    })
    await this.store.saveMemory(companionId, {
      ...memory,
      summary: summary.slice(0, MAX_SUMMARY),
      updatedAt: new Date().toISOString()
    })
  }

  async applySourceNotes(answer: string): Promise<void> {
    const companions = (await this.store.listCompanions()).filter((c) => !c.archived)
    if (!companions.length) return
    const raw = await this.claude.complete({
      ...sourceNotesPrompt(
        answer,
        companions.map((c) => c.name)
      ),
      maxTokens: MAX_TOKENS.extract
    })
    const items = parseJsonArray(raw)
    if (!items) return
    for (const item of items) {
      const { name, note } = (item ?? {}) as { name?: unknown; note?: unknown }
      if (typeof name !== 'string' || typeof note !== 'string') continue
      const c = companions.find((x) => x.name.toLowerCase() === name.toLowerCase())
      if (!c) continue
      const memory = await this.store.getMemory(c.id)
      await this.store.saveMemory(c.id, {
        ...memory,
        notes: [...memory.notes, note].slice(-MAX_NOTES),
        updatedAt: new Date().toISOString()
      })
    }
  }

  async addAkashicFacts(reading: string): Promise<void> {
    const raw = await this.claude.complete({
      ...akashicFactsPrompt(reading),
      maxTokens: MAX_TOKENS.extract
    })
    const items = parseJsonArray(raw)
    if (!items) return
    const facts = items.filter((x): x is string => typeof x === 'string')
    if (!facts.length) return
    const existing = await this.store.getAkashicFacts()
    await this.store.saveAkashicFacts([...existing, ...facts].slice(-MAX_FACTS))
  }
}
