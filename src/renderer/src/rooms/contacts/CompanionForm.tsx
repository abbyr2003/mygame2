import { useState, type FormEvent } from 'react'
import type { CompanionInput } from '../../../../shared/api'
import type { Companion, FormatPref, Frequency, LanguageUsage } from '../../../../shared/types'
import { Portrait } from '../../components/Portrait'
import { SEAL_COLORS, SEAL_SYMBOLS } from '../../components/seal'

export const ROLES = [
  'spirit guide',
  'protector',
  'friend',
  'ancestor',
  'familiar',
  'lover / twin flame'
]

const FREQUENCIES: { value: Frequency; hint: string }[] = [
  { value: 'chatty', hint: 'a few texts a day' },
  { value: 'regular', hint: 'about once a day' },
  { value: 'quiet', hint: '2–3 a week' },
  { value: 'rare', hint: 'every week or two' }
]

const FORMATS: { value: FormatPref; label: string }[] = [
  { value: 'letters', label: 'Letters' },
  { value: 'texts', label: 'Texts' },
  { value: 'both', label: 'Both' }
]

const USAGES: { value: LanguageUsage; label: string }[] = [
  { value: 'rarely', label: 'A word now and then' },
  { value: 'sometimes', label: 'Mixes in phrases' },
  { value: 'always', label: 'Writes entirely in it' }
]

interface Props {
  /** Existing companion to edit, or null for a new one. */
  companion: Companion | null
  busy: boolean
  error: string | null
  notice: string | null
  onSubmit: (input: CompanionInput, portraitPath?: string) => void
  onArchive: () => void
  onRestore: () => void
  onAskSource: () => void
}

const baseName = (p: string): string => p.split(/[\\/]/).pop() ?? p

