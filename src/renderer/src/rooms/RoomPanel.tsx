import { useEffect, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  /** Extra controls on the right of the header strip. */
  actions?: ReactNode
  children?: ReactNode
}

/** A dark-wood room panel floating over the dimmed cottage. Escape returns home. */
export function RoomPanel({ title, onClose, actions, children }: Props): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="room-layer">
      <section className="room frame" role="dialog" aria-label={title}>
        <header className="room-header">
          <button type="button" className="btn" onClick={onClose}>
            ✕ Back to cottage
          </button>
          <h1>{title}</h1>
          <span style={{ flex: 1 }} />
          {actions}
        </header>
        <div className="room-body">{children}</div>
      </section>
    </div>
  )
}
