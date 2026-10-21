import { useCallback, useEffect, useRef, useState } from 'react'
import { Cottage, type Unread } from './cottage/Cottage'
import { HOTSPOTS, type RoomId } from './cottage/hotspots'
import { RoomPanel } from './rooms/RoomPanel'
import { ContactsRoom } from './rooms/contacts/ContactsRoom'
import { MessagesRoom } from './rooms/messages/MessagesRoom'
import { LettersRoom } from './rooms/letters/LettersRoom'
import { SourceRoom } from './rooms/source/SourceRoom'
import { LibraryRoom } from './rooms/library/LibraryRoom'
import { SettingsRoom } from './rooms/settings/SettingsRoom'
import { VeilNotice } from './components/VeilNotice'
import { playChime } from './chime'

const TWITCH_MS = 4000

function App(): React.JSX.Element {
  const [openRoom, setOpenRoom] = useState<RoomId | null>(null)
  const [unread, setUnread] = useState<Unread>({ letters: 0, messages: 0 })
  const [veil, setVeil] = useState(false)
  const [twitch, setTwitch] = useState(false)
  // Source conversation to show when the crystal ball opens (set by "Ask Source about them").
  const [sourceConversationId, setSourceConversationId] = useState<string | null>(null)
  // null until settings load, so the welcome note never flashes.
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  const soundOn = useRef(true)

  const refreshUnread = useCallback(() => {
    window.keep
      .unread()
      .then(setUnread)
      .catch(() => {})
  }, [])

  const refreshSettings = useCallback(() => {
    window.keep.settings
      .get()
      .then((s) => {
        soundOn.current = s.sound
        setHasKey(s.hasKey)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshUnread()
    refreshSettings()
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
  }, [refreshUnread, refreshSettings])

  const close = useCallback(() => {
    setOpenRoom(null)
    setSourceConversationId(null)
    // Settings may have changed (key, sound).
    refreshSettings()
  }, [refreshSettings])
  const title = HOTSPOTS.find((h) => h.room === openRoom)?.label ?? ''

  const askSource = useCallback((conversationId: string) => {
    setSourceConversationId(conversationId)
    setOpenRoom('source')
  }, [])

  const room = (id: RoomId): React.JSX.Element => {
    switch (id) {
      case 'contacts':
        return <ContactsRoom onAskSource={askSource} />
      case 'messages':
        return <MessagesRoom />
      case 'letters':
        return <LettersRoom />
      case 'source':
        return <SourceRoom initialConversationId={sourceConversationId} />
      case 'library':
        return <LibraryRoom />
      case 'settings':
        return <SettingsRoom />
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
      {hasKey === false && !openRoom && (
        <div className="welcome frame" role="note">
          <p className="serif">
            Welcome to your keep. To open the connection, visit <strong>the Hearth</strong> (the
            fireplace) and add your Claude key. Then wake the cat to add your first companion.
          </p>
          <button type="button" className="btn selected" onClick={() => setOpenRoom('settings')}>
            Go to the Hearth
          </button>
        </div>
      )}
      {veil && <VeilNotice onDismiss={() => setVeil(false)} />}
    </>
  )
}

export default App
