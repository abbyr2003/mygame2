// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { MessagesRoom } from '../../src/renderer/src/rooms/messages/MessagesRoom'
import type { Thread } from '../../src/shared/types'
import { makeCompanion } from '../helpers/fixtures'
import { installKeep, type FakeKeep } from '../helpers/keep'
import { awayAt, hereAt } from '../helpers/presence'
import { formatWhen } from '../../src/renderer/src/format'
import type { Message } from '../../src/shared/types'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const bubbles = (): HTMLElement => document.querySelector('.bubbles') as HTMLElement

let threads: Thread[]
let keep: FakeKeep

beforeEach(() => {
  threads = [
    {
      companionId: 'c1',
      messages: [
        { id: 'm1', direction: 'in', createdAt: '2026-10-20T10:00:00.000Z', body: 'Hello star', read: true },
        { id: 'm2', direction: 'in', createdAt: '2026-10-21T10:00:00.000Z', body: 'Are you awake?', read: false }
      ]
    },
    {
      companionId: 'c2',
      messages: [
        { id: 'm3', direction: 'out', createdAt: '2026-10-19T10:00:00.000Z', body: 'Night Orion', read: true }
      ]
    }
  ]
  keep = installKeep({
    companions: {
      list: async () => [
        makeCompanion({ id: 'c1', name: 'Elara', language: { name: 'French', usage: 'sometimes' } }),
        makeCompanion({ id: 'c2', name: 'Orion' })
      ]
    },
    messages: {
      threads: vi.fn(async () => threads),
      send: vi.fn(async (_id: string, body: string) => ({
        id: 'new',
        direction: 'out',
        createdAt: '2026-10-21T12:00:00.000Z',
        body,
        read: true
      })),
      markRead: vi.fn(async () => {}),
      translate: vi.fn(async () => 'translated')
    }
  })
})

describe('MessagesRoom', () => {
  it('thread list shows latest line and unread glow', async () => {
    render(<MessagesRoom />)
    const elara = await screen.findByRole('button', { name: /Elara/ })
    expect(elara.textContent).toContain('Are you awake?')
    expect(elara.className).toContain('unread')
    const orion = screen.getByRole('button', { name: /Orion/ })
    expect(orion.textContent).toContain('Night Orion')
    expect(orion.className).not.toContain('unread')
    // Most recent thread first.
    const rows = screen.getAllByRole('button', { name: /Elara|Orion/ })
    expect(rows[0]).toBe(elara)
  })

  it('opening a thread calls markRead', async () => {
    render(<MessagesRoom />)
    fireEvent.click(await screen.findByRole('button', { name: /Elara/ }))
    await waitFor(() => expect(keep.messages.markRead).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(within(bubbles()).getByText('Hello star')).toBeTruthy())
  })

  it('sending a text calls messages.send and clears the box', async () => {
    render(<MessagesRoom />)
    fireEvent.click(await screen.findByRole('button', { name: /Orion/ }))
    const box = (await screen.findByPlaceholderText(/message to Orion/i)) as HTMLInputElement
    fireEvent.change(box, { target: { value: 'Shine on' } })
    fireEvent.click(screen.getByRole('button', { name: /^send/i }))
    await waitFor(() => expect(keep.messages.send).toHaveBeenCalledWith('c2', 'Shine on'))
    await waitFor(() => expect(box.value).toBe(''))
    await waitFor(() => expect(within(bubbles()).getByText('Shine on')).toBeTruthy())
  })

  it('does not send an empty message', async () => {
    render(<MessagesRoom />)
    fireEvent.click(await screen.findByRole('button', { name: /Orion/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^send/i }))
    expect(keep.messages.send).not.toHaveBeenCalled()
  })

  it('inbound messages from a companion with a language can be translated', async () => {
    render(<MessagesRoom />)
    fireEvent.click(await screen.findByRole('button', { name: /Elara/ }))
    await waitFor(() => expect(within(bubbles()).getByText('Are you awake?')).toBeTruthy())
    fireEvent.click(within(bubbles()).getAllByRole('button', { name: /translate/i })[1])
    await waitFor(() => expect(keep.messages.translate).toHaveBeenCalledWith('c1', 'm2'))
  })

  it('thread header shows the companion is here', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: hereAt(makeCompanion({ id: 'c2' })) })
    render(<MessagesRoom />)
    fireEvent.click(await screen.findByRole('button', { name: /Orion/ }))
    const header = await waitFor(() => document.querySelector('.thread-header') as HTMLElement)
    expect(within(header).getByRole('status', { name: 'here' })).toBeTruthy()
  })

  const orion = makeCompanion({ id: 'c2' })
  const out = (over: Partial<Message>): Message => ({
    id: 'o1',
    direction: 'out',
    createdAt: '2026-10-21T12:00:00.000Z',
    body: 'Are you there?',
    read: true,
    ...over
  })

  async function openOrion(messages: Message[], now: Date): Promise<void> {
    vi.useFakeTimers({ toFake: ['Date'], now })
    threads[1] = { companionId: 'c2', messages }
    render(<MessagesRoom />)
    fireEvent.click(await screen.findByRole('button', { name: /Orion/ }))
    await waitFor(() => expect(within(bubbles()).getAllByText(/./).length).toBeGreaterThan(0))
  }

  it('the last outgoing text shows Delivered before it is read', async () => {
    const now = hereAt(orion)
    await openOrion([out({ readAt: new Date(now.getTime() + 20_000).toISOString() })], now)
    expect(within(bubbles()).getByText('Delivered')).toBeTruthy()
  })

  it('shows Read with the time once read', async () => {
    const now = hereAt(orion)
    const readAt = new Date(now.getTime() - 20_000).toISOString()
    await openOrion([out({ readAt })], now)
    expect(within(bubbles()).getByText(`Read ${formatWhen(readAt)}`)).toBeTruthy()
  })

  it('older messages without readAt show no receipt', async () => {
    await openOrion([out({})], hereAt(orion))
    expect(within(bubbles()).queryByText(/^Delivered|^Read/)).toBeNull()
  })

  it('shows typing when a here companion has read the newest message', async () => {
    const now = hereAt(orion)
    await openOrion([out({ readAt: new Date(now.getTime() - 5_000).toISOString() })], now)
    expect(within(bubbles()).getByLabelText('Orion is typing')).toBeTruthy()
  })

  it('no typing when the companion is away', async () => {
    const now = awayAt(orion)
    await openOrion([out({ readAt: new Date(now.getTime() - 5_000).toISOString() })], now)
    expect(within(bubbles()).queryByLabelText('Orion is typing')).toBeNull()
  })

  it('no typing when the newest message is theirs', async () => {
    const now = hereAt(orion)
    const readAt = new Date(now.getTime() - 60_000).toISOString()
    await openOrion(
      [
        out({ readAt }),
        { id: 'i1', direction: 'in', createdAt: now.toISOString(), body: 'I am here', read: true }
      ],
      now
    )
    expect(within(bubbles()).queryByLabelText('Orion is typing')).toBeNull()
  })

  it('Delivered turns into Read right when the companion reads it', async () => {
    const readAt = new Date(Date.now() + 300).toISOString()
    threads[1] = { companionId: 'c2', messages: [out({ readAt })] }
    render(<MessagesRoom />)
    fireEvent.click(await screen.findByRole('button', { name: /Orion/ }))
    expect(await within(bubbles()).findByText('Delivered')).toBeTruthy()
    await waitFor(() => expect(within(bubbles()).getByText(`Read ${formatWhen(readAt)}`)).toBeTruthy(), {
      timeout: 2000
    })
  })
})
