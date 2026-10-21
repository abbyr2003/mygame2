import { vi, type Mock } from 'vitest'
import { API_METHODS, type SpiritKeepApi } from '../../src/shared/api'

/* eslint-disable @typescript-eslint/no-explicit-any */
type Mocked<G> = { [M in keyof G]: Mock<(...args: any[]) => any> }
export type FakeKeep = { [G in keyof typeof API_METHODS]: Mocked<SpiritKeepApi[G]> } & {
  unread: Mock<(...args: any[]) => any>
  on: Mock<(...args: any[]) => any>
  /** Fire a KeepEvent at every listener registered through `on`. */
  emit(event: string, payload?: unknown): void
}

type Overrides = { [G in keyof typeof API_METHODS]?: Record<string, (...args: any[]) => any> }

/** Install a fake window.keep where every method resolves to undefined unless overridden. */
export function installKeep(overrides: Overrides = {}): FakeKeep {
  const listeners: { event: string; cb: (p?: unknown) => void }[] = []
  const keep: Record<string, unknown> = {}
  for (const [group, methods] of Object.entries(API_METHODS)) {
    const given = overrides[group as keyof Overrides] ?? {}
    keep[group] = Object.fromEntries(
      (methods as readonly string[]).map((m) => {
        const impl = given[m]
        return [m, vi.isMockFunction(impl) ? impl : vi.fn(impl ?? (async () => undefined))]
      })
    )
  }
  keep.unread = vi.fn(async () => ({ letters: 0, messages: 0 }))
  keep.on = vi.fn((event: string, cb: (p?: unknown) => void) => {
    const entry = { event, cb }
    listeners.push(entry)
    return () => listeners.splice(listeners.indexOf(entry), 1)
  })
  keep.emit = (event: string, payload?: unknown) =>
    listeners.filter((l) => l.event === event).forEach((l) => l.cb(payload))
  ;(window as unknown as { keep: unknown }).keep = keep
  return keep as unknown as FakeKeep
}
