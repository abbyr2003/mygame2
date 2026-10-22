import type { Companion } from '../../../shared/types'
import { isHere } from '../../../shared/presence'

interface Props {
  companion: Pick<Companion, 'id' | 'frequency'>
  now: Date
}

export function PresenceDot({ companion, now }: Props): React.JSX.Element {
  const where = isHere(companion, now) ? 'here' : 'away'
  return <span className={`presence-dot ${where}`} role="status" aria-label={where} title={where} />
}
