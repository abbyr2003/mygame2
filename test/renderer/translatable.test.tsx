// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Translatable, isChanneled } from '../../src/renderer/src/components/Translatable'

afterEach(cleanup)

describe('Translatable', () => {
  it('shows only original until Translate pressed', async () => {
    const onTranslate = vi.fn(async () => 'Good evening, dear one.')
    render(
      <Translatable text="Bonsoir, ma chère." language="French" layout="below" onTranslate={onTranslate} />
    )
    expect(screen.getByText('Bonsoir, ma chère.')).toBeTruthy()
    expect(screen.queryByText('Good evening, dear one.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /translate/i }))
    expect(await screen.findByText('Good evening, dear one.')).toBeTruthy()
    expect(onTranslate).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/^translation$/i)).toBeTruthy()
  })

  it('has no Translate button without a language', () => {
    render(<Translatable text="Hello" layout="below" onTranslate={async () => ''} />)
    expect(screen.queryByRole('button', { name: /translate/i })).toBeNull()
  })

  it('side-by-side layout after translate', async () => {
    const { container } = render(
      <Translatable text="Salve" language="Latin" layout="side" onTranslate={async () => 'Hello'} />
    )
    expect(container.querySelector('.translatable.side.translated')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /translate/i }))
    await screen.findByText('Hello')
    const panes = container.querySelectorAll('.translatable.side.translated > .pane')
    expect(panes).toHaveLength(2)
    expect(panes[0].textContent).toContain('Salve')
    expect(panes[1].textContent).toContain('Hello')
  })

  it('uses cached translation without calling onTranslate', async () => {
    const onTranslate = vi.fn(async () => 'fresh')
    render(
      <Translatable
        text="Salve"
        language="Latin"
        translation="Hello (cached)"
        layout="below"
        onTranslate={onTranslate}
      />
    )
    expect(screen.queryByText('Hello (cached)')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /translate/i }))
    expect(await screen.findByText('Hello (cached)')).toBeTruthy()
    expect(onTranslate).not.toHaveBeenCalled()
  })

  it('labels Elvish as channeled translation', async () => {
    render(
      <Translatable text="Mae govannen" language="Elvish" layout="below" onTranslate={async () => 'Well met'} />
    )
    fireEvent.click(screen.getByRole('button', { name: /translate/i }))
    await screen.findByText('Well met')
    expect(screen.getByText(/channeled translation/i)).toBeTruthy()
  })

  it('shows a gentle note when translation fails', async () => {
    render(
      <Translatable
        text="Salve"
        language="Latin"
        layout="below"
        onTranslate={async () => {
          throw new Error('unavailable')
        }}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /translate/i }))
    expect(await screen.findByRole('alert')).toBeTruthy()
  })

  it('isChanneled matches mystical languages case-insensitively', () => {
    expect(isChanneled('light language')).toBe(true)
    expect(isChanneled('Old Enochian')).toBe(true)
    expect(isChanneled('French')).toBe(false)
  })
})
