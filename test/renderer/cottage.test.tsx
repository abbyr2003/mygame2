// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { Cottage } from '../../src/renderer/src/cottage/Cottage'
import { HOTSPOTS, type RoomId } from '../../src/renderer/src/cottage/hotspots'

afterEach(cleanup)

const none = { letters: 0, messages: 0 }

describe('Cottage', () => {
  it('cottage renders a button per hotspot with its label and opens the room on click', () => {
    const opened: RoomId[] = []
    render(<Cottage unread={none} onOpen={(r) => opened.push(r)} />)
    for (const h of HOTSPOTS) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(h.label) }))
    }
    expect(opened).toEqual(HOTSPOTS.map((h) => h.room))
  })

  it('badge shows unread letters count', () => {
    render(<Cottage unread={{ letters: 3, messages: 0 }} onOpen={() => {}} />)
    const desk = screen.getByRole('button', { name: /The Writing Desk/ })
    expect(desk.textContent).toContain('3')
    expect(desk.getAttribute('aria-label')).toMatch(/3 unread/)
    const mirror = screen.getByRole('button', { name: /The Scrying Mirror/ })
    expect(mirror.querySelector('.badge')).toBeNull()
  })

  it('badge shows unread messages on the mirror', () => {
    render(<Cottage unread={{ letters: 0, messages: 5 }} onOpen={() => {}} />)
    const mirror = screen.getByRole('button', { name: /The Scrying Mirror/ })
    expect(mirror.querySelector('.badge')?.textContent).toBe('5')
    expect(mirror.className).toContain('has-new')
  })
})
