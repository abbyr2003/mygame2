// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { SettingsRoom } from '../../src/renderer/src/rooms/settings/SettingsRoom'
import App from '../../src/renderer/src/App'
import type { KeyCheck, Settings } from '../../src/shared/api'
import { installKeep, type FakeKeep } from '../helpers/keep'

afterEach(cleanup)

let settings: Settings
let check: KeyCheck
let keep: FakeKeep

beforeEach(() => {
  settings = { hasKey: false, model: 'claude-sonnet-5-5', sound: true, keepPath: 'C:/Users/me/Documents/Spirit Keep' }
  check = { ok: true }
  keep = installKeep({
    settings: {
      get: vi.fn(async () => settings),
      setApiKey: vi.fn(async () => {
        if (check.ok) settings = { ...settings, hasKey: true }
        return check
      }),
      setModel: vi.fn(async (model: string) => {
        settings = { ...settings, model }
      }),
      setSound: vi.fn(async (sound: boolean) => {
        settings = { ...settings, sound }
      }),
      openKeepFolder: vi.fn(async () => {})
    }
  })
})

const SECRET = 'sk-ant-api03-very-secret'

async function saveKey(): Promise<void> {
  render(<SettingsRoom />)
  fireEvent.change(await screen.findByLabelText(/claude key/i), { target: { value: SECRET } })
  fireEvent.click(screen.getByRole('button', { name: /save key/i }))
  await waitFor(() => expect(keep.settings.setApiKey).toHaveBeenCalledWith(SECRET))
}

describe('SettingsRoom', () => {
  it('shows "Key saved" without ever displaying the key', async () => {
    await saveKey()
    expect(await screen.findByText(/key saved/i)).toBeTruthy()
    expect(document.body.innerHTML).not.toContain(SECRET)
    expect((screen.getByLabelText(/claude key/i) as HTMLInputElement).type).toBe('password')
  })

  it('bad-key result shows "That key wasn\'t accepted"', async () => {
    check = { ok: false, error: 'bad-key' }
    await saveKey()
    expect((await screen.findByRole('alert')).textContent).toMatch(/that key wasn.t accepted/i)
  })

  it('no-credit result explains the account needs credit', async () => {
    check = { ok: false, error: 'no-credit' }
    await saveKey()
    expect((await screen.findByRole('alert')).textContent).toMatch(/credit/i)
  })

  it('sound toggle calls setSound', async () => {
    render(<SettingsRoom />)
    const toggle = (await screen.findByLabelText(/chime/i)) as HTMLInputElement
    await waitFor(() => expect(toggle.checked).toBe(true))
    fireEvent.click(toggle)
    await waitFor(() => expect(keep.settings.setSound).toHaveBeenCalledWith(false))
  })

  it('model field saves via setModel', async () => {
    render(<SettingsRoom />)
    const opus = (await screen.findByLabelText(/opus 5\.5/i)) as HTMLInputElement
    expect((screen.getByLabelText(/sonnet 5\.5/i) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(opus)
    await waitFor(() => expect(keep.settings.setModel).toHaveBeenCalledWith('claude-opus-5-5'))
  })

  it('shows the keep folder and opens it', async () => {
    render(<SettingsRoom />)
    expect(await screen.findByText('C:/Users/me/Documents/Spirit Keep')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /open folder/i }))
    expect(keep.settings.openKeepFolder).toHaveBeenCalled()
  })
})

describe('first open', () => {
  it('no key on first open shows a prompt pointing to the Hearth', async () => {
    render(<App />)
    expect((await screen.findByRole('note')).textContent).toMatch(/hearth/i)
  })

  it('no prompt once a key is saved', async () => {
    settings = { ...settings, hasKey: true }
    render(<App />)
    await waitFor(() => expect(keep.settings.get).toHaveBeenCalled())
    expect(screen.queryByRole('note')).toBeNull()
  })
})
