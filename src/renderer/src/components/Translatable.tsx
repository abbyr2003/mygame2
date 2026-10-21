import { useState, type CSSProperties } from 'react'

// Languages with no earthly dictionary: their English is "channeled", not translated.
const CHANNELED = [
  'elvish',
  'light language',
  'enochian',
  'angelic',
  'starseed',
  'atlantean',
  'lemurian'
]

export const isChanneled = (language: string): boolean => {
  const l = language.toLowerCase()
  return CHANNELED.some((c) => l.includes(c))
}

interface Props {
  text: string
  language?: string
  /** Cached English, if the item was translated before. */
  translation?: string
  /** "side" for letters, "below" for texts. */
  layout: 'side' | 'below'
  onTranslate: () => Promise<string>
  /** Styling for the original (e.g. the companion's handwriting font). */
  originalClassName?: string
  originalStyle?: CSSProperties
}

export function Translatable(props: Props): React.JSX.Element {
  const { text, language, layout } = props
  const [english, setEnglish] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const translate = async (): Promise<void> => {
    setFailed(false)
    if (english ?? props.translation) {
      setEnglish(english ?? props.translation ?? null)
      setShown(true)
      return
    }
    setLoading(true)
    try {
      setEnglish(await props.onTranslate())
      setShown(true)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const original = (
    <div className={`original ${props.originalClassName ?? ''}`} style={props.originalStyle}>
      {text}
    </div>
  )
  const label = language && isChanneled(language) ? 'channeled translation' : 'translation'
  const translated = shown && english !== null

  const control = language && (
    <div className="translate-control">
      {translated ? (
        <button type="button" className="link-btn" onClick={() => setShown(false)}>
          Hide English
        </button>
      ) : (
        <button type="button" className="link-btn" disabled={loading} onClick={translate}>
          {loading ? 'Translating…' : `Translate from ${language}`}
        </button>
      )}
      {failed && (
        <span className="translate-failed" role="alert">
          The words won&apos;t come through just now. Try again in a little while.
        </span>
      )}
    </div>
  )

  if (!translated) {
    return (
      <div className={`translatable ${layout}`}>
        {original}
        {control}
      </div>
    )
  }

  const englishBlock = (
    <div className="translation serif">
      <div className="translation-label">{label}</div>
      <div>{english}</div>
    </div>
  )

  return layout === 'side' ? (
    <div className="translatable side translated">
      <div className="pane">{original}</div>
      <div className="pane">{englishBlock}</div>
      {control}
    </div>
  ) : (
    <div className="translatable below translated">
      {original}
      {englishBlock}
      {control}
    </div>
  )
}
