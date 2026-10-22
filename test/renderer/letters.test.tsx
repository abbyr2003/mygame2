// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { LettersRoom } from '../../src/renderer/src/rooms/letters/LettersRoom'
import type { Letter } from '../../src/shared/types'
import { makeCompanion } from '../helpers/fixtures'
import { installKeep, type FakeKeep } from '../helpers/keep'
import { formatWhen } from '../../src/renderer/src/format'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const letter = (over: Partial<Letter>): Letter => ({
  id: 'l1',
  companionId: 'c1',
  direction: 'in',
  kind: 'spontaneous',
  createdAt: '2026-10-21T10:00:00.000Z',
  body: 'Dearest one, the moon remembers you.',
  read: false,
  starred: false,
  ...over
})

let letters: Letter[]
let keep: FakeKeep

beforeEach(() => {
  letters = [
    letter({ id: 'l1' }),
    letter({ id: 'l2', companionId: 'c2', body: 'From the deep stars.', read: true, createdAt: '2026-10-20T10:00:00.000Z' }),
    letter({ id: 'l3', direction: 'out', kind: 'user', body: 'My reply to Elara', read: true, createdAt: '2026-10-19T10:00:00.000Z' })
  ]
  keep = installKeep({
    companions: {
      list: async () => [
        makeCompanion({ id: 'c1', name: 'Elara', seal: { color: '#c1272d', symbol: 'rose' }, handwriting: 'Dancing Script' }),
        makeCompanion({ id: 'c2', name: 'Orion', seal: { color: '#2b4a8a', symbol: 'star' } })
      ]
    },
    letters: {
      list: vi.fn(async () => letters),
      markRead: vi.fn(async () => {}),
      star: vi.fn(async (id: string, starred: boolean) => {
        letters = letters.map((l) => (l.id === id ? { ...l, starred } : l))
      }),
      send: vi.fn(async (companionId: string, body: string) =>
        letter({ id: 'new', companionId, body, direction: 'out', kind: 'user', read: true })
      ),
      request: vi.fn(async () => {}),
      translate: vi.fn(async () => 'English')
    }
  })
})

const room = (): ReturnType<typeof render> => render(<LettersRoom unsealMs={30} />)

describe('LettersRoom', () => {
  it('unread incoming letters render as sealed envelopes with the companion seal color', async () => {
    room()
    const sealed = await screen.findByRole('button', { name: /letter from Elara.*unread/i })
    expect(sealed.className).toContain('sealed')
    const seal = sealed.querySelector('.wax') as HTMLElement
    expect(seal.style.backgroundColor).toBe('rgb(193, 39, 45)')
    const opened = screen.getByRole('button', { name: /letter from Orion/i })
    expect(opened.className).not.toContain('sealed')
    // Outgoing letters are not in the inbox.
    expect(screen.queryByRole('button', { name: /letter to Elara/i })).toBeNull()
  })

  it('clicking an envelope plays unseal then shows the letter and calls markRead', async () => {
    room()
    fireEvent.click(await screen.findByRole('button', { name: /letter from Elara/i }))
    expect(document.querySelector('.unsealing')).not.toBeNull()
    expect(keep.letters.markRead).toHaveBeenCalledWith('l1')
    const desk = document.querySelector('.letter-desk') as HTMLElement
    const body = await within(desk).findByText('Dearest one, the moon remembers you.')
    expect(body.style.fontFamily).toContain('Dancing Script')
    expect(document.querySelector('.unsealing')).toBeNull()
  })

  it('filter by companion', async () => {
    room()
    await screen.findByRole('button', { name: /letter from Elara/i })
    fireEvent.change(screen.getByLabelText(/companion/i), { target: { value: 'c2' } })
    expect(screen.queryByRole('button', { name: /letter from Elara/i })).toBeNull()
    expect(screen.getByRole('button', { name: /letter from Orion/i })).toBeTruthy()
  })

  it('star toggles letters.star', async () => {
    room()
    fireEvent.click(await screen.findByRole('button', { name: /letter from Orion/i }))
    fireEvent.click(await screen.findByRole('button', { name: /^star letter/i }))
    await waitFor(() => expect(keep.letters.star).toHaveBeenCalledWith('l2', true))
    fireEvent.click(await screen.findByRole('button', { name: /^unstar letter/i }))
    await waitFor(() => expect(keep.letters.star).toHaveBeenCalledWith('l2', false))
  })

  it('Write back sends via letters.send', async () => {
    room()
    fireEvent.click(await screen.findByRole('button', { name: /letter from Orion/i }))
    fireEvent.click(await screen.findByRole('button', { name: /write back/i }))
    fireEvent.change(screen.getByLabelText(/your letter/i), { target: { value: 'Dear Orion…' } })
    fireEvent.click(screen.getByRole('button', { name: /send letter/i }))
    await waitFor(() => expect(keep.letters.send).toHaveBeenCalledWith('c2', 'Dear Orion…'))
    expect(await screen.findByText(/on its way to Orion/i)).toBeTruthy()
  })

  it('Request a letter calls letters.request with the text', async () => {
    room()
    fireEvent.click(await screen.findByRole('button', { name: /letter from Orion/i }))
    fireEvent.click(await screen.findByRole('button', { name: /request a letter/i }))
    fireEvent.change(screen.getByLabelText(/write to me about/i), { target: { value: 'the old forest' } })
    fireEvent.click(screen.getByRole('button', { name: /send request/i }))
    await waitFor(() => expect(keep.letters.request).toHaveBeenCalledWith('c2', 'the old forest'))
  })

  it('sent letters appear under "Sent"', async () => {
    room()
    await screen.findByRole('button', { name: /letter from Elara/i })
    fireEvent.click(screen.getByRole('tab', { name: /sent/i }))
    const list = screen.getByRole('list', { name: /letters/i })
    expect(within(list).getByRole('button', { name: /letter to Elara/i })).toBeTruthy()
    expect(within(list).queryByRole('button', { name: /letter from/i })).toBeNull()
  })

  async function openSent(): Promise<void> {
    room()
    await screen.findByRole('button', { name: /letter from Elara/i })
    fireEvent.click(screen.getByRole('tab', { name: /sent/i }))
    fireEvent.click(screen.getByRole('button', { name: /letter to Elara/i }))
    await waitFor(() => expect(document.querySelector('.sent-body')).not.toBeNull())
  }

  it('a sent letter the companion has opened shows Opened', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00.000Z') })
    letters[2] = { ...letters[2], readAt: '2026-10-21T11:00:00.000Z' }
    await openSent()
    expect(screen.getByText(/^Opened/).textContent).toContain(formatWhen('2026-10-21T11:00:00.000Z'))
  })

  it('a sent letter not yet opened shows no receipt', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T12:00:00.000Z') })
    letters[2] = { ...letters[2], readAt: '2026-10-21T13:00:00.000Z' }
    await openSent()
    expect(screen.queryByText(/^Opened/)).toBeNull()
  })
})
