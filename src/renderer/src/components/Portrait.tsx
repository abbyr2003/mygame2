import { portraitUrl } from '../../../shared/api'
import type { Companion } from '../../../shared/types'

interface Props {
  companion: Pick<Companion, 'id' | 'name' | 'portraitFile'>
  size?: number
}

/** Square pixel-framed portrait; falls back to the companion's initial. */
export function Portrait({ companion, size = 48 }: Props): React.JSX.Element {
  const url = portraitUrl(companion)
  return (
    <span className="portrait" style={{ width: size, height: size, fontSize: size * 0.45 }}>
      {url ? (
        <img src={url} alt={companion.name} draggable={false} />
      ) : (
        <span aria-label={companion.name}>{companion.name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  )
}
