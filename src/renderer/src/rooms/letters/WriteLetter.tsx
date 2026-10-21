import { useState, type FormEvent } from 'react'
import type { Companion } from '../../../../shared/types'

export type WriteMode = 'letter' | 'request'

interface Props {
  mode: WriteMode
  companions: Companion[]
  initialCompanionId: string | null
  onSend: (companionId: string, text: string) => Promise<void>
  onCancel: () => void
}

export function WriteLetter({ mode, companions, initialCompanionId, onSend, onCancel }: Props): React.JSX.Element {
  const [to, setTo] = useState(initialCompanionId ?? companions[0]?.id ?? '')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!to || !text.trim() || sending) return
    setSending(true)
    setFailed(false)
    try {
      await onSend(to, text.trim())
    } catch {
      setFailed(true)
      setSending(false)
    }
  }

  const isRequest = mode === 'request'
  return (
    <form className="write-letter" onSubmit={submit}>
      <h2 className="form-title">{isRequest ? 'Request a letter' : 'Write a letter'}</h2>
      <label className="field">
        <span>To</span>
        <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
          {companions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{isRequest ? 'Write to me about…' : 'Your letter'}</span>
        <textarea
          className="input letter-input"
          rows={isRequest ? 3 : 12}
          value={text}
          placeholder={isRequest ? 'the old forest, my path this year, your realm…' : 'Dear…'}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      {failed && (
        <p className="form-error" role="alert">
          It couldn&apos;t be sent just now. Please try again.
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={sending || !text.trim()}>
          {isRequest ? 'Send request' : 'Send letter'}
        </button>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
