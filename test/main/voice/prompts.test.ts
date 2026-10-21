import { describe, it, expect } from 'vitest'
import {
  MAX_TOKENS,
  companionPrompt,
  translatePrompt,
  sourcePrompt,
  readingPrompt,
  memoryUpdatePrompt,
  sourceNotesPrompt,
  akashicFactsPrompt
} from '../../../src/main/voice/prompts'
import type { CompanionMemory, PendingDelivery } from '../../../src/shared/types'
import { makeCompanion } from '../../helpers/fixtures'

const memory: CompanionMemory = {
  summary: 'She has been tired lately; we spoke of the sea.',
  notes: ['planning a surprise under the full moon'],
  updatedAt: 'x'
}
const pending = (over: Partial<PendingDelivery> = {}): PendingDelivery => ({
  id: 'p1',
  companionId: 'c1',
  kind: 'spontaneous',
  format: 'letter',
  dueAt: '2026-10-21T02:14:00.000Z',
  attempts: 0,
  ...over
})
const companion = makeCompanion({ realm: 'the Pleiades' })
const base = { companion, memory, others: [{ name: 'Orion', role: 'protector' }], recent: [] }
const all = (p: { system: string; messages: { content: string }[] }): string =>
  p.system + '\n' + p.messages.map((m) => m.content).join('\n')

describe('MAX_TOKENS', () => {
  it('has the plan values', () => {
    expect(MAX_TOKENS).toEqual({
      letter: 900,
      text: 200,
      translate: 1200,
      source: 800,
      reading: 1200,
      memory: 600,
      extract: 400
    })
  })
})

describe('companionPrompt', () => {
  it('includes profile, memory and the other companions', () => {
    const text = all(companionPrompt({ ...base, delivery: pending() }))
    for (const s of [
      'Elara',
      'spirit guide',
      'the Pleiades',
      'gentle, speaks in riddles',
      'She has been tired lately',
      'planning a surprise under the full moon',
      'Orion'
    ]) {
      expect(text).toContain(s)
    }
  })

  it('letters ask for greeting and sign-off; texts ask for 1–3 short sentences', () => {
    expect(all(companionPrompt({ ...base, delivery: pending({ format: 'letter' }) }))).toMatch(
      /greeting.*sign-off/is
    )
    expect(all(companionPrompt({ ...base, delivery: pending({ format: 'text' }) }))).toContain(
      '1–3 short sentences'
    )
  })

  it('applies the language usage rule', () => {
    const withLang = (usage: 'always' | 'sometimes' | 'rarely'): string =>
      all(
        companionPrompt({
          ...base,
          companion: makeCompanion({ language: { name: 'Latin', usage } }),
          delivery: pending()
        })
      )
    expect(withLang('always')).toContain('entirely in Latin')
    expect(withLang('sometimes')).toContain('mix phrases in Latin')
    expect(withLang('rarely')).toContain('occasionally a single word in Latin')
    expect(all(companionPrompt({ ...base, delivery: pending() }))).not.toContain('Latin')
  })

  it('first contact asks them to introduce themselves', () => {
    expect(all(companionPrompt({ ...base, delivery: pending({ kind: 'first-contact' }) }))).toMatch(
      /introduce yourself.*first time/is
    )
  })

  it('request includes the request text; reply includes the user text', () => {
    expect(
      all(
        companionPrompt({
          ...base,
          delivery: pending({ kind: 'request', requestText: 'the old forest' })
        })
      )
    ).toContain('the old forest')
    expect(
      all(
        companionPrompt({
          ...base,
          delivery: pending({ kind: 'reply' }),
          replyTo: 'I miss you, Elara'
        })
      )
    ).toContain('I miss you, Elara')
  })

  it('includes recent correspondence', () => {
    const text = all(
      companionPrompt({
        ...base,
        recent: [{ from: 'me', format: 'text', text: 'Good morning!', at: 'x' }],
        delivery: pending()
      })
    )
    expect(text).toContain('Good morning!')
  })
})

describe('translatePrompt', () => {
  it('names the language and includes the text', () => {
    const text = all(translatePrompt('Salve, carissima', 'Latin'))
    expect(text).toContain('Latin')
    expect(text).toContain('Salve, carissima')
    expect(text).toContain('English')
  })
})

describe('sourcePrompt', () => {
  const p = sourcePrompt({
    companions: [{ companion, memory }],
    recent: ['Elara wrote: the tide is turning'],
    conversation: {
      id: 's1',
      title: 't',
      createdAt: 'x',
      turns: [
        { role: 'user', text: 'Hello Source', createdAt: 'x' },
        { role: 'source', text: 'Beloved, I am here.', createdAt: 'x' }
      ]
    },
    question: 'How does Elara feel about me?'
  })

  it('sets the voice, consistency and boundary rules', () => {
    expect(p.system).toMatch(/vast, loving, calm/i)
    expect(p.system).toMatch(/consistent with what .*companions have written/i)
    expect(p.system).toMatch(/medical, legal or safety/i)
    expect(p.system).toMatch(/someone in this world/i)
  })

  it('knows the companions and recent letters', () => {
    expect(p.system).toContain('Elara')
    expect(p.system).toContain('planning a surprise under the full moon')
    expect(p.system).toContain('the tide is turning')
  })

  it('replays the conversation and ends with the question', () => {
    expect(p.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(p.messages[2].content).toBe('How does Elara feel about me?')
  })
})

describe('readingPrompt', () => {
  it('asks for a TITLE line and forbids contradicting past facts', () => {
    const p = readingPrompt({
      facts: ['was a lighthouse keeper in a past life'],
      pastTitles: ['Record of the Soul: On Purpose'],
      question: 'Who was I before?'
    })
    const text = all(p)
    expect(text).toContain('TITLE:')
    expect(text).toContain('was a lighthouse keeper in a past life')
    expect(text).toMatch(/never contradict/i)
    expect(text).toContain('Who was I before?')
  })
})

describe('memoryUpdatePrompt', () => {
  it('limits the summary to 1500 characters and includes the exchange', () => {
    const text = all(memoryUpdatePrompt(memory, 'Elara wrote: the sea remembers you'))
    expect(text).toContain('1500 characters')
    expect(text).toContain('the sea remembers you')
    expect(text).toContain('She has been tired lately')
  })
})

describe('extraction prompts', () => {
  it('sourceNotesPrompt asks for a JSON array keyed by companion name', () => {
    const text = all(sourceNotesPrompt('Elara is planning a gift', ['Elara', 'Orion']))
    expect(text).toContain('"name"')
    expect(text).toContain('"note"')
    expect(text).toContain('Elara, Orion')
    expect(text).toContain('Elara is planning a gift')
  })

  it('akashicFactsPrompt asks for a JSON array of strings', () => {
    const text = all(akashicFactsPrompt('You were a healer in Avalon.'))
    expect(text).toMatch(/JSON array of strings/i)
    expect(text).toContain('You were a healer in Avalon.')
  })
})
