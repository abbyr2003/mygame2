import type { Companion } from '../../../../shared/types'
import { Portrait } from '../../components/Portrait'
import { sealGlyph } from '../../components/seal'
import { PresenceDot } from '../../components/PresenceDot'
import { useNow } from '../../useNow'

interface Props {
  companion: Companion
  selected: boolean
  onSelect: () => void
}

export function CompanionCard({ companion: c, selected, onSelect }: Props): React.JSX.Element {
  const now = useNow()
  return (
    <button
      type="button"
      className={`companion-card${selected ? ' selected' : ''}${c.archived ? ' archived' : ''}`}
      onClick={onSelect}
    >
      <Portrait companion={c} size={64} />
      <span className="companion-card-text">
        <span className="companion-name">
          {c.name} {!c.archived && <PresenceDot companion={c} now={now} />}
        </span>
        <span className="companion-role">{c.role}</span>
        <span className="chips">
          <span className="chip">{c.frequency}</span>
          {c.archived && <span className="chip">archived</span>}
        </span>
      </span>
      <span className="seal-dot" style={{ background: c.seal.color }} aria-hidden>
        {sealGlyph(c.seal.symbol)}
      </span>
    </button>
  )
}
