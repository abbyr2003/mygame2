import { useCallback, useEffect, useRef, useState } from 'react'
import { Cottage, type Unread } from './cottage/Cottage'
import { HOTSPOTS, type RoomId } from './cottage/hotspots'
import { RoomPanel } from './rooms/RoomPanel'
import { ContactsRoom } from './rooms/contacts/ContactsRoom'
import { MessagesRoom } from './rooms/messages/MessagesRoom'
import { VeilNotice } from './components/VeilNotice'
import { playChime } from './chime'

const TWITCH_MS = 4000

function App(): React.JSX.Element {
  const [openRoom, setOpenRoom] = useState<RoomId | null>(null)
  const [unread, setUnread] = useState<Unread>({ letters: 0, messages: 0 })
  const [veil, setVeil] = useState(false)
  const [twitch, setTwitch] = useState(false)
  // Source conversation to show when the crystal ball opens (set by "Ask Source about them").
  const [, setSourceConversationId] = useState<string | null>(null)
  const soundOn = useRef(true)

  const refreshUnread = useCallback(() => {
    window.keep
      .unread()
      .then(setUnread)
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshUnread()
    window.keep.settings
      .get()
      .then((s) => (soundOn.current = s.sound))
      .catch(() => {})
    let timer: ReturnType<typeof setTimeout> | undefined
    const offs = [
      window.keep.on('changed', refreshUnread),
      window.keep.on('delivered', () => {
        playChime(soundOn.current)
        setTwitch(true)
        clearTimeout(timer)
        timer = setTimeout(() => setTwitch(false), TWITCH_MS)
      }),
      window.keep.on('veil', () => setVeil(true))
    ]
    return () => {
      offs.forEach((off) => off())
      clearTimeout(timer)
    }
  }, [refreshUnread])

  const close = useCallback(() => setOpenRoom(null), [])
  const title = HOTSPOTS.find((h) => h.room === openRoom)?.label ?? ''

  const askSource = useCallback((conversationId: string) => {
    setSourceConversationId(conversationId)
    setOpenRoom('source')
  }, [])

  const room = (id: RoomId): React.JSX.Element | null => {
    switch (id) {
      case 'contacts':
        return <ContactsRoom onAskSource={askSource} />
      case 'messages':
        return <MessagesRoom />
      default:
        return null
    }
  }

  return (
    <>
      <Cottage unread={unread} onOpen={setOpenRoom} dimmed={openRoom !== null} twitch={twitch} />
      {openRoom && (
        <RoomPanel title={title} onClose={close}>
          {room(openRoom)}
        </RoomPanel>
      )}
      {veil && <VeilNotice onDismiss={() => setVeil(false)} />}
    </>
  )
}

export default App
