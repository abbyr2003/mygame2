import { useCallback, useEffect, useState } from 'react'
import type { Companion, Message, Thread } from '../../../../shared/types'
import { Portrait } from '../../components/Portrait'
import { ThreadView } from './ThreadView'

interface Row {
  companion: Companion
  messages: Message[]
  latest: Message | undefined
  unread: number
}

const unreadIn = (messages: Message[]): number =>
  messages.filter((m) => m.direction === 'in' && !m.read).length

function buildRows(companions: Companion[], threads: Thread[]): Row[] {
  const byId = new Map(threads.map((t) => [t.companionId, t.messages]))
  return companions
    .filter((c) => !c.archived || (byId.get(c.id)?.length ?? 0) > 0)
    .map((c) => {
      const messages = byId.get(c.id) ?? []
      return { companion: c, messages, latest: messages.at(-1), unread: unreadIn(messages) }
    })
    .sort((a, b) => (b.latest?.createdAt ?? '').localeCompare(a.latest?.createdAt ?? ''))
}

export function MessagesRoom(): React.JSX.Element {
  const [companions, setCompanions] = useState<Companion[]>([])
  const [threads, setThreads] = useState<Thread[]>([])
  const [openId, setOpenId] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [cs, ts] = await Promise.all([
      window.keep.companions.list(),
      window.keep.messages.threads()
    ])
    setCompanions(cs)
    setThreads(ts)
  }, [])

  useEffect(() => {
    reload().catch(() => {})
    return window.keep.on('changed', () => void reload().catch(() => {}))
  }, [reload])

  const rows = buildRows(companions, threads)
  const open = rows.find((r) => r.companion.id === openId)

  // Whatever arrives in the open thread is read as soon as it's on screen.
  const openUnread = open?.unread ?? 0
  useEffect(() => {
    if (openId && openUnread > 0) window.keep.messages.markRead(openId).catch(() => {})
  }, [openId, openUnread])

  const send = async (body: string): Promise<void> => {
    if (!openId) return
    const message = await window.keep.messages.send(openId, body)
    setThreads((ts) => {
      const others = ts.filter((t) => t.companionId !== openId)
      const mine = ts.find((t) => t.companionId === openId)?.messages ?? []
      return [...others, { companionId: openId, messages: [...mine, message] }]
    })
  }

  return (
    <div className="messages">
      <aside className="thread-list pixel-scroll">
        {rows.length === 0 && (
          <p className="empty-hint dark">Add a companion with the cat first.</p>
        )}
        {rows.map((r) => (
          <button
            key={r.companion.id}
            type="button"
            className={`thread-row${r.unread > 0 ? ' unread' : ''}${r.companion.id === openId ? ' selected' : ''}`}
            onClick={() => setOpenId(r.companion.id)}
          >
            <span className="thread-portrait">
              <Portrait companion={r.companion} size={48} />
              {r.unread > 0 && <span className="badge small">{r.unread}</span>}
            </span>
            <span className="thread-row-text">
              <span className="companion-name">{r.companion.name}</span>
              <span className="latest">{r.latest ? r.latest.body : 'No messages yet'}</span>
            </span>
          </button>
        ))}
      </aside>
      {open ? (
        <ThreadView
          key={open.companion.id}
          companion={open.companion}
          messages={open.messages}
          onSend={send}
        />
      ) : (
        <div className="thread parchment">
          <p className="empty-hint">Gaze into the mirror: choose someone to talk with.</p>
        </div>
      )}
    </div>
  )
}
