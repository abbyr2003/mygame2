import { useEffect, useState, type FormEvent } from 'react'
import type { KeyCheck, Settings } from '../../../../shared/api'

export const MODELS = [
  { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', hint: 'Balanced — about $8 a month' },
  { id: 'claude-opus-5-5', name: 'Opus 5.5', hint: 'Richest voices — about $16 a month' },
  { id: 'claude-haiku-5-5', name: 'Haiku 5.5', hint: 'Lightest — well under $1 a month' }
]

function keyMessage(result: KeyCheck): { ok: boolean; text: string } {
  if (result.ok) return { ok: true, text: 'Key saved. The connection is open.' }
  switch (result.error) {
    case 'bad-key':
      return { ok: false, text: "That key wasn't accepted. Check it was copied in full and try again." }
    case 'no-credit':
      return {
        ok: false,
        text: 'Key saved, but your Claude account has no credit yet. Add some at console.anthropic.com.'
      }
    default:
      return { ok: false, text: "Key saved, but the connection couldn't be checked just now." }
  }
}

export function SettingsRoom(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [key, setKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  const reload = async (): Promise<void> => setSettings(await window.keep.settings.get())

  useEffect(() => {
    reload().catch(() => {})
  }, [])

  const saveKey = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!key.trim() || saving) return
    setSaving(true)
    setResult(null)
    try {
      setResult(keyMessage(await window.keep.settings.setApiKey(key.trim())))
    } catch {
      setResult({ ok: false, text: "The key couldn't be stored on this computer." })
    } finally {
      // The key never stays on screen.
      setKey('')
      setSaving(false)
      await reload().catch(() => {})
    }
  }

  const setModel = async (model: string): Promise<void> => {
    setSettings((s) => (s ? { ...s, model } : s))
    await window.keep.settings.setModel(model)
  }

  const setSound = async (sound: boolean): Promise<void> => {
    setSettings((s) => (s ? { ...s, sound } : s))
    await window.keep.settings.setSound(sound)
  }

  return (
    <div className="settings pixel-scroll">
      <div className="settings-panel parchment">
        <span className="hearth-fire" aria-hidden />

        <section>
          <h2 className="form-title">Your Claude key</h2>
          <form className="key-row" onSubmit={saveKey}>
            <label className="field">
              <span>Claude key</span>
              <input
                className="input"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={key}
                placeholder={settings?.hasKey ? '•••••••• (saved — paste a new one to replace it)' : 'sk-ant-…'}
                onChange={(e) => setKey(e.target.value)}
              />
            </label>
            <button type="submit" className="btn primary" disabled={saving || !key.trim()}>
              {saving ? 'Checking…' : 'Save key'}
            </button>
          </form>
          {result &&
            (result.ok ? (
              <p className="form-notice">{result.text}</p>
            ) : (
              <p className="form-error" role="alert">
                {result.text}
              </p>
            ))}
          {!result && settings && (
            <p className={settings.hasKey ? 'status-pill on' : 'status-pill'}>
              {settings.hasKey ? 'Connected ✓' : 'No key yet'}
            </p>
          )}
          <p className="hint">
            Your key is locked with Windows encryption and kept only on this computer. It is never shown again.
          </p>
        </section>

        <fieldset className="field">
          <legend>Voice of the keep</legend>
          <div className="model-cards">
            {MODELS.map((m) => (
              <label key={m.id} className={`model-card${settings?.model === m.id ? ' selected' : ''}`}>
                <input
                  type="radio"
                  name="model"
                  value={m.id}
                  checked={settings?.model === m.id}
                  onChange={() => void setModel(m.id).catch(() => {})}
                />
                <span className="model-name">{m.name}</span>
                <span className="hint">{m.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="check">
          <input
            type="checkbox"
            checked={settings?.sound ?? true}
            onChange={(e) => void setSound(e.target.checked).catch(() => {})}
          />
          <span>Chime when something arrives</span>
        </label>

        <section>
          <h2 className="form-title">Your keep folder</h2>
          <p className="keep-path">{settings?.keepPath}</p>
          <button
            type="button"
            className="btn"
            onClick={() => void window.keep.settings.openKeepFolder().catch(() => {})}
          >
            Open folder
          </button>
        </section>
      </div>
    </div>
  )
}
