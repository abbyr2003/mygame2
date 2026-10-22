export type Frequency = 'devoted' | 'chatty' | 'regular' | 'quiet' | 'rare'
export type FormatPref = 'letters' | 'texts' | 'both'
export type LanguageUsage = 'rarely' | 'sometimes' | 'always'
export type Format = 'letter' | 'text'
export type DeliveryKind = 'first-contact' | 'spontaneous' | 'reply' | 'request'

export interface Companion {
  id: string
  name: string
  portraitFile: string | null
  role: string
  realm?: string
  voice: string
  language?: { name: string; usage: LanguageUsage }
  frequency: Frequency
  formatPref: FormatPref
  seal: { color: string; symbol: string }
  handwriting: string
  archived: boolean
  createdAt: string
  nextSpontaneousAt: string | null
}

export interface CompanionMemory {
  summary: string
  notes: string[]
  updatedAt: string
}

export interface Letter {
  id: string
  companionId: string
  direction: 'in' | 'out'
  kind: DeliveryKind | 'user'
  createdAt: string
  body: string
  language?: string
  translation?: string
  read: boolean
  starred: boolean
  requestText?: string
  // Outgoing only: when the companion opens it.
  readAt?: string
}

export interface Message {
  id: string
  direction: 'in' | 'out'
  createdAt: string
  body: string
  language?: string
  translation?: string
  read: boolean
  // Outgoing only: when the companion reads it.
  readAt?: string
}

export interface Thread {
  companionId: string
  messages: Message[]
}

export interface SourceTurn {
  role: 'user' | 'source'
  text: string
  createdAt: string
}

export interface SourceConversation {
  id: string
  title: string
  focusCompanionId?: string
  createdAt: string
  turns: SourceTurn[]
}

export interface Reading {
  id: string
  question: string
  title: string
  body: string
  createdAt: string
}

export interface PendingDelivery {
  id: string
  companionId: string
  kind: DeliveryKind
  format: Format
  dueAt: string
  replyToId?: string
  requestText?: string
  // When the companion reads the message this answers.
  readAt?: string
  attempts: number
}

export interface KeepState {
  schemaVersion: 1
  lastOpenedAt: string | null
  sound: boolean
  model: string
}
