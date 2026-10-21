import Anthropic from '@anthropic-ai/sdk'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export interface CompletionRequest {
  system: string
  messages: ChatMessage[]
  maxTokens: number
  effort?: 'low' | 'medium'
}

export interface ClaudeClient {
  complete(req: CompletionRequest): Promise<string>
}

export type VoiceErrorCode = 'no-key' | 'bad-key' | 'no-credit' | 'unavailable' | 'refused'

export class VoiceError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    message?: string
  ) {
    super(message ?? code)
    this.name = 'VoiceError'
  }
}

// The one SDK call we make; injectable so tests never touch the network.
type CreateFn = (params: Record<string, unknown>) => Promise<unknown>
export type MakeClient = (apiKey: string) => { create: CreateFn }

const defaultMakeClient: MakeClient = (apiKey) => {
  const client = new Anthropic({ apiKey })
  return {
    create: (params) =>
      client.beta.messages.create(
        params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming
      )
  }
}

// Models that accept the server-side refusal fallback in its "default" form.
const FALLBACK_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1']

function toVoiceError(err: unknown): VoiceError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new VoiceError('bad-key', err.message)
  }
  if (err instanceof Anthropic.APIConnectionError) return new VoiceError('unavailable', err.message)
  if (err instanceof Anthropic.APIError) {
    if (err.status === 402) return new VoiceError('no-credit', err.message)
    return new VoiceError('unavailable', err.message)
  }
  return new VoiceError('unavailable', err instanceof Error ? err.message : String(err))
}

type Reply = { stop_reason?: string; content?: { type: string; text?: string }[] }

export class AnthropicClaude implements ClaudeClient {
  constructor(
    private readonly getKey: () => Promise<string | null>,
    private readonly getModel: () => Promise<string>,
    private readonly makeClient: MakeClient = defaultMakeClient
  ) {}

  async complete(req: CompletionRequest): Promise<string> {
    const key = await this.getKey()
    if (!key) throw new VoiceError('no-key')
    const model = await this.getModel()
    const params: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: req.messages,
      output_config: { effort: req.effort ?? 'low' }
    }
    if (FALLBACK_MODELS.includes(model)) {
      params.betas = ['server-side-fallback-2026-07-01']
      params.fallbacks = 'default'
    }
    let reply: Reply
    try {
      reply = (await this.makeClient(key).create(params)) as Reply
    } catch (err) {
      throw toVoiceError(err)
    }
    if (reply.stop_reason === 'refusal') throw new VoiceError('refused')
    return (reply.content ?? [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text ?? '')
      .join('')
      .trim()
  }
}
