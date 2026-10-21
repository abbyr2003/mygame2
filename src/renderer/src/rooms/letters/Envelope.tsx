import type { Companion, Letter } from '../../../../shared/types'
import { sealGlyph } from '../../components/seal'
import { formatWhen } from '../../format'

interface Props {
  letter: Letter
  companion: Companion | undefined
  selected: boolean
  unsealing: boolean
  onOpen: () => void
}

export function Envelope({ letter: l, companion: c, selected, unsealing, onOpen }: Props): React.JSX.Element {
  const name = c?.name ?? 'someone departed'
  const sealed = l.direction === 'in' && !l.read && !unsealing
  const who = l.direction === 'in' ? `Letter from ${name}` : `Letter to ${name}`
  const label = `${who}, ${formatWhen(l.createdAt)}${sealed ? ', unread' : ''}`
  const classes = ['envelope-card']
  if (sealed) classes.push('sealed')
  if (unsealing) classes.push('unsealing')
  if (selected) classes.push('selected')

  return (
    <button type="button" className={classes.join(' ')} aria-label={label} onClick={onOpen}>
      <span className="envelope-art" aria-hidden>
        <span className="flap" />
        <span className="wax" style={{ backgroundColor: c?.seal.color ?? '#6b3fa0' }}>
          {sealGlyph(c?.seal.symbol ?? '')}
        </span>
      </span>
      <span className="envelope-text" aria-hidden>
        <span className="companion-name">{l.direction === 'in' ? name : `To ${name}`}</span>
        <span className="latest">
          {l.requestText ? `Asked about: ${l.requestText}` : l.body.slice(0, 60)}
        </span>
        <time>{formatWhen(l.createdAt)}</time>
      </span>
      {l.starred && (
        <span className="star-mark" aria-hidden>
          ★
        </span>
      )}
    </button>
  )
}
