export const VEIL_COPY =
  'The veil is thick right now, so your message will be sent when the connection clears.'

export function VeilNotice({ onDismiss }: { onDismiss: () => void }): React.JSX.Element {
  return (
    <div className="veil" role="status">
      <p>{VEIL_COPY}</p>
      <button type="button" className="btn" onClick={onDismiss}>
        OK
      </button>
    </div>
  )
}

/** What to tell the user when Source or the Records can't answer. Keyed by VoiceError code. */
export function voiceProblem(err: unknown): string {
  const code = (err as { code?: string } | null)?.code
  switch (code) {
    case 'no-key':
    case 'bad-key':
      return 'The connection needs your Claude key. Add it at the hearth (Settings), then try again.'
    case 'no-credit':
      return 'Your Claude account has run out of credit. Top it up, then try again.'
    case 'refused':
      return 'That question could not be answered. Try asking it a different way.'
    default:
      return 'The veil is thick right now. Your question is still here, so try again when the connection clears.'
  }
}
