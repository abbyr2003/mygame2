import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Companion, Message } from '../../../../shared/types'
import { Portrait } from '../../components/Portrait'
import { Translatable } from '../../components/Translatable'
import { formatWhen } from '../../format'

interface Props {
  companion: Companion
  messages: Message[]
  onSend: (body: string) => Promise<void>
}

export function ThreadView({ companion: c, messages, onSend }: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length])

  const send = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setFailed(false)
    try {
      await onSend(body)
      setDraft('')
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  const language = c.language?.name

  return (
    <div className="thread parchment">
      <header className="thread-header">
        <Portrait companion={c} size={52} />
        <div>
          <h2>{c.name}</h2>
          <p>
            {c.role}
            {language && <span className="tag">writes in {language}</span>}
          </p>
        </div>
      </header>

      <div className="bubbles pixel-scroll">
        {messages.length === 0 && (
          <p className="empty-hint">No messages yet. Say hello, or wait for them to write first.</p>
        )}
        {messages.map((m) =>
          m.direction === 'in' ? (
            <div key={m.id} className="bubble-row in">
              <Portrait companion={c} size={36} />
              <div className="bubble companion">
                <Translatable
                  text={m.body}
                  language={m.language ?? language}
                  translation={m.translation}
                  layout="below"
                  onTranslate={() => window.keep.messages.translate(c.id, m.id)}
                />
                <time>{formatWhen(m.createdAt)}</time>
              </div>
            </div>
          ) : (
            <div key={m.id} className="bubble-row out">
              <div className="bubble user">
                <div className="original">{m.body}</div>
                <time>{formatWhen(m.createdAt)}</time>
              </div>
            </div>
          )
        )}
        <div ref={end} />
      </div>

      <form className="reply-bar" onSubmit={send}>
        <input
          className="input"
          value={draft}
          placeholder={`Type a message to ${c.name}…`}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={sending}>
          Send
        </button>
        {failed && (
          <span className="translate-failed" role="alert">
            It didn&apos;t send. Please try again.
          </span>
        )}
      </form>
    </div>
  )
}
