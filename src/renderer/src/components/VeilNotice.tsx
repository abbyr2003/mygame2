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
