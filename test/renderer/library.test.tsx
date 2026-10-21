// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { LibraryRoom } from '../../src/renderer/src/rooms/library/LibraryRoom'
import type { Reading } from '../../src/shared/types'
import { installKeep, type FakeKeep } from '../helpers/keep'

afterEach(cleanup)

const reading = (over: Partial<Reading>): Reading => ({
  id: 'r1',
  question: 'What are my gifts?',
  title: 'Record of the Soul: On Gifts',
  body: 'You carry the gift of listening.',
  createdAt: '2026-10-19T10:00:00.000Z',
  ...over
})

let readings: Reading[]
let keep: FakeKeep

beforeEach(() => {
  readings = [
    reading({ id: 'r2', title: 'Record of the Soul: Past Lives', body: 'You were a lighthouse keeper.', createdAt: '2026-10-20T10:00:00.000Z' }),
    reading({})
  ]
  keep = installKeep({
    library: {
      list: vi.fn(async () => readings),
      ask: vi.fn(async (question: string) => {
        const r = reading({ id: 'r3', question, title: 'Record of the Soul: On Purpose', body: 'Your purpose is to remember.', createdAt: '2026-10-21T10:00:00.000Z' })
        readings = [r, ...readings]
        return r
      })
    }
  })
})

const scroll = (): HTMLElement => document.querySelector('.scroll') as HTMLElement

describe('LibraryRoom', () => {
  it('asking a question shows the returned reading as a scroll with title and date', async () => {
    render(<LibraryRoom />)
    fireEvent.change(await screen.findByLabelText(/ask the akashic records/i), {
      target: { value: 'What is my purpose?' }
    })
    fireEvent.click(screen.getByRole('button', { name: /open the records/i }))
    await waitFor(() => expect(keep.library.ask).toHaveBeenCalledWith('What is my purpose?'))
    await waitFor(() => expect(scroll()).not.toBeNull())
    expect(within(scroll()).getByRole('heading', { name: 'Record of the Soul: On Purpose' })).toBeTruthy()
    expect(within(scroll()).getByText('Your purpose is to remember.')).toBeTruthy()
    expect(within(scroll()).getByText('What is my purpose?')).toBeTruthy()
    expect(scroll().querySelector('time')?.getAttribute('datetime')).toBe('2026-10-21T10:00:00.000Z')
  })

  it('readings appear on the shelf newest first and reopen on click', async () => {
    render(<LibraryRoom />)
    const shelf = await screen.findByRole('list', { name: /shelf/i })
    await waitFor(() => expect(within(shelf).getAllByRole('button')).toHaveLength(2))
    const books = within(shelf).getAllByRole('button')
    expect(books[0].getAttribute('aria-label')).toMatch(/Past Lives/)
    expect(books[1].getAttribute('aria-label')).toMatch(/On Gifts/)
    fireEvent.click(books[1])
    expect(within(scroll()).getByText('You carry the gift of listening.')).toBeTruthy()
  })

  it('empty question cannot be submitted', async () => {
    render(<LibraryRoom />)
    const button = await screen.findByRole('button', { name: /open the records/i })
    expect((button as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/ask the akashic records/i), { target: { value: '   ' } })
    fireEvent.click(button)
    expect(keep.library.ask).not.toHaveBeenCalled()
  })

  it('a failed reading keeps the question and explains gently', async () => {
    keep.library.ask.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'unavailable' }))
    render(<LibraryRoom />)
    const box = (await screen.findByLabelText(/ask the akashic records/i)) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Who was I?' } })
    fireEvent.click(screen.getByRole('button', { name: /open the records/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/veil is thick/i)
    expect(box.value).toBe('Who was I?')
  })
})
