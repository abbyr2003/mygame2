// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { MessagesRoom } from '../../src/renderer/src/rooms/messages/MessagesRoom'
import type { Thread } from '../../src/shared/types'
import { makeCompanion } from '../helpers/fixtures'
import { installKeep, type FakeKeep } from '../helpers/keep'

afterEach(cleanup)

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
})
