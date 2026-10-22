import type { Companion, Letter } from '../../../../shared/types'
import { Portrait } from '../../components/Portrait'
import { Translatable } from '../../components/Translatable'
import { formatWhen } from '../../format'
import { useNow } from '../../useNow'

interface Props {
  letter: Letter
  companion: Companion | undefined
  onStar: (starred: boolean) => void
  onWriteBack: () => void
  onRequest: () => void
}

export function LetterView({ letter: l, companion: c, onStar, onWriteBack, onRequest }: Props): React.JSX.Element {
  const incoming = l.direction === 'in'
  const name = c?.name ?? 'someone departed'
  const now = useNow(60_000, l.readAt)
  const opened = !incoming && !!l.readAt && new Date(l.readAt) <= now
  return (
    <article className="letter-view">
      <header className="letter-head">
        {c && <Portrait companion={c} size={48} />}
        <div>
          <h2>{incoming ? `From ${name}` : `To ${name}`}</h2>
          <time>{formatWhen(l.createdAt)}</time>
        </div>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className={`btn star${l.starred ? ' selected' : ''}`}
          aria-label={l.starred ? 'Unstar letter' : 'Star letter'}
          aria-pressed={l.starred}
          onClick={() => onStar(!l.starred)}
        >
          ★
        </button>
      </header>

      {l.requestText && !incoming && <p className="request-note">You asked them to write about…</p>}

      <div className="letter-paper pixel-scroll">
        {incoming ? (
          <Translatable
            text={l.body}
            language={l.language ?? c?.language?.name}
            translation={l.translation}
            layout="side"
            onTranslate={() => window.keep.letters.translate(l.id)}
            originalClassName="handwriting"
            originalStyle={{ fontFamily: `'${c?.handwriting ?? 'Caveat'}', cursive` }}
          />
        ) : (
          <div className="original serif sent-body">{l.body}</div>
        )}
      </div>

      {opened && <p className="receipt">Opened {formatWhen(l.readAt!)}</p>}

      {incoming && c && !c.archived && (
        <footer className="form-actions">
          <button type="button" className="btn primary" onClick={onWriteBack}>
            Write back
          </button>
          <button type="button" className="btn" onClick={onRequest}>
            Request a letter
          </button>
        </footer>
      )}
    </article>
  )
}
