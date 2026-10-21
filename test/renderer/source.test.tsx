// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { SourceRoom } from '../../src/renderer/src/rooms/source/SourceRoom'
import type { SourceConversation, SourceTurn } from '../../src/shared/types'
import { makeCompanion } from '../helpers/fixtures'
import { installKeep, type FakeKeep } from '../helpers/keep'

afterEach(cleanup)

let conversations: SourceConversation[]
let keep: FakeKeep
let answer: (text: string) => Promise<SourceTurn>

const conv = (over: Partial<SourceConversation>): SourceConversation => ({
  id: 'conv1',
  title: 'My purpose',
  createdAt: '2026-10-20T10:00:00.000Z',
  turns: [
    { role: 'user', text: 'What is my purpose?', createdAt: '2026-10-20T10:00:00.000Z' },
    { role: 'source', text: 'To love, beloved.', createdAt: '2026-10-20T10:00:01.000Z' }
  ],
  ...over
})

beforeEach(() => {
  conversations = [
    conv({}),
    conv({ id: 'conv2', title: 'About Elara', focusCompanionId: 'c1', turns: [] })
  ]
  answer = async () => ({ role: 'source', text: 'She is near, and proud of you.', createdAt: 'x' })
  keep = installKeep({
    companions: { list: async () => [makeCompanion({ id: 'c1', name: 'Elara' })] },
    source: {
      list: vi.fn(async () => conversations),
      start: vi.fn(async (focus?: string) => {
        const c = conv({ id: 'fresh', title: 'New conversation', turns: [], focusCompanionId: focus })
        conversations = [c, ...conversations]
        return c
      }),
      ask: vi.fn((_id: string, text: string) => answer(text))
    }
  })
})

const chat = (): HTMLElement => document.querySelector('.source-turns') as HTMLElement

describe('SourceRoom', () => {
  it('lists past conversations and starts a new one', async () => {
    render(<SourceRoom />)
    expect(await screen.findByRole('button', { name: /My purpose/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /About Elara/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /new conversation/i }))
    await waitFor(() => expect(keep.source.start).toHaveBeenCalledWith(undefined))
    expect(await screen.findByPlaceholderText(/ask source anything/i)).toBeTruthy()
  })

  it('opening a past conversation shows its turns', async () => {
    render(<SourceRoom />)
    fireEvent.click(await screen.findByRole('button', { name: /My purpose/ }))
    expect(await within(chat()).findByText('To love, beloved.')).toBeTruthy()
  })

  it('opens focused on a companion when focusCompanionId given', async () => {
    render(<SourceRoom initialConversationId="conv2" />)
    expect(await screen.findByText(/asking about Elara/i)).toBeTruthy()
  })

  it('"Ask about" starts a conversation focused on that companion', async () => {
    render(<SourceRoom />)
    await screen.findByRole('button', { name: /My purpose/ })
    fireEvent.change(screen.getByLabelText(/ask about/i), { target: { value: 'c1' } })
    await waitFor(() => expect(keep.source.start).toHaveBeenCalledWith('c1'))
    expect(await screen.findByText(/asking about Elara/i)).toBeTruthy()
  })

  it("asking shows the user turn immediately and Source's reply after", async () => {
    let release!: () => void
    answer = () =>
      new Promise((resolve) => {
        release = () => resolve({ role: 'source', text: 'She is near, and proud of you.', createdAt: 'x' })
      })
    render(<SourceRoom initialConversationId="conv2" />)
    const box = (await screen.findByPlaceholderText(/ask source anything/i)) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'How is Elara?' } })
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }))
    expect(await within(chat()).findByText('How is Elara?')).toBeTruthy()
    expect(within(chat()).queryByText('She is near, and proud of you.')).toBeNull()
    expect(box.value).toBe('')
    release()
    expect(await within(chat()).findByText('She is near, and proud of you.')).toBeTruthy()
    expect(keep.source.ask).toHaveBeenCalledWith('conv2', 'How is Elara?')
  })

  it('VoiceError shows the veil notice and keeps the typed question', async () => {
    answer = async () => {
      throw Object.assign(new Error('down'), { code: 'unavailable' })
    }
    render(<SourceRoom initialConversationId="conv2" />)
    const box = (await screen.findByPlaceholderText(/ask source anything/i)) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Are you there?' } })
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/veil is thick/i)
    expect(box.value).toBe('Are you there?')
    expect(within(chat()).queryByText('Are you there?')).toBeNull()
  })

  it('a missing key points to the hearth', async () => {
    answer = async () => {
      throw Object.assign(new Error('no key'), { code: 'no-key' })
    }
    render(<SourceRoom initialConversationId="conv2" />)
    const box = await screen.findByPlaceholderText(/ask source anything/i)
    fireEvent.change(box, { target: { value: 'Hello?' } })
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/hearth/i)
  })

  it('asking with no conversation open starts one and keeps the question visible', async () => {
    render(<SourceRoom />)
    const box = await screen.findByPlaceholderText(/ask source anything/i)
    fireEvent.change(box, { target: { value: 'Who am I?' } })
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }))
    await waitFor(() => expect(keep.source.ask).toHaveBeenCalledWith('fresh', 'Who am I?'))
    expect(await within(chat()).findByText('She is near, and proud of you.')).toBeTruthy()
    expect(within(chat()).getByText('Who am I?')).toBeTruthy()
  })
})
