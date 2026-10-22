// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react'
import { ContactsRoom } from '../../src/renderer/src/rooms/contacts/ContactsRoom'
import type { Companion } from '../../src/shared/types'
import { makeCompanion } from '../helpers/fixtures'
import { installKeep } from '../helpers/keep'
import { awayAt, hereAt } from '../helpers/presence'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

let companions: Companion[]
let keep: ReturnType<typeof installKeep>

beforeEach(() => {
  companions = [
    makeCompanion({ id: 'c1', name: 'Elara' }),
    makeCompanion({ id: 'c2', name: 'Orion', archived: true })
  ]
  keep = installKeep({
    companions: {
      list: vi.fn(async () => companions),
      create: vi.fn(async (input) => makeCompanion({ ...input, id: 'new' })),
      update: vi.fn(async (id, patch) => ({ ...companions.find((c) => c.id === id)!, ...patch })),
      archive: vi.fn(async (id: string) => {
        companions = companions.map((c) => (c.id === id ? { ...c, archived: true } : c))
      }),
      choosePortrait: vi.fn(async () => 'C:/pics/elara.png')
    },
    source: {
      start: vi.fn(async (id?: string) => ({
        id: 'conv1',
        title: 'About Elara',
        focusCompanionId: id,
        createdAt: 'x',
        turns: []
      }))
    }
  })
})

function fill(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

async function openNewForm(): Promise<void> {
  render(<ContactsRoom onAskSource={() => {}} />)
  fireEvent.click(await screen.findByRole('button', { name: /add companion/i }))
}

describe('ContactsRoom', () => {
  it('form requires name, role and voice', async () => {
    await openNewForm()
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(keep.companions.create).not.toHaveBeenCalled()
  })

  it('language fields appear only when "Knows another language" is checked', async () => {
    await openNewForm()
    expect(screen.queryByLabelText(/language name/i)).toBeNull()
    fireEvent.click(screen.getByLabelText(/knows another language/i))
    expect(screen.getByLabelText(/language name/i)).toBeTruthy()
    expect(screen.getByLabelText(/how often they use it/i)).toBeTruthy()
  })

  it('submitting calls companions.create with frequency, formatPref, seal and language', async () => {
    await openNewForm()
    fireEvent.click(screen.getByRole('button', { name: /choose image/i }))
    await screen.findByText(/elara\.png/)
    fill(/^name/i, 'Selene')
    fireEvent.change(screen.getByLabelText(/^role/i), { target: { value: 'ancestor' } })
    fill(/personality/i, 'Wise and warm')
    fireEvent.click(screen.getByRole('button', { name: /^quiet/i }))
    fireEvent.click(screen.getByRole('button', { name: /^letters$/i }))
    fireEvent.click(screen.getByRole('button', { name: /seal symbol rose/i }))
    fireEvent.click(screen.getByRole('button', { name: /seal color #c1272d/i }))
    fireEvent.click(screen.getByLabelText(/knows another language/i))
    fill(/language name/i, 'Latin')
    fireEvent.change(screen.getByLabelText(/how often they use it/i), {
      target: { value: 'always' }
    })
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    await waitFor(() => expect(keep.companions.create).toHaveBeenCalledTimes(1))
    const [input, portrait] = keep.companions.create.mock.calls[0]
    expect(input).toMatchObject({
      name: 'Selene',
      role: 'ancestor',
      voice: 'Wise and warm',
      frequency: 'quiet',
      formatPref: 'letters',
      seal: { color: '#c1272d', symbol: 'rose' },
      language: { name: 'Latin', usage: 'always' }
    })
    expect(portrait).toBe('C:/pics/elara.png')
  })

  it('offers a devoted frequency', async () => {
    await openNewForm()
    fill(/^name/i, 'Selene')
    fireEvent.change(screen.getByLabelText(/^role/i), { target: { value: 'ancestor' } })
    fill(/personality/i, 'Warm')
    const devoted = screen.getByRole('button', { name: /^devoted/i })
    expect(devoted.textContent).toContain('many times a day')
    fireEvent.click(devoted)
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    await waitFor(() => expect(keep.companions.create).toHaveBeenCalled())
    expect(keep.companions.create.mock.calls[0][0]).toMatchObject({ frequency: 'devoted' })
  })

  it('cards show whether a companion is here or away', async () => {
    const c = companions[0]
    vi.useFakeTimers({ toFake: ['Date'], now: hereAt(c) })
    const { unmount } = render(<ContactsRoom onAskSource={() => {}} />)
    const card = await screen.findByRole('button', { name: /Elara/ })
    expect(within(card).getByRole('status', { name: 'here' })).toBeTruthy()
    unmount()
    vi.setSystemTime(awayAt(c))
    render(<ContactsRoom onAskSource={() => {}} />)
    const again = await screen.findByRole('button', { name: /Elara/ })
    expect(within(again).getByRole('status', { name: 'away' })).toBeTruthy()
  })

  it('a custom role is used when "other" is chosen', async () => {
    await openNewForm()
    fill(/^name/i, 'Ash')
    fireEvent.change(screen.getByLabelText(/^role/i), { target: { value: 'other' } })
    fill(/describe their role/i, 'star keeper')
    fill(/personality/i, 'Quiet')
    fireEvent.click(screen.getByRole('button', { name: /^save/i }))
    await waitFor(() => expect(keep.companions.create).toHaveBeenCalled())
    expect(keep.companions.create.mock.calls[0][0]).toMatchObject({ role: 'star keeper' })
    expect(keep.companions.create.mock.calls[0][0].language).toBeUndefined()
  })

  it('archive hides companion from list but "Show archived" reveals it', async () => {
    render(<ContactsRoom onAskSource={() => {}} />)
    expect(await screen.findByText('Elara')).toBeTruthy()
    expect(screen.queryByText('Orion')).toBeNull()
    fireEvent.click(screen.getByLabelText(/show archived/i))
    expect(await screen.findByText('Orion')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Elara/ }))
    fireEvent.click(await screen.findByRole('button', { name: /^archive/i }))
    await waitFor(() => expect(keep.companions.archive).toHaveBeenCalledWith('c1'))
    fireEvent.click(screen.getByLabelText(/show archived/i))
    await waitFor(() => expect(screen.queryByRole('button', { name: /Elara/ })).toBeNull())
  })

  it('Ask Source about them calls source.start with the id', async () => {
    const asked: string[] = []
    render(<ContactsRoom onAskSource={(id) => asked.push(id)} />)
    fireEvent.click(await screen.findByRole('button', { name: /Elara/ }))
    fireEvent.click(await screen.findByRole('button', { name: /ask source about them/i }))
    await waitFor(() => expect(keep.source.start).toHaveBeenCalledWith('c1'))
    await waitFor(() => expect(asked).toEqual(['conv1']))
  })
})
