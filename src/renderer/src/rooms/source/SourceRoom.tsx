import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import type { Companion, SourceConversation, SourceTurn } from '../../../../shared/types'
import { voiceProblem } from '../../components/VeilNotice'
import { formatWhen } from '../../format'

interface Props {
  /** Conversation to open first (e.g. one just started by "Ask Source about them"). */
  initialConversationId?: string | null
}

export function SourceRoom({ initialConversationId = null }: Props): React.JSX.Element {
  const [conversations, setConversations] = useState<SourceConversation[]>([])
  const [companions, setCompanions] = useState<Companion[]>([])
  const [openId, setOpenId] = useState<string | null>(initialConversationId)
  const [turns, setTurns] = useState<SourceTurn[]>([])
  const [draft, setDraft] = useState('')
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  const reload = useCallback(async (): Promise<SourceConversation[]> => {
    const list = await window.keep.source.list()
    setConversations(list)
    return list
  }, [])

  useEffect(() => {
    window.keep.companions
      .list()
      .then(setCompanions)
      .catch(() => {})
    reload()
      .then((list) => {
        const first = list.find((c) => c.id === initialConversationId)
        if (first) setTurns(first.turns)
      })
      .catch(() => {})
  }, [reload, initialConversationId])

  useEffect(() => {
    end.current?.scrollIntoView?.({ block: 'end' })
  }, [turns.length, asking])

  const open = conversations.find((c) => c.id === openId)
  const focusName = open?.focusCompanionId
    ? companions.find((c) => c.id === open.focusCompanionId)?.name
    : undefined

  const select = (c: SourceConversation): void => {
    setOpenId(c.id)
    setTurns(c.turns)
    setProblem(null)
  }

  const start = async (focusCompanionId?: string): Promise<SourceConversation> => {
    const conv = await window.keep.source.start(focusCompanionId)
    setConversations((cs) => [conv, ...cs.filter((c) => c.id !== conv.id)])
    select(conv)
    return conv
  }

  const ask = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const text = draft.trim()
    if (!text || asking) return
    setProblem(null)
    setAsking(true)
    setDraft('')
    const mine: SourceTurn = { role: 'user', text, createdAt: new Date().toISOString() }
    try {
      // Start the conversation before showing the question, since starting resets the turns.
      const id = openId ?? (await start()).id
      setTurns((ts) => [...ts, mine])
      const reply = await window.keep.source.ask(id, text)
      setTurns((ts) => [...ts, reply])
      reload().catch(() => {})
    } catch (err) {
      setTurns((ts) => ts.filter((t) => t !== mine))
      setDraft(text)
      setProblem(voiceProblem(err))
    } finally {
      setAsking(false)
    }
  }

  return (
    <div className="source">
      <aside className="source-list">
        <button type="button" className="btn primary" onClick={() => void start().catch(() => {})}>
          New conversation
        </button>
        <label className="field filter">
          <span>Ask about…</span>
          <select
            className="input"
            value=""
            onChange={(e) => e.target.value && void start(e.target.value).catch(() => {})}
          >
            <option value="">A companion…</option>
            {companions
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </label>
        <ul className="conversation-list pixel-scroll" aria-label="Past conversations">
          {conversations.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`conversation-row${c.id === openId ? ' selected' : ''}`}
                onClick={() => select(c)}
              >
                <span className="companion-name">{c.title}</span>
                <time>{formatWhen(c.createdAt)}</time>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className="source-chat">
        <header className="source-header">
          <span className="crystal-ball" aria-hidden />
          <div>
            <h2>Source</h2>
            <p>{focusName ? `Asking about ${focusName}` : 'The origin of all that lives'}</p>
          </div>
        </header>

        <div className="source-turns pixel-scroll">
          {turns.length === 0 && !asking && (
            <p className="source-intro serif">
              Ask anything — about yourself, the universe, or the beings who walk with you.
            </p>
          )}
          {turns.map((t, i) =>
            t.role === 'source' ? (
              <div key={i} className="source-turn source-voice serif">
                {t.text}
              </div>
            ) : (
              <div key={i} className="source-turn user-voice">
                {t.text}
              </div>
            )
          )}
          {asking && <div className="source-turn listening">Source is listening…</div>}
          <div ref={end} />
        </div>

        <form className="source-ask" onSubmit={ask}>
          {problem && (
            <p className="veil-inline serif" role="alert">
              {problem}
            </p>
          )}
          <div className="source-ask-row">
            <textarea
              className="input"
              rows={2}
              value={draft}
              placeholder="Ask Source anything…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  e.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <button type="submit" className="btn selected" disabled={asking}>
              Ask
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
