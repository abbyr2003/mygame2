import type { ClaudeClient, CompletionRequest } from '../../src/main/voice/claudeClient'

// Answers by matching the system prompt, and records every call.
export function fakeClaude(route: (req: CompletionRequest) => string | Promise<string>) {
  const calls: CompletionRequest[] = []
  const client: ClaudeClient = {
    complete: async (req) => {
      calls.push(req)
      return route(req)
    }
  }
  return { client, calls }
}

export const kindOf = (req: CompletionRequest): string => {
  const s = req.system
  if (s.includes('keep a spirit companion’s memory')) return 'memory'
  if (s.includes('Extract any statements')) return 'notes'
  if (s.includes('Extract the concrete facts')) return 'facts'
  if (s.includes('You translate messages')) return 'translate'
  if (s.includes('You are Source')) return 'source'
  if (s.includes('You are the Akashic Records')) return 'reading'
  return 'companion'
}
