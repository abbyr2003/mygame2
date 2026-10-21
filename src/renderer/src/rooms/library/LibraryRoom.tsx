import { useEffect, useState, type FormEvent } from 'react'
import type { Reading } from '../../../../shared/types'
import { voiceProblem } from '../../components/VeilNotice'
import { Scroll } from './Scroll'

const SPINES = ['#6b3fa0', '#2b4a8a', '#7a2f2f', '#2f6b3a', '#8b5e3c', '#3fb8a8']

// "Record of the Soul: On Purpose" → "On Purpose" for the narrow spine.
const spineTitle = (title: string): string => title.split(':').pop()?.trim() || title

export function LibraryRoom(): React.JSX.Element {
  const [readings, setReadings] = useState<Reading[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    window.keep.library
      .list()
      .then(setReadings)
      .catch(() => {})
  }, [])

  const ask = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const q = question.trim()
    if (!q || asking) return
    setAsking(true)
    setProblem(null)
    try {
      const reading = await window.keep.library.ask(q)
      setReadings((rs) => [reading, ...rs.filter((r) => r.id !== reading.id)])
      setOpenId(reading.id)
      setQuestion('')
    } catch (err) {
      setProblem(voiceProblem(err))
    } finally {
      setAsking(false)
    }
  }

  const open = readings.find((r) => r.id === openId)

  return (
    <div className="library">
      <aside className="bookshelf">
        <ul className="shelf" aria-label="Shelf of past readings">
          {readings.map((r, i) => (
            <li key={r.id}>
              <button
                type="button"
                className={`book${r.id === openId ? ' selected' : ''}`}
                style={{ backgroundColor: SPINES[i % SPINES.length] }}
                aria-label={r.title}
                title={r.title}
                onClick={() => {
                  setOpenId(r.id)
                  setProblem(null)
                }}
              >
                <span aria-hidden>{spineTitle(r.title)}</span>
              </button>
            </li>
          ))}
        </ul>
        {readings.length === 0 && (
          <p className="empty-hint dark">Your readings will rest here, on the shelf.</p>
        )}
      </aside>

      <section className="reading-desk">
        <form className="records-ask" onSubmit={ask}>
          <span className="candle" aria-hidden />
          <label className="field">
            <span>Ask the Akashic Records</span>
            <textarea
              className="input"
              rows={2}
              value={question}
              placeholder="Who am I beneath it all? What did I come here to learn?"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <button type="submit" className="btn selected" disabled={asking || !question.trim()}>
            {asking ? 'Opening…' : 'Open the Records'}
          </button>
          <span className="candle" aria-hidden />
        </form>
        {problem && (
          <p className="veil-inline serif" role="alert">
            {problem}
          </p>
        )}
        {asking ? (
          <p className="empty-hint dark">The Records are opening…</p>
        ) : open ? (
          <Scroll key={open.id} reading={open} />
        ) : (
          <p className="empty-hint dark">
            Ask one question, and the Records will answer with a scroll.
          </p>
        )}
      </section>
    </div>
  )
}
