import { describe, it, expect } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { AnthropicClaude, VoiceError } from '../../../src/main/voice/claudeClient'

const req = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }], maxTokens: 100 }

type Create = (params: Record<string, unknown>) => Promise<unknown>

function clientWith(create: Create, key: string | null = 'sk-ant-test', model = 'claude-sonnet-5-5') {
  const seen: { key?: string; params?: Record<string, unknown> } = {}
  const claude = new AnthropicClaude(
    async () => key,
    async () => model,
    (apiKey) => {
      seen.key = apiKey
      return {
        create: async (params) => {
          seen.params = params
          return create(params)
        }
      }
    }
  )
  return { claude, seen }
}

const apiError = (status: number): Error =>
  Anthropic.APIError.generate(status, { type: 'error' }, 'boom', new Headers())

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
  } catch (e) {
    if (e instanceof VoiceError) return e.code
    throw e
  }
  throw new Error('did not throw')
}

describe('AnthropicClaude', () => {
  it('returns the text of the reply and sends model, system and max tokens', async () => {
    const { claude, seen } = clientWith(async () => ({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Dear one,' }]
    }))
    expect(await claude.complete(req)).toBe('Dear one,')
    expect(seen.key).toBe('sk-ant-test')
    expect(seen.params).toMatchObject({ model: 'claude-sonnet-5-5', system: 's', max_tokens: 100 })
  })

  it('maps missing key to no-key', async () => {
    const { claude } = clientWith(async () => ({}), null)
    expect(await codeOf(claude.complete(req))).toBe('no-key')
  })

  it('maps 401 and 403 to bad-key', async () => {
    expect(await codeOf(clientWith(() => Promise.reject(apiError(401))).claude.complete(req))).toBe(
      'bad-key'
    )
    expect(await codeOf(clientWith(() => Promise.reject(apiError(403))).claude.complete(req))).toBe(
      'bad-key'
    )
  })

  it('maps 402 to no-credit', async () => {
    expect(await codeOf(clientWith(() => Promise.reject(apiError(402))).claude.complete(req))).toBe(
      'no-credit'
    )
  })

  it('maps 529, 429 and connection errors to unavailable', async () => {
    for (const err of [
      apiError(529),
      apiError(429),
      new Anthropic.APIConnectionError({ message: 'offline' })
    ]) {
      expect(await codeOf(clientWith(() => Promise.reject(err)).claude.complete(req))).toBe(
        'unavailable'
      )
    }
  })

  it('maps a refusal to refused', async () => {
    const { claude } = clientWith(async () => ({ stop_reason: 'refusal', content: [] }))
    expect(await codeOf(claude.complete(req))).toBe('refused')
  })
})
