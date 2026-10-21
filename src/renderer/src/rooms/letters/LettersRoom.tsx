import { useCallback, useEffect, useRef, useState } from 'react'
import type { Companion, Letter } from '../../../../shared/types'
import { Envelope } from './Envelope'
import { LetterView } from './LetterView'
import { WriteLetter, type WriteMode } from './WriteLetter'

type Tab = 'inbox' | 'sent' | 'starred'
type View =
  | { kind: 'letter'; id: string }
  | { kind: 'write'; mode: WriteMode; companionId: string | null }
  | null

const TABS: { id: Tab; label: string }[] = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'starred', label: 'Starred' }
]

const UNSEAL_MS = 1200

const prefersReducedMotion = (): boolean =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface Props {
  /** Length of the unsealing animation; tests shorten it. */
  unsealMs?: number
}

export function LettersRoom({ unsealMs = UNSEAL_MS }: Props): React.JSX.Element {
  const [companions, setCompanions] = useState<Companion[]>([])
  const [letters, setLetters] = useState<Letter[]>([])
  const [tab, setTab] = useState<Tab>('inbox')
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<View>(null)
  const [unsealingId, setUnsealingId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const reload = useCallback(async () => {
    const [cs, ls] = await Promise.all([window.keep.companions.list(), window.keep.letters.list()])
    setCompanions(cs)
    setLetters(ls)
  }, [])

  useEffect(() => {
    reload().catch(() => {})
    const off = window.keep.on('changed', () => void reload().catch(() => {}))
    return () => {
      off()
      clearTimeout(timer.current)
    }
  }, [reload])

  const byId = new Map(companions.map((c) => [c.id, c]))
  const shown = letters.filter((l) => {
    if (filter && l.companionId !== filter) return false
    if (tab === 'inbox') return l.direction === 'in'
    if (tab === 'sent') return l.direction === 'out'
    return l.starred
  })

  const open = (l: Letter): void => {
    setNotice(null)
    clearTimeout(timer.current)
    const sealed = l.direction === 'in' && !l.read
    if (!sealed) {
      setUnsealingId(null)
      setView({ kind: 'letter', id: l.id })
      return
    }
    window.keep.letters.markRead(l.id).catch(() => {})
    const ms = prefersReducedMotion() ? 0 : unsealMs
    setUnsealingId(l.id)
    setView(null)
    timer.current = setTimeout(() => {
      setUnsealingId(null)
      setLetters((ls) => ls.map((x) => (x.id === l.id ? { ...x, read: true } : x)))
      setView({ kind: 'letter', id: l.id })
    }, ms)
  }

  const star = async (id: string, starred: boolean): Promise<void> => {
    await window.keep.letters.star(id, starred)
    setLetters((ls) => ls.map((x) => (x.id === id ? { ...x, starred } : x)))
  }

  const write = (mode: WriteMode, companionId: string | null): void => {
    setNotice(null)
    setView({ kind: 'write', mode, companionId })
  }

  const send = async (mode: WriteMode, companionId: string, text: string): Promise<void> => {
    const name = byId.get(companionId)?.name ?? 'them'
    if (mode === 'request') {
      await window.keep.letters.request(companionId, text)
      setNotice(`Your request is on its way to ${name}. They will write when they're ready.`)
    } else {
      await window.keep.letters.send(companionId, text)
      setNotice(`Your letter is on its way to ${name}.`)
    }
    setView(null)
    await reload()
  }

  const current = view?.kind === 'letter' ? letters.find((l) => l.id === view.id) : undefined
  const active = companions.filter((c) => !c.archived)

  return (
    <div className="letters">
      <aside className="letter-list">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`btn${tab === t.id ? ' selected' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="field filter">
          <span>Companion</span>
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All companions</option>
            {companions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <ul className="envelopes-list pixel-scroll" aria-label="Letters">
          {shown.length === 0 && <li className="empty-hint dark">No letters here yet.</li>}
          {shown.map((l) => (
            <li key={l.id}>
              <Envelope
                letter={l}
                companion={byId.get(l.companionId)}
                selected={current?.id === l.id || unsealingId === l.id}
                unsealing={unsealingId === l.id}
                onOpen={() => open(l)}
              />
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn primary"
          disabled={active.length === 0}
          onClick={() => write('letter', filter || null)}
        >
          Write a letter
        </button>
      </aside>

      <section className="letter-desk parchment">
        {notice && <p className="form-notice">{notice}</p>}
        {unsealingId && (
          <div className="unseal-stage" aria-hidden>
            <span
              className="unseal-wax"
              style={{
                backgroundColor:
                  byId.get(letters.find((l) => l.id === unsealingId)?.companionId ?? '')?.seal
                    .color ?? '#6b3fa0'
              }}
            />
            <span className="unseal-paper" />
          </div>
        )}
        {view?.kind === 'write' && (
          <WriteLetter
            key={`${view.mode}-${view.companionId}`}
            mode={view.mode}
            companions={active}
            initialCompanionId={view.companionId}
            onSend={(id, text) => send(view.mode, id, text)}
            onCancel={() => setView(null)}
          />
        )}
        {current && (
          <LetterView
            letter={current}
            companion={byId.get(current.companionId)}
            onStar={(s) => void star(current.id, s).catch(() => {})}
            onWriteBack={() => write('letter', current.companionId)}
            onRequest={() => write('request', current.companionId)}
          />
        )}
        {!view && !unsealingId && !notice && (
          <p className="empty-hint">Choose an envelope from the desk, or write a letter of your own.</p>
        )}
      </section>
    </div>
  )
}
