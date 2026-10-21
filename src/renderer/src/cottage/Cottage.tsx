import { useEffect, useState } from 'react'
import cottageArt from '../../../../images/cottage-home-screen.png'
import {
  HOTSPOTS,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  fitImage,
  hotspotRect,
  type Hotspot,
  type RoomId
} from './hotspots'

export interface Unread {
  letters: number
  messages: number
}

interface Props {
  unread: Unread
  onOpen: (room: RoomId) => void
  /** A room is open over the cottage: dim it and disable the hotspots. */
  dimmed?: boolean
  /** Someone just wrote: the cat's ears twitch. */
  twitch?: boolean
}

// Fixed sparkle positions (percent of the image) so the scene doesn't jump between renders.
const SPARKLES = [
  { left: 31, top: 18, delay: 0 },
  { left: 58, top: 12, delay: 0.8 },
  { left: 81, top: 33, delay: 1.6 },
  { left: 47, top: 52, delay: 0.4 },
  { left: 66, top: 70, delay: 2.0 }
]

function useViewport(): { w: number; h: number } {
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const onResize = (): void => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return size
}

function countFor(room: RoomId, unread: Unread): number {
  if (room === 'letters') return unread.letters
  if (room === 'messages') return unread.messages
  return 0
}

function Cue({ room, count }: { room: RoomId; count: number }): React.JSX.Element | null {
  switch (room) {
    case 'letters':
      return count > 0 ? (
        <span className="envelopes" aria-hidden>
          {Array.from({ length: Math.min(count, 3) }, (_, i) => (
            <span
              key={i}
              className="envelope"
              style={{ left: i * 14, top: -i * 6, transform: `rotate(${(i - 1) * 8}deg)` }}
            />
          ))}
        </span>
      ) : null
    case 'source':
      return <span className="aura" aria-hidden />
    case 'library':
      return <span className="book-glow" aria-hidden />
    case 'contacts':
      return <span className="ears" aria-hidden />
    default:
      return null
  }
}

function HotspotButton({
  h,
  rect,
  count,
  twitch,
  onOpen
}: {
  h: Hotspot
  rect: React.CSSProperties
  count: number
  twitch: boolean
  onOpen: (room: RoomId) => void
}): React.JSX.Element {
  const classes = ['hotspot', h.room]
  if (count > 0) classes.push('has-new')
  if (twitch && h.room === 'contacts') classes.push('twitch')
  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={rect}
      aria-label={count > 0 ? `${h.label}, ${count} unread` : h.label}
      onClick={() => onOpen(h.room)}
    >
      <span className="glow" aria-hidden />
      <span className="plate" aria-hidden>
        {h.label}
      </span>
      <Cue room={h.room} count={count} />
      {count > 0 && <span className="badge">{count}</span>}
    </button>
  )
}

export function Cottage({ unread, onOpen, dimmed = false, twitch = false }: Props): React.JSX.Element {
  const { w, h } = useViewport()
  const fit = fitImage(w, h, IMAGE_WIDTH, IMAGE_HEIGHT)

  return (
    <div className={dimmed ? 'cottage dimmed' : 'cottage'} aria-hidden={dimmed || undefined}>
      <img
        className="cottage-art"
        src={cottageArt}
        alt="A moonlit witch's cottage with a sleeping cat"
        draggable={false}
        style={{ left: fit.offsetX, top: fit.offsetY, width: fit.width, height: fit.height }}
      />
      {SPARKLES.map((s, i) => (
        <span
          key={i}
          className="sparkle"
          aria-hidden
          style={{
            left: fit.offsetX + (s.left / 100) * fit.width,
            top: fit.offsetY + (s.top / 100) * fit.height,
            animationDelay: `${s.delay}s`
          }}
        />
      ))}
      {HOTSPOTS.map((hs) => {
        const r = hotspotRect(hs, fit)
        return (
          <HotspotButton
            key={hs.room}
            h={hs}
            rect={{ left: r.left, top: r.top, width: r.width, height: r.height }}
            count={countFor(hs.room, unread)}
            twitch={twitch}
            onOpen={onOpen}
          />
        )
      })}
    </div>
  )
}
