import { useCallback, useEffect, useState } from 'react'
import type { CompanionInput } from '../../../../shared/api'
import type { Companion } from '../../../../shared/types'
import { CompanionCard } from './CompanionCard'
import { CompanionForm } from './CompanionForm'

interface Props {
  /** Called with the new Source conversation's id, focused on the chosen companion. */
  onAskSource: (conversationId: string) => void
}

type Selection = { mode: 'new' } | { mode: 'edit'; id: string } | null

export function ContactsRoom({ onAskSource }: Props): React.JSX.Element {
  const [companions, setCompanions] = useState<Companion[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const [selection, setSelection] = useState<Selection>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setCompanions(await window.keep.companions.list())
  }, [])

  useEffect(() => {
    reload().catch(() => setError('The ledger could not be read.'))
    return window.keep.on('changed', () => void reload().catch(() => {}))
  }, [reload])

  const select = (s: Selection): void => {
    setSelection(s)
    setError(null)
    setNotice(null)
  }

  const run = async (action: () => Promise<void>, failure: string): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }

  const editing =
    selection?.mode === 'edit' ? (companions.find((c) => c.id === selection.id) ?? null) : null
  const visible = companions.filter((c) => showArchived || !c.archived)

  const save = (input: CompanionInput, portraitPath?: string): Promise<void> =>
    run(async () => {
      if (editing) {
        await window.keep.companions.update(editing.id, input, portraitPath)
        await reload()
        setNotice('Saved.')
      } else {
        const created = await window.keep.companions.create(input, portraitPath)
        await reload()
        setSelection({ mode: 'edit', id: created.id })
        setNotice(`${created.name} has joined your keep. Expect a first word from them soon.`)
      }
    }, 'Something went wrong saving them. Please try again.')

  const archive = (): Promise<void> =>
    run(async () => {
      if (!editing) return
      await window.keep.companions.archive(editing.id)
      setSelection(null)
      await reload()
    }, 'They could not be archived just now.')

  const restore = (): Promise<void> =>
    run(async () => {
      if (!editing) return
      await window.keep.companions.update(editing.id, { archived: false })
      await reload()
      setNotice(`${editing.name} is back in your keep.`)
    }, 'They could not be restored just now.')

  const askSource = (): Promise<void> =>
    run(async () => {
      if (!editing) return
      const conv = await window.keep.source.start(editing.id)
      onAskSource(conv.id)
    }, 'Source could not be reached just now.')

  return (
    <div className="contacts">
      <div className="contacts-list well pixel-scroll">
        <div className="contacts-grid">
          {visible.map((c) => (
            <CompanionCard
              key={c.id}
              companion={c}
              selected={editing?.id === c.id}
              onSelect={() => select({ mode: 'edit', id: c.id })}
            />
          ))}
          <button
            type="button"
            className={`companion-card add${selection?.mode === 'new' ? ' selected' : ''}`}
            onClick={() => select({ mode: 'new' })}
          >
            <span className="add-plus" aria-hidden>
              +
            </span>
            <span>Add companion</span>
          </button>
        </div>
        <label className="check show-archived">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          <span>Show archived</span>
        </label>
      </div>

      <div className="contacts-detail parchment pixel-scroll">
        {selection === null || (selection.mode === 'edit' && !editing) ? (
          <p className="empty-hint">
            Choose a companion from the ledger, or add someone new to your keep.
          </p>
        ) : (
          <CompanionForm
            key={editing?.id ?? 'new'}
            companion={editing}
            busy={busy}
            error={error}
            notice={notice}
            onSubmit={save}
            onArchive={archive}
            onRestore={restore}
            onAskSource={askSource}
          />
        )}
      </div>
    </div>
  )
}