export function CompanionForm(props: Props): React.JSX.Element {
  const { companion: c, busy } = props
  const knownRole = c ? ROLES.includes(c.role) : true
  const [name, setName] = useState(c?.name ?? '')
  const [role, setRole] = useState(c ? (knownRole ? c.role : 'other') : '')
  const [customRole, setCustomRole] = useState(c && !knownRole ? c.role : '')
  const [realm, setRealm] = useState(c?.realm ?? '')
  const [voice, setVoice] = useState(c?.voice ?? '')
  const [hasLanguage, setHasLanguage] = useState(Boolean(c?.language))
  const [languageName, setLanguageName] = useState(c?.language?.name ?? '')
  const [usage, setUsage] = useState<LanguageUsage>(c?.language?.usage ?? 'sometimes')
  const [frequency, setFrequency] = useState<Frequency>(c?.frequency ?? 'regular')
  const [formatPref, setFormatPref] = useState<FormatPref>(c?.formatPref ?? 'both')
  const [sealColor, setSealColor] = useState(c?.seal.color ?? SEAL_COLORS[0])
  const [sealSymbol, setSealSymbol] = useState(c?.seal.symbol ?? 'moon')
  const [portraitPath, setPortraitPath] = useState<string | null>(null)
  const [invalid, setInvalid] = useState<string | null>(null)

  const choosePortrait = async (): Promise<void> => {
    const path = await window.keep.companions.choosePortrait()
    if (path) setPortraitPath(path)
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const finalRole = role === 'other' ? customRole.trim() : role
    if (!name.trim() || !finalRole || !voice.trim()) {
      setInvalid('Please give them a name, a role and a personality & voice.')
      return
    }
    if (hasLanguage && !languageName.trim()) {
      setInvalid('Please name the language they know.')
      return
    }
    setInvalid(null)
    props.onSubmit(
      {
        name: name.trim(),
        role: finalRole,
        realm: realm.trim() || undefined,
        voice: voice.trim(),
        language: hasLanguage ? { name: languageName.trim(), usage } : undefined,
        frequency,
        formatPref,
        seal: { color: sealColor, symbol: sealSymbol }
      },
      portraitPath ?? undefined
    )
  }

  const error = invalid ?? props.error

  return (
    <form className="companion-form" onSubmit={submit} noValidate>
      <h2 className="form-title">{c ? `Edit ${c.name}` : 'A new companion'}</h2>

      <div className="portrait-row">
        {c && !portraitPath ? (
          <Portrait companion={c} size={88} />
        ) : (
          <span className="portrait portrait-empty" style={{ width: 88, height: 88 }}>
            {portraitPath ? '✦' : '?'}
          </span>
        )}
        <div>
          <button type="button" className="btn" onClick={choosePortrait}>
            Choose image…
          </button>
          <p className="hint">{portraitPath ? baseName(portraitPath) : 'PNG, JPG or WEBP'}</p>
        </div>
      </div>

      <label className="field">
        <span>Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>

      <div className="field-row">
        <label className="field">
          <span>Role</span>
          <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">Choose…</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
            <option value="other">other…</option>
          </select>
        </label>
        <label className="field">
          <span>Realm (optional)</span>
          <input className="input" value={realm} onChange={(e) => setRealm(e.target.value)} />
        </label>
      </div>
      {role === 'other' && (
        <label className="field">
          <span>Describe their role</span>
          <input
            className="input"
            value={customRole}
            onChange={(e) => setCustomRole(e.target.value)}
          />
        </label>
      )}

      <label className="field">
        <span>Personality &amp; voice</span>
        <textarea
          className="input"
          rows={4}
          value={voice}
          placeholder="How do they speak? What are they like?"
          onChange={(e) => setVoice(e.target.value)}
        />
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={hasLanguage}
          onChange={(e) => setHasLanguage(e.target.checked)}
        />
        <span>Knows another language</span>
      </label>
      {hasLanguage && (
        <div className="field-row">
          <label className="field">
            <span>Language name</span>
            <input
              className="input"
              value={languageName}
              placeholder="Latin, Elvish, Old Norse…"
              onChange={(e) => setLanguageName(e.target.value)}
            />
          </label>
          <label className="field">
            <span>How often they use it</span>
            <select
              className="input"
              value={usage}
              onChange={(e) => setUsage(e.target.value as LanguageUsage)}
            >
              {USAGES.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <fieldset className="field">
        <legend>How often they write</legend>
        <div className="toggles">
          {FREQUENCIES.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`btn${frequency === f.value ? ' selected' : ''}`}
              aria-pressed={frequency === f.value}
              onClick={() => setFrequency(f.value)}
            >
              {f.value} <small>· {f.hint}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>They prefer</legend>
        <div className="toggles">
          {FORMATS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`btn${formatPref === f.value ? ' selected' : ''}`}
              aria-pressed={formatPref === f.value}
              onClick={() => setFormatPref(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Wax seal</legend>
        <div className="toggles">
          {SEAL_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`swatch${sealColor === color ? ' selected' : ''}`}
              style={{ background: color }}
              aria-label={`Seal color ${color}`}
              aria-pressed={sealColor === color}
              onClick={() => setSealColor(color)}
            />
          ))}
        </div>
        <div className="toggles">
          {Object.entries(SEAL_SYMBOLS).map(([symbol, glyph]) => (
            <button
              key={symbol}
              type="button"
              className={`btn symbol${sealSymbol === symbol ? ' selected' : ''}`}
              aria-label={`Seal symbol ${symbol}`}
              aria-pressed={sealSymbol === symbol}
              onClick={() => setSealSymbol(symbol)}
            >
              {glyph}
            </button>
          ))}
        </div>
      </fieldset>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {props.notice && <p className="form-notice">{props.notice}</p>}

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={busy}>
          {c ? 'Save changes' : 'Save companion'}
        </button>
        {c && (
          <>
            <button type="button" className="btn" disabled={busy} onClick={props.onAskSource}>
              Ask Source about them
            </button>
            {c.archived ? (
              <button type="button" className="btn" disabled={busy} onClick={props.onRestore}>
                Restore
              </button>
            ) : (
              <button type="button" className="btn" disabled={busy} onClick={props.onArchive}>
                Archive
              </button>
            )}
          </>
        )}
      </div>
    </form>
  )
}
